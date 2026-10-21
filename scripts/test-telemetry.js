// npm test: meten, wachtrij, opnieuw proberen en het overzicht (zonder netwerk).
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTelemetry } = require('../telemetry');
const { sanitize, summarize } = require('../rapport/summarize');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-telemetry-'));
  let enabled = true;
  let page = '/sales-orders/:id';
  let cpu = 10;
  const posted = [];
  let serverUp = false;
  const fetchImpl = async (url, options) => {
    if (!serverUp) throw new Error('niet bereikbaar');
    posted.push(JSON.parse(options.body));
    return { ok: true };
  };
  const make = (config = { url: 'http://test/ingest', token: 'x'.repeat(20) }) => createTelemetry({
    dir, appVersion: '1.3.0', config, fetchImpl,
    isEnabled: () => enabled,
    getMetrics: () => ({ totalCpu: cpu, activeCpu: cpu / 2, memMb: 800, windowFocused: true }),
    getActive: () => page,
    getSnapshot: () => ({ theme: 'laser', dark: true, themeMode: 'zon', soft: false, zoom: 1, tabs: 4, startTabs: 1, groups: 0, displays: 1, notifications: true })
  });
  const t = make();

  // Bezoeken: een nieuwe pagina-soort in een tab telt, ?tab=... binnen dezelfde order niet.
  t.visit('tab-1', 'https://snglng.lovable.app/sales-orders/30044');
  t.visit('tab-1', 'https://snglng.lovable.app/sales-orders/30044?tab=kwaliteit');
  t.visit('tab-1', 'https://snglng.lovable.app/sales-orders/30129');
  t.visit('tab-2', 'https://snglng.lovable.app/qrm-connect');
  t.visit('tab-3', 'https://evil.com/x');
  t.sample(); cpu = 30; t.sample();
  t.crash();
  t.flush();
  await new Promise(resolve => setTimeout(resolve, 50)); // send() mislukt: server uit

  const queue = JSON.parse(fs.readFileSync(path.join(dir, 'telemetry-queue.json'), 'utf8'));
  assert.equal(queue.length, 1, 'rapport blijft in de wachtrij zolang de server uit staat');
  const report = queue[0];
  assert.deepEqual(report.visits, { '/sales-orders/:id': 1, '/qrm-connect': 1 });
  assert.equal(report.cpu.n, 2);
  assert.equal(report.cpu.max, 30);
  assert.equal(report.cpu.byKind['/sales-orders/:id'].sum, 20);
  assert.equal(report.seconds['/sales-orders/:id'], 60);
  assert.equal(report.crashes, 1);
  assert.deepEqual(report.crashKinds, { 'tab:crashed': 1 });
  assert.equal(report.settings.theme, 'laser');
  assert.ok(/^[0-9a-f-]{36}$/.test(report.id));
  assert.ok(!JSON.stringify(report).includes('30044'), 'geen ordernummer in het rapport');

  // Server weer bereikbaar: de wachtrij gaat leeg, het ID blijft hetzelfde.
  serverUp = true;
  await t.send();
  assert.equal(posted.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'telemetry-queue.json'), 'utf8')).length, 0);
  assert.equal(make().buildReport().id, report.id, 'zelfde installatie-ID');

  // Uit of zonder config: er wordt niets verzameld of verstuurd.
  enabled = false;
  t.visit('tab-9', 'https://snglng.lovable.app/customers/5');
  t.sample(); t.flush();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'telemetry-queue.json'), 'utf8')).length, 0);
  enabled = true;
  const stil = make(null);
  stil.visit('tab-1', 'https://snglng.lovable.app/customers/5'); stil.sample(); stil.flush();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'telemetry-queue.json'), 'utf8')).length, 0);

  // Server: rapport van buiten wordt opgeschoond; rommel wordt afgewezen.
  const clean = sanitize({ ...posted[0], extra: 'weg', cpu: { ...posted[0].cpu, evil: 1 } });
  assert.equal(clean.extra, undefined);
  assert.equal(clean.cpu.evil, undefined);
  assert.equal(sanitize({ id: 'niet-een-uuid' }), null);
  assert.equal(sanitize('tekst'), null);

  // Overzicht: gemiddelden, zwaarste pagina en thema.
  const summary = summarize([clean, { ...clean, sentAt: '2099-01-01T00:00:00Z' }]);
  assert.equal(summary.installs, 1, 'twee rapporten van één installatie = 1 installatie');
  assert.equal(summary.reports, 2);
  assert.equal(summary.pages[0].visits, 2);
  assert.equal(summary.cpuByTheme[0].theme, 'laser');
  assert.equal(summary.cpu.avg, 20);
  assert.equal(summary.cpu.max, 30);
  assert.equal(summary.crashes, 2);
  assert.deepEqual(summary.crashKinds, [['tab:crashed', 2]]);

  // Meldingen: wachtrij als de server uit staat, daarna versturen naar /melding.
  serverUp = false;
  assert.equal(await t.submitMelding({ type: 'bug', title: 'Factuur faalt', text: 'Foutmelding', page: '/sales-orders/1' }), 'queued');
  serverUp = true;
  posted.length = 0;
  assert.equal(await t.submitMelding({ type: 'idee', title: 'Zoeken op klant', text: '' }), 'sent');
  assert.deepEqual(posted.map(m => m.type), ['bug', 'idee'], 'eerst de oude uit de wachtrij, dan de nieuwe');
  assert.equal(posted[0].id, report.id);
  assert.equal(await make(null).submitMelding({ type: 'bug', title: 'x' }), 'unavailable');

  // Server: melding opschonen; zonder inhoud, zonder geldig ID of met een
  // niet-JPEG-afbeelding wordt hij afgewezen of de afbeelding weggelaten.
  const { sanitizeMelding } = require('../rapport/summarize');
  const m = sanitizeMelding({ ...posted[0], title: 'a'.repeat(500), screenshot: 'data:image/png;base64,AAAA', extra: 1 });
  assert.equal(m.title.length, 120);
  assert.equal(m.shot, null);
  assert.equal(m.extra, undefined);
  assert.equal(sanitizeMelding({ ...posted[0], title: '', text: '' }), null);
  assert.equal(sanitizeMelding({ ...posted[0], type: 'spam' }), null);
  assert.ok(sanitizeMelding({ ...posted[0], screenshot: 'data:image/jpeg;base64,/9j/AA==' }).shot);

  console.log('telemetry: alle controles geslaagd');
})().catch((error) => { console.error(error); process.exit(1); });

// Tijd op de voorgrond: aandeel van de open tijd waarin een app-venster de focus had.
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-telemetry-focus-'));
  let focused = true;
  const t = createTelemetry({ dir, appVersion: '1.3.0', config: { url: 'http://test/ingest', token: 'x'.repeat(20) }, isEnabled: () => true,
    getMetrics: () => ({ totalCpu: 5, activeCpu: 2, memMb: 500, windowFocused: focused, anyFocused: focused }),
    getActive: () => '/qrm-connect', getSnapshot: () => ({ theme: 'standaard' }), fetchImpl: async () => ({ ok: true }) });
  t.sample(); t.sample(); t.sample(); focused = false; t.sample();
  const report = t.buildReport();
  assert.deepEqual(report.time, { open: 120, focus: 90 });
  const clean = sanitize(report);
  assert.equal(summarize([clean]).focus.percent, 75);
  assert.equal(summarize([sanitize({ ...report, time: undefined })]).focus.percent, null, 'oude rapporten zonder tijdmeting');
  console.log('voorgrondtijd: alle controles geslaagd');

  // Geheugen per pc: 8 GB, de pc gebruikt gemiddeld 4 GB, de app 500 MB daarvan.
  const mem = summarize([sanitize({ ...report, ramGb: 8, cpu: { ...report.cpu, n: 2, memSum: 1000, memMax: 600, sysSum: 8192, sysMax: 7782 } })]).memory[0];
  assert.deepEqual({ ...mem, id: undefined }, { id: undefined, ramGb: 8, pcAvg: 50, pcMax: 95, appAvgMb: 500, appMaxMb: 600, appShare: 12 });
  assert.equal(summarize([sanitize({ ...report, cpu: { ...report.cpu, sysSum: undefined } })]).memory.length, 0, 'oude rapporten zonder pc-geheugen');
  console.log('geheugen per pc: alle controles geslaagd');
})().catch((error) => { console.error(error); process.exit(1); });
