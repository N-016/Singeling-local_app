// Rapport-server voor de anonieme gebruiksgegevens en meldingen van de
// Singeling App. Draait in de app zelf: Instellingen > Debug > Beheer (zie
// main.js, "Beheer: rapport-server in de app").
//
//   POST /ingest    rapport van een app (Bearer-sleutel "token")
//   POST /melding   bug of idee uit een app (zelfde sleutel)
//   GET  /?key=     overzicht (sleutel "viewToken"), alleen vanaf deze pc
//   GET  /api?key=  hetzelfde als JSON
//   GET  /shot/...  schermafbeelding bij een melding (alleen vanaf deze pc)
//   POST /archive   melding archiveren of terugzetten (alleen vanaf deze pc)
//
// "token" zit in elke app (telemetry.config.json, dus ook in de installer) en
// mag alleen insturen. "viewToken" maakt de app bij elke start opnieuw aan en
// houdt hem in het geheugen. Gewone http (niet versleuteld), bedoeld voor het
// bedrijfsnetwerk.
//
// Omdat de insturen-sleutel in een publieke installer zit, begrenzen we wat
// iemand ermee kan: een maximum aantal installaties (ID's van de laatste 30
// dagen), meldingen per dag, en bytes per dag.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { sanitize, sanitizeMelding, summarize } = require('./summarize');
const { render } = require('./dashboard');

const MAX_BODY = 64 * 1024;
const MAX_MELDING_BODY = 2 * 1024 * 1024; // met schermafbeelding
const MAX_DAY_BYTES = 100 * 1024 * 1024; // op een dag nooit meer opslaan, tegen een volle schijf
const DAYS = 30;
const SUMMARY_CACHE_MS = 30 * 1000;

function createRapportServer({
  token, viewToken, port, dataDir, log = () => {}, onMelding = () => {},
  maxInstalls = 50, maxMeldingenPerDay = 200
}) {
  if (!token || token.length < 16 || !viewToken || viewToken.length < 16 || token === viewToken) {
    throw new Error('Twee verschillende, lange sleutels nodig (token en viewToken).');
  }
  const meldingenDir = path.join(dataDir, 'meldingen');
  const idsFile = path.join(dataDir, 'installaties.json');
  let server = null;
  let summaryCache = null; // { days, at, value }

  function loadReports(days) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const reports = [];
    for (const name of fs.readdirSync(dataDir).filter(n => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n) && n.slice(0, 10) >= cutoff)) {
      for (const line of fs.readFileSync(path.join(dataDir, name), 'utf8').split('\n')) {
        if (!line) continue;
        try { reports.push(JSON.parse(line)); } catch { /* kapotte regel overslaan */ }
      }
    }
    return reports;
  }

  // De samenvatting 30 seconden onthouden: elke paginalading leest anders alle
  // rapporten van 30 dagen opnieuw (ook na elke klik op Archiveren).
  function loadSummary(days) {
    if (summaryCache && summaryCache.days === days && Date.now() - summaryCache.at < SUMMARY_CACHE_MS) return summaryCache.value;
    const value = summarize(loadReports(days));
    summaryCache = { days, at: Date.now(), value };
    return value;
  }

  // Meldingen, nieuwste eerst (max 300), met de bestandsnaam (zonder .json)
  // om ze te kunnen archiveren.
  function loadMeldingen() {
    return fs.readdirSync(meldingenDir).filter(n => n.endsWith('.json')).sort().reverse().slice(0, 300).map(name => {
      try { return { ...JSON.parse(fs.readFileSync(path.join(meldingenDir, name), 'utf8')), file: name.slice(0, -5) }; } catch { return null; }
    }).filter(Boolean);
  }

  // Bekende installaties (ID -> laatst gezien) van de laatste 30 dagen. Een
  // nieuw ID boven het maximum wordt geweigerd: zo kan niemand met de sleutel
  // uit de installer honderden nep-installaties verzinnen.
  function acceptInstall(id) {
    let known = {};
    try { known = JSON.parse(fs.readFileSync(idsFile, 'utf8')); } catch { /* nog geen bestand */ }
    const cutoff = Date.now() - DAYS * 86400000;
    for (const [key, seen] of Object.entries(known)) if (!(seen > cutoff)) delete known[key];
    if (!(id in known) && Object.keys(known).length >= maxInstalls) return false;
    known[id] = Date.now();
    fs.writeFileSync(idsFile, JSON.stringify(known));
    return true;
  }

  const today = () => new Date().toISOString().slice(0, 10);
  // Bestandsnamen van meldingen beginnen met de datum waarop ze binnenkwamen.
  const meldingenToday = () => fs.readdirSync(meldingenDir).filter(n => n.endsWith('.json') && n.startsWith(today())).length;

  // Insturen mag met token; lezen alleen met viewToken én vanaf deze pc zelf,
  // zodat de leessleutel nooit over het netwerk gaat.
  const mayIngest = (req) => (req.headers.authorization || '') === `Bearer ${token}`;
  const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const mayView = (req, url) => isLocal(req) && (url.searchParams.get('key') === viewToken || (req.headers.authorization || '') === `Bearer ${viewToken}`);

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) { reject(new Error('te groot')); req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const send = (code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    try {
      if (req.method === 'POST' && url.pathname === '/ingest') {
        if (!mayIngest(req)) return send(401, 'Geen toegang');
        const report = sanitize(JSON.parse(await readBody(req, MAX_BODY)));
        if (!report) return send(400, 'Ongeldig rapport');
        if (!acceptInstall(report.id)) return send(429, 'Te veel installaties');
        const dayFile = path.join(dataDir, `${today()}.jsonl`);
        if (fs.existsSync(dayFile) && fs.statSync(dayFile).size > MAX_DAY_BYTES) return send(507, 'Vol voor vandaag');
        // De klok van de pc kan fout staan: de dag in het overzicht volgt deze tijd.
        fs.appendFileSync(dayFile, JSON.stringify({ ...report, receivedAt: new Date().toISOString() }) + '\n');
        return send(204, '');
      }
      if (req.method === 'POST' && url.pathname === '/melding') {
        if (!mayIngest(req)) return send(401, 'Geen toegang');
        const m = sanitizeMelding(JSON.parse(await readBody(req, MAX_MELDING_BODY)));
        if (!m) return send(400, 'Ongeldige melding');
        if (!acceptInstall(m.id)) return send(429, 'Te veel installaties');
        if (meldingenToday() >= maxMeldingenPerDay) return send(429, 'Te veel meldingen vandaag');
        const base = `${new Date().toISOString().replace(/[:.]/g, '-')}-${m.type}-${Math.random().toString(36).slice(2, 8)}`;
        if (m.shot) fs.writeFileSync(path.join(meldingenDir, `${base}.jpg`), Buffer.from(m.shot.slice(m.shot.indexOf(',') + 1), 'base64'));
        const { shot, ...rest } = m;
        fs.writeFileSync(path.join(meldingenDir, `${base}.json`), JSON.stringify({ ...rest, receivedAt: new Date().toISOString(), shotFile: shot ? `${base}.jpg` : null }, null, 2));
        log(`Nieuwe melding (${m.type}): ${m.title || m.text.slice(0, 60)}`);
        try { onMelding(m); } catch { /* een fout in de melder mag het ontvangen niet breken */ }
        return send(204, '');
      }
      if (req.method === 'POST' && url.pathname === '/archive') {
        if (!mayView(req, url)) return send(401, 'Geen toegang');
        const { file, archived } = JSON.parse(await readBody(req, MAX_BODY));
        if (typeof file !== 'string' || !/^[\w.-]+$/.test(file)) return send(400, 'Ongeldige melding');
        const full = path.join(meldingenDir, `${file}.json`);
        if (!fs.existsSync(full)) return send(404, 'Niet gevonden');
        const melding = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (archived) melding.archivedAt = new Date().toISOString();
        else delete melding.archivedAt;
        fs.writeFileSync(full, JSON.stringify(melding, null, 2));
        return send(204, '');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/shot/')) {
        if (!mayView(req, url)) return send(401, 'Geen toegang');
        const name = path.basename(decodeURIComponent(url.pathname.slice(6)));
        if (!/^[\w.-]+\.jpg$/.test(name) || !fs.existsSync(path.join(meldingenDir, name))) return send(404, 'Niet gevonden');
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        return res.end(fs.readFileSync(path.join(meldingenDir, name)));
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/api')) {
        if (!mayView(req, url)) return send(401, 'Geen toegang');
        const summary = loadSummary(Number(url.searchParams.get('days')) || DAYS);
        if (url.pathname === '/api') return send(200, JSON.stringify({ ...summary, meldingen: loadMeldingen() }, null, 2), 'application/json');
        return send(200, render(summary, loadMeldingen(), viewToken), 'text/html; charset=utf-8');
      }
      send(404, 'Niet gevonden');
    } catch {
      send(400, 'Ongeldig verzoek');
    }
  }

  return {
    start: () => new Promise((resolve, reject) => {
      if (server) return resolve();
      fs.mkdirSync(meldingenDir, { recursive: true });
      server = http.createServer(handle);
      server.once('error', (error) => { server = null; reject(error); });
      server.listen(port, () => { log(`Rapport-server luistert op poort ${port} (gegevens in ${dataDir})`); resolve(); });
    }),
    stop: () => new Promise((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
      server.closeAllConnections?.();
      server = null;
    }),
    running: () => !!server,
    port
  };
}

module.exports = { createRapportServer };
