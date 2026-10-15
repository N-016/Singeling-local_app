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

  /* Navigatie (zijbalk links). De webapp maakt die altijd bijna zwart
     (--sg-ink); hier volgt hij de donkere modus: heel donkergrijs in donker,
     lichtgrijs met donkere tekst in licht. Kleuren = de tabbalk (index.html). */
  html.dark .sg-app .side {
    background: #1e2127;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
  }

  html:not(.dark) .sg-app .side {
    background: #f0f2f4;
    color: #4a5059;
    border-right: 1px solid #dfe2e6;
  }

  html:not(.dark) .sg-app .side .brand .t { color: #16181d; }
  html:not(.dark) .sg-app .side .brand .t span { color: #6b7178; }
  html:not(.dark) .sg-app .side .foot { color: #9aa0a8; }

  html:not(.dark) .sg-app .side .sidetoggle { color: #6b7178; }
  html:not(.dark) .sg-app .side .sidetoggle:hover {
    background: rgba(22, 24, 29, 0.06);
    color: #16181d;
  }

  html:not(.dark) .sg-app .navg .it,
  html:not(.dark) .sg-app .navg .sub a {
    color: #4a5059;
  }

  html:not(.dark) .sg-app .navg .it:hover {
    background: rgba(22, 24, 29, 0.06);
    color: #16181d;
  }

  html:not(.dark) .sg-app .navg .it.open,
  html:not(.dark) .sg-app .navg .sub a:hover {
    color: #16181d;
  }

  html:not(.dark) .sg-app .navg .it.active,
  html:not(.dark) .sg-app .navg .sub a.active {
    color: #16181d;
    background: rgba(255, 81, 0, 0.12);
  }

  html:not(.dark) .sg-app .navg .sub {
    border-left-color: #d5d9de;
  }

  /* Zachtgrijze weergave (soft-mode.js): zijbalk iets dieper grijs dan de
     pagina, zodat hij zich blijft onderscheiden. Na de lichte regels hierboven
     (zelfde specificiteit), dus deze wint. */
  html.sg-soft .sg-app .side {
    background: #dcdcd8;
    border-right-color: #cdcdc8;
  }

  html.sg-soft .sg-app .navg .sub {
    border-left-color: #c9c9c4;
  }

  /* Leescomfort in donker: zijbalk donkergrijs, net iets lichter dan de pagina. */
  html.dark.sg-soft-dark .sg-app .side {
    background: #2a2d33;
    border-right-color: rgba(255, 255, 255, 0.08);
  }
`;

module.exports = { PAGE_TWEAKS_CSS };
