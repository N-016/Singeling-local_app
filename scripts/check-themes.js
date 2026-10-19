// Controle van de thema's (themes.js). Draait vanzelf vóór `npm run build`
// (prebuild), los: `npm run check:themes`.
//
// Regel: een accentkleur mag niet op een statuskleur van de Singeling-app
// lijken. Anders ziet elke knop eruit als een waarschuwing, fout of "klaar".
// Statuskleuren in de app (CSS van de webapp, oktober 2026):
//   rood  (stop/destructive)  #D93A2B, hsl 5      + Tailwind red-500   0
//   amber (warn/warning)      #E8A100, hsl 42     + Tailwind amber 38-45
//   groen (ok/success)        #1F9D57, hsl 147    + Tailwind green/emerald 142-160
// Een accent moet minstens MIN_HUE_DISTANCE graden (kleurenwiel) buiten die
// zones liggen. Grijzige accenten (weinig verzadiging) tellen niet: die lezen
// niet als statuskleur. Het Singeling-oranje (hsl 19) past er net tussen.

const themes = require('../themes');

const STATUS_ZONES = [
  { name: 'rood', from: 0, to: 5 },
  { name: 'amber', from: 38, to: 45 },
  { name: 'groen', from: 142, to: 160 }
];
const MIN_HUE_DISTANCE = 12;
const MIN_SATURATION = 0.35;

function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

// Afstand (graden) van een tint tot een zone op het kleurenwiel; 0 = erin.
function distanceToZone(h, { from, to }) {
  if (h >= from && h <= to) return 0;
  const around = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  return Math.min(around(h, from), around(h, to));
}

function accents(id, theme) {
  if (theme.palettes) {
    return Object.entries(theme.palettes).map(([mode, p]) => ({ mode, hex: p.accent }));
  }
  // Afgeleid thema: zelfde tint in licht en donker (donker is iets lichter).
  return theme.accent ? [{ mode: 'licht/donker', hex: theme.accent }] : [];
}

const problems = [];
for (const [id, theme] of Object.entries(themes.THEMES)) {
  for (const { mode, hex } of accents(id, theme)) {
    const { h, s } = hexToHsl(hex);
    if (s < MIN_SATURATION) continue;
    for (const zone of STATUS_ZONES) {
      const distance = distanceToZone(h, zone);
      if (distance < MIN_HUE_DISTANCE) {
        problems.push(`${theme.name} (${id}, ${mode}): accent ${hex} (tint ${Math.round(h)}) ligt ${Math.round(distance)}° van ${zone.name}`);
      }
    }
  }
}

// Regel 2: een hoog-contrastthema (highContrast) moet dat echt zijn. Alle
// tekst, het accent en de statuskleuren halen 7:1 (WCAG AAA) op elk vlak;
// randen 4,5:1 op de kaarten.
function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [16, 8, 0].map(shift => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const HC_BACKGROUNDS = ['canvas', 'surface', 'raised', 'sunk', 'secondary', 'sidebar', 'bar', 'tab'];
for (const [id, theme] of Object.entries(themes.THEMES)) {
  if (!theme.highContrast) continue;
  for (const mode of Object.keys(theme.palettes)) {
    const p = theme.palettes[mode];
    const inks = { fg1: p.fg1, fg2: p.fg2, fg3: p.fg3, fg4: p.fg4, accent: p.accent, ...theme.status[mode] };
    const check = (name, fg, bg, min) => {
      const ratio = contrast(fg, bg);
      if (ratio < min) problems.push(`${theme.name} (${id}, ${mode}): ${name} haalt ${ratio.toFixed(2)}:1, minimaal ${min}:1`);
    };
    for (const [name, fg] of Object.entries(inks)) {
      for (const bg of HC_BACKGROUNDS) check(`${name} op ${bg}`, fg, p[bg], 7);
    }
    check('onAccent op accent', p.onAccent, p.accent, 7);
    check('border op surface', p.border, p.surface, 4.5);
  }
}

// Regel 3: een thema met één stand (mode) heeft precies dat ene palet, en
// elk bestand waar een thema naar verwijst bestaat.
const fs = require('fs');
const path = require('path');
for (const [id, theme] of Object.entries(themes.THEMES)) {
  if (theme.mode && (!theme.palettes || Object.keys(theme.palettes).join() !== theme.mode)) {
    problems.push(`${theme.name} (${id}): mode '${theme.mode}', maar paletten: ${Object.keys(theme.palettes || {}).join(', ') || 'geen'}`);
  }
  const files = [theme.wallpaper, theme.motion, theme.ambient, theme.passer].flatMap(set => Object.values(set || {}))
    .concat([theme.font, theme.displayFont, theme.monoFont].flatMap(font => (font ? font.faces.map(face => face.file) : [])));
  for (const file of files) {
    if (!fs.existsSync(path.join(__dirname, '..', file))) problems.push(`${theme.name} (${id}): bestand ontbreekt: ${file}`);
  }
}

if (problems.length) {
  console.error(`Thema's: ${problems.length} probleem/problemen (accent minimaal ${MIN_HUE_DISTANCE}° van een statuskleur; hoog contrast 7:1):`);
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}
console.log(`Thema's: alle accenten liggen minstens ${MIN_HUE_DISTANCE}° van rood, amber en groen; hoog contrast haalt 7:1.`);
