// Oogcomfort: zachtere kleuren voor de Lovable-app (instelling softColors).
//
// Alleen in licht (class "sg-soft"): zachtgrijze vlakken met donkergrijze
// tekst i.p.v. fel wit met zwart, en wat diepere tinten in de gekleurde
// vlakken. Donker is al rustig genoeg en blijft zoals het is.
// Minder contrast, prettiger bij lang lezen. Kleuren als het oranje en de
// statuskleuren blijven gewoon bestaan. main.js zet de class op <html>.
//
// Zelfde opbouw als dark-mode.js: eerst de variabelen van de app (shadcn en
// Singeling), dan de onderdelen met een vaste witte achtergrond. "Papier"
// (een nagebootst document, zoals de preview van een offerte) blijft wit.

const { WHITE_SURFACES, PAPER, TAILWIND_COLORS, tailwindGradientRules } = require('./dark-mode');

// Achtergrond van de tab tijdens het laden (= --background hieronder).
const SOFT_MODE_BACKGROUND = '#dfdfdb';

// Pagina (87%) en kaarten/vlakken (95%) duidelijk uit elkaar, zodat bv. de
// orderkaarten in QRM Connect loskomen van de achtergrond; nog steeds geen
// fel wit.
const SOFT_VARIABLES = `
  html.sg-soft {
    --background: 60 6% 87%;
    --foreground: 220 7% 18%;
    --card: 60 11% 95%;
    --card-foreground: 220 7% 18%;
    --popover: 60 11% 95%;
    --popover-foreground: 220 7% 18%;
    --secondary: 60 7% 90%;
    --secondary-foreground: 220 7% 18%;
    --muted: 60 7% 90%;
    --muted-foreground: 215 5% 40%;
    --accent: 60 7% 90%;
    --accent-foreground: 220 7% 18%;
    --border: 60 5% 79%;
    --input: 60 5% 79%;
    --bg-canvas: #dfdfdb;
    --bg-surface: #f3f3f0;
    --bg-sunk: #d8d8d4;
    --fg-1: #2b2d31;
    --fg-2: #55595f;
    --fg-3: #7b7f86;
    --border-1: #d3d3ce;
    --border-2: #c4c4bf;
    --border-strong: #2b2d31;
  }
`;

const softSelectors = (list) => list.map(selector => `html.sg-soft ${selector}`).join(',\n  ');

const SOFT_SURFACES = `
  ${softSelectors(WHITE_SURFACES)} { background: var(--bg-surface); }
  html:where(.sg-soft) .bg-white:where(:not(${PAPER})) { background-color: hsl(var(--card)); }
  html:where(.sg-soft) body { background-color: hsl(var(--background)); }
`;

// Vaste lichte Tailwind-kleuren (bg-purple-50, border-blue-200, ...), bv. de
// gekleurde kolommen van het QRM-bord. Die zijn bijna wit; in zachtgrijs zouden
// de (zachtgrijze) orderkaarten erin wegvallen. Daarom een gedempte tint van
// de eigen kleur over het grijs, iets dieper dan de kaarten (95%): de kolom
// houdt zijn kleur en de kaarten komen er licht bovenop te liggen.
// :where() houdt de specificiteit laag, net als in dark-mode.js.
const SOFT_BG_STRENGTH = { 50: 11, 100: 16, 200: 24 };
const SOFT_BORDER_STRENGTH = { 100: 30, 200: 40, 300: 52 };
function softTailwindRules() {
  const scope = 'html:where(.sg-soft)';
  const rules = [];
  for (const [name, [c500]] of Object.entries(TAILWIND_COLORS)) {
    for (const [shade, pct] of Object.entries(SOFT_BG_STRENGTH)) {
      rules.push(`${scope} .bg-${name}-${shade}:where(:not(${PAPER} *)), ${scope} .hover\\:bg-${name}-${shade}:hover { background-color: color-mix(in srgb, rgb(${c500}) ${pct}%, var(--sg-tw-mix, #e2e2de)); }`);
    }
    for (const [shade, pct] of Object.entries(SOFT_BORDER_STRENGTH)) {
      rules.push(`${scope} .border-${name}-${shade}:where(:not(${PAPER} *)) { border-color: color-mix(in srgb, rgb(${c500}) ${pct}%, var(--sg-tw-mix-border, #cfcfca)); }`);
    }
  }
  // Kleurverlopen (from-blue-50 to-blue-100 e.d.): dezelfde gedempte tinten.
  rules.push(...tailwindGradientRules(scope,
    (c500, pct) => `color-mix(in srgb, rgb(${c500}) ${pct}%, var(--sg-tw-mix, #e2e2de))`, SOFT_BG_STRENGTH));
  return rules.join('\n');
}

// Papier blijft zoals in licht (wit met de gewone lichte kleuren).
const SOFT_PAPER = `
  html.sg-soft ${PAPER} {
    --background: 210 17% 97%;
    --foreground: 223 14% 10%;
    --card: 0 0% 100%;
    --muted-foreground: 212 6% 44%;
    --border: 214 12% 89%;
    --bg-surface: #ffffff;
    --fg-1: var(--sg-ink);
    --fg-2: var(--grey-600);
    --fg-3: var(--grey-400);
  }
`;

const SOFT_MODE_CSS = SOFT_VARIABLES + SOFT_SURFACES + softTailwindRules() + SOFT_PAPER;

module.exports = { SOFT_MODE_BACKGROUND, SOFT_MODE_CSS };
