// Maakt de kleine voorbeeldplaatjes van de thema-achtergronden voor
// Instellingen > Thema's (naast elke achtergrond: <naam>.preview.png).
// Een PNG van 480 x 300 is bijna gratis om te tonen; de SVG's zelf (soms
// honderden lijntjes) opnieuw uitrekenen bij elke licht/donker-wissel liet de
// app haperen. Opnieuw draaien na het aanpassen van een achtergrond:
//   npm run previews
// scripts/check-themes.js controleert dat de plaatjes er zijn en bij zijn.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const themes = require('../themes');

const ROOT = path.join(__dirname, '..');
const WIDTH = 480;
const HEIGHT = 300;

const previewFile = (file) => file.replace(/\.[a-z]+$/i, '.preview.png');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: WIDTH, height: HEIGHT, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  const files = [...new Set(Object.values(themes.THEMES).flatMap(theme => Object.values(theme.wallpaper || {})))];
  for (const file of files) {
    const url = 'file:///' + path.join(ROOT, file).split(path.sep).join('/');
    // Zelfde uitsnede als in de app: onderkant, schermvullend (cover).
    const html = `<body style="margin:0;width:${WIDTH}px;height:${HEIGHT}px;background:url('${url}') center bottom / cover no-repeat"></body>`;
    const page = path.join(require('os').tmpdir(), 'sg-theme-preview.html');
    fs.writeFileSync(page, html);
    await win.loadFile(page);
    await new Promise(resolve => setTimeout(resolve, 400));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ROOT, previewFile(file)), image.toPNG());
    console.log('voorbeeld:', previewFile(file));
  }
  app.quit();
});
