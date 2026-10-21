// Anonieme gebruiksgegevens: welk thema, welke pagina-soorten, hoe lang, en
// hoeveel CPU en geheugen de app gebruikt. Zo zie je wat veel gebruikt wordt
// en wat zwaar is. Geen namen, geen e-mail, geen ordernummers (zie pageKind
// in rules.js): alleen een willekeurig installatie-ID.
//
// Werking: elke 30 seconden een meting; elke 30 minuten (en bij afsluiten)
// gaat het opgespaarde stuk als rapport in een wachtrij-bestand en naar de
// server (tools/rapport-server). Lukt dat niet (pc van de server uit, geen
// netwerk), dan blijft het in de wachtrij tot de volgende keer. Meldingen
// (bug of idee, via het kevertje) gaan op dezelfde manier, in een eigen
// wachtrij, naar /melding. Zonder
// telemetry.config.json (adres + sleutel, niet in git) of met de schakelaar
// uit gebeurt er niets. Niets hier mag de app ooit laten crashen of haperen.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { pageKind } = require('./rules');

const SAMPLE_MS = 30 * 1000;
const FLUSH_MS = 30 * 60 * 1000;
const MAX_QUEUE = 30; // oudste rapporten vallen af; een week uit de lucht is genoeg
const MAX_KINDS = 150; // pagina-soorten per rapport

const emptySession = () => ({
  startedAt: Date.now(),
  visits: {}, // pagina-soort -> aantal keer geopend
  seconds: {}, // pagina-soort -> seconden dat de app daar op stond (venster actief)
  // memSum/memMax: geheugen van de app; sysSum/sysMax: wat de hele pc in gebruik heeft (MB).
  cpu: { n: 0, sum: 0, max: 0, memSum: 0, memMax: 0, sysSum: 0, sysMax: 0, byKind: {} },
  // Seconden dat de app open stond en daarvan op de voorgrond (een van de
  // app-vensters heeft de focus): het aandeel tijd dat je er echt mee werkt.
  time: { open: 0, focus: 0 },
  crashes: 0,
  crashKinds: {} // 'tab:oom' -> aantal
});

function createTelemetry({ dir, appVersion, config, isEnabled, getMetrics, getActive, getSnapshot, fetchImpl = fetch }) {
  const queueFile = path.join(dir, 'telemetry-queue.json');
  const meldingFile = path.join(dir, 'meldingen-queue.json');
  let session = emptySession();
  let lastKindByTab = new Map();
  let sampleTimer = null;
  let flushTimer = null;
  let sending = false;

  const active = () => !!config && !!config.url && !!config.token && isEnabled();

  const readQueue = (file = queueFile) => {
    try {
      const queue = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(queue) ? queue : [];
    } catch {
      return [];
    }
  };
  const writeQueue = (queue, file = queueFile) => {
    try {
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(queue.slice(-MAX_QUEUE)));
      fs.renameSync(`${file}.tmp`, file);
    } catch {
      // Niet kunnen opslaan is jammer, geen reden voor een fout.
    }
  };

  // Eén vast willekeurig ID per installatie, in de map van de app zelf.
  const installId = () => {
    const file = path.join(dir, 'install-id');
    try {
      const id = fs.readFileSync(file, 'utf8').trim();
      if (/^[0-9a-f-]{36}$/.test(id)) return id;
    } catch {
      // Nog geen ID: maak er een.
    }
    const id = crypto.randomUUID();
    try { fs.writeFileSync(file, id); } catch { /* dan een ID voor deze sessie */ }
    return id;
  };

  // Een pagina-soort telt als bezoek bij een nieuwe soort in die tab; een
  // ander tabblad binnen dezelfde order (?tab=...) telt dus niet mee.
  function visit(tabId, url) {
    if (!active()) return;
    const kind = pageKind(url);
    if (!kind || lastKindByTab.get(tabId) === kind) return;
    lastKindByTab.set(tabId, kind);
    if (Object.keys(session.visits).length < MAX_KINDS || kind in session.visits) {
      session.visits[kind] = (session.visits[kind] || 0) + 1;
    }
  }

  function forgetTab(tabId) {
    lastKindByTab.delete(tabId);
  }

  function crash(kind = 'tab:crashed') {
    if (!active()) return;
    session.crashes += 1;
    if (session.crashKinds[kind] || Object.keys(session.crashKinds).length < 20) session.crashKinds[kind] = (session.crashKinds[kind] || 0) + 1;
  }

  // CPU is "percentage sinds de vorige meting" (100 = één hele kern), dus
  // bij 30 seconden ertussen het gemiddelde over die tijd. Het deel van de
  // pagina waar je op staat wordt apart bijgehouden.
  function sample() {
    if (!active()) return;
    try {
      const { totalCpu, memMb, activeCpu, windowFocused, anyFocused = windowFocused } = getMetrics();
      const kind = getActive();
      session.time.open += SAMPLE_MS / 1000;
      if (anyFocused) session.time.focus += SAMPLE_MS / 1000;
      const c = session.cpu;
      c.n += 1;
      c.sum += totalCpu;
      c.max = Math.max(c.max, totalCpu);
      c.memSum += memMb;
      c.memMax = Math.max(c.memMax, memMb);
      const sysMb = (os.totalmem() - os.freemem()) / 1024 ** 2;
      c.sysSum += sysMb;
      c.sysMax = Math.max(c.sysMax, sysMb);
      if (kind && (c.byKind[kind] || Object.keys(c.byKind).length < MAX_KINDS)) {
        const entry = c.byKind[kind] || (c.byKind[kind] = { n: 0, sum: 0, max: 0 });
        entry.n += 1;
        entry.sum += activeCpu;
        entry.max = Math.max(entry.max, activeCpu);
        // Tijd tellen we alleen als je echt in de app zit, niet bij een tab
        // die op de achtergrond openstaat.
        if (windowFocused) session.seconds[kind] = (session.seconds[kind] || 0) + SAMPLE_MS / 1000;
      }
    } catch {
      // Een mislukte meting slaan we over.
    }
  }

  const round = (value) => Math.round(value * 10) / 10;

  // Het opgespaarde stuk als rapport; daarna begint een nieuw stuk.
  function buildReport() {
    const s = session;
    session = emptySession();
    const byKind = {};
    for (const [kind, entry] of Object.entries(s.cpu.byKind)) byKind[kind] = { n: entry.n, sum: round(entry.sum), max: round(entry.max) };
    return {
      v: 1,
      id: installId(),
      sentAt: new Date().toISOString(),
      appVersion,
      electron: process.versions.electron || null,
      os: os.release(),
      arch: os.arch(),
      cores: os.cpus().length,
      ramGb: Math.round(os.totalmem() / 1024 ** 3),
      minutes: Math.round((Date.now() - s.startedAt) / 60000),
      settings: getSnapshot(),
      visits: s.visits,
      seconds: s.seconds,
      time: s.time,
      cpu: { n: s.cpu.n, sum: round(s.cpu.sum), max: round(s.cpu.max), memSum: Math.round(s.cpu.memSum), memMax: Math.round(s.cpu.memMax), sysSum: Math.round(s.cpu.sysSum), sysMax: Math.round(s.cpu.sysMax), byKind },
      crashes: s.crashes,
      crashKinds: s.crashKinds
    };
  }

  // Eén wachtrij leegsturen naar url; stopt bij de eerste mislukking.
  async function drain(file, url, timeout) {
    let queue = readQueue(file);
    while (queue.length > 0) {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
        body: JSON.stringify(queue[0]),
        signal: AbortSignal.timeout(timeout)
      });
      // 400: de server wil dit nooit hebben; weggooien, anders blokkeert het de rest.
      if (!response.ok && response.status !== 400) return false;
      queue = readQueue(file).slice(1);
      writeQueue(queue, file);
    }
    return true;
  }

  // Meldingen hangen niet af van de schakelaar (je stuurt ze zelf), wel van
  // een rapport-adres. Geeft true als alles verstuurd is.
  async function send() {
    if (!config || sending) return false;
    sending = true;
    try {
      const meldingenSent = await drain(meldingFile, new URL('/melding', config.url).href, 15000);
      if (active()) await drain(queueFile, config.url, 5000);
      return meldingenSent;
    } catch {
      return false; // server niet bereikbaar: de wachtrijen blijven, volgende keer weer
    } finally {
      sending = false;
    }
  }

  // Een melding (bug of idee) uit het meldscherm: eerst in de wachtrij, dan
  // meteen proberen. 'sent' = nu aangekomen, 'queued' = komt later.
  async function submitMelding(melding) {
    if (!config) return 'unavailable';
    writeQueue([...readQueue(meldingFile), { ...melding, id: installId(), appVersion, os: os.release(), sentAt: new Date().toISOString() }], meldingFile);
    return (await send()) && readQueue(meldingFile).length === 0 ? 'sent' : 'queued';
  }

  // Alleen opslaan als er iets te melden valt (de app stond een tijd open).
  function flush({ final = false } = {}) {
    if (!active()) return;
    const hasData = session.cpu.n > 0 || Object.keys(session.visits).length > 0;
    if (hasData) writeQueue([...readQueue(), buildReport()]);
    // Bij afsluiten geen netwerk afwachten: het rapport staat in de wachtrij.
    if (!final) send();
  }

  function start() {
    if (!config) return;
    sampleTimer = setInterval(sample, SAMPLE_MS);
    flushTimer = setInterval(() => flush(), FLUSH_MS);
    sampleTimer.unref();
    flushTimer.unref();
    setTimeout(() => send(), 20 * 1000).unref(); // wachtrij van de vorige keer, na de start
  }

  return { start, visit, forgetTab, crash, sample, flush, send, buildReport, submitMelding, available: () => !!config };
}

// telemetry.config.json naast de app: { "url": "http://pc:8787/ingest", "token": "..." }.
// Staat niet in git (openbare repo, intern adres); ontbreekt hij, dan blijft
// de app stil.
function loadConfig(dir) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'telemetry.config.json'), 'utf8'));
    return typeof config.url === 'string' && typeof config.token === 'string' ? config : null;
  } catch {
    return null;
  }
}

module.exports = { createTelemetry, loadConfig };
