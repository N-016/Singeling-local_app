// Kleine aanpassingen aan de Singeling-pagina's (Lovable-app), los van de
// donkere modus. Wordt net als DARK_MODE_CSS bij elke paginalading ingevoegd;
// regels die van een instelling afhangen hangen onder een class op <html>
// (die zet main.js, zie applyPageTweaks).
//
// Klokbalk bovenaan de pagina (.clockbar in de webapp) heeft drie standen:
//   - "Afwezig": zelfde balk met inline background var(--stop)  -> blijft zoals hij is
//   - "Niet geklokt op een order": oranje balk                    -> hier subtiel / verborgen
//   - "Geklokt op ...": een ander blok (geen .clockbar)           -> blijft zoals hij is
// "Niet geklokt" herkennen we dus aan .clockbar zonder --stop in de style.
// Verandert dat in de webapp, dan hier de selector aanpassen.

const NOT_CLOCKED = '.sg-app .clockbar:not([style*="--stop"])';

const PAGE_TWEAKS_CSS = `
  /* Als de melding aan staat: rustige regel i.p.v. de grote oranje balk. */
  ${NOT_CLOCKED} {
    height: 24px;
    background: transparent;
    color: var(--fg-2);
    border-bottom: 1px solid var(--border-1);
    font-size: 10.5px;
    letter-spacing: 0.1em;
  }

  ${NOT_CLOCKED} svg {
    width: 12px;
    height: 12px;
    color: var(--sg-orange);
  }

  /* Instelling "Melding niet geklokt tonen" uit (de standaard): helemaal weg. */
  html.sg-hide-not-clocked ${NOT_CLOCKED} {
    display: none;
  }
`;

module.exports = { PAGE_TWEAKS_CSS };
