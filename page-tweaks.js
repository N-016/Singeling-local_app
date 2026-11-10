// Kleine aanpassingen aan de Singeling-pagina's (Lovable-app), los van de
// donkere modus. Wordt net als DARK_MODE_CSS bij elke paginalading ingevoegd;
// regels die van een instelling afhangen hangen onder een class op <html>
// (die zet main.js, zie applyPageTweaks).
//
// Klokbalk bovenaan de pagina (.clockbar in de webapp) heeft drie standen:
//   - "Afwezig": zelfde balk met inline background var(--stop)  -> blijft zoals hij is
//   - "Niet geklokt op een order": oranje balk                    -> instelling: aan / subtiel / uit
//   - "Geklokt op ...": een ander blok (geen .clockbar)           -> blijft zoals hij is
// "Niet geklokt" herkennen we dus aan .clockbar zonder --stop in de style.
// Verandert dat in de webapp, dan hier de selector aanpassen.

const NOT_CLOCKED = '.sg-app .clockbar:not([style*="--stop"])';

const PAGE_TWEAKS_CSS = `
  /* Knoppen die de webapp rechtsonder over de pagina legt en die in de app
     alleen in de weg zitten: de badge "Edit with Lovable" en het zwevende
     sneltoetsenknopje (de sneltoets ? werkt gewoon nog). */
  #lovable-badge,
  div.fixed:has(> button[title^="Sneltoetsen"]) {
    display: none !important;
  }

  /* Een keuzelijst of pop-up blokkeert het scrollen (body[data-scroll-locked]):
     de schuifbalk verdwijnt en de webapp schuift de inhoud 17px op met een
     marge. De achtergrond van een thema vult het hele scherm en schoof dan
     mee. Met een achtergrond: schuifbalk altijd tonen, marge weg, en body
     niet zelf laten afknippen (anders plakt de zijbalk niet meer). */
  html.sg-wallpaper { overflow-y: scroll; }
  html.sg-wallpaper body[data-scroll-locked] { margin-right: 0 !important; overflow: visible !important; }

  /* Instelling "Niet geklokt op een order": "aan" (de standaard) laat de
     oranje balk van de webapp gewoon staan. */

  /* "Subtiel": rustige regel i.p.v. de grote oranje balk. */
  html.sg-not-clocked-subtiel ${NOT_CLOCKED} {
    height: 24px;
    background: transparent;
    color: var(--fg-2);
    border-bottom: 1px solid var(--border-1);
    font-size: 10.5px;
    letter-spacing: 0.1em;
  }

  html.sg-not-clocked-subtiel ${NOT_CLOCKED} svg {
    width: 12px;
    height: 12px;
    color: var(--sg-orange);
  }

  /* "Uit": helemaal weg. */
  html.sg-not-clocked-uit ${NOT_CLOCKED} {
    display: none;
  }

  /* Knop "Openen in nieuw tabblad" in de kop van de viewer (PREVIEW_TAB_SCRIPT):
     naast de bestandsnaam, links van het sluitkruisje. */
  [data-dialog-drag-handle]:has(> .sg-preview-newtab) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-right: 3.5rem;
  }

  .sg-preview-newtab {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    height: 32px;
    margin-top: 0 !important;
    padding: 0 12px;
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .sg-preview-newtab:hover {
    background: hsl(var(--accent));
  }

  /* Melding bij het printen van stickers op de DYMO (LABEL_PRINT_SCRIPT). */
  .sg-label-note {
    position: fixed;
    left: 50%;
    bottom: 28px;
    z-index: 2147483647;
    max-width: min(520px, calc(100vw - 32px));
    padding: 10px 16px;
    border-radius: 8px;
    background: #1f2937;
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    transform: translateX(-50%);
    pointer-events: none;
  }

  .sg-label-note-error {
    background: #b42318;
  }

  /* Navigatie (zijbalk links). De webapp maakt die altijd bijna zwart
     (--sg-ink); hier volgt hij de donkere modus: heel donkergrijs in donker,
     lichtgrijs met donkere tekst in licht. Kleuren = de tabbalk (index.html).
     Niet bij het thema "Origineel" (class sg-original): dan blijft de
     zijbalk zoals de webapp hem maakt. */
  html.dark .sg-app .side {
    background: #1e2127;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
  }

  html:not(.dark):not(.sg-original) .sg-app .side {
    background: #f0f2f4;
    color: #4a5059;
    border-right: 1px solid #dfe2e6;
  }

  html:not(.dark):not(.sg-original) .sg-app .side .brand .t { color: #16181d; }
  html:not(.dark):not(.sg-original) .sg-app .side .brand .t span { color: #6b7178; }
  html:not(.dark):not(.sg-original) .sg-app .side .foot { color: #9aa0a8; }

  html:not(.dark):not(.sg-original) .sg-app .side .sidetoggle { color: #6b7178; }
  html:not(.dark):not(.sg-original) .sg-app .side .sidetoggle:hover {
    background: rgba(22, 24, 29, 0.06);
    color: #16181d;
  }

  html:not(.dark):not(.sg-original) .sg-app .navg .it,
  html:not(.dark):not(.sg-original) .sg-app .navg .sub a {
    color: #4a5059;
  }

  html:not(.dark):not(.sg-original) .sg-app .navg .it:hover {
    background: rgba(22, 24, 29, 0.06);
    color: #16181d;
  }

  html:not(.dark):not(.sg-original) .sg-app .navg .it.open,
  html:not(.dark):not(.sg-original) .sg-app .navg .sub a:hover {
    color: #16181d;
  }

  html:not(.dark):not(.sg-original) .sg-app .navg .it.active,
  html:not(.dark):not(.sg-original) .sg-app .navg .sub a.active {
    color: #16181d;
    background: rgba(255, 81, 0, 0.12);
  }

  html:not(.dark):not(.sg-original) .sg-app .navg .sub {
    border-left-color: #d5d9de;
  }

  /* Zachtgrijze weergave (soft-mode.js): zijbalk iets dieper grijs dan de
     pagina, zodat hij zich blijft onderscheiden. Na de lichte regels hierboven
     (zelfde specificiteit), dus deze wint. */
  html.sg-soft .sg-app .side {
    background: #d4d4cf;
    border-right-color: #c6c6c1;
  }

  html.sg-soft .sg-app .navg .sub {
    border-left-color: #c9c9c4;
  }
`;

// Doorzichtige tinten dicht maken bij een thema met een achtergrondafbeelding
// (class sg-wallpaper, main.js). De webapp gebruikt veel tinten als
// "bg-success/10" (10% groen): op een gewone pagina valt dat niet op, maar met
// een achtergrondafbeelding schijnt die erdoorheen en wordt tekst slecht
// leesbaar (bv. de ingeklokte mensen op de Shopfloor).
//
// Het script zoekt in de stylesheets van de pagina alle regels met zo'n
// doorzichtige achtergrondkleur en legt er een dichte kaartkleur onder: de
// tint blijft, alleen schijnt de achtergrond er niet meer door. Zo werkt het
// ook voor kleuren die Lovable later toevoegt. Bewust doorzichtig blijft:
// zwart/wit (de waas achter een pop-up, glimlaagjes), primary-foreground
// (glimlaag op knoppen), border en muted-foreground (lijntjes, stipjes).
const SOLID_TINTS_SCRIPT = `(() => {
  if (window.__sgSolidTints) return;
  window.__sgSolidTints = true;
  const SKIP = /bg-(black|white|transparent|primary-foreground|border|muted-foreground)\\b/;
  const style = document.createElement('style');
  style.id = 'sg-solid-tints';
  document.head.appendChild(style);
  const seen = new Set();
  const scan = () => {
    const out = [];
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode === style) continue;
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list) => {
        for (const rule of list) {
          if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); continue; }
          const selector = rule.selectorText;
          if (!selector || !selector.includes('bg-') || SKIP.test(selector) || seen.has(selector)) continue;
          const value = rule.style && rule.style.getPropertyValue('background-color');
          // Alleen tinten met doorzichtigheid: "hsl(var(--x) / .1)" of rgba(..., 0.x).
          if (!value || !/\\/\\s*\\.?\\d|rgba\\(/.test(value)) continue;
          seen.add(selector);
          // Een tint met !important (bv. .!bg-info/10) krijgt dat hier ook.
          const imp = rule.style.getPropertyPriority('background-color') === 'important' ? ' !important' : '';
          const scoped = selector.split(',').map(part => 'html.sg-wallpaper ' + part.trim()).join(', ');
          out.push(scoped + ' { background-image: linear-gradient(' + value + ', ' + value + ')' + imp + '; background-color: hsl(var(--card))' + imp + '; }');
        }
      };
      walk(rules);
    }
    if (out.length) style.textContent += out.join('\\n') + '\\n';
  };
  scan();
  // Later geladen stylesheets (bv. een nieuwe pagina in de app) ook meenemen.
  let timer = null;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 300); })
    .observe(document.head, { childList: true });
})();`;

// Knop "Openen in nieuw tabblad" in de viewer van "Bekijken" (documenten).
// Die viewer is een venster binnen de pagina en kan dus niet naar een tweede
// scherm; als tab wel (losslepen). Elke documentregel heeft naast "Bekijken"
// al de knop "Openen in nieuw tabblad"; deze knop in de viewer klikt die van
// hetzelfde document en sluit de viewer. Bij STEP opent die knop geen tab
// (download), dus daar komt hij niet. Verandert de webapp de knoppen of de
// viewer, dan verschijnt de knop gewoon niet.
const PREVIEW_TAB_SCRIPT = `(() => {
  if (window.__sgPreviewTab) return;
  window.__sgPreviewTab = true;
  let opener = null;
  document.addEventListener('click', (event) => {
    const view = event.target.closest && event.target.closest('button[title="Bekijken"]');
    if (view) opener = view.parentElement.querySelector('button[title="Openen in nieuw tabblad"]');
  }, true);
  const addButton = (dialog) => {
    const head = dialog.querySelector('[data-dialog-drag-handle]');
    const title = head && head.querySelector('h2');
    if (!title || head.querySelector('.sg-preview-newtab') || !opener || !opener.isConnected) return;
    if (/\\.(stp|step)$/i.test(title.textContent.trim())) return;
    const source = opener;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sg-preview-newtab';
    button.title = 'Openen in nieuw tabblad. Die tab kun je onder de balk uit slepen, bv. naar een tweede scherm.';
    button.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
    button.append('Openen in nieuw tabblad');
    // De kop is ook de sleepgreep van de viewer: niet gaan slepen bij een klik.
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', () => {
      source.click();
      const close = [...dialog.querySelectorAll('button')].find(b => /^(Sluiten|Close)$/.test(b.textContent.trim()));
      if (close) close.click();
    });
    head.appendChild(button);
  };
  new MutationObserver(() => {
    document.querySelectorAll('[role="dialog"][data-state="open"]').forEach(addButton);
  }).observe(document.body, { childList: true, subtree: true });
})();`;

// Transportstickers meteen op de DYMO, zonder printdialoog. "Deze sticker
// printen" / "Alle stickers printen" laat de webapp een PDF maken en die in
// een voorbeeld ("Stickers transport ...") tonen, met "Afdrukken" (= het
// printdialoog). Staat het formaat op een labelprinter, dan stuurt dit script
// die PDF naar main.js (ELECTRON_PRINT_LABEL), dat hem stil op de DYMO print.
// Gelukt: voorbeeld dicht. Niet gelukt (geen DYMO, printfout): voorbeeld
// blijft open met een melding, zodat je via "Afdrukken" alsnog kunt printen.
// Bij "A4-vel" verandert er niets. Verandert de webapp het voorbeeld of de
// formaatkeuze, dan gaat alles gewoon weer via het dialoog.
const LABEL_PRINT_SCRIPT = `(() => {
  if (window.__sgLabelPrint) return;
  window.__sgLabelPrint = true;
  const handled = new WeakSet();
  let pending = null;
  const note = (text, ok) => {
    const el = document.createElement('div');
    el.className = 'sg-label-note' + (ok ? '' : ' sg-label-note-error');
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ok ? 3000 : 7000);
  };
  // Antwoord van main.js na het printen.
  window.__sgLabelPrinted = (ok, message) => {
    const dialog = pending;
    pending = null;
    note(message, ok);
    if (!ok || !dialog) return;
    const close = [...dialog.querySelectorAll('button')].find(b => /^(Sluiten|Close)$/.test(b.textContent.trim()));
    if (close) close.click();
  };
  const toBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  };
  new MutationObserver(() => {
    for (const dialog of document.querySelectorAll('[role="dialog"][data-state="open"]')) {
      if (handled.has(dialog)) continue;
      const title = (dialog.querySelector('h2') || {}).textContent || '';
      const frame = dialog.querySelector('iframe[src^="blob:"]');
      if (!/^Stickers\\b/.test(title) || !frame) continue;
      handled.add(dialog);
      // De formaatkeuze staat in het transportvenster eronder.
      const format = [...document.querySelectorAll('button[role="combobox"]')]
        .map(b => b.textContent.trim()).find(t => /^(Labelprinter|A4)/.test(t)) || '';
      if (!/^Labelprinter/.test(format)) continue;
      pending = dialog;
      note('Stickers naar de DYMO sturen…', true);
      fetch(frame.src)
        .then(response => response.arrayBuffer())
        .then(buffer => console.log('ELECTRON_PRINT_LABEL:' + toBase64(buffer)))
        .catch(() => window.__sgLabelPrinted(false, 'De stickers konden niet gelezen worden. Print via "Afdrukken".'));
    }
  }).observe(document.body, { childList: true, subtree: true });
})();`;

// Knop "Print rit" in Transport > Dag planning, naast "Ritindeling voorstellen".
// Opent een eigen keuzevenster met de ritten van die dag; de gekozen rit wordt
// als beknopt overzicht (klant, adres, actie, goederen, referentie) geprint.
// De gegevens komen uit de ritkolommen op het scherm zelf: verandert de webapp
// die opbouw ("Rit N"-kop, titels "Klik om bestemming te bewerken" e.d.), dan
// hier de selectors aanpassen.
const PRINT_RIT_SCRIPT = `(() => {
  if (window.__sgPrintRit) return;
  window.__sgPrintRit = true;
  const ANCHOR = 'button[title^="Stel voor welke transporten"]';
  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const style = el('style', [
    '.sg-pr-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}',
    '.sg-pr-box{background:hsl(var(--card));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:8px;padding:20px;width:360px;max-width:90vw;display:flex;flex-direction:column;gap:8px}',
    '.sg-pr-box h2{font-size:16px;font-weight:600;margin:0 0 4px}',
    '.sg-pr-box button{font:inherit;text-align:left;padding:8px 12px;border:1px solid hsl(var(--border));border-radius:6px;background:transparent;color:inherit;cursor:pointer}',
    '.sg-pr-box button:hover{background:hsl(var(--accent))}',
    '#sg-print{display:none}',
    '@media print{html,body{background:#fff!important}body>*:not(#sg-print){display:none!important}',
    '#sg-print{display:block!important;color:#000;font:12px/1.35 sans-serif}',
    '#sg-print h1{font-size:18px;margin:0 0 2px}#sg-print p{margin:0 0 10px}',
    '#sg-print table{width:100%;border-collapse:collapse}',
    '#sg-print th,#sg-print td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}',
    '#sg-print th{background:#eee}#sg-print tr{break-inside:avoid}',
    '#sg-print th:nth-child(3){width:35%}}'
  ].join(''));
  document.head.appendChild(style);

  const leaves = (card) => [...card.querySelectorAll('*')].filter(e => !e.children.length && e.textContent.trim()).map(e => e.textContent.trim());
  const readCard = (card) => {
    const t = leaves(card);
    const text = card.textContent;
    const type = t.findIndex(x => /^[A-Z]{3,}$/.test(x));
    const vehicle = (card.querySelector('[title="Klik om voertuig te bewerken"]') || {}).textContent;
    // Verantwoordelijke (bv. "Jan (inkoper)", uit de order/inkoop); anders wie het transport aanmaakte.
    const owner = card.querySelector('[title^="Verantwoordelijke: "]') || card.querySelector('[title^="Aangemaakt door "]');
    return {
      // Initialen: "Jan de Vries (inkoper)" wordt "JdV".
      wie: owner ? owner.title.replace(/^(Verantwoordelijke: |Aangemaakt door )/, '').replace(/\\s*\\(.*\\)$/, '').trim().split(/\\s+/).map(w => w[0]).join('') : '',
      volg: (text.match(/Volg nummer:\\s*(\\d+)/) || [])[1],
      klant: t[0],
      adres: (card.querySelector('[title="Klik om bestemming te bewerken"]') || {}).textContent || '',
      actie: t.find(x => /^(Ophalen|Wegbrengen)$/.test(x)) || '',
      goederen: t.find(x => /^\\d+\\s+\\S/.test(x) && !/^Volg/.test(x)) || '',
      doc: type >= 0 ? t[type][0] + t[type].slice(1).toLowerCase() + ' ' + (t[type + 1] || '') : '',
      tnr: (text.match(/T-\\d+/) || [])[0] || '',
      uiterlijk: (t.find(x => /^Uiterlijk/.test(x)) || '').replace(/^Uiterlijk\\s*/, ''),
      voertuig: vehicle && vehicle.trim() !== '-' ? vehicle.trim() : ''
    };
  };
  const readRitten = () => {
    const out = [];
    for (const head of document.querySelectorAll('div')) {
      if (head.children.length || !/^Rit \\d+$/.test(head.textContent.trim())) continue;
      let col = head;
      while (col.parentElement && !(col.parentElement.getAttribute('style') || '').includes('grid-template-columns')) col = col.parentElement;
      if (!col.parentElement) continue;
      const rows = [...col.querySelectorAll('[aria-roledescription="draggable"]')].map(readCard);
      if (rows.length) out.push({ naam: head.textContent.trim(), rows: rows.sort((a, b) => (a.volg || 999) - (b.volg || 999)) });
    }
    return out;
  };

  const print = (rit, datum) => {
    const box = el('div');
    box.id = 'sg-print';
    box.appendChild(el('h1', rit.naam + ' - ' + datum));
    const vehicles = [...new Set(rit.rows.map(r => r.voertuig).filter(Boolean))].join(', ');
    box.appendChild(el('p', rit.rows.length + ' transporten' + (vehicles ? ' · ' + vehicles : '')));
    const table = el('table');
    const head = el('tr');
    ['#', 'Klant', 'Adres', 'Actie', 'Goederen', 'Document', 'Transport', 'Uiterlijk', 'Wie'].forEach(h => head.appendChild(el('th', h)));
    table.appendChild(head);
    rit.rows.forEach((r, i) => {
      const tr = el('tr');
      [i + 1, r.klant, r.adres, r.actie, r.goederen, r.doc, r.tnr, r.uiterlijk, r.wie].forEach(v => tr.appendChild(el('td', v)));
      table.appendChild(tr);
    });
    box.appendChild(table);
    document.body.appendChild(box);
    window.addEventListener('afterprint', () => box.remove(), { once: true });
    window.print();
  };

  const open = (datum) => {
    const ritten = readRitten();
    const overlay = el('div', null, 'sg-pr-overlay');
    const box = el('div', null, 'sg-pr-box');
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    box.appendChild(el('h2', 'Welke rit printen?'));
    if (!ritten.length) box.appendChild(el('div', 'Er staan geen transporten in een rit op deze dag.'));
    for (const rit of ritten) {
      const b = el('button', rit.naam + ' · ' + rit.rows.length + ' transporten');
      b.addEventListener('click', () => { close(); print(rit, datum); });
      box.appendChild(b);
    }
    const cancel = el('button', 'Annuleren');
    cancel.addEventListener('click', close);
    box.appendChild(cancel);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
  };

  const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
  const ensureButton = () => {
    const anchor = document.querySelector(ANCHOR);
    if (!anchor || (anchor.nextElementSibling && anchor.nextElementSibling.hasAttribute('data-sg-print'))) return;
    const button = el('button', null, anchor.className);
    button.setAttribute('data-sg-print', '');
    button.title = 'Een rit uit deze dag printen als beknopt overzicht';
    button.innerHTML = ICON + 'Print rit';
    // De datum staat in het blokje links van de knoppen ("woensdag 4 november 2026").
    button.addEventListener('click', () => open([...anchor.parentElement.children].map(c => c.textContent.trim()).find(x => /\\d{4}$/.test(x)) || ''));
    anchor.after(button);
  };
  ensureButton();
  new MutationObserver(ensureButton).observe(document.body, { childList: true, subtree: true });
})();`;


module.exports = { PAGE_TWEAKS_CSS, SOLID_TINTS_SCRIPT, PREVIEW_TAB_SCRIPT, LABEL_PRINT_SCRIPT, PRINT_RIT_SCRIPT };
