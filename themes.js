// Thema's (bèta): een vaste set kleurensets van ons, bovenop licht/donker en
// leescomfort. Twee soorten:
//
//   1. Afgeleid: alleen een recept, de kleuren worden berekend.
//        hue    - tint van de achtergronden en tekst (0-360, kleurenwiel)
//        tint   - hoe sterk die tint is (1 = normaal, 0 = grijs)
//        accent - accentkleur i.p.v. het Singeling-oranje
//      De vier varianten (licht, donker, en van allebei de zachte versie)
//      komen uit de vaste lichtheden in VARIANTS.
//
//   2. Vast palet (palettes.light / palettes.dark): de kleuren van een bestaand
//      thema letterlijk overgenomen, eventueel met een achtergrondafbeelding
//      (wallpaper) achter de pagina's. Leescomfort verandert hier (voorlopig)
//      niets aan: het thema heeft zijn eigen uitstraling.
//
// Waar de kleuren terechtkomen:
//   - de Singeling-pagina's: pageThemeCss(id), class "sg-theme-<id>" op <html>
//     (main.js, applyDarkMode). Papier (de preview van een offerte e.d.) blijft
//     wit en oranje: dat is het echte document.
//   - de chrome (tabbalk, instellingen, losse vensters, hulpkaartje):
//     chromeThemeCss(), via dezelfde variabelen als in index.html.
//   - het welkomstscherm en de laadbalk van de splash: alleen de accentkleur.

const fs = require('fs');
const path = require('path');
const { WHITE_SURFACES, PAPER } = require('./dark-mode');

// Rosé Pine: palet MIT, achtergronden CC0 (zie assets/themes/rose-pine/BRON.md).
const ROSE_PINE = {
  name: 'Rosé Pine',
  description: 'Zacht paars en oudroze, met een achtergrond van bladeren. Lettertype Nunito.',
  palettes: {
    // Dawn
    light: {
      canvas: '#faf4ed', surface: '#fffaf3', raised: '#f2e9e1', sunk: '#f4ede8',
      bar: '#fffaf3', tab: '#fffaf3', sidebar: '#f2e9e1', secondary: '#f2e9e1',
      border: '#dfdad9', borderStrong: '#cecacd',
      fg1: '#575279', fg2: '#6e6a8e', fg3: '#797593', fg4: '#9893a5',
      accent: '#907aa9', accentStrong: '#7a6396', onAccent: '#ffffff'
    },
    // Moon
    dark: {
      canvas: '#232136', surface: '#2a273f', raised: '#393552', sunk: '#1f1d30',
      bar: '#1a1828', tab: '#2a273f', sidebar: '#1f1d30', secondary: '#393552',
      border: '#44415a', borderStrong: '#56526e',
      fg1: '#e0def4', fg2: '#c1bed8', fg3: '#908caa', fg4: '#6e6a86',
      accent: '#c4a7e7', accentStrong: '#8a6cb3', onAccent: '#232136'
    }
  },
  wallpaper: {
    light: 'assets/themes/rose-pine/leafy-dawn.jpg',
    dark: 'assets/themes/rose-pine/leafy-moon.jpg'
  },
  // Nunito (OFL): afgerond en zacht, past bij het palet. Variabel lettertype.
  font: {
    family: 'Nunito',
    fallback: '"Segoe UI", sans-serif',
    faces: [
      { file: 'assets/themes/rose-pine/Nunito-Variable.woff2', weight: '200 1000' }
    ]
  },
  radius: '12px'
};

// Synthwave '84 (cyber): palet van Robb Owen, MIT (zie
// assets/themes/synthwave/BRON.md). Het origineel is alleen donker; de
// lichte variant is van ons, in dezelfde kleuren. Achtergrond: eigen SVG.
const SYNTHWAVE = {
  name: 'Synthwave',
  description: 'Neon uit de jaren 80. Lettertype Chakra Petch.',
  palettes: {
    light: {
      canvas: '#f6f1fb', surface: '#fffcff', raised: '#eee5f7', sunk: '#efe7f6',
      bar: '#fffcff', tab: '#fffcff', sidebar: '#ece2f6', secondary: '#efe6f8',
      border: '#dccfe9', borderStrong: '#c7b5dc',
      fg1: '#2a2139', fg2: '#4b3f63', fg3: '#6d6290', fg4: '#9a8fb6',
      accent: '#d22d9c', accentStrong: '#a8207c', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#262335', surface: '#2a2139', raised: '#34294f', sunk: '#1f1a2b',
      bar: '#171520', tab: '#241b2f', sidebar: '#1d1828', secondary: '#34294f',
      border: '#3e3358', borderStrong: '#4f4370',
      fg1: '#f4eeff', fg2: '#cdc3e3', fg3: '#a296c2', fg4: '#6d6290',
      accent: '#ff7edb', accentStrong: '#b1388f', onAccent: '#241b2f'
    }
  },
  wallpaper: {
    light: 'assets/themes/synthwave/outrun-light.svg',
    dark: 'assets/themes/synthwave/outrun-dark.svg'
  },
  // Chakra Petch (OFL): hoekig en futuristisch, maar goed leesbaar.
  font: {
    family: 'Chakra Petch',
    fallback: '"Segoe UI", sans-serif',
    faces: [
      { file: 'assets/themes/synthwave/ChakraPetch-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/synthwave/ChakraPetch-Bold.woff2', weight: '600 900' }
    ]
  },
  radius: '3px'
};

// Gruvbox (retro): palet van morhetz, MIT (zie assets/themes/gruvbox/BRON.md),
// officieel licht en donker. Achtergrond: eigen SVG.
const GRUVBOX = {
  name: 'Gruvbox',
  description: 'Warm en retro, jaren 70. Lettertype Fraunces.',
  palettes: {
    light: {
      canvas: '#fbf1c7', surface: '#f9f5d7', raised: '#ebdbb2', sunk: '#f2e5bc',
      bar: '#f9f5d7', tab: '#f9f5d7', sidebar: '#f2e5bc', secondary: '#ebdbb2',
      border: '#d5c4a1', borderStrong: '#bdae93',
      fg1: '#3c3836', fg2: '#504945', fg3: '#665c54', fg4: '#928374',
      accent: '#b57614', accentStrong: '#8f5b0c', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#282828', surface: '#32302f', raised: '#3c3836', sunk: '#1d2021',
      bar: '#1d2021', tab: '#32302f', sidebar: '#1d2021', secondary: '#3c3836',
      border: '#504945', borderStrong: '#665c54',
      fg1: '#ebdbb2', fg2: '#d5c4a1', fg3: '#bdae93', fg4: '#928374',
      accent: '#fabd2f', accentStrong: '#a96b0e', onAccent: '#282828'
    }
  },
  wallpaper: {
    light: 'assets/themes/gruvbox/seventies-light.svg',
    dark: 'assets/themes/gruvbox/seventies-dark.svg'
  },
  // Fraunces (OFL): zachte serif met een jaren-70-gevoel. Variabel lettertype,
  // één bestand voor alle gewichten.
  font: {
    family: 'Fraunces',
    fallback: 'Georgia, serif',
    faces: [
      { file: 'assets/themes/gruvbox/Fraunces-Variable.woff2', weight: '100 900' }
    ]
  },
  radius: '10px'
};

// Terminal: gaat verder dan kleur. Eigen lettertype (JetBrains Mono, OFL; zie
// assets/themes/terminal/BRON.md) en strakke hoeken. Een oude monitor met
// scanlines: donker = groen fosfor op zwart, licht = een licht groen scherm.
// Palet en achtergronden van ons.
const TERMINAL = {
  name: 'Terminal',
  description: 'Een oude computer: groen fosfor met scanlines. Lettertype JetBrains Mono.',
  palettes: {
    light: {
      canvas: '#f1f5ee', surface: '#fafcf8', raised: '#e6ede2', sunk: '#e9efe5',
      bar: '#fafcf8', tab: '#fafcf8', sidebar: '#e4ebe0', secondary: '#e6ede2',
      border: '#c9d6c4', borderStrong: '#aebfa8',
      fg1: '#102a17', fg2: '#2b4a33', fg3: '#4c6b53', fg4: '#7d9683',
      accent: '#13803a', accentStrong: '#0d5e2a', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#0a0e0a', surface: '#0f150f', raised: '#152015', sunk: '#070a07',
      bar: '#060906', tab: '#0f150f', sidebar: '#080c08', secondary: '#142014',
      border: '#1e3320', borderStrong: '#2a4a2d',
      fg1: '#c8f7cf', fg2: '#9fdcaa', fg3: '#6fae7c', fg4: '#47704f',
      accent: '#39ff6a', accentStrong: '#1c8a3c', onAccent: '#041006'
    }
  },
  wallpaper: {
    light: 'assets/themes/terminal/crt-light.svg',
    dark: 'assets/themes/terminal/crt-dark.svg'
  },
  font: {
    family: 'JetBrains Mono',
    fallback: 'Consolas, "Courier New", monospace',
    faces: [
      { file: 'assets/themes/terminal/JetBrainsMono-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/terminal/JetBrainsMono-Bold.woff2', weight: '600 900' }
    ]
  },
  radius: '2px'
};

// Noorderlicht: licht geanimeerde achtergrond. De lucht (wallpaper) staat
// stil; het noorderlicht is een losse laag (motion) die heel langzaam
// verschuift. Lettertype Lexend (OFL), gemaakt voor leesbaarheid. Palet en
// achtergronden van ons (assets/themes/noorderlicht/BRON.md).
const NOORDERLICHT = {
  name: 'Noorderlicht',
  description: 'Bewegend noorderlicht boven de bergen. Lettertype Lexend.',
  palettes: {
    light: {
      canvas: '#f2f7f8', surface: '#fbfdfd', raised: '#e6eff1', sunk: '#e9f1f3',
      bar: '#fbfdfd', tab: '#fbfdfd', sidebar: '#e5eef1', secondary: '#e6eff1',
      border: '#cfdde2', borderStrong: '#b3c7ce',
      fg1: '#10262e', fg2: '#2b4650', fg3: '#4c6872', fg4: '#7f979f',
      accent: '#0f8f6c', accentStrong: '#0a6a50', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#0b1320', surface: '#111c2e', raised: '#172539', sunk: '#081019',
      bar: '#070d17', tab: '#101a2b', sidebar: '#0a1222', secondary: '#17263a',
      border: '#1f3149', borderStrong: '#2b4262',
      fg1: '#e6f1ff', fg2: '#b9cbe3', fg3: '#8aa1bf', fg4: '#5a6f8c',
      accent: '#4fe3b0', accentStrong: '#1d9a72', onAccent: '#062018'
    }
  },
  wallpaper: {
    light: 'assets/themes/noorderlicht/lucht-light.svg',
    dark: 'assets/themes/noorderlicht/lucht-dark.svg'
  },
  motion: {
    light: 'assets/themes/noorderlicht/aurora-light.svg',
    dark: 'assets/themes/noorderlicht/aurora-dark.svg'
  },
  font: {
    family: 'Lexend',
    fallback: '"Segoe UI", sans-serif',
    faces: [
      { file: 'assets/themes/noorderlicht/Lexend-Variable.woff2', weight: '100 900' }
    ]
  },
  radius: '8px'
};

const THEMES = {
  // De app precies zoals de webapp hem maakt: geen licht/donker, geen
  // leescomfort, geen aangepaste kleuren of zijbalk (main.js darkActive,
  // class sg-original op de pagina's; page-tweaks.js).
  origineel: { name: 'Standaard', description: 'De app precies zoals hij is, zonder aanpassingen: geen licht/donker of leescomfort.', original: true },
  // id "standaard" blijft (bewaard in ieders instellingen, en de standaard
  // voor iedereen): de Singeling-kleuren van de app, met licht/donker en
  // leescomfort.
  standaard: { name: 'Singeling', description: 'De Singeling-kleuren van de app, met licht/donker en leescomfort.' },
  test: { name: 'Testthema', description: 'Koel en rustig blauw.', hue: 215, tint: 1, accent: '#2f7fe0' },
  rosepine: ROSE_PINE,
  synthwave: SYNTHWAVE,
  gruvbox: GRUVBOX,
  terminal: TERMINAL,
  noorderlicht: NOORDERLICHT
};

const DEFAULT_THEME = 'standaard';

// Lichtheid (%) per rol, per variant, voor afgeleide thema's. sat =
// verzadiging van de vlakken bij tint 1; tekst krijgt de helft daarvan.
// Leescomfort (soft) verlaagt vooral het contrast (lichtheid), niet de tint:
// anders wordt elk thema grijs. In donker iets meer verzadiging, anders is
// de tint bij zo weinig licht nauwelijks te zien.
const VARIANTS = {
  light: {
    sat: 30, canvas: 96, surface: 99.5, raised: 94, sunk: 93, bar: 99.5, tab: 99.5,
    sidebar: 93, secondary: 93, border: 87, borderStrong: 78,
    fg1: 12, fg2: 30, fg3: 44, fg4: 62, mix: 96, mixBorder: 87
  },
  dark: {
    sat: 36, canvas: 10, surface: 14, raised: 18, sunk: 12, bar: 8, tab: 12,
    sidebar: 13, secondary: 19, border: 21, borderStrong: 30,
    fg1: 95, fg2: 78, fg3: 62, fg4: 42, mix: 10, mixBorder: 21
  },
  softLight: {
    sat: 26, canvas: 86, surface: 94, raised: 89, sunk: 84, bar: 88, tab: 88,
    sidebar: 82, secondary: 89, border: 78, borderStrong: 69,
    fg1: 19, fg2: 30, fg3: 41, fg4: 56, mix: 88.5, mixBorder: 80
  },
  softDark: {
    sat: 30, canvas: 15, surface: 18.5, raised: 22, sunk: 16, bar: 13, tab: 16.5,
    sidebar: 18, secondary: 22, border: 27, borderStrong: 35,
    fg1: 87, fg2: 74, fg3: 62, fg4: 45, mix: 15, mixBorder: 27
  }
};

const isDarkVariant = (variant) => variant === 'dark' || variant === 'softDark';

function variantFor(dark, soft) {
  if (dark) return soft ? 'softDark' : 'dark';
  return soft ? 'softLight' : 'light';
}

function isTheme(id) {
  return Object.prototype.hasOwnProperty.call(THEMES, id);
}

// Het standaardthema heeft geen eigen kleuren (dan gelden index.html,
// dark-mode.js en soft-mode.js zoals altijd).
function customTheme(id) {
  const theme = THEMES[id];
  return theme && (theme.hue !== undefined || theme.palettes) ? theme : null;
}

// De webapp zonder aanpassingen: licht, met de bijna zwarte zijbalk.
const ORIGINAL_PREVIEW = {
  canvas: '#f6f7f9', surface: '#ffffff', sidebar: '#16181d', bar: '#ffffff', border: '#dfe2e6',
  text: '#16181d', muted: '#6b7178', accent: '#ff5100', onAccent: '#ffffff'
};

// Kleuren van het standaardthema voor het voorbeeld in de instellingen
// (= index.html en de Singeling-app zelf).
const STANDARD_PREVIEW = {
  light: {
    canvas: '#f6f7f9', surface: '#ffffff', sidebar: '#f0f2f4', bar: '#ffffff', border: '#dfe2e6',
    text: '#16181d', muted: '#6b7178', accent: '#ff5100', onAccent: '#ffffff'
  },
  dark: {
    canvas: '#14161a', surface: '#1e2127', sidebar: '#1e2127', bar: '#0f1115', border: '#353b45',
    text: '#f4f5f6', muted: '#9da3ac', accent: '#ff5100', onAccent: '#ffffff'
  }
};

// Alles wat het tabblad Thema's in de instellingen nodig heeft. Twee soorten:
// een kleurenset verandert alleen kleuren (en eventueel de achtergrond), een
// thema gaat verder (eigen lettertype en vormen). Paden zijn relatief aan
// index.html.
function themeCatalog() {
  return Object.entries(THEMES).map(([id, theme]) => {
    const custom = customTheme(id);
    const preview = {};
    for (const mode of ['light', 'dark']) {
      const p = custom && palette(custom, mode);
      preview[mode] = {
        ...(p ? {
          canvas: p.canvas.hex, surface: p.surface.hex, sidebar: p.sidebar.hex, bar: p.bar.hex,
          border: p.border.hex, text: p.fg1.hex, muted: p.fg3.hex, accent: p.accent, onAccent: p.onAccent
        } : theme.original ? ORIGINAL_PREVIEW : STANDARD_PREVIEW[mode]),
        wallpaper: (theme.wallpaper && theme.wallpaper[mode]) || null,
        motion: (theme.motion && theme.motion[mode]) || null
      };
    }
    return {
      id,
      name: theme.name,
      description: theme.description || '',
      kind: theme.font || theme.radius ? 'thema' : 'kleurenset',
      font: theme.font ? fontStack(theme) : null,
      radius: theme.radius || null,
      preview
    };
  });
}

// @font-face van alle thema's, voor de voorbeelden in de instellingen. Een
// lettertype wordt pas geladen als een voorbeeld het echt gebruikt.
function previewFontCss() {
  return Object.values(THEMES).map(theme => fontFaceCss(theme, file => file)).join('');
}

// Leescomfort werkt bij het standaardthema en de afgeleide thema's; een vast
// palet heeft zijn eigen uitstraling (zie boven), en "zoals hij is"
// (original) heeft geen leescomfort.
function supportsSoft(id) {
  const theme = THEMES[id];
  return !theme || (!theme.palettes && !theme.original);
}

// De app zonder aanpassingen (geen licht/donker, geen eigen kleuren).
function isOriginal(id) {
  const theme = THEMES[id];
  return !!(theme && theme.original);
}

// ---------- Kleurrekenen ----------

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

// Mengt hex-kleur a met b (amount = aandeel van b, 0-1).
function mix(a, b, amount) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((c, i) => c + (cb[i] - c) * amount));
}

const round = (n) => Math.round(n * 10) / 10;
// Shadcn-vorm ("215 30% 96%") voor hsl(var(--background)) in de webapp.
const triplet = (h, s, l) => `${round(h)} ${round(s)}% ${round(l)}%`;
const hexTriplet = (hex) => triplet(...rgbToHsl(hexToRgb(hex)));
const hslHex = (h, s, l) => rgbToHex(hslToRgb(h, s, l));
const rgba = (hex, alpha) => `rgba(${hexToRgb(hex).join(', ')}, ${alpha})`;
const color = (hex) => ({ t: hexTriplet(hex), hex });

// ---------- Palet per thema en variant ----------

// Zelfde opbouw als de oranje schaal van de webapp (--orange-50 ... -700).
function accentScale(accent) {
  return {
    50: mix(accent, '#ffffff', 0.93), 100: mix(accent, '#ffffff', 0.8),
    200: mix(accent, '#ffffff', 0.58), 300: mix(accent, '#ffffff', 0.3),
    400: accent, 500: mix(accent, '#000000', 0.09),
    600: mix(accent, '#000000', 0.22), 700: mix(accent, '#000000', 0.38)
  };
}

function fixedPalette(theme, variant) {
  const dark = isDarkVariant(variant);
  const c = theme.palettes[dark ? 'dark' : 'light'];
  const roles = {};
  for (const role of ['canvas', 'surface', 'raised', 'sunk', 'bar', 'tab', 'sidebar', 'secondary',
    'border', 'borderStrong', 'fg1', 'fg2', 'fg3', 'fg4']) {
    roles[role] = color(c[role]);
  }
  return {
    dark,
    ...roles,
    mix: color(c.mix || c.canvas),
    mixBorder: color(c.mixBorder || c.border),
    accent: c.accent,
    accentTriplet: hexTriplet(c.accent),
    accentHover: mix(c.accent, '#ffffff', 0.2),
    accentStrong: c.accentStrong || mix(c.accent, '#000000', 0.22),
    onAccent: c.onAccent || '#ffffff',
    scale: accentScale(c.accent)
  };
}

function derivedPalette(theme, variant) {
  const v = VARIANTS[variant];
  const h = theme.hue;
  const s = v.sat * theme.tint;
  const fs = s / 2;
  const dark = isDarkVariant(variant);
  const surface = (l) => ({ t: triplet(h, s, l), hex: hslHex(h, s, l) });
  const text = (l) => ({ t: triplet(h, fs, l), hex: hslHex(h, fs, l) });

  // Accent: in donker iets lichter, zodat het genoeg contrast heeft.
  const accent = dark ? mix(theme.accent, '#ffffff', 0.12) : theme.accent;

  return {
    dark,
    canvas: surface(v.canvas), surface: surface(v.surface), raised: surface(v.raised),
    sunk: surface(v.sunk), bar: surface(v.bar), tab: surface(v.tab), sidebar: surface(v.sidebar),
    secondary: surface(v.secondary), border: surface(v.border), borderStrong: surface(v.borderStrong),
    mix: surface(v.mix), mixBorder: surface(v.mixBorder),
    fg1: text(v.fg1), fg2: text(v.fg2), fg3: text(v.fg3), fg4: text(v.fg4),
    accent,
    accentTriplet: hexTriplet(accent),
    accentHover: mix(accent, '#ffffff', 0.2),
    accentStrong: mix(accent, '#000000', 0.22),
    onAccent: '#ffffff',
    scale: accentScale(accent)
  };
}

function palette(theme, variant) {
  return theme.palettes ? fixedPalette(theme, variant) : derivedPalette(theme, variant);
}

// Achtergrond van een pagina tijdens het laden / het gordijn, of null bij
// het standaardthema (dan gelden de kleuren van main.js).
function themeBackground(id, dark, soft) {
  const theme = customTheme(id);
  return theme ? palette(theme, variantFor(dark, soft)).canvas.hex : null;
}

// Accentkleur (bv. voor de laadbalk van het splash-scherm), of null.
function themeAccent(id, dark) {
  const theme = customTheme(id);
  return theme ? palette(theme, dark ? 'dark' : 'light').accent : null;
}

// Kleur van de balk (voor het venster van een losgetrokken tab).
function themeBarColor(id, dark, soft) {
  const theme = customTheme(id);
  return theme ? palette(theme, variantFor(dark, soft)).bar.hex : null;
}

// ---------- Achtergrondafbeelding ----------

// Als data-URL in de CSS: de pagina's zijn https en mogen geen bestanden van
// de schijf laden. Eén keer inlezen.
const wallpaperCache = new Map();
function wallpaperUrl(file) {
  if (!wallpaperCache.has(file)) {
    let url = null;
    try {
      const type = file.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
      url = `data:${type};base64,${fs.readFileSync(path.join(__dirname, file)).toString('base64')}`;
    } catch {
      // Geen afbeelding: dan alleen de kleur.
    }
    wallpaperCache.set(file, url);
  }
  return wallpaperCache.get(file);
}

// ---------- Lettertype en vorm ----------

// Eigen naam, zodat een op de pc geïnstalleerde versie niet meedoet.
const fontFamily = (theme) => `"SG ${theme.font.family}"`;
const fontStack = (theme) => `${fontFamily(theme)}, ${theme.font.fallback}`;

const fontDataUrl = (file) => {
  if (!wallpaperCache.has(file)) {
    let url = null;
    try {
      url = `data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, file)).toString('base64')}`;
    } catch {
      // Geen bestand: dan het reservelettertype.
    }
    wallpaperCache.set(file, url);
  }
  return wallpaperCache.get(file);
};

// urlFor(file): data-URL voor de pagina's en het hulpkaartje (https en
// data:, die mogen niet van de schijf laden), een relatief pad voor
// index.html en detached.html (die staan zelf in de app-map).
function fontFaceCss(theme, urlFor) {
  if (!theme.font) return '';
  return theme.font.faces.map(face => {
    const url = urlFor(face.file);
    return url ? `
  @font-face {
    font-family: ${fontFamily(theme)};
    src: url("${url}") format("woff2");
    font-weight: ${face.weight};
    font-style: normal;
    font-display: block;
  }` : '';
  }).join('');
}

// Lettertype en afronding van de webapp zelf (app-CSS, oktober 2026). Papier
// krijgt deze terug, anders erft het de thema-waarden van de pagina.
const APP_FONT = '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const APP_RADIUS = '.375rem';

// Pagina's: de lettertype-variabelen van de webapp, plus alles wat een
// eigen vast lettertype heeft (koppen e.d. met "Segoe UI").
//
// Papier (een documentpreview, zoals een Moneybird-offerte in de pagina)
// houdt het gewone lettertype en de gewone hoeken: dat is het echte document.
// De regel met !important slaat papier over, en op het papier zelf komen de
// originele waarden terug, zodat de inhoud die erft in plaats van het thema.
// Previews in een eigen tabblad (specificatie-HTML, PDF) zijn geen
// Singeling-pagina en krijgen helemaal geen thema-CSS (main.js).
function pageShapeCss(id, theme) {
  const t = `html.sg-theme-${id}.sg-theme-${id}`;
  let css = '';
  if (theme.font) {
    css += fontFaceCss(theme, fontDataUrl) + `
  ${t} {
    --font-display: ${fontStack(theme)};
    --font-body: ${fontStack(theme)};
    --font-mono: ${fontStack(theme)};
  }
  ${t} body,
  ${t} body *:not(${PAPER}, ${PAPER} *) {
    font-family: ${fontStack(theme)} !important;
  }
  ${t} ${PAPER} {
    --font-display: ${APP_FONT};
    --font-body: ${APP_FONT};
    --font-mono: ${APP_FONT};
    font-family: ${APP_FONT};
  }
`;
  }
  if (theme.radius) {
    css += `
  ${t} { --radius: ${theme.radius}; }
  ${t} ${PAPER} { --radius: ${APP_RADIUS}; }
`;
  }
  return css;
}

// ---------- CSS voor de Singeling-pagina's ----------

// Elk blok geldt voor precies één variant, dus de volgorde maakt niet uit.
// De dubbele class houdt de specificiteit boven die van dark-mode.js,
// soft-mode.js en page-tweaks.js (bv. html.dark.sg-soft-dark, 0,2,1).
function variantSelector(id, variant) {
  const t = `html.sg-theme-${id}.sg-theme-${id}`;
  return {
    light: `${t}:not(.dark):not(.sg-soft)`,
    softLight: `${t}.sg-soft:not(.dark)`,
    dark: `${t}.dark:not(.sg-soft-dark)`,
    softDark: `${t}.dark.sg-soft-dark`
  }[variant];
}

// Pagina-achtergrond: de kleur, of de afbeelding met een waas in de
// paginakleur erover (tekst die direct op de achtergrond staat, zoals de
// paginatitel, blijft zo leesbaar). Kaarten, zijbalk en bovenbalk zijn dicht.
function bodyBackgroundCss(sel, theme, p) {
  const mode = p.dark ? 'dark' : 'light';
  if (!wallpaperFor(theme, mode)) return `${sel} body { background-color: hsl(var(--background)); }`;
  const veil = rgba(p.canvas.hex, p.dark ? 0.35 : 0.3);
  return `${sel} body {
    background: linear-gradient(${veil}, ${veil}), var(--sg-wallpaper-${mode}) center bottom / cover no-repeat fixed, ${p.canvas.hex};
  }`;
}

function wallpaperFor(theme, mode) {
  const file = theme.wallpaper && theme.wallpaper[mode];
  return file ? wallpaperUrl(file) : null;
}

function motionFor(theme, mode) {
  const file = theme.motion && theme.motion[mode];
  return file ? wallpaperUrl(file) : null;
}

// De afbeeldingen één keer als variabele (anders staan ze in elke variant).
function wallpaperVariablesCss(id, theme) {
  const vars = [];
  for (const mode of ['light', 'dark']) {
    const wallpaper = wallpaperFor(theme, mode);
    const motion = motionFor(theme, mode);
    if (wallpaper) vars.push(`--sg-wallpaper-${mode}: url("${wallpaper}");`);
    if (motion) vars.push(`--sg-motion-${mode}: url("${motion}");`);
  }
  return vars.length ? `\n  html.sg-theme-${id} { ${vars.join(' ')} }\n` : '';
}

// Bewegende laag (motion): een eigen vlak achter de inhoud dat alleen
// verschuift en van helderheid verandert. Dat doet de videokaart (transform
// en opacity), zonder de pagina steeds opnieuw te tekenen. Zo traag dat het
// niet afleidt; met "animaties uit" in Windows staat hij stil.
// Twee lagen met dezelfde afbeelding (de tweede gespiegeld) die in een
// ander tempo tegen elkaar in bewegen: samen golft dat natuurlijker dan één
// laag die heen en weer schuift.
function motionCss(id, theme, sel, p) {
  const mode = p.dark ? 'dark' : 'light';
  if (!motionFor(theme, mode)) return '';
  return `
  ${sel} body::before,
  ${sel} body::after {
    content: '';
    position: fixed;
    top: -6vh;
    left: -20vw;
    width: 140vw;
    height: 78vh;
    z-index: -1;
    pointer-events: none;
    background: var(--sg-motion-${mode}) center / 100% 100% no-repeat;
    will-change: transform, opacity;
  }
  ${sel} body::before {
    animation: sg-theme-drift 20s ease-in-out infinite alternate;
  }
  ${sel} body::after {
    animation: sg-theme-drift-back 31s ease-in-out infinite alternate;
  }`;
}

function motionKeyframesCss(id, theme) {
  if (!theme.motion) return '';
  return `
  @keyframes sg-theme-drift {
    0% { transform: translate3d(-12vw, 0, 0) scaleY(0.9); opacity: 0.5; }
    50% { transform: translate3d(0, 3vh, 0) scaleY(1.2); opacity: 1; }
    100% { transform: translate3d(12vw, -2vh, 0) scaleY(0.95); opacity: 0.65; }
  }
  @keyframes sg-theme-drift-back {
    0% { transform: translate3d(10vw, 2vh, 0) scale(-1, 1.1); opacity: 0.25; }
    50% { transform: translate3d(-4vw, -2vh, 0) scale(-1, 0.85); opacity: 0.6; }
    100% { transform: translate3d(-12vw, 1vh, 0) scale(-1, 1.15); opacity: 0.3; }
  }
  @media (prefers-reduced-motion: reduce) {
    html.sg-theme-${id} body::before,
    html.sg-theme-${id} body::after { animation: none; }
  }
`;
}

function pageVariantCss(id, theme, variant) {
  const p = palette(theme, variant);
  const sel = variantSelector(id, variant);
  const scale = Object.entries(p.scale).map(([shade, hex]) => `--orange-${shade}: ${hex};`).join(' ');
  const within = (list) => list.map(item => `${sel} ${item}`).join(',\n  ');
  return `
  ${sel} {
    --background: ${p.canvas.t};
    --foreground: ${p.fg1.t};
    --card: ${p.surface.t};
    --card-foreground: ${p.fg1.t};
    --popover: ${p.surface.t};
    --popover-foreground: ${p.fg1.t};
    --secondary: ${p.secondary.t};
    --secondary-foreground: ${p.fg1.t};
    --muted: ${p.secondary.t};
    --muted-foreground: ${p.fg3.t};
    --accent: ${p.secondary.t};
    --accent-foreground: ${p.fg1.t};
    --border: ${p.border.t};
    --input: ${p.border.t};
    --primary: ${p.accentTriplet};
    --primary-foreground: ${hexTriplet(p.onAccent)};
    --ring: ${p.accentTriplet};
    --sidebar-primary: ${p.accentTriplet};
    --sidebar-primary-foreground: ${hexTriplet(p.onAccent)};
    --sidebar-ring: ${p.accentTriplet};
    --bg-canvas: ${p.canvas.hex};
    --bg-surface: ${p.surface.hex};
    --bg-sunk: ${p.sunk.hex};
    --fg-1: ${p.fg1.hex};
    --fg-2: ${p.fg2.hex};
    --fg-3: ${p.fg3.hex};
    --fg-on-accent: ${p.onAccent};
    --border-1: ${p.border.hex};
    --border-2: ${p.borderStrong.hex};
    --border-strong: ${p.fg1.hex};
    --sg-orange: ${p.accent};
    --sg-ring: 0 0 0 3px ${rgba(p.accent, 0.3)};
    ${scale}
    --sg-tw-mix: ${p.mix.hex};
    --sg-tw-mix-border: ${p.mixBorder.hex};
  }
  ${bodyBackgroundCss(sel, theme, p)}
  ${motionCss(id, theme, sel, p)}
  ${within(WHITE_SURFACES)} { background: var(--bg-surface); }
  ${sel} .bg-white:where(:not(${PAPER})) { background-color: hsl(var(--card)); }
  ${sel} .bg-\\[\\#FF5100\\] { background-color: ${p.accent}; color: ${p.onAccent}; }
  ${sel} .text-\\[\\#FF5100\\] { color: ${p.accent}; }
  ${sel} .bg-primary :where(h1, h2, h3, h4, h5, h6) { color: inherit; }
  ${sel} .sg-app .side {
    background: ${p.sidebar.hex};
    border-right: 1px solid ${p.dark ? rgba('#ffffff', 0.06) : p.border.hex};
  }
  ${sel} .sg-app .navg .it.active,
  ${sel} .sg-app .navg .sub a.active {
    background: ${rgba(p.accent, p.dark ? 0.18 : 0.12)};
  }
  ${sel} .sg-app .navg .sub { border-left-color: ${p.borderStrong.hex}; }
`;
}

// Papier blijft het echte document: wit, met de gewone lichte kleuren en
// het Singeling-oranje.
function pagePaperCss(id) {
  return `
  html.sg-theme-${id}.sg-theme-${id} ${PAPER} {
    color-scheme: light;
    --background: 210 17% 97%;
    --foreground: 223 14% 10%;
    --card: 0 0% 100%;
    --card-foreground: 223 14% 10%;
    --muted-foreground: 212 6% 44%;
    --border: 214 12% 89%;
    --primary: 19 100% 50%;
    --primary-foreground: 0 0% 100%;
    --ring: 19 100% 50%;
    --bg-surface: #ffffff;
    --fg-1: var(--sg-ink);
    --fg-2: var(--grey-600);
    --fg-3: var(--grey-400);
    --sg-orange: #FF5100;
    --orange-50: #FFF1EA; --orange-100: #FFDDCC; --orange-200: #FFB793; --orange-300: #FF8A4D;
    --orange-400: #FF5100; --orange-500: #E84600; --orange-600: #C73B00; --orange-700: #9E2F00;
  }
  html.sg-theme-${id}.sg-theme-${id} ${PAPER} .bg-\\[\\#FF5100\\] { background-color: #FF5100; color: #ffffff; }
  html.sg-theme-${id}.sg-theme-${id} ${PAPER} .text-\\[\\#FF5100\\] { color: #FF5100; }
`;
}

// CSS voor de pagina's bij het gekozen thema ('' bij het standaardthema).
// Alleen het actieve thema, zodat een achtergrondafbeelding niet bij elke
// paginalading voor alle thema's meegaat.
const pageCssCache = new Map();
function pageThemeCss(id) {
  const theme = customTheme(id);
  if (!theme) return '';
  if (!pageCssCache.has(id)) {
    const css = wallpaperVariablesCss(id, theme)
      + motionKeyframesCss(id, theme)
      + pageShapeCss(id, theme)
      + Object.keys(VARIANTS).map(variant => pageVariantCss(id, theme, variant)).join('')
      + pagePaperCss(id);
    pageCssCache.set(id, css);
  }
  return pageCssCache.get(id);
}

// Alle classes die main.js op <html> kan zetten (om de oude weg te halen).
const THEME_CLASSES = Object.keys(THEMES).map(id => `sg-theme-${id}`);

// ---------- CSS voor de chrome ----------
//
// Zelfde variabelen en classes als index.html en detached.html (theme-light,
// theme-soft), onder de extra class "chrome-theme". Specificiteit (0,3,1)
// wint van de leescomfort-regels daar (0,2,1).

function chromeVariantCss(theme, variant) {
  const p = palette(theme, variant);
  const ink = p.fg1.hex;
  const sel = {
    light: 'html.chrome-theme.theme-light:not(.theme-soft)',
    softLight: 'html.chrome-theme.theme-light.theme-soft',
    dark: 'html.chrome-theme:not(.theme-light):not(.theme-soft)',
    softDark: 'html.chrome-theme.theme-soft:not(.theme-light)'
  }[variant];
  const backdropBase = p.dark ? p.canvas.hex : p.surface.hex;
  return `
  ${sel} {
    --accent: ${p.accent};
    --accent-hover: ${p.accentHover};
    --accent-strong: ${p.accentStrong};
    --app-bg: ${p.canvas.hex};
    --bar-bg: ${p.bar.hex};
    --bar-border: ${p.dark ? p.borderStrong.hex : p.border.hex};
    --tab-bg: ${p.tab.hex};
    --surface: ${p.surface.hex};
    --surface-raised: ${p.raised.hex};
    --field-bg: ${p.dark ? 'rgba(0, 0, 0, 0.22)' : p.canvas.hex};
    --border: ${p.dark ? rgba('#ffffff', 0.1) : p.border.hex};
    --border-strong: ${p.dark ? rgba('#ffffff', 0.2) : p.borderStrong.hex};
    --hover: ${rgba(ink, p.dark ? 0.06 : 0.05)};
    --hover-strong: ${rgba(ink, p.dark ? 0.12 : 0.09)};
    --text: ${ink};
    --text-2: ${p.fg2.hex};
    --text-muted: ${p.fg3.hex};
    --text-faint: ${p.fg4.hex};
    --overlay: ${p.dark ? rgba(mix(p.canvas.hex, '#000000', 0.5), 0.72) : rgba(ink, 0.42)};
    --shadow: 0 16px 40px ${p.dark ? 'rgba(0, 0, 0, 0.5)' : rgba(ink, 0.16)};
    --panel-bg: ${rgba(p.surface.hex, p.dark ? 0.72 : 0.82)};
    --backdrop:
      radial-gradient(circle at 88% 4%, ${rgba(p.accent, p.dark ? 0.26 : 0.15)}, transparent 40%),
      radial-gradient(circle at 60% 0%, ${rgba(p.accent, p.dark ? 0.12 : 0.07)}, transparent 45%),
      linear-gradient(155deg, ${backdropBase} 0%, ${p.canvas.hex} 60%, ${p.sunk.hex} 100%);
  }
`;
}

// CSS voor de chrome bij het gekozen thema ('' bij het standaardthema).
function chromeThemeCss(id) {
  const theme = customTheme(id);
  if (!theme) return '';
  return Object.keys(VARIANTS).map(variant => chromeVariantCss(theme, variant)).join('') + chromeShapeCss(theme);
}

// Lettertype en hoeken in de chrome. De paden zijn relatief aan index.html
// en detached.html (die staan in dezelfde map als assets/).
function chromeShapeCss(theme) {
  let css = '';
  if (theme.font) {
    css += fontFaceCss(theme, file => file) + `
  html.chrome-theme body,
  html.chrome-theme button,
  html.chrome-theme input,
  html.chrome-theme select,
  html.chrome-theme textarea {
    font-family: ${fontStack(theme)} !important;
  }
`;
  }
  if (theme.radius) css += `\n  html.chrome-theme { --radius: ${theme.radius}; }\n`;
  return css;
}

// Het hulpkaartje (main.js, HELP_POPOVER_HTML) heeft eigen namen: --bg,
// --muted, en de classes light/soft.
function helpPopoverThemeCss(id) {
  const theme = customTheme(id);
  if (!theme) return '';
  return Object.keys(VARIANTS).map(variant => {
    const p = palette(theme, variant);
    const sel = {
      light: 'html.themed.light:not(.soft)',
      softLight: 'html.themed.light.soft',
      dark: 'html.themed:not(.light):not(.soft)',
      softDark: 'html.themed.soft:not(.light)'
    }[variant];
    return `${sel} { --bg: ${p.surface.hex}; --border: ${p.dark ? rgba('#ffffff', 0.1) : p.border.hex}; --text: ${p.fg1.hex}; --text-2: ${p.fg2.hex}; --muted: ${p.fg3.hex}; --accent: ${p.accent}; }`;
  }).join('\n') + (theme.font
    ? fontFaceCss(theme, fontDataUrl) + `\n  html.themed body { font-family: ${fontStack(theme)} !important; }`
    : '');
}

module.exports = {
  THEMES,
  DEFAULT_THEME,
  THEME_CLASSES,
  isTheme,
  isOriginal,
  themeCatalog,
  previewFontCss,
  supportsSoft,
  pageThemeCss,
  themeBackground,
  themeAccent,
  themeBarColor,
  chromeThemeCss,
  helpPopoverThemeCss
};
