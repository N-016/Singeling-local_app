// Donkere modus voor de Lovable-app.
//
// De app heeft al een volledig donker thema onder de class "dark"
// (shadcn/Tailwind-variabelen), maar zet die zelf nooit aan; main.js zet de
// class op <html>. Wat dat thema niet dekt, vullen we hier aan:
//   1. De eigen Singeling-variabelen (--bg-surface, --fg-2, --border-1, ...).
//   2. Singeling-componenten (.sg-app ...) met een vaste witte achtergrond of
//      donkere --sg-ink-tekst.
//   3. Vaste lichte Tailwind-kleuren (bg-blue-50, border-blue-200,
//      text-red-800, ...), bv. de gekleurde kolommen van het QRM-bord.
//
// Alles hangt onder html.dark, dus zonder de class doet deze CSS niets.
// Bij 3 staat er bewust html:where(.dark) (specificiteit 0,1,1): dat wint van
// de gewone lichte class (0,1,0), maar verliest van de dark:-varianten die de
// app op sommige plekken zelf al heeft (.dark\:... :is(.dark *), 0,2,0).
//
// Lijst bij 2 is gebaseerd op de CSS van de app (oktober 2026). Komt er in
// Lovable een nieuw onderdeel met een vaste kleur bij, dan hier toevoegen.

const DARK_MODE_BACKGROUND = '#14161a'; // = --background van .dark (220 12% 9%)

const SINGELING_VARIABLES = `
  html.dark {
    color-scheme: dark;
    --bg-canvas: hsl(220 12% 9%);
    --bg-surface: hsl(222 12% 13%);
    --bg-sunk: hsl(222 12% 11%);
    --fg-1: hsl(210 11% 96%);
    --fg-2: hsl(212 8% 72%);
    --fg-3: hsl(212 8% 55%);
    --border-1: hsl(220 13% 20%);
    --border-2: hsl(220 13% 26%);
    --border-strong: hsl(210 11% 85%);
  }
`;

// Singeling-componenten met background:#fff in de app-CSS.
const WHITE_SURFACES = [
  '.sg-app .al', '.sg-app .al-btn', '.sg-app .attn', '.sg-app .backbtn',
  '.sg-app .dr-h', '.sg-app .dr-kv', '.sg-app .dr-par', '.sg-app .fl-card',
  '.sg-app .fl-top', '.sg-app .kpi', '.sg-app .mc', '.sg-app .nst-table',
  '.sg-app .ohead', '.sg-app .panel', '.sg-app .st-table', '.sg-app .st-top',
  '.sg-app .sys', '.sg-app .tg', '.sg-app .topbar', '.sg-app .worder',
  '.sg-app .zone', '.sg-badge', '.sg-input', '.sg-textarea', '.sg-select'
];

// Singeling-componenten met color:var(--sg-ink) (bijna zwart).
const INK_TEXT = [
  '.sg-app .al-btn', '.sg-app .al-msg', '.sg-app .backbtn:hover',
  '.sg-app .dr-ev-e', '.sg-app .dr-kv b', '.sg-app .dr-name', '.sg-app .dr-par b',
  '.sg-app .dr-x:hover', '.sg-app .fl-name', '.sg-app .iconbtn:hover',
  '.sg-app .kpi .kn', '.sg-app .kpi .ms', '.sg-app .kpi .n', '.sg-app .mc-name',
  '.sg-app .navtoggle:hover', '.sg-app .nst-sheet', '.sg-app .nst-src',
  '.sg-app .nst-util b', '.sg-app .st-loc', '.sg-app .st-mat', '.sg-app .st-name',
  '.sg-app .st-sheets b', '.sg-app .st-stat b', '.sg-app .sys-metric',
  '.sg-app .sys-name', '.sg-app .sys-pt', '.sg-app .tg.on', '.sg-app .tg:hover',
  '.sg-app .zone-t'
];

const darkSelectors = (list) => list.map(selector => `html.dark ${selector}`).join(',\n  ');

const SINGELING_COMPONENTS = `
  ${darkSelectors(WHITE_SURFACES)} { background: var(--bg-surface); }
  ${darkSelectors(INK_TEXT)} { color: hsl(var(--foreground)); }
  html.dark .sg-app .kpi.accent .n { color: #fff; }
  html.dark .sg-app .topbar .crumb { color: hsl(var(--foreground)); }

  /* Badges die met color-mix(..., white) een lichte tint krijgen. */
  html.dark .sg-badge--ok { background: color-mix(in srgb, var(--ok) 15%, transparent); border-color: color-mix(in srgb, var(--ok) 40%, transparent); }
  html.dark .sg-badge--warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 15%, transparent); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
  html.dark .sg-badge--stop { background: color-mix(in srgb, var(--stop) 15%, transparent); border-color: color-mix(in srgb, var(--stop) 40%, transparent); }
  html.dark .sg-app .rstep.done .b { background: color-mix(in srgb, var(--ok) 15%, transparent); border-color: color-mix(in srgb, var(--ok) 40%, transparent); }
  html.dark .sg-app .docbadge.miss { background: color-mix(in srgb, var(--stop) 15%, transparent); border-color: color-mix(in srgb, var(--stop) 40%, transparent); }
  html.dark .sg-app .docbadge.ok { background: color-mix(in srgb, var(--ok) 15%, transparent); border-color: color-mix(in srgb, var(--ok) 40%, transparent); }

  /* Scheduler, weekdiagram: de stippellijn van de capaciteit en het blokje
     "Capaciteit" in de legenda hebben een vaste bijna-zwarte kleur (#16181D).
     Gedempt licht: zichtbaar, maar niet feller dan de staven zelf (vaak reikt
     de capaciteit tot boven de grafiek, dan staan er overal stippelvakken).
     De legendatekst krijgt zijn kleur inline, vandaar !important. */
  html.dark .recharts-surface rect[stroke="#16181D" i] { stroke: hsl(var(--foreground) / 0.5); stroke-width: 1.5px; }
  html.dark .recharts-legend-item path[fill="#16181D" i] { fill: hsl(var(--foreground) / 0.5); }
  html.dark .recharts-legend-item:has(path[fill="#16181D" i]) .recharts-legend-item-text { color: hsl(var(--foreground) / 0.75) !important; }
`;

// Tailwind-kleuren: [500, 400, 300] als RGB. De lichte achtergronden (50-200)
// en randen (100-300) worden een doorschijnende tint van 500 over de donkere
// achtergrond; donkere tekst (600-900) wordt de lichte 300/400-variant.
const TAILWIND_COLORS = {
  slate:   ['100 116 139', '148 163 184', '203 213 225'],
  gray:    ['107 114 128', '156 163 175', '209 213 219'],
  red:     ['239 68 68',   '248 113 113', '252 165 165'],
  orange:  ['249 115 22',  '251 146 60',  '253 186 116'],
  amber:   ['245 158 11',  '251 191 36',  '252 211 77'],
  yellow:  ['234 179 8',   '250 204 21',  '253 224 71'],
  lime:    ['132 204 22',  '163 230 53',  '190 242 100'],
  green:   ['34 197 94',   '74 222 128',  '134 239 172'],
  emerald: ['16 185 129',  '52 211 153',  '110 231 183'],
  teal:    ['20 184 166',  '45 212 191',  '94 234 212'],
  cyan:    ['6 182 212',   '34 211 238',  '103 232 249'],
  sky:     ['14 165 233',  '56 189 248',  '125 211 252'],
  blue:    ['59 130 246',  '96 165 250',  '147 197 253'],
  indigo:  ['99 102 241',  '129 140 248', '165 180 252'],
  violet:  ['139 92 246',  '167 139 250', '196 181 253'],
  purple:  ['168 85 247',  '192 132 252', '216 180 254'],
  fuchsia: ['217 70 239',  '232 121 249', '240 171 252'],
  pink:    ['236 72 153',  '244 114 182', '249 168 212'],
  rose:    ['244 63 94',   '251 113 133', '253 164 175']
};
const BG_ALPHA = { 50: 0.10, 100: 0.16, 200: 0.24 };
const BORDER_ALPHA = { 100: 0.20, 200: 0.30, 300: 0.45 };

// Kleurverlopen met lichte stops (bv. "bg-gradient-to-r from-blue-50
// to-blue-100", de jobkaarten op Laser Jobs): zelfde omzetting als de
// vlakke kleuren. Tailwind zet de stops in variabelen; from- zet ook een
// doorzichtige to-, dus eerst alle from-, dan via-, dan to- (zelfde
// specificiteit, de laatste wint). color(c500, sterkte) geeft de kleur.
function tailwindGradientRules(scope, color, strengths) {
  const from = [];
  const via = [];
  const to = [];
  for (const [name, [c500]] of Object.entries(TAILWIND_COLORS)) {
    for (const [shade, strength] of Object.entries(strengths)) {
      const c = color(c500, strength);
      const clear = color(c500, 0);
      from.push(`${scope} .from-${name}-${shade} { --tw-gradient-from: ${c} var(--tw-gradient-from-position); --tw-gradient-to: ${clear} var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }`);
      via.push(`${scope} .via-${name}-${shade} { --tw-gradient-to: ${clear} var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), ${c} var(--tw-gradient-via-position), var(--tw-gradient-to); }`);
      to.push(`${scope} .to-${name}-${shade} { --tw-gradient-to: ${c} var(--tw-gradient-to-position); }`);
    }
  }
  return [...from, ...via, ...to];
}

function tailwindColorRules() {
  const scope = 'html:where(.dark)';
  const rules = [];
  for (const [name, [c500, c400, c300]] of Object.entries(TAILWIND_COLORS)) {
    for (const [shade, alpha] of Object.entries(BG_ALPHA)) {
      rules.push(`${scope} .bg-${name}-${shade}, ${scope} .hover\\:bg-${name}-${shade}:hover { background-color: rgb(${c500} / ${alpha}); }`);
    }
    for (const [shade, alpha] of Object.entries(BORDER_ALPHA)) {
      rules.push(`${scope} .border-${name}-${shade} { border-color: rgb(${c500} / ${alpha}); }`);
    }
    rules.push(`${scope} .text-${name}-600 { color: rgb(${c400}); }`);
    rules.push(`${scope} .text-${name}-700, ${scope} .text-${name}-800, ${scope} .text-${name}-900 { color: rgb(${c300}); }`);
  }
  rules.push(...tailwindGradientRules(scope, (c500, alpha) => `rgb(${c500} / ${alpha})`, BG_ALPHA));
  // Een wit vlak met een eigen vaste tekstkleur (bv. "bg-white text-[#16181D]")
  // is "papier": een nagebootst document zoals de preview van een
  // Moneybird-offerte. Dat blijft wit, anders wordt het zwarte tekst op een
  // donker vlak. :where() houdt de specificiteit laag (zie boven).
  rules.push(`${scope} .bg-white:where(:not(${PAPER})) { background-color: hsl(var(--card)); }`);
  rules.push(`${scope} .text-black:where(:not(${PAPER} *, ${PAPER})) { color: hsl(var(--foreground)); }`);
  return rules.join('\n');
}

// Zie hierboven. Binnen het papier gelden de lichte themakleuren weer (de
// waarden van :root in de app-CSS), zodat bv. een kop zonder eigen kleur
// (hsl(var(--foreground))) of een border-b zonder eigen kleur licht-modus
// blijft. --sg-ink en --grey-* zijn vaste app-kleuren (niet donker gemaakt).
const PAPER = '.bg-white:is([class*="text-[#"], .text-black)';
const PAPER_RULES = `
  html.dark ${PAPER} {
    color-scheme: light;
    --background: 210 17% 97%;
    --foreground: 223 14% 10%;
    --card: 0 0% 100%;
    --card-foreground: 223 14% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 223 14% 10%;
    --secondary: 210 11% 94%;
    --secondary-foreground: 223 14% 10%;
    --muted: 210 11% 94%;
    --muted-foreground: 212 6% 44%;
    --accent: 210 11% 94%;
    --accent-foreground: 223 14% 10%;
    --border: 214 12% 89%;
    --input: 214 12% 89%;
    --bg-canvas: var(--grey-50);
    --bg-surface: #ffffff;
    --bg-sunk: #f0f2f4;
    --fg-1: var(--sg-ink);
    --fg-2: var(--grey-600);
    --fg-3: var(--grey-400);
    --border-1: var(--grey-200);
    --border-2: var(--grey-300);
    --border-strong: var(--sg-ink);
  }
`;

const DARK_MODE_CSS = SINGELING_VARIABLES + SINGELING_COMPONENTS + tailwindColorRules() + PAPER_RULES;

// WHITE_SURFACES, PAPER en TAILWIND_COLORS worden ook gebruikt door soft-mode.js.
module.exports = { DARK_MODE_BACKGROUND, DARK_MODE_CSS, WHITE_SURFACES, PAPER, TAILWIND_COLORS, tailwindGradientRules };
