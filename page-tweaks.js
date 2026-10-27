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

module.exports = { PAGE_TWEAKS_CSS, SOLID_TINTS_SCRIPT, PREVIEW_TAB_SCRIPT };
