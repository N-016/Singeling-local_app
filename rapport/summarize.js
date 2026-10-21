// Maakt van de losse rapporten (zie ../../telemetry.js) een overzicht. Los van
// de server, zodat het ook te testen is en als command-line te draaien:
//   node tools/rapport-server/report.js [dagen]

// Een rapport van buiten kan van alles bevatten: alleen bekende velden met het
// juiste type en een redelijke grootte komen erdoor, de rest valt weg.
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (value, max = 60) => (typeof value === 'string' ? value.slice(0, max) : null);
  const num = (value, max = 1e9) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0);
  const counts = (obj) => {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const [key, value] of Object.entries(obj).slice(0, 200)) out[key.slice(0, 80)] = num(value, 1e7);
    return out;
  };
  if (typeof raw.id !== 'string' || !/^[0-9a-f-]{36}$/.test(raw.id)) return null;
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const cpu = raw.cpu && typeof raw.cpu === 'object' ? raw.cpu : {};
  const byKind = {};
  for (const [kind, entry] of Object.entries(cpu.byKind && typeof cpu.byKind === 'object' ? cpu.byKind : {}).slice(0, 200)) {
    if (entry && typeof entry === 'object') byKind[kind.slice(0, 80)] = { n: num(entry.n, 1e6), sum: num(entry.sum, 1e9), max: num(entry.max, 1e5) };
  }
  return {
    v: 1,
    id: raw.id,
    sentAt: str(raw.sentAt, 40),
    appVersion: str(raw.appVersion),
    electron: str(raw.electron),
    os: str(raw.os),
    arch: str(raw.arch, 20),
    cores: num(raw.cores, 512),
    ramGb: num(raw.ramGb, 4096),
    minutes: num(raw.minutes, 1e5),
    settings: {
      theme: str(settings.theme), dark: !!settings.dark, themeMode: str(settings.themeMode, 20), soft: !!settings.soft,
      zoom: num(settings.zoom, 10), tabBarDisabled: !!settings.tabBarDisabled, allLinksNewTab: !!settings.allLinksNewTab,
      beta: !!settings.beta, notifications: !!settings.notifications, notClocked: str(settings.notClocked, 20),
      tabs: num(settings.tabs, 1000), detached: num(settings.detached, 1000), startTabs: num(settings.startTabs, 1000),
      groups: num(settings.groups, 1000), displays: num(settings.displays, 20)
    },
    time: { open: num(raw.time && raw.time.open, 1e7), focus: num(raw.time && raw.time.focus, 1e7) },
    visits: counts(raw.visits),
    seconds: counts(raw.seconds),
    cpu: { n: num(cpu.n, 1e6), sum: num(cpu.sum, 1e9), max: num(cpu.max, 1e5), memSum: num(cpu.memSum, 1e10), memMax: num(cpu.memMax, 1e6), sysSum: num(cpu.sysSum, 1e12), sysMax: num(cpu.sysMax, 1e7), byKind },
    crashes: num(raw.crashes, 1e5),
    crashKinds: counts(raw.crashKinds)
  };
}

// Een melding (bug of idee) uit de app: korte velden, een schermafbeelding
// alleen als JPEG-dataURL van redelijke grootte.
const MAX_SHOT = 1500 * 1024;
function sanitizeMelding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const type = raw.type === 'idee' ? 'idee' : raw.type === 'bug' ? 'bug' : null;
  const title = str(raw.title, 120);
  const text = str(raw.text, 5000);
  if (!type || typeof raw.id !== 'string' || !/^[0-9a-f-]{36}$/.test(raw.id) || (!title && !text)) return null;
  const shot = typeof raw.screenshot === 'string' && raw.screenshot.startsWith('data:image/jpeg;base64,') && raw.screenshot.length <= MAX_SHOT
    ? raw.screenshot : null;
  return {
    type, title, text, id: raw.id, shot,
    name: str(raw.name, 80), page: str(raw.page, 300), appVersion: str(raw.appVersion, 40),
    theme: str(raw.theme, 40), dark: !!raw.dark, os: str(raw.os, 40), sentAt: str(raw.sentAt, 40)
  };
}

// Wanneer een rapport binnenkwam: de tijd van de server, want de klok van de
// pc kan fout staan (dan kwam het rapport 'in 2099' of 'gisteren' binnen).
const stamp = (report) => report.receivedAt || report.sentAt || '';
const add = (map, key, amount = 1) => { map[key] = (map[key] || 0) + amount; };
const top = (map, limit) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
const avg = (sum, n) => (n > 0 ? Math.round((sum / n) * 10) / 10 : 0);

function summarize(reports) {
  const latest = new Map(); // nieuwste rapport per installatie
  const out = { reports: reports.length, installs: 0, from: null, to: null, minutes: 0, crashes: 0 };
  const visits = {}; const seconds = {}; const pageCpu = {};
  const byTheme = {}; const byVersion = {}; const darkMinutes = { dark: 0, light: 0 };
  const total = { n: 0, sum: 0, max: 0, memSum: 0, memMax: 0 };
  const crashKinds = {};
  const days = {}; // YYYY-MM-DD -> { ids: Set, minutes }
  const time = { open: 0, focus: 0 };
  const timeByInstall = {}; // id -> { open, focus }
  const memByInstall = {}; // id -> { n, app, sys, sysMax, appMax } (MB), alleen rapporten met pc-geheugen

  for (const report of reports) {
    const day = stamp(report).slice(0, 10);
    if (day) {
      const d = days[day] || (days[day] = { ids: new Set(), minutes: 0 });
      d.ids.add(report.id);
      d.minutes += report.minutes;
    }
    const known = latest.get(report.id);
    if (!known || stamp(report) > stamp(known)) latest.set(report.id, report);
    if (!out.from || stamp(report) < out.from) out.from = stamp(report);
    if (!out.to || stamp(report) > out.to) out.to = stamp(report);
    out.minutes += report.minutes;
    out.crashes += report.crashes;
    for (const [kind, n] of Object.entries(report.crashKinds || {})) add(crashKinds, kind, n);
    if (report.time) {
      time.open += report.time.open; time.focus += report.time.focus;
      const t = timeByInstall[report.id] || (timeByInstall[report.id] = { open: 0, focus: 0 });
      t.open += report.time.open; t.focus += report.time.focus;
    }
    for (const [kind, n] of Object.entries(report.visits)) add(visits, kind, n);
    for (const [kind, n] of Object.entries(report.seconds)) add(seconds, kind, n);
    for (const [kind, e] of Object.entries(report.cpu.byKind)) {
      const p = pageCpu[kind] || (pageCpu[kind] = { n: 0, sum: 0, max: 0 });
      p.n += e.n; p.sum += e.sum; p.max = Math.max(p.max, e.max);
    }
    total.n += report.cpu.n; total.sum += report.cpu.sum; total.max = Math.max(total.max, report.cpu.max);
    total.memSum += report.cpu.memSum; total.memMax = Math.max(total.memMax, report.cpu.memMax);
    if (report.cpu.sysSum > 0) {
      const m = memByInstall[report.id] || (memByInstall[report.id] = { n: 0, app: 0, sys: 0, sysMax: 0, appMax: 0 });
      m.n += report.cpu.n; m.app += report.cpu.memSum; m.sys += report.cpu.sysSum;
      m.sysMax = Math.max(m.sysMax, report.cpu.sysMax); m.appMax = Math.max(m.appMax, report.cpu.memMax);
    }
    const theme = report.settings.theme || 'onbekend';
    const t = byTheme[theme] || (byTheme[theme] = { minutes: 0, n: 0, sum: 0, max: 0, memSum: 0 });
    t.minutes += report.minutes; t.n += report.cpu.n; t.sum += report.cpu.sum; t.max = Math.max(t.max, report.cpu.max); t.memSum += report.cpu.memSum;
    add(darkMinutes, report.settings.dark ? 'dark' : 'light', report.minutes);
    const v = byVersion[report.appVersion || 'onbekend'] || (byVersion[report.appVersion || 'onbekend'] = { n: 0, sum: 0 });
    v.n += report.cpu.n; v.sum += report.cpu.sum;
  }

  out.installs = latest.size;
  // Aandeel van de tijd op de voorgrond: alleen rapporten met een tijdmeting
  // (oudere versies hebben die niet). Per installatie met een kort nummer,
  // anoniem; laagste bovenaan is niet interessant, dus hoogste eerst.
  out.focus = {
    percent: time.open > 0 ? Math.round((time.focus / time.open) * 100) : null,
    hoursOpen: Math.round(time.open / 360) / 10,
    hoursFocus: Math.round(time.focus / 360) / 10,
    byInstall: Object.entries(timeByInstall).filter(([, t]) => t.open >= 600)
      .map(([id, t]) => ({ id: id.slice(0, 4), percent: Math.round((t.focus / t.open) * 100), hours: Math.round(t.open / 360) / 10 }))
      .sort((a, b) => b.percent - a.percent).slice(0, 30)
  };
  // Geheugen per pc: heeft iemand genoeg RAM? Hoe vol zit de pc (gemiddeld en
  // op het drukste moment), en welk deel daarvan is de app. Volste pc bovenaan.
  out.memory = Object.entries(memByInstall).filter(([id, m]) => m.n > 0 && latest.get(id).ramGb > 0).map(([id, m]) => {
    const ramMb = latest.get(id).ramGb * 1024;
    return {
      id: id.slice(0, 4), ramGb: latest.get(id).ramGb,
      pcAvg: Math.round((m.sys / m.n / ramMb) * 100), pcMax: Math.min(100, Math.round((m.sysMax / ramMb) * 100)),
      appAvgMb: Math.round(m.app / m.n), appMaxMb: Math.round(m.appMax), appShare: m.sys > 0 ? Math.round((m.app / m.sys) * 100) : 0
    };
  }).sort((a, b) => b.pcMax - a.pcMax).slice(0, 50);
  out.crashKinds = top(crashKinds, 15);
  out.byDay = Object.keys(days).sort().map(day => ({ day, installs: days[day].ids.size, hours: Math.round(days[day].minutes / 6) / 10 }));
  const installs = [...latest.values()];
  const count = (pick) => { const m = {}; for (const r of installs) add(m, pick(r) ?? 'onbekend'); return top(m, 12); };
  out.versions = count(r => r.appVersion);
  out.windows = count(r => r.os);
  out.themeInstalls = count(r => r.settings.theme);
  out.adoption = {
    donker: installs.filter(r => r.settings.dark).length,
    oogcomfort: installs.filter(r => r.settings.soft).length,
    tabbalkUit: installs.filter(r => r.settings.tabBarDisabled).length,
    allesNieuwTab: installs.filter(r => r.settings.allLinksNewTab).length,
    beta: installs.filter(r => r.settings.beta).length,
    windowsMeldingen: installs.filter(r => r.settings.notifications).length,
    startTabs: installs.filter(r => r.settings.startTabs > 0).length,
    tabgroepen: installs.filter(r => r.settings.groups > 0).length
  };
  out.darkShare = darkMinutes.dark + darkMinutes.light > 0 ? Math.round((darkMinutes.dark / (darkMinutes.dark + darkMinutes.light)) * 100) : 0;
  out.pages = top(visits, 15).map(([kind, n]) => ({ kind, visits: n, minutes: Math.round((seconds[kind] || 0) / 60) }));
  out.pagesByTime = top(seconds, 10).map(([kind, s]) => ({ kind, minutes: Math.round(s / 60) }));
  // Zwaarste pagina's: gemiddelde CPU van de pagina waar je op staat. Pas
  // vanaf 5 metingen, anders telt één piek te zwaar.
  out.heavyPages = Object.entries(pageCpu).filter(([, p]) => p.n >= 5)
    .map(([kind, p]) => ({ kind, avgCpu: avg(p.sum, p.n), maxCpu: Math.round(p.max), samples: p.n }))
    .sort((a, b) => b.avgCpu - a.avgCpu).slice(0, 10);
  out.cpu = { avg: avg(total.sum, total.n), max: Math.round(total.max), memAvgMb: avg(total.memSum, total.n), memMaxMb: total.memMax, samples: total.n };
  out.cpuByTheme = Object.entries(byTheme).filter(([, t]) => t.n > 0)
    .map(([theme, t]) => ({ theme, minutes: t.minutes, avgCpu: avg(t.sum, t.n), maxCpu: Math.round(t.max), memAvgMb: avg(t.memSum, t.n) }))
    .sort((a, b) => b.avgCpu - a.avgCpu);
  out.cpuByVersion = Object.entries(byVersion).filter(([, v]) => v.n > 0)
    .map(([version, v]) => ({ version, avgCpu: avg(v.sum, v.n) })).sort((a, b) => (a.version < b.version ? 1 : -1));
  return out;
}

module.exports = { sanitize, sanitizeMelding, summarize };
