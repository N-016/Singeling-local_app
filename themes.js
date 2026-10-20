// Thema's (bèta): een vaste set kleurensets van ons, bovenop licht/donker en
// oogcomfort. Twee soorten:
//
//   1. Afgeleid: alleen een recept, de kleuren worden berekend.
//        hue    - tint van de achtergronden en tekst (0-360, kleurenwiel)
//        tint   - hoe sterk die tint is (1 = normaal, 0 = grijs)
//        accent - accentkleur i.p.v. het Singeling-oranje
//      De drie varianten (licht, licht met oogcomfort, donker) komen uit de
//      vaste lichtheden in VARIANTS.
//
// Accentkleuren mogen niet op de statuskleuren van de app lijken (rood,
// amber, groen); scripts/check-themes.js controleert dat vóór elke build.
//
//   2. Vast palet (palettes.light / palettes.dark): de kleuren van een bestaand
//      thema letterlijk overgenomen, eventueel met een achtergrondafbeelding
//      (wallpaper) achter de pagina's. Oogcomfort verandert hier (voorlopig)
//      niets aan: het thema heeft zijn eigen uitstraling.
//      Met mode: 'dark' of 'light' heeft het thema maar één stand: dan is er
//      ook maar één palet en één set afbeeldingen, en negeert de app
//      licht/donker (main.js darkActive; de knop verdwijnt). De automatische
//      wissel loopt gewoon door en geldt weer bij een ander thema.
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
  description: 'Zacht paars en oudroze, met een achtergrond van bladeren.',
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

// Cassette: jaren 80 in rustig pastel (Doe Maar-kleuren: lila, roze, geel,
// blauw). Een cassettebandje ("MIX '86"), een kubuspuzzel en wat Memphis.
// Licht = lichtlila met roze accent, donker = diep paars met lichtroze accent
// (geel zat te dicht bij de "let op"-kleur; geel zit nog in de achtergrond).
// Tekst in Fredoka, koppen in Righteous (beide OFL); palet en achtergronden
// van ons (zie assets/themes/cassette/BRON.md).
const CASSETTE = {
  name: 'Cassette',
  description: 'Jaren 80 in pastel: een cassettebandje, een kubuspuzzel en Memphis-vormen.',
  palettes: {
    light: {
      canvas: '#fbf6ff', surface: '#ffffff', raised: '#f3e9fb', sunk: '#f4ecfb',
      bar: '#ffffff', tab: '#ffffff', sidebar: '#f1e6fa', secondary: '#f3eafb',
      border: '#e2d2f2', borderStrong: '#c9b0e6',
      fg1: '#2b1645', fg2: '#4a2f6e', fg3: '#6e5490', fg4: '#a08bbd',
      accent: '#d8559b', accentStrong: '#a83e77', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#24133d', surface: '#2e1a4c', raised: '#3a235e', sunk: '#1c0f30',
      bar: '#170b28', tab: '#2b1847', sidebar: '#1d1033', secondary: '#3a235e',
      border: '#4a3170', borderStrong: '#5f4389',
      fg1: '#fdf3ff', fg2: '#e2cff5', fg3: '#b9a0d8', fg4: '#7f66a3',
      accent: '#ff9fd2', accentStrong: '#b4407f', onAccent: '#24133d'
    }
  },
  wallpaper: {
    light: 'assets/themes/cassette/cassette-light.svg',
    dark: 'assets/themes/cassette/cassette-dark.svg'
  },
  font: {
    family: 'Fredoka',
    fallback: '"Segoe UI", sans-serif',
    faces: [
      { file: 'assets/themes/cassette/Fredoka-Variable.woff2', weight: '300 700' }
    ]
  },
  displayFont: {
    family: 'Righteous',
    fallback: '"Segoe UI", sans-serif',
    faces: [{ file: 'assets/themes/cassette/Righteous-Regular.woff2', weight: '100 900' }]
  },
  radius: '14px'
};

// Terminal: gaat verder dan kleur. Alle tekst in JetBrains Mono (OFL; zie
// assets/themes/terminal/BRON.md): dat maakt het "cyber"; leest wat zwaarder
// in lange teksten, maar dat hoort bij dit thema. Strakke hoeken. Een oude monitor met scanlines: groen fosfor op zwart,
// alleen donker. Het accent is cyaan i.p.v. groen, anders lijkt elke knop het
// "klaar"-groen van de app. Palet en achtergrond van ons.
const JETBRAINS_MONO = {
  family: 'JetBrains Mono',
  fallback: 'Consolas, "Courier New", monospace',
  faces: [
    { file: 'assets/themes/terminal/JetBrainsMono-Regular.woff2', weight: '100 500' },
    { file: 'assets/themes/terminal/JetBrainsMono-Bold.woff2', weight: '600 900' }
  ]
};

const TERMINAL = {
  name: 'Terminal',
  description: 'Een oude computer: groen fosfor met scanlines. Alleen donker.',
  mode: 'dark',
  palettes: {
    dark: {
      canvas: '#0a0e0a', surface: '#0f150f', raised: '#152015', sunk: '#070a07',
      bar: '#060906', tab: '#0f150f', sidebar: '#080c08', secondary: '#142014',
      border: '#1e3320', borderStrong: '#2a4a2d',
      fg1: '#c8f7cf', fg2: '#9fdcaa', fg3: '#6fae7c', fg4: '#47704f',
      accent: '#3ef2e6', accentStrong: '#127a80', onAccent: '#041006'
    }
  },
  wallpaper: {
    dark: 'assets/themes/terminal/crt-dark.svg'
  },
  font: JETBRAINS_MONO,
  radius: '2px'
};

// Noorderlicht: licht geanimeerde achtergrond. De lucht (wallpaper) staat
// stil; het noorderlicht is een losse laag (motion) die heel langzaam
// verschuift. Lettertype Lexend (OFL), gemaakt voor leesbaarheid. Accent
// ijsblauw/cyaan: het groen van het noorderlicht zelf lijkt op het
// "klaar"-groen. Palet en achtergronden van ons
// (assets/themes/noorderlicht/BRON.md).
const NOORDERLICHT = {
  name: 'Noorderlicht',
  description: 'Een dennenbos bij nacht met bewegend noorderlicht. Alleen donker.',
  mode: 'dark',
  palettes: {
    dark: {
      canvas: '#0b1320', surface: '#111c2e', raised: '#172539', sunk: '#081019',
      bar: '#070d17', tab: '#101a2b', sidebar: '#0a1222', secondary: '#17263a',
      border: '#1f3149', borderStrong: '#2b4262',
      fg1: '#e6f1ff', fg2: '#b9cbe3', fg3: '#8aa1bf', fg4: '#5a6f8c',
      accent: '#5ad8e6', accentStrong: '#177884', onAccent: '#062018'
    }
  },
  wallpaper: {
    dark: 'assets/themes/noorderlicht/lucht-dark.svg'
  },
  motion: {
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

// Werkplaats: past bij Singeling. Een lastafel in zijaanzicht waar iemand
// aan het lassen is, tegen een wand van geborsteld staal met
// waarschuwingsstrepen en een traanplaatvloer. Het laspunt gloeit en de
// vonken spatten (ambient-laag). Lettertype Barlow (OFL). Accent = vonk-oranje;
// het veiligheidsgeel zit in de achtergrond, als accent lijkt het op de
// "let op"-kleur.
const WERKPLAATS = {
  name: 'Werkplaats',
  description: 'Een lastafel in de werkplaats: er wordt gelast en de vonken spatten. Alleen donker.',
  mode: 'dark',
  palettes: {
    dark: {
      canvas: '#16191d', surface: '#1e2227', raised: '#272c32', sunk: '#111417',
      bar: '#0e1013', tab: '#1c2025', sidebar: '#121519', secondary: '#272c32',
      border: '#333941', borderStrong: '#454c56',
      fg1: '#e8ebee', fg2: '#c3c8ce', fg3: '#9aa1aa', fg4: '#69717b',
      accent: '#ff7a2e', accentStrong: '#b4500f', onAccent: '#16191d'
    }
  },
  wallpaper: {
    dark: 'assets/themes/werkplaats/staal-dark.svg'
  },
  // Het laspunt: gloed op de muur en spattende vonken.
  ambient: {
    dark: 'assets/themes/werkplaats/vonken-dark.svg'
  },
  font: {
    family: 'Barlow',
    fallback: '"Segoe UI", sans-serif',
    faces: [
      { file: 'assets/themes/werkplaats/Barlow-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/werkplaats/Barlow-Bold.woff2', weight: '600 900' }
    ]
  },
  radius: '2px'
};

// Delfts blauw: porseleinwit met kobaltblauw, Delftse tegels langs de randen.
// Alleen licht. Lora (OFL) alleen voor de koppen: een schreefletter leest
// minder goed in drukke tabellen.
const DELFTS = {
  name: 'Delfts blauw',
  description: 'Porseleinwit met kobaltblauw en Delftse tegels. Alleen licht.',
  mode: 'light',
  palettes: {
    light: {
      canvas: '#f5f8fc', surface: '#ffffff', raised: '#e9eff8', sunk: '#edf2f9',
      bar: '#ffffff', tab: '#ffffff', sidebar: '#e6edf8', secondary: '#eaf0f9',
      border: '#cfdbee', borderStrong: '#b2c3e2',
      fg1: '#12245a', fg2: '#2a3d78', fg3: '#4a5d96', fg4: '#8593bd',
      accent: '#1f4fa8', accentStrong: '#173d85', onAccent: '#ffffff'
    }
  },
  wallpaper: {
    light: 'assets/themes/delfts/tegels-light.svg'
  },
  displayFont: {
    family: 'Lora',
    fallback: 'Georgia, serif',
    faces: [{ file: 'assets/themes/delfts/Lora-Variable.woff2', weight: '400 700' }]
  },
  radius: '4px'
};

// Haven: de Zaanstreek aan het water, met molens, huisjes, een schip en een
// kraan; het water golft (bewegende laag onderin). 's Nachts met havenlichtjes.
// Lettertype Work Sans (OFL).
const HAVEN = {
  name: 'Haven',
  description: 'Een Zaanse waterkant met molens; af en toe vaart er een tjalk voorbij.',
  palettes: {
    light: {
      canvas: '#eef5f8', surface: '#fbfdfe', raised: '#e2edf2', sunk: '#e6f0f4',
      bar: '#fbfdfe', tab: '#fbfdfe', sidebar: '#e0ecf1', secondary: '#e3eef3',
      border: '#c8dbe4', borderStrong: '#a9c4d1',
      fg1: '#0f2a3a', fg2: '#274656', fg3: '#486676', fg4: '#7f99a6',
      accent: '#0a7ea4', accentStrong: '#075f7c', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#0a1a26', surface: '#0f2433', raised: '#163042', sunk: '#07131c',
      bar: '#050f17', tab: '#0e2230', sidebar: '#08151f', secondary: '#163042',
      border: '#1f3c50', borderStrong: '#2b4f66',
      fg1: '#e6f3fa', fg2: '#bcd5e2', fg3: '#8badbf', fg4: '#5a7a8b',
      accent: '#4cc3e6', accentStrong: '#1f87a8', onAccent: '#06202b'
    }
  },
  wallpaper: {
    light: 'assets/themes/haven/haven-light.svg',
    dark: 'assets/themes/haven/haven-dark.svg'
  },
  motion: {
    light: 'assets/themes/haven/golven-light.svg',
    dark: 'assets/themes/haven/golven-dark.svg'
  },
  motionStyle: 'waves',
  motionArea: 'bottom',
  // De tjalk vaart af en toe rustig voorbij (zit niet in de achtergrond zelf).
  passer: {
    light: 'assets/themes/haven/boot-light.svg',
    dark: 'assets/themes/haven/boot-dark.svg'
  },
  passerDuration: 150,
  // De molenwieken draaien heel langzaam (zitten niet in de achtergrond zelf).
  ambient: {
    light: 'assets/themes/haven/molens-light.svg',
    dark: 'assets/themes/haven/molens-dark.svg'
  },
  font: {
    family: 'Work Sans',
    fallback: '"Segoe UI", sans-serif',
    faces: [{ file: 'assets/themes/haven/WorkSans-Variable.woff2', weight: '300 700' }]
  },
  radius: '6px'
};

// Arcade: spelletjes uit de jaren 80/90. Eigen pixelkunst (overdag wolken,
// heuvels en munten; 's nachts sterren, een planeet en ruimtewezens),
// pixellettertype Pixelify Sans (OFL) voor de koppen, Rubik (OFL) voor de
// lopende tekst (een pixellettertype leest niet goed), en geen afgeronde
// hoeken.
const ARCADE = {
  name: 'Arcade',
  description: 'Pixels uit de spelletjestijd: overdag wolken en draaiende munten, \'s nachts twinkelende sterren.',
  palettes: {
    light: {
      canvas: '#f2f4ff', surface: '#ffffff', raised: '#e6e9ff', sunk: '#e9ecff',
      bar: '#ffffff', tab: '#ffffff', sidebar: '#e3e7ff', secondary: '#e8ebff',
      border: '#c9cff5', borderStrong: '#a9b1ee',
      fg1: '#14163a', fg2: '#2d3170', fg3: '#4f55a0', fg4: '#8d92c9',
      accent: '#5a3cff', accentStrong: '#3f22d6', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#0d0d1a', surface: '#16162b', raised: '#20203d', sunk: '#090912',
      bar: '#07070f', tab: '#14142a', sidebar: '#0a0a16', secondary: '#20203d',
      border: '#2c2c52', borderStrong: '#3d3d6e',
      fg1: '#f1f1ff', fg2: '#c9c9f0', fg3: '#9a9ad0', fg4: '#6262a0',
      accent: '#00e5ff', accentStrong: '#008ea0', onAccent: '#0d0d1a'
    }
  },
  wallpaper: {
    light: 'assets/themes/arcade/pixel-light.svg',
    dark: 'assets/themes/arcade/pixel-dark.svg'
  },
  // Munten draaien, 's nachts twinkelen er sterren.
  ambient: {
    light: 'assets/themes/arcade/munten-light.svg',
    dark: 'assets/themes/arcade/munten-dark.svg'
  },
  font: {
    family: 'Rubik',
    fallback: '"Segoe UI", sans-serif',
    faces: [{ file: 'assets/themes/arcade/Rubik-Variable.woff2', weight: '300 800' }]
  },
  displayFont: {
    family: 'Pixelify Sans',
    fallback: 'Consolas, monospace',
    faces: [{ file: 'assets/themes/arcade/PixelifySans-Variable.woff2', weight: '400 700' }]
  },
  radius: '0px'
};

// Metaal: geborsteld rvs, koel grijs, met een donkerblauw accent (gelakt
// staal, geanodiseerd aluminium). Anders dan Werkplaats (vonk-oranje, alleen
// donker): rustig en koel. Platen met naden en verzonken bouten, onderin
// traanplaat.
const METAAL = {
  name: 'Metaal',
  description: 'Geborsteld rvs met naden en verzonken bouten, onderin traanplaat.',
  palettes: {
    light: {
      canvas: '#eceff2', surface: '#f8f9fb', raised: '#e1e5ea', sunk: '#e4e8ec',
      bar: '#f8f9fb', tab: '#f8f9fb', sidebar: '#dfe3e8', secondary: '#e2e6eb',
      border: '#c5ccd4', borderStrong: '#a7b0bb',
      fg1: '#161b22', fg2: '#2c333d', fg3: '#4d5662', fg4: '#848d98',
      accent: '#1f4f8a', accentStrong: '#173c6b', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#15181c', surface: '#1c2026', raised: '#252a31', sunk: '#101215',
      bar: '#0c0e11', tab: '#1a1e24', sidebar: '#111418', secondary: '#252a31',
      border: '#323840', borderStrong: '#444b55',
      fg1: '#e9ecef', fg2: '#c4c9cf', fg3: '#9aa1a9', fg4: '#69717a',
      accent: '#7fa8de', accentStrong: '#3f6aa6', onAccent: '#0c0e11'
    }
  },
  wallpaper: {
    light: 'assets/themes/metaal/rvs-light.svg',
    dark: 'assets/themes/metaal/rvs-dark.svg'
  },
  font: {
    family: 'Source Sans 3',
    fallback: '"Segoe UI", sans-serif',
    faces: [{ file: 'assets/themes/metaal/SourceSans3-Variable.woff2', weight: '200 900' }]
  },
  displayFont: {
    family: 'Zilla Slab',
    fallback: 'Georgia, serif',
    faces: [
      { file: 'assets/themes/metaal/ZillaSlab-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/metaal/ZillaSlab-Bold.woff2', weight: '600 900' }
    ]
  },
  radius: '4px'
};

// Rijstpapier: wabi-sabi. Rustig, veel lucht: rijstpapier en inkt, een tak met
// bloesem, een half open ensō en een kleine hanko. Accent olijf-matcha (ver
// van het "klaar"-groen). Shippori Mincho B1 voor de koppen, Zen Kaku Gothic
// New voor de tekst (beide OFL, alleen de Latijnse tekens).
const RIJSTPAPIER = {
  name: 'Rijstpapier',
  description: 'Wabi-sabi: rijstpapier en inkt, een bloesemtak en een ensō.',
  palettes: {
    light: {
      canvas: '#f4f0e6', surface: '#fbf9f3', raised: '#ebe5d8', sunk: '#ede8dc',
      bar: '#fbf9f3', tab: '#fbf9f3', sidebar: '#e9e3d5', secondary: '#ebe5d8',
      border: '#d6cebd', borderStrong: '#bcb29d',
      fg1: '#1e1c18', fg2: '#36332c', fg3: '#57534a', fg4: '#8c867a',
      accent: '#647336', accentStrong: '#525e2b', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#17171a', surface: '#1e1e22', raised: '#28282d', sunk: '#111113',
      bar: '#0d0d0f', tab: '#1c1c20', sidebar: '#121215', secondary: '#28282d',
      border: '#35353b', borderStrong: '#48484f',
      fg1: '#ece8df', fg2: '#c9c4b8', fg3: '#9f9a8f', fg4: '#6d6960',
      accent: '#a8b86a', accentStrong: '#6f7d3c', onAccent: '#111113'
    }
  },
  wallpaper: {
    light: 'assets/themes/rijstpapier/papier-light.svg',
    dark: 'assets/themes/rijstpapier/papier-dark.svg'
  },
  font: {
    family: 'Zen Kaku Gothic New',
    fallback: '"Segoe UI", sans-serif',
    faces: [
      { file: 'assets/themes/rijstpapier/ZenKakuGothicNew-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/rijstpapier/ZenKakuGothicNew-Bold.woff2', weight: '600 900' }
    ]
  },
  displayFont: {
    family: 'Shippori Mincho B1',
    fallback: 'Georgia, serif',
    faces: [
      { file: 'assets/themes/rijstpapier/ShipporiMinchoB1-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/rijstpapier/ShipporiMinchoB1-Bold.woff2', weight: '600 900' }
    ]
  },
  radius: '2px'
};

// Blauwdruk: een technische tekening, de klassieke blauwdruk (Pruisisch blauw
// met witte lijnen); alleen donker. Een plotter tekent een flensplaat.
const BLAUWDRUK = {
  name: 'Blauwdruk',
  description: 'Een technische tekening met kader en stempelveld; een plotter tekent een flensplaat. Alleen donker.',
  mode: 'dark',
  palettes: {
    dark: {
      canvas: '#0f3a66', surface: '#12436f', raised: '#184e7d', sunk: '#0c3157',
      bar: '#0a2b4d', tab: '#11406b', sidebar: '#0c3259', secondary: '#184e7d',
      border: '#2a5f8f', borderStrong: '#3b74a6',
      fg1: '#eef6ff', fg2: '#c4dbf2', fg3: '#93b6d8', fg4: '#6489b0',
      accent: '#9be7ff', accentStrong: '#3fa9d6', onAccent: '#082744'
    }
  },
  wallpaper: {
    dark: 'assets/themes/blauwdruk/blad-dark.svg'
  },
  ambient: {
    dark: 'assets/themes/blauwdruk/plotter-dark.svg'
  },
  font: {
    family: 'IBM Plex Sans',
    fallback: '"Segoe UI", sans-serif',
    faces: [{ file: 'assets/themes/blauwdruk/IBMPlexSans-Variable.woff2', weight: '100 700' }]
  },
  displayFont: {
    family: 'IBM Plex Mono',
    fallback: 'Consolas, "Courier New", monospace',
    faces: [
      { file: 'assets/themes/blauwdruk/IBMPlexMono-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/blauwdruk/IBMPlexMono-Bold.woff2', weight: '600 900' }
    ]
  },
  radius: '2px'
};

// Laser: een geborstelde plaat met een nesting van onderdelen; de laserkop
// snijdt er acht één voor één uit (fase 2: nesting uit
// vw_monitor_nestings halen).
const LASER = {
  name: 'Laser',
  description: 'Een geborstelde plaat met nesting; de laser snijdt er één voor één onderdelen uit. Alleen licht.',
  mode: 'light',
  palettes: {
    light: {
      canvas: '#eef0f3', surface: '#fafbfc', raised: '#e3e6ea', sunk: '#e6e9ed',
      bar: '#fafbfc', tab: '#fafbfc', sidebar: '#e1e4e9', secondary: '#e4e7eb',
      border: '#c8cdd4', borderStrong: '#aab1ba',
      fg1: '#191c21', fg2: '#30353d', fg3: '#525a64', fg4: '#878f99',
      accent: '#8b3fd9', accentStrong: '#6d28b8', onAccent: '#ffffff'
    }
  },
  wallpaper: {
    light: 'assets/themes/laser/plaat-light.svg'
  },
  ambient: {
    light: 'assets/themes/laser/snijden-light.svg'
  },
  font: {
    family: 'Inter',
    fallback: '"Segoe UI", sans-serif',
    faces: [{ file: 'assets/themes/laser/Inter-Variable.woff2', weight: '100 900' }]
  },
  displayFont: {
    family: 'Chakra Petch',
    fallback: '"Segoe UI", sans-serif',
    faces: [
      { file: 'assets/themes/laser/ChakraPetch-Regular.woff2', weight: '100 500' },
      { file: 'assets/themes/laser/ChakraPetch-Bold.woff2', weight: '600 900' }
    ]
  },
  radius: '4px'
};

// Hal: hoog contrast voor schermen en tablets op de werkvloer (fel licht,
// vanaf een afstand). Een eigen groep, geen sfeerthema: alle tekst, het
// accent en de statuskleuren halen 7:1 (scripts/check-themes.js), randen
// 4,5:1. Daarbovenop (highContrastCss): dichte randen, een focusrand van
// 3px en grijze Tailwind-tekst van de app op fg3. Geen achtergrond.
// Atkinson Hyperlegible Next is gemaakt voor leesbaarheid.
const HAL = {
  name: 'Hal',
  description: 'Hoog contrast voor de werkvloer: goed leesbaar in fel licht en vanaf een afstand.',
  highContrast: true,
  palettes: {
    light: {
      canvas: '#ffffff', surface: '#ffffff', raised: '#f0f0f0', sunk: '#ebebeb',
      bar: '#ffffff', tab: '#ffffff', sidebar: '#f0f0f0', secondary: '#ebebeb',
      border: '#767676', borderStrong: '#000000',
      fg1: '#000000', fg2: '#1a1a1a', fg3: '#333333', fg4: '#4a4a4a',
      accent: '#0040c1', accentStrong: '#002f8f', onAccent: '#ffffff'
    },
    dark: {
      canvas: '#000000', surface: '#0d0d0d', raised: '#1a1a1a', sunk: '#000000',
      bar: '#000000', tab: '#0d0d0d', sidebar: '#000000', secondary: '#1f1f1f',
      border: '#7a7a7a', borderStrong: '#ffffff',
      fg1: '#ffffff', fg2: '#f0f0f0', fg3: '#d6d6d6', fg4: '#b0b0b0',
      accent: '#7ab0ff', accentStrong: '#2f6fe0', onAccent: '#000000'
    }
  },
  // Statuskleuren (--stop/--warn/--ok van de app) met meer contrast.
  status: {
    light: { stop: '#96001c', warn: '#743c00', ok: '#00562a' },
    dark: { stop: '#ff8a8a', warn: '#ffb000', ok: '#3ddc84' }
  },
  font: {
    family: 'Atkinson Hyperlegible Next',
    fallback: '"Segoe UI", sans-serif',
    faces: [{ file: 'assets/themes/hal/AtkinsonHyperlegibleNext-Variable.woff2', weight: '200 800' }]
  },
  radius: '4px'
};

const THEMES = {
  // De app precies zoals de webapp hem maakt: geen licht/donker, geen
  // oogcomfort, geen aangepaste kleuren of zijbalk (main.js darkActive,
  // class sg-original op de pagina's; page-tweaks.js).
  origineel: { name: 'Origineel', description: 'De app precies zoals hij is, zonder aanpassingen: geen licht/donker of oogcomfort.', original: true },
  // id "standaard" blijft (bewaard in ieders instellingen, en de standaard
  // voor iedereen): de Singeling-kleuren van de app, met licht/donker en
  // oogcomfort.
  standaard: { name: 'Singeling', description: 'De Singeling-kleuren: grijs met oranje.' },
  // Pastelkleurensets (afgeleid: tint + accent). Alleen kleuren, met
  // licht/donker en oogcomfort.
  blauw: { name: 'Blauw', description: 'Koel en rustig blauw.', hue: 215, tint: 1, accent: '#2f7fe0' },
  // Accenten blijven uit de buurt van de statuskleuren (scripts/check-themes.js):
  // Groen krijgt jadegroen-blauw, Crème terracotta.
  groen: { name: 'Groen', description: 'Zacht saliegroen met jade.', hue: 150, tint: 0.85, accent: '#1f8a80' },
  roze: { name: 'Roze', description: 'Poederroze.', hue: 340, tint: 0.8, accent: '#d0457e' },
  creme: { name: 'Crème', description: 'Warm crème met terracotta.', hue: 38, tint: 1.1, accent: '#b0623a' },
  lavendel: { name: 'Lavendel', description: 'Licht lila.', hue: 262, tint: 0.9, accent: '#7a5af0' },
  rosepine: ROSE_PINE,
  cassette: CASSETTE,
  metaal: METAAL,
  rijstpapier: RIJSTPAPIER,
  terminal: TERMINAL,
  noorderlicht: NOORDERLICHT,
  werkplaats: WERKPLAATS,
  delfts: DELFTS,
  haven: HAVEN,
  arcade: ARCADE,
  blauwdruk: BLAUWDRUK,
  laser: LASER,
  hal: HAL
};

const DEFAULT_THEME = 'standaard';

// Lichtheid (%) per rol, per variant, voor afgeleide thema's. sat =
// verzadiging van de vlakken bij tint 1; tekst krijgt de helft daarvan.
// Oogcomfort (soft, alleen in licht) verlaagt vooral het contrast
// (lichtheid), niet de tint: anders wordt elk thema grijs. In donker iets
// meer verzadiging, anders is de tint bij zo weinig licht nauwelijks te zien.
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
  }
};

const isDarkVariant = (variant) => variant === 'dark';

function variantFor(dark, soft) {
  if (dark) return 'dark';
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

// Voorbeeldplaatje naast een achtergrond (<naam>.preview.png), of de
// achtergrond zelf als dat plaatje (nog) ontbreekt.
const previewFileFor = (file) => file.replace(/\.[a-z]+$/i, '.preview.png');
function previewImage(file) {
  if (!file) return null;
  const preview = previewFileFor(file);
  return fs.existsSync(path.join(__dirname, preview)) ? preview : file;
}

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
      // Thema met één stand: in beide voorbeelden die ene stand.
      const pick = (assets) => (assets && (assets[mode] || assets[theme.mode])) || null;
      preview[mode] = {
        ...(p ? {
          canvas: p.canvas.hex, surface: p.surface.hex, sidebar: p.sidebar.hex, bar: p.bar.hex,
          border: p.border.hex, text: p.fg1.hex, muted: p.fg3.hex, accent: p.accent, onAccent: p.onAccent
        } : theme.original ? ORIGINAL_PREVIEW : STANDARD_PREVIEW[mode]),
        // Alleen de stilstaande achtergrond, als klein plaatje (scripts/
        // theme-previews.js): bewegende lagen en tientallen SVG's opnieuw
        // uitrekenen bij elke licht/donker-wissel maakten de instellingen traag.
        wallpaper: previewImage(pick(theme.wallpaper))
      };
    }
    return {
      id,
      name: theme.name,
      description: theme.description || '',
      // dynamisch = er beweegt iets in de achtergrond; thema = eigen
      // lettertype/vormen; kleurenset = alleen kleuren; contrast = hoog
      // contrast (een eigen groep, geen sfeer).
      kind: theme.original ? 'standaard'
        : theme.highContrast ? 'contrast'
        : (theme.motion || theme.passer || theme.ambient ? 'dynamisch' : (hasOwnFonts(theme) || theme.radius ? 'thema' : 'kleurenset')),
      font: theme.font ? fontStack(theme) : null,
      displayFont: theme.font || theme.displayFont ? displayStack(theme) : null,
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

// Oogcomfort werkt bij het standaardthema en de afgeleide thema's; een vast
// palet heeft zijn eigen uitstraling (zie boven), en "zoals hij is"
// (original) heeft geen oogcomfort.
function supportsSoft(id) {
  const theme = THEMES[id];
  return !theme || (!theme.palettes && !theme.original);
}

// De app zonder aanpassingen (geen licht/donker, geen eigen kleuren).
// Heeft dit thema een achtergrondafbeelding? Dan maakt main.js doorzichtige
// tinten dicht (page-tweaks.js, SOLID_TINTS_SCRIPT; class sg-wallpaper).
function hasWallpaper(id) {
  const theme = THEMES[id];
  return !!(theme && theme.wallpaper);
}

function isOriginal(id) {
  const theme = THEMES[id];
  return !!(theme && theme.original);
}

// 'dark' of 'light' bij een thema met maar één stand, anders null.
function fixedMode(id) {
  const theme = THEMES[id];
  return (theme && theme.mode) || null;
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
  // Thema met één stand (mode): er is maar één palet.
  const c = theme.palettes[dark ? 'dark' : 'light'] || theme.palettes[theme.mode];
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
// Alle drie optioneel:
//   font        - het lettertype voor alles; zonder: de gewone app-letter
//   displayFont - alleen voor koppen, bv. een pixel- of schreefletter die
//                 voor lopende tekst en drukke tabellen niet goed leest
//   monoFont    - getallen en codes (in de app: .font-mono, .tabular-nums)
const familyOf = (font) => `"SG ${font.family}"`;
const stackOf = (font) => `${familyOf(font)}, ${font.fallback}`;
const fontStack = (theme) => (theme.font ? stackOf(theme.font) : APP_FONT);
const displayStack = (theme) => (theme.displayFont ? stackOf(theme.displayFont) : fontStack(theme));
const monoStack = (theme) => (theme.monoFont ? stackOf(theme.monoFont) : fontStack(theme));
const hasOwnFonts = (theme) => !!(theme.font || theme.displayFont || theme.monoFont);

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
  const fonts = [theme.font, theme.displayFont, theme.monoFont]
    .filter((font, index, all) => font && all.findIndex(other => other && other.family === font.family) === index);
  return fonts.map(font => font.faces.map(face => {
    const url = urlFor(face.file);
    return url ? `
  @font-face {
    font-family: ${familyOf(font)};
    src: url("${url}") format("woff2");
    font-weight: ${face.weight};
    font-style: normal;
    font-display: block;
  }` : '';
  }).join('')).join('');
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
  if (hasOwnFonts(theme)) {
    css += fontFaceCss(theme, fontDataUrl) + `
  ${t} {
    --font-display: ${displayStack(theme)};
    --font-body: ${fontStack(theme)};
    --font-mono: ${monoStack(theme)};
  }${theme.font ? `
  ${t} body,
  ${t} body *:not(${PAPER}, ${PAPER} *) {
    font-family: ${fontStack(theme)} !important;
  }` : ''}${theme.displayFont ? `
  ${t} body :is(h1, h2, h3, h4, h5, h6, .font-display):not(${PAPER}, ${PAPER} *) {
    font-family: ${displayStack(theme)} !important;
  }` : ''}${theme.monoFont ? `
  ${t} body :is(.font-mono, .tabular-nums, code, kbd, pre):not(${PAPER}, ${PAPER} *) {
    font-family: ${monoStack(theme)} !important;
  }` : ''}
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
// soft-mode.js en page-tweaks.js (bv. html.sg-soft, html.dark). Alle drie
// even specifiek (0,4,1); vandaar ook .dark.dark.
function variantSelector(id, variant) {
  const t = `html.sg-theme-${id}.sg-theme-${id}`;
  return {
    light: `${t}:not(.dark):not(.sg-soft)`,
    softLight: `${t}.sg-soft:not(.dark)`,
    dark: `${t}.dark.dark`
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
// Ambient: een stilstaande laag boven de achtergrond (html::before) met eigen
// animaties in de afbeelding zelf, bv. draaiende molenwieken of een
// knipperende cursor. Zelfde schaling als de achtergrond (cover). De
// afbeelding zet zelf de animaties stil bij "animaties uit".
function ambientFor(theme, mode) {
  const file = theme.ambient && theme.ambient[mode];
  return file ? wallpaperUrl(file) : null;
}

function ambientCss(sel, theme, mode) {
  if (!ambientFor(theme, mode)) return '';
  return `
  ${sel}::before {
    content: '';
    position: fixed;
    inset: 0; /* niet 100vw: dat telt de scrollbalk mee en dan schuift de laag t.o.v. de achtergrond */
    z-index: -1;
    pointer-events: none;
    background: var(--sg-ambient-${mode}) center bottom / cover no-repeat;
  }`;
}

// Iets dat af en toe voorbijkomt (passer), bv. een bootje over het water.
function passerFor(theme, mode) {
  const file = theme.passer && theme.passer[mode];
  return file ? wallpaperUrl(file) : null;
}

function wallpaperVariablesCss(id, theme) {
  const vars = [];
  for (const mode of ['light', 'dark']) {
    const wallpaper = wallpaperFor(theme, mode);
    const motion = motionFor(theme, mode);
    const passer = passerFor(theme, mode);
    const ambient = ambientFor(theme, mode);
    if (wallpaper) vars.push(`--sg-wallpaper-${mode}: url("${wallpaper}");`);
    if (motion) vars.push(`--sg-motion-${mode}: url("${motion}");`);
    if (passer) vars.push(`--sg-passer-${mode}: url("${passer}");`);
    if (ambient) vars.push(`--sg-ambient-${mode}: url("${ambient}");`);
  }
  return vars.length ? `\n  html.sg-theme-${id} { ${vars.join(' ')} }\n` : '';
}

// Bewegende laag (motion): een eigen vlak achter de inhoud dat alleen
// verschuift en van helderheid verandert. Dat doet de videokaart (transform
// en opacity), zonder de pagina steeds opnieuw te tekenen. Zo traag dat het
// niet afleidt; met "animaties uit" in Windows staat hij stil.
// Twee lagen met dezelfde afbeelding die in een ander tempo bewegen; samen
// oogt dat natuurlijker dan één laag. Per thema:
//   motionStyle: 'drift' (golvend heen en weer, bv. noorderlicht),
//                'waves' (alleen opzij, bv. golfjes op het water) of
//                'fall'  (vallen en uitdoven) of
//                'weld'  (laspunt dat langs een naad omlaag loopt, flakkerend)
//                'static' (één laag die zelf stilstaat; de afbeelding heeft
//                         eigen animaties, bv. een paar bewegende tegeltjes.
//                         Met "animaties uit" verdwijnt de laag, dan blijft de
//                         stilstaande versie in de achtergrond over)
//   motionArea:  'top' (bovenste deel), 'bottom' (onderste deel) of 'full'
//   motionSize:  'stretch' (standaard: afbeelding over het vlak) of 'cover'
//                (zelfde schaling als de achtergrond, zodat iets precies op
//                een plek in de achtergrond blijft, bv. het laspunt op de naad)
//   weldTravel:  bij 'weld': hoe ver het laspunt zakt, in eenheden van de
//                achtergrond (viewBox 1920 x 1200)
const MOTION_AREAS = {
  top: 'top: -6vh; left: -20vw; width: 140vw; height: 78vh;',
  bottom: 'top: 70vh; left: -20vw; width: 140vw; height: 36vh;',
  full: 'top: 0; left: 0; width: 100vw; height: 100vh;'
};
const MOTION_TIMING = {
  drift: ['20s ease-in-out infinite alternate', '31s ease-in-out infinite alternate'],
  waves: ['14s ease-in-out infinite alternate', '19s ease-in-out infinite alternate'],
  fall: ['2.8s linear infinite', '3.7s linear -1.4s infinite'],
  weld: ['16s linear infinite', '16s linear infinite']
};

// Laspunt langs de naad: in 20 stappen omlaag, met flakkerend licht; aan het
// begin en eind uit (dan begint de volgende las bovenaan). De afstand rekent
// met dezelfde schaal als de achtergrond (cover: de grootste van
// breedte/1920 en hoogte/1200).
function weldKeyframes(travel, flicker) {
  const scale = 'max(100vw / 1920, 100vh / 1200)';
  return Array.from({ length: 21 }, (_, i) => {
    const opacity = i === 0 || i === 20 ? 0 : flicker[i % flicker.length];
    return `${i * 5}% { transform: translate3d(0, calc(${scale} * ${(travel * i / 20).toFixed(1)}), 0); opacity: ${opacity}; }`;
  }).join('\n    ');
}
const MOTION_KEYFRAMES = {
  drift: [
    `0% { transform: translate3d(-12vw, 0, 0) scaleY(0.9); opacity: 0.5; }
    50% { transform: translate3d(0, 3vh, 0) scaleY(1.2); opacity: 1; }
    100% { transform: translate3d(12vw, -2vh, 0) scaleY(0.95); opacity: 0.65; }`,
    `0% { transform: translate3d(10vw, 2vh, 0) scale(-1, 1.1); opacity: 0.25; }
    50% { transform: translate3d(-4vw, -2vh, 0) scale(-1, 0.85); opacity: 0.6; }
    100% { transform: translate3d(-12vw, 1vh, 0) scale(-1, 1.15); opacity: 0.3; }`
  ],
  waves: [
    `0% { transform: translate3d(-10vw, 0, 0); opacity: 0.6; }
    100% { transform: translate3d(10vw, 0.6vh, 0); opacity: 0.95; }`,
    `0% { transform: translate3d(8vw, 1vh, 0) scale(-1, 1); opacity: 0.35; }
    100% { transform: translate3d(-8vw, 0.4vh, 0) scale(-1, 1); opacity: 0.6; }`
  ],
  fall: [
    `0% { transform: translate3d(0, -4vh, 0); opacity: 0; }
    15% { opacity: 1; }
    70% { opacity: 0.9; }
    100% { transform: translate3d(0, 8vh, 0); opacity: 0; }`,
    `0% { transform: translate3d(-1vw, -2vh, 0) scale(1.08); opacity: 0; }
    20% { opacity: 0.8; }
    100% { transform: translate3d(1vw, 10vh, 0) scale(1.08); opacity: 0; }`
  ]
};

function motionCss(id, theme, sel, p) {
  const mode = p.dark ? 'dark' : 'light';
  if (!motionFor(theme, mode)) return '';
  const area = MOTION_AREAS[theme.motionArea] || MOTION_AREAS.top;
  const size = theme.motionSize === 'cover' ? 'center bottom / cover' : 'center / 100% 100%';
  const [timingA, timingB] = MOTION_TIMING[theme.motionStyle] || MOTION_TIMING.drift;
  return `
  ${sel} body::before,
  ${sel} body::after {
    content: '';
    position: fixed;
    ${area}
    z-index: -1;
    pointer-events: none;
    background: var(--sg-motion-${mode}) ${size} no-repeat;
    will-change: transform, opacity;
  }
  ${sel} body::before {
    animation: sg-motion-${id}-a ${timingA};
  }
  ${sel} body::after {
    animation: sg-motion-${id}-b ${timingB};
  }`.replace(theme.motionStyle === 'static' ? /animation: sg-motion-[^;]+;/g : /$^/, 'animation: none;')
    + (theme.motionStyle === 'static' ? `
  ${sel} body::after { display: none; }` : '')
    + passerCss(id, theme, sel, mode);
}

// Passer: de tweede laag (::after) wordt iets dat af en toe rustig door het
// beeld trekt (theme.passer, met passerDuration). Zelfde schaling als de
// achtergrond, zodat het precies op bv. de waterlijn blijft; het beeld
// begint links buiten beeld. Ongeveer 60% van de tijd onderweg, daarna even
// niets.
function passerCss(id, theme, sel, mode) {
  if (!passerFor(theme, mode)) return '';
  const duration = theme.passerDuration || 150;
  return `
  ${sel} body::after {
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: var(--sg-passer-${mode}) center bottom / cover no-repeat;
    opacity: 1;
    animation: sg-motion-${id}-pass ${duration}s linear -${Math.round(duration * 0.15)}s infinite;
  }`;
}

function motionKeyframesCss(id, theme) {
  if (!theme.motion) return '';
  if (theme.motionStyle === 'static') {
    return `
  @media (prefers-reduced-motion: reduce) {
    html.sg-theme-${id} body::before { display: none; }
  }
`;
  }
  const [framesA, framesB] = theme.motionStyle === 'weld'
    ? [weldKeyframes(theme.weldTravel || 800, [0.75, 1, 0.6, 0.95, 0.8, 1, 0.65, 0.9]),
       weldKeyframes(theme.weldTravel || 800, [0.4, 0.15, 0.5, 0.25, 0.45, 0.1, 0.5, 0.3])]
    : (MOTION_KEYFRAMES[theme.motionStyle] || MOTION_KEYFRAMES.drift);
  return `
  @keyframes sg-motion-${id}-a {
    ${framesA}
  }
  @keyframes sg-motion-${id}-b {
    ${framesB}
  }
  @media (prefers-reduced-motion: reduce) {
    html.sg-theme-${id} body::before,
    html.sg-theme-${id} body::after { animation: none; }
  }
` + (theme.passer ? `
  @keyframes sg-motion-${id}-pass {
    0% { transform: translate3d(-25vw, 0, 0); }
    15% { transform: translate3d(8vw, -0.25vh, 0); }
    30% { transform: translate3d(41vw, 0, 0); }
    45% { transform: translate3d(74vw, -0.25vh, 0); }
    60% { transform: translate3d(108vw, 0, 0); }
    100% { transform: translate3d(108vw, 0, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    html.sg-theme-${id} body::after { display: none; }
  }
` : '');
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
  ${ambientCss(sel, theme, p.dark ? 'dark' : 'light')}
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
  ${highContrastCss(sel, theme, p)}
`;
}

// Hoog contrast (theme.highContrast): de app zelf zet op veel plekken
// zachtgrijze tekst en lichte statuskleuren (Tailwind-classes, --ok e.d.).
// Die gaan hier naar de themakleuren; papier blijft het echte document.
const HC_STATUS_CLASSES = { stop: ['red', 'rose'], warn: ['amber', 'yellow'], ok: ['green', 'emerald'] };
const HC_GREY_CLASSES = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
function highContrastCss(sel, theme, p) {
  if (!theme.highContrast) return '';
  const status = theme.status[p.dark ? 'dark' : 'light'];
  const notPaper = `:not(${PAPER} *)`;
  const textClasses = (names, shades) => names.flatMap(name => shades.map(shade => `.text-${name}-${shade}`)).join(', ');
  const statusText = Object.entries(HC_STATUS_CLASSES).map(([role, names]) =>
    `${sel} :is(${textClasses(names, [400, 500, 600, 700, 800, 900])})${notPaper} { color: ${status[role]}; }`).join('\n  ');
  return `${sel} { --stop: ${status.stop}; --warn: ${status.warn}; --ok: ${status.ok}; }
  ${statusText}
  ${sel} :is(${textClasses(HC_GREY_CLASSES, [300, 400, 500, 600])}, .text-muted-foreground)${notPaper} { color: ${p.fg3.hex}; }
  ${sel} ::placeholder { color: ${p.fg4.hex}; opacity: 1; }
  ${sel} :focus-visible { outline: 3px solid ${p.accent} !important; outline-offset: 2px; }`;
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
// wint van de oogcomfort-regels daar (0,2,1). In donker staat theme-soft er
// soms ook op (de instelling zelf), maar oogcomfort doet dan niets.

function chromeVariantCss(theme, variant) {
  const p = palette(theme, variant);
  const ink = p.fg1.hex;
  const sel = {
    light: 'html.chrome-theme.theme-light:not(.theme-soft)',
    softLight: 'html.chrome-theme.theme-light.theme-soft',
    dark: 'html.chrome-theme.chrome-theme:not(.theme-light)'
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
    --border: ${p.dark && !theme.highContrast ? rgba('#ffffff', 0.1) : p.border.hex};
    --border-strong: ${p.dark && !theme.highContrast ? rgba('#ffffff', 0.2) : p.borderStrong.hex};
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
  if (hasOwnFonts(theme)) {
    css += fontFaceCss(theme, file => file) + (theme.font ? `
  html.chrome-theme body,
  html.chrome-theme button,
  html.chrome-theme input,
  html.chrome-theme select,
  html.chrome-theme textarea {
    font-family: ${fontStack(theme)} !important;
  }` : '') + (theme.displayFont ? `
  html.chrome-theme :is(h1, h2, h3, h4) {
    font-family: ${displayStack(theme)} !important;
  }` : '') + '\n';
  }
  if (theme.radius) css += `\n  html.chrome-theme { --radius: ${theme.radius}; }\n`;
  if (theme.highContrast) css += `\n  html.chrome-theme :focus-visible { outline: 3px solid var(--accent) !important; outline-offset: 2px; }\n`;
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
      dark: 'html.themed.themed:not(.light)'
    }[variant];
    return `${sel} { --bg: ${p.surface.hex}; --border: ${p.dark && !theme.highContrast ? rgba('#ffffff', 0.1) : p.border.hex}; --text: ${p.fg1.hex}; --text-2: ${p.fg2.hex}; --muted: ${p.fg3.hex}; --accent: ${p.accent}; }`;
  }).join('\n') + (hasOwnFonts(theme)
    ? fontFaceCss(theme, fontDataUrl)
      + (theme.font ? `\n  html.themed body { font-family: ${fontStack(theme)} !important; }` : '')
      + (theme.displayFont ? `\n  html.themed h1 { font-family: ${displayStack(theme)} !important; }` : '')
    : '');
}

module.exports = {
  THEMES,
  DEFAULT_THEME,
  THEME_CLASSES,
  isTheme,
  isOriginal,
  fixedMode,
  hasWallpaper,
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
