// npm test: de rapport-server via echt http (poort 8796, tijdelijke map):
// wie wat mag, archiveren, pad-doorlopen, limieten, foute pc-klok en de hook.
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRapportServer } = require('../rapport/server');

const TOKEN = 'insturen-insturen-insturen-1';
const VIEW = 'lezen-lezen-lezen-lezen-2222';
const PORT = 8796;
const base = `http://127.0.0.1:${PORT}`;

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-server-'));
  const hooked = [];
  const server = createRapportServer({
    token: TOKEN, viewToken: VIEW, port: PORT, dataDir, maxInstalls: 2, maxMeldingenPerDay: 3,
    onMelding: (m) => { hooked.push(m.type); if (hooked.length === 2) throw new Error('fout in de hook'); }
  });
  await server.start();
  const post = (p, body, auth) => fetch(base + p, { method: 'POST', headers: auth ? { authorization: `Bearer ${auth}` } : {}, body: JSON.stringify(body) }).then(r => r.status);
  const get = (p) => fetch(base + p).then(async r => ({ status: r.status, text: await r.text(), type: r.headers.get('content-type') }));
  const report = (id, extra = {}) => ({ id, sentAt: '2099-01-01T00:00:00Z', appVersion: '1.3.0', settings: { theme: 'laser' }, visits: { '/qrm-connect': 1 }, cpu: { n: 2, sum: 20, max: 15, memSum: 2000, memMax: 1000, byKind: {} }, minutes: 30, ...extra });
  const idA = crypto.randomUUID(); const idB = crypto.randomUUID(); const idC = crypto.randomUUID();

  // Insturen: alleen met de insturen-sleutel, niet met de leessleutel.
  assert.equal(await post('/ingest', report(idA)), 401);
  assert.equal(await post('/ingest', report(idA), VIEW), 401);
  assert.equal(await post('/ingest', report(idA), TOKEN), 204);
  assert.equal(await post('/ingest', { id: 'rommel' }, TOKEN), 400);

  // Maximaal 2 installaties: een derde nieuw ID wordt geweigerd, een bekend ID mag blijven sturen.
  assert.equal(await post('/ingest', report(idB), TOKEN), 204);
  assert.equal(await post('/ingest', report(idC), TOKEN), 429);
  assert.equal(await post('/ingest', report(idA), TOKEN), 204);

  // Lezen: alleen met de leessleutel; de insturen-sleutel of geen sleutel geeft niets.
  assert.equal((await get('/api')).status, 401);
  assert.equal((await get(`/api?key=${TOKEN}`)).status, 401);
  const api = JSON.parse((await get(`/api?key=${VIEW}`)).text);
  assert.equal(api.installs, 2);
  // De pc zei 2099, de server weet beter: de dag is vandaag.
  assert.equal(api.byDay.length, 1);
  assert.equal(api.byDay[0].day, new Date().toISOString().slice(0, 10));
  assert.ok(!api.to.startsWith('2099'));
  assert.ok((await get(`/?key=${VIEW}`)).text.includes('Singeling App: overzicht'));

  // Meldingen: hook, schermafbeelding, daglimiet (3), foute melding.
  const melding = (title, extra = {}) => ({ type: 'bug', title, text: 'x', id: idA, ...extra });
  const jpeg = 'data:image/jpeg;base64,/9j/AA==';
  assert.equal(await post('/melding', melding('een', { screenshot: jpeg }), TOKEN), 204);
  assert.equal(await post('/melding', melding('twee'), TOKEN), 204, 'een fout in de hook breekt het ontvangen niet');
  assert.equal(await post('/melding', melding('drie', { type: 'idee' }), TOKEN), 204);
  assert.equal(await post('/melding', melding('vier'), TOKEN), 429, 'daglimiet bereikt');
  assert.equal(await post('/melding', { type: 'spam', title: 'x', id: idA }, TOKEN), 400);
  assert.equal(await post('/melding', melding('x'), VIEW), 401);
  assert.deepEqual(hooked, ['bug', 'bug', 'idee']);

  const list = JSON.parse((await get(`/api?key=${VIEW}`)).text).meldingen;
  const eerste = list.find(m => m.title === 'een');
  assert.ok(eerste.receivedAt && eerste.shotFile && eerste.file);
  const shot = await get(`/shot/${eerste.shotFile}?key=${VIEW}`);
  assert.equal(shot.status, 200);
  assert.equal(shot.type, 'image/jpeg');
  assert.equal((await get(`/shot/${eerste.shotFile}`)).status, 401);
  assert.equal((await get(`/shot/..%2F..%2Fx.jpg?key=${VIEW}`)).status, 404);

  // Archiveren en terugzetten; verkeerde sleutel en pad-doorlopen worden geweigerd.
  assert.equal(await post('/archive?key=fout', { file: eerste.file, archived: true }), 401);
  assert.equal(await post('/archive', { file: eerste.file, archived: true }, TOKEN), 401);
  assert.equal(await post(`/archive?key=${VIEW}`, { file: '../x', archived: true }), 400);
  assert.equal(await post(`/archive?key=${VIEW}`, { file: 'bestaat-niet', archived: true }), 404);
  assert.equal(await post(`/archive?key=${VIEW}`, { file: eerste.file, archived: true }), 204);
  let after = JSON.parse((await get(`/api?key=${VIEW}`)).text).meldingen;
  assert.deepEqual(after.filter(m => m.archivedAt).map(m => m.title), ['een']);
  assert.equal(await post(`/archive?key=${VIEW}`, { file: eerste.file, archived: false }), 204);
  after = JSON.parse((await get(`/api?key=${VIEW}`)).text).meldingen;
  assert.equal(after.filter(m => m.archivedAt).length, 0);

  // Stoppen en opnieuw starten werkt; twee servers op één poort geeft een duidelijke fout.
  await server.stop();
  assert.equal(server.running(), false);
  await server.start();
  const dubbel = createRapportServer({ token: TOKEN, viewToken: VIEW, port: PORT, dataDir });
  await assert.rejects(dubbel.start(), { code: 'EADDRINUSE' });
  await server.stop();

  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('server: alle controles geslaagd');
})().catch((error) => { console.error(error); process.exit(1); });
