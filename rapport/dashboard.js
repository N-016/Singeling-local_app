// De overzichtspagina van de rapport-server: kerncijfers, staafgrafieken en de
// meldingen (bugs en ideeën). Eén pagina, geen pakketten of externe scripts.
// Elke grafiek is één reeks, dus één kleur; tekst in tekstkleuren; per staafje
// een tooltip (title) en onder elke grafiek de tabel om uit te klappen.

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (n) => Number(n).toLocaleString('nl-NL');

// Liggende staafjes: label, staaf (breedte naar de grootste waarde), waarde.
function bars(rows, { unit = '', empty = 'Nog geen gegevens' } = {}) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  const max = Math.max(...rows.map(r => r.value), 1);
  return `<div class="bars">${rows.map(r => `
    <div class="bar-row" title="${esc(r.label)}: ${esc(nl(r.value))}${esc(unit)}${r.note ? ` (${esc(r.note)})` : ''}">
      <span class="bar-label">${esc(r.label)}</span>
      <span class="bar-track"><span class="bar" style="width:${Math.max(1, (r.value / max) * 100)}%"></span></span>
      <span class="bar-value">${esc(nl(r.value))}${esc(unit)}</span>
    </div>`).join('')}</div>`;
}

// Staande staafjes per dag (activiteit), met de datum eronder om de paar dagen.
function columns(rows) {
  if (!rows.length) return '<p class="empty">Nog geen gegevens</p>';
  const max = Math.max(...rows.map(r => r.value), 1);
  const every = Math.ceil(rows.length / 8);
  return `<div class="cols">${rows.map((r, i) => `
    <div class="col" title="${esc(r.label)}: ${esc(r.value)} installaties, ${esc(r.note)} uur">
      <span class="col-bar" style="height:${Math.max(2, (r.value / max) * 100)}%"></span>
      <span class="col-label">${i % every === 0 ? esc(r.label.slice(5)) : ''}</span>
    </div>`).join('')}</div>`;
}

const table = (head, rows) => `<details><summary>Tabel</summary><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
  rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9">Nog geen gegevens</td></tr>'
}</tbody></table></details>`;

const tile = (value, label) => `<div class="tile"><span class="tile-value">${esc(value)}</span><span class="tile-label">${esc(label)}</span></div>`;

function melding(m, key) {
  const when = m.receivedAt || m.sentAt;
  const date = when ? new Date(when).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const meta = [m.name && `van ${m.name}`, date, m.page, m.appVersion && `versie ${m.appVersion}`, m.theme && `thema ${m.theme}${m.dark ? ' (donker)' : ''}`, m.os && `Windows ${m.os}`]
    .filter(Boolean).map(esc).join(' · ');
  return `<article class="melding${m.archivedAt ? ' archived' : ''}">
    <div class="melding-head"><span class="badge badge-${m.type}">${m.type === 'bug' ? 'Bug' : 'Idee'}</span><h3>${esc(m.title || '(zonder titel)')}</h3>
      <button type="button" class="archive-btn" data-file="${esc(m.file)}" data-archived="${m.archivedAt ? '' : '1'}">${m.archivedAt ? 'Terugzetten' : 'Archiveren'}</button></div>
    ${m.text ? `<p class="melding-text">${esc(m.text)}</p>` : ''}
    <p class="melding-meta">${meta}</p>
    ${m.shotFile ? `<img class="shot" src="/shot/${encodeURIComponent(m.shotFile)}?key=${encodeURIComponent(key)}" alt="Schermafbeelding bij de melding (klik om te vergroten)" title="Klik om te vergroten">` : ''}
  </article>`;
}

function render(s, alle, key) {
  const meldingen = alle.filter(m => !m.archivedAt);
  const archief = alle.filter(m => m.archivedAt);
  const bugs = meldingen.filter(m => m.type === 'bug').length;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Singeling App: overzicht</title>
<style>
  :root { --bg: #f4f4f2; --surface: #fcfcfb; --ink: #1c1d22; --ink-2: #4a4c55; --muted: #7a7c85; --line: #e4e4e0; --bar: #2a78d6; --track: #eeeeea; --bug: #b3261e; --idee: #2a78d6; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #121211; --surface: #1a1a19; --ink: #ededeb; --ink-2: #bdbdb8; --muted: #8d8d88; --line: #2c2c2a; --bar: #3987e5; --track: #262624; --bug: #ff8a80; --idee: #3987e5; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, "Segoe UI", sans-serif; }
  header { padding: 22px 28px 0; }
  h1 { margin: 0; font-size: 20px; }
  .sub { margin: 4px 0 0; color: var(--muted); }
  nav { display: flex; gap: 4px; padding: 16px 28px 0; border-bottom: 1px solid var(--line); }
  nav button { padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-2); font: inherit; cursor: pointer; }
  nav button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--bar); font-weight: 600; }
  main { padding: 20px 28px 40px; max-width: 1200px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .tile, .card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
  .tile { padding: 14px 16px; display: flex; flex-direction: column; }
  .tile-value { font-size: 26px; font-weight: 650; }
  .tile-label { color: var(--muted); font-size: 12.5px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 14px; }
  .card { padding: 16px 18px; }
  .card h2 { margin: 0 0 2px; font-size: 15px; }
  .card .hint { margin: 0 0 12px; color: var(--muted); font-size: 12.5px; }
  .bars { display: flex; flex-direction: column; gap: 6px; }
  .bar-row { display: grid; grid-template-columns: minmax(120px, 34%) 1fr 64px; align-items: center; gap: 10px; padding: 2px 4px; border-radius: 4px; }
  .bar-row:hover { background: var(--track); }
  .bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
  .bar-track { height: 12px; }
  .bar { display: block; height: 100%; background: var(--bar); border-radius: 0 4px 4px 0; }
  .bar-value { text-align: right; font-variant-numeric: tabular-nums; }
  .cols { display: flex; align-items: flex-end; gap: 2px; height: 150px; padding-bottom: 18px; }
  .col { position: relative; flex: 1; max-width: 36px; height: 100%; display: flex; align-items: flex-end; }
  .col-bar { display: block; width: 100%; background: var(--bar); border-radius: 4px 4px 0 0; }
  .col:hover .col-bar { opacity: 0.75; }
  .col-label { position: absolute; bottom: -18px; left: 0; font-size: 11px; color: var(--muted); white-space: nowrap; }
  details { margin-top: 10px; }
  details.more { margin-top: 18px; }
  details.more > summary { font-size: 14px; color: var(--ink-2); padding: 6px 0; }
  details.more > .grid { margin-top: 10px; }
  summary { cursor: pointer; color: var(--muted); font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 13px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; }
  .empty { color: var(--muted); }
  .melding { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .melding-head { display: flex; align-items: center; gap: 10px; }
  .melding h3 { margin: 0; font-size: 15px; }
  .badge { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor; }
  .badge-bug { color: var(--bug); }
  .badge-idee { color: var(--idee); }
  .melding.archived { opacity: 0.7; }
  .archive-btn { margin-left: auto; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: none; color: var(--ink-2); font: inherit; font-size: 12.5px; cursor: pointer; }
  .archive-btn:hover { border-color: var(--bar); color: var(--ink); }
  .melding-text { white-space: pre-wrap; margin: 8px 0; }
  .melding-meta { margin: 0; color: var(--muted); font-size: 12.5px; }
  .shot { display: block; max-width: 420px; width: 100%; margin-top: 10px; border: 1px solid var(--line); border-radius: 6px; cursor: zoom-in; }
  .shot.large { max-width: 100%; cursor: zoom-out; }
  [hidden] { display: none !important; }
</style></head><body>
<header>
  <h1>Singeling App: overzicht</h1>
  <p class="sub">${s.from ? `${esc(s.from.slice(0, 10))} t/m ${esc(s.to.slice(0, 10))}` : 'Nog geen rapporten'} · anonieme gegevens van de laatste 30 dagen</p>
</header>
<nav role="tablist">
  <button role="tab" aria-selected="true" data-tab="gebruik">Gebruik</button>
  <button role="tab" aria-selected="false" data-tab="meldingen">Meldingen (${meldingen.length})</button>
  <button role="tab" aria-selected="false" data-tab="archief">Archief (${archief.length})</button>
</nav>
<main>
  <section data-panel="gebruik">
    <div class="tiles">
      ${tile(nl(s.installs), 'installaties')}
      ${tile(nl(Math.round(s.minutes / 60)), 'uur in de app')}
      ${tile(s.focus.percent === null ? '-' : `${s.focus.percent}%`, 'van de tijd op de voorgrond')}
      ${tile(`${s.cpu.avg}%`, 'gemiddelde CPU (100 = één kern)')}
      ${tile(`${nl(Math.round(s.cpu.memAvgMb))} MB`, 'gemiddeld geheugen')}
      ${tile(nl(s.crashes), 'gecrashte tabs')}
    </div>
    <div class="grid">
      <div class="card"><h2>Meest bezochte pagina's</h2><p class="hint">Keer geopend, per soort pagina (zonder nummers).</p>
        ${bars(s.pages.map(p => ({ label: p.kind, value: p.visits, note: `${p.minutes} min erop` })))}
        ${table(['Pagina', 'Keer geopend', 'Minuten erop'], s.pages.map(p => [p.kind, p.visits, p.minutes]))}</div>
      <div class="card"><h2>Zwaarste pagina's</h2><p class="hint">Gemiddelde CPU van de pagina waar je op staat (100 = één kern). Hier valt te winnen.</p>
        ${bars(s.heavyPages.map(p => ({ label: p.kind, value: p.avgCpu, note: `piek ${p.maxCpu}%, ${p.samples} metingen` })), { unit: '%' })}
        ${table(['Pagina', 'Gem. CPU %', 'Piek %', 'Metingen'], s.heavyPages.map(p => [p.kind, p.avgCpu, p.maxCpu, p.samples]))}</div>
      <div class="card"><h2>Thema's: belasting</h2><p class="hint">Gemiddelde CPU van de hele app per thema. Zware thema's staan bovenaan.</p>
        ${bars(s.cpuByTheme.map(t => ({ label: t.theme, value: t.avgCpu, note: `${t.minutes} min, ${t.memAvgMb} MB` })), { unit: '%' })}
        ${table(['Thema', 'Minuten', 'Gem. CPU %', 'Piek %', 'Gem. geheugen MB'], s.cpuByTheme.map(t => [t.theme, t.minutes, t.avgCpu, t.maxCpu, t.memAvgMb]))}</div>
      <div class="card"><h2>Op de voorgrond</h2><p class="hint">Aandeel van de tijd dat de app open staat waarin het venster ook echt de focus heeft. ${s.focus.percent === null ? 'Nog geen meting.' : `Samen ${nl(s.focus.hoursFocus)} van ${nl(s.focus.hoursOpen)} uur.`}</p>
        ${bars(s.focus.byInstall.map(p => ({ label: 'Installatie ' + p.id, value: p.percent, note: p.hours + ' uur open' })), { unit: '%', empty: 'Nog geen metingen (een installatie telt mee na 10 minuten).' })}
        ${table(['Installatie', 'Op de voorgrond %', 'Uur open'], s.focus.byInstall.map(p => [p.id, p.percent, p.hours]))}</div>
      <div class="card"><h2>Activiteit per dag</h2><p class="hint">Aantal installaties dat die dag de app gebruikte.</p>
        ${columns(s.byDay.map(d => ({ label: d.day, value: d.installs, note: d.hours })))}
        ${table(['Dag', 'Installaties', 'Uur'], s.byDay.map(d => [d.day, d.installs, d.hours]))}</div>
    </div>
    <details class="more"><summary>Meer details: appversies, instellingen, Windows (${s.darkShare}% van de tijd donker)</summary>
    <div class="grid">
      <div class="card"><h2>Thema's per installatie</h2><p class="hint">Welk thema staat er nu ingesteld.</p>
        ${bars(s.themeInstalls.map(([theme, n]) => ({ label: theme, value: n })))}
        ${table(['Thema', 'Installaties'], s.themeInstalls)}</div>
      <div class="card"><h2>Appversies</h2><p class="hint">Wie heeft nog niet bijgewerkt?</p>
        ${bars(s.versions.map(([version, n]) => ({ label: version, value: n })))}
        ${table(['Versie', 'Installaties'], s.versions)}</div>
      <div class="card"><h2>Instellingen</h2><p class="hint">Aantal installaties waarbij dit aan staat.</p>
        ${bars(Object.entries(s.adoption).map(([name, n]) => ({ label: name, value: n })))}
        ${table(['Instelling', 'Installaties'], Object.entries(s.adoption))}</div>
      <div class="card"><h2>Windows</h2><p class="hint">Windows-versies (build).</p>
        ${bars(s.windows.map(([version, n]) => ({ label: version, value: n })))}
        ${table(['Windows', 'Installaties'], s.windows)}</div>
    </div>
    </details>
  </section>
  <section data-panel="meldingen" hidden>
    <div class="tiles">${tile(nl(bugs), 'bugs')}${tile(nl(meldingen.length - bugs), 'ideeën')}</div>
    ${meldingen.length ? meldingen.map(m => melding(m, key)).join('') : '<p class="empty">Geen open meldingen.</p>'}
  </section>
  <section data-panel="archief" hidden>
    ${archief.length ? archief.map(m => melding(m, key)).join('') : '<p class="empty">Het archief is leeg. Archiveer een melding als je hem hebt afgehandeld.</p>'}
  </section>
</main>
<script>
  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t === tab));
      for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== tab.dataset.tab;
      history.replaceState(null, '', '#' + tab.dataset.tab);
      // De app (Beheer) weet dan dat de nieuwe meldingen gezien zijn.
      if (tab.dataset.tab === 'meldingen' && parent !== window) parent.postMessage({ type: 'melding-seen' }, '*');
    });
  }
  // Schermafbeelding groter/kleiner (geen nieuw venster: dat blokkeert de app).
  for (const shot of document.querySelectorAll('.shot')) shot.addEventListener('click', () => shot.classList.toggle('large'));
  // Archiveren of terugzetten, en de pagina opnieuw laden op hetzelfde tabblad.
  for (const button of document.querySelectorAll('.archive-btn')) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const response = await fetch('/archive?key=' + encodeURIComponent(${JSON.stringify(key)}), {
        method: 'POST', body: JSON.stringify({ file: button.dataset.file, archived: !!button.dataset.archived })
      });
      if (response.ok) location.reload(); else button.disabled = false;
    });
  }
  if (location.hash === '#archief') document.querySelector('[data-tab="archief"]').click();
  if (location.hash === '#meldingen') document.querySelector('[data-tab="meldingen"]').click();
</script></body></html>`;
}

module.exports = { render };
