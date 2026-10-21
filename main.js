const { app, BrowserWindow, WebContentsView, ipcMain, Menu, clipboard, shell, screen, session, systemPreferences, nativeTheme, Notification, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { DARK_MODE_BACKGROUND, DARK_MODE_CSS } = require('./dark-mode');
const { PAGE_TWEAKS_CSS, SOLID_TINTS_SCRIPT } = require('./page-tweaks');
const { SOFT_MODE_BACKGROUND, SOFT_MODE_CSS } = require('./soft-mode');
const themes = require('./themes');
const { START_URL, APP_HOSTNAME, isInternalUrl, isAuthUrl, compareVersions, criticalUpdateFrom, pageKind } = require('./rules');
const { createTelemetry, loadConfig } = require('./telemetry');
const { createRapportServer } = require('./rapport/server');
const crypto = require('crypto');
const os = require('os');

// Zonder deze lock start elke nieuwe poging een los proces dat om dezelfde
// cache- en instellingenbestanden in userData vecht met de al draaiende app
// (vandaar de "Access is denied"/quota-database-fouten bij dubbel opstarten).
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Windows toont meldingen alleen voor een app met een app-ID. Geïnstalleerd
// is dat de appId uit package.json (die zet de installer op de snelkoppeling);
// bij npm start de electron.exe zelf.
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'com.singeling.app' : process.execPath);

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

const TABBAR_HEIGHT = 38;
const UPDATE_BANNER_HEIGHT = 40;
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

let mainWindow;
let tabs = new Map();      // tabId -> WebContentsView
let parentTabs = new Map(); // tabId -> tab waaruit deze tab is geopend
let previousTabs = new Map(); // tabId -> laatst actieve tab vóór deze tab
let lockedTabs = new Set();
const detachedWindows = new Map(); // tabId -> { window, view } - losgetrokken tabs in hun eigen venster
let activeTabId = null;
let tabCounter = 0;
const internalNavigations = new Set();
let onboardingActive = false;
let settingsPanelOpen = false;
let tabOverviewOpen = false;
let changelogNoticeOpen = false;
let updateBannerOpen = false;
let updateAvailableInfo = null;
let dailyUpdateCheckScheduled = false;
// Elk uur stil op de achtergrond kijken (was: elke dag), zodat een kritieke
// update ook midden op de dag snel binnenkomt.
const DAILY_UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;
// Gevonden update (zie "Updatemelding"):
// { version, critical, reason, beta, downloading, downloaded, percent, error }
let pendingUpdate = null;
let updateNoticeOpen = false;
let updateReminderTimer = null;
let updatePostponedVersion = null; // gewone update: "Later" -> pas bij de volgende start weer
const CRITICAL_REMINDER_MS = 60 * 60 * 1000;

// Draait er een bètaversie (bv. 1.3.0-beta.1)? Dan staan bèta-updates
// standaard aan, zodat iemand die een bèta installeert ook de volgende krijgt.
const RUNNING_PRERELEASE = app.getVersion().includes('-');

// Instellingen > Debug: bij npm start en in elke bètaversie, nooit in een
// gewone versie.
const DEBUG_AVAILABLE = !app.isPackaged || RUNNING_PRERELEASE;
const DEBUG_PORT = 9222;

// Instellingen worden per Windows-gebruiker opgeslagen (userData-map), zodat
// iedereen zijn eigen zoomniveau en starttabs heeft.
let appSettings = {
  zoomFactor: DEFAULT_ZOOM,
  zoomResetDone: true, // zie ZOOM_RESET in loadSettings
  startTabs: [], // [{ url, locked }]
  tabGroups: [], // [{ id, name, urls: [] }]
  lastSeenChangelogVersion: null,
  seenWhatsNewTours: [], // ids van "Nieuw in deze versie"-rondleidingen die al getoond zijn
  openAllLinksInNewTab: false,
  tabBarDisabled: false, // tabbalk uit: één scherm, balk toont alleen het instellingen-icoon
  showOnboarding: true,
  blockCtrlB: false,
  windowsNotifications: true, // Windows-melding bij een nieuwe melding bij het belletje
  telemetry: true, // anonieme gebruiksgegevens delen (alleen als telemetry.config.json er is)
  // Beheer (Instellingen > Debug): wachtwoord alleen als scrypt-hash, blijft
  // ingelogd tot je vergrendelt; rapport-server eventueel mee laten starten.
  adminPasswordHash: '',
  adminUnlocked: false,
  rapportSeenAt: 0, // wanneer je het tabblad Meldingen voor het laatst opende (ms); alles daarna is nieuw
  adminLockOnRestart: false, // Beheer vergrendelen bij elke start van de app
  rapportServerAutostart: false,
  debugUnlocked: false, // Debug zichtbaar gemaakt met Ctrl+Shift+Alt+D (gewone versie)
  notClockedMode: 'aan', // melding "Niet geklokt op een order": 'aan' (oranje balk), 'subtiel' of 'uit'
  preferencesChosen: false, // keuzescherm (thema + klokmelding) al gezien
  setupVersion: 0, // versie van de instelassistent die al doorlopen is (SETUP_VERSION in index.html)
  darkMode: false,
  softColors: true, // oogcomfort: zachtere kleuren (alleen in licht: zachtgrijs; soft-mode.js). Standaard aan.
  betaUpdates: RUNNING_PRERELEASE, // ook bètaversies (GitHub pre-releases) als update aanbieden
  appTheme: themes.DEFAULT_THEME, // kleurenthema (themes.js); voorlopig alleen met bèta-updates aan
  // Licht/donker automatisch (zie "Licht/donker automatisch"):
  // 'handmatig' | 'systeem' | 'tijden' | 'zon'
  themeMode: 'zon', // standaard: zon op/onder (sinds 1.3.0; zie SUN_DEFAULT in loadSettings)
  sunDefaultDone: true,
  themeTimes: { dark: '18:00', light: '07:00' }, // bij 'tijden'
  // bij 'zon': minuten later (+) of eerder (-) dan zon op (licht) en zon onder (donker)
  themeSunOffset: { light: 0, dark: 0 },
  debugPort: false // Instellingen > Debug: versie waarvoor de Chrome-debugpoort (DEBUG_PORT) open staat
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

// De debugpoort moet vóór app-ready aan staan, dus hier al los uit het
// instellingenbestand lezen (loadSettings draait pas in whenReady).
try {
  if (DEBUG_AVAILABLE && JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')).debugPort === app.getVersion()) {
    app.commandLine.appendSwitch('remote-debugging-port', String(DEBUG_PORT));
  }
} catch {
  // Nog geen instellingenbestand: poort blijft dicht.
}

const NOT_CLOCKED_MODES = ['aan', 'subtiel', 'uit'];

// Tot en met 1.2.0 was dit een aan/uit-instelling (showNotClockedBar): uit =
// verborgen, aan = subtiel. Wie dat al had, houdt precies hetzelfde; zonder
// die oude instelling (nieuw, of van vóór 1.2.0) de gewone oranje balk.
function notClockedModeFrom(parsed) {
  if (NOT_CLOCKED_MODES.includes(parsed.notClockedMode)) return parsed.notClockedMode;
  if (typeof parsed.showNotClockedBar === 'boolean') return parsed.showNotClockedBar ? 'subtiel' : 'uit';
  return 'aan';
}

const THEME_MODES = ['handmatig', 'systeem', 'tijden', 'zon'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function validThemeTimes(times) {
  const dark = times && TIME_PATTERN.test(times.dark) ? times.dark : '18:00';
  const light = times && TIME_PATTERN.test(times.light) ? times.light : '07:00';
  return { dark, light };
}

function validSunOffset(offset) {
  return Number.isFinite(offset) ? Math.max(-120, Math.min(120, Math.round(offset))) : 0;
}

// Tot en met 1.3.0-beta.1 was er één verschuiving voor zon op én zon onder (een
// getal). Wie dat al had, houdt die verschuiving voor allebei.
function validSunOffsets(offsets) {
  if (typeof offsets === 'number') {
    const offset = validSunOffset(offsets);
    return { light: offset, dark: offset };
  }
  return {
    light: validSunOffset(Number(offsets && offsets.light)),
    dark: validSunOffset(Number(offsets && offsets.dark))
  };
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    // Eenmalig: na deze update begint iedereen weer op 100%. Daarna wordt
    // ieders eigen zoomniveau weer gewoon onthouden (zoomResetDone).
    const zoomResetDone = parsed.zoomResetDone === true;
    appSettings = {
      zoomFactor: zoomResetDone && typeof parsed.zoomFactor === 'number' ? parsed.zoomFactor : DEFAULT_ZOOM,
      zoomResetDone: true,
      // Alleen geldige app-adressen: een kapotte regel of bv. about:blank als
      // starttab gaf anders een crash of een lege app bij de start.
      startTabs: Array.isArray(parsed.startTabs)
        ? parsed.startTabs.filter(tab => tab && typeof tab.url === 'string' && isInternalUrl(tab.url))
        : [],
      tabGroups: Array.isArray(parsed.tabGroups)
        ? parsed.tabGroups
          .filter(group => group && Array.isArray(group.urls))
          .map(group => ({ ...group, urls: group.urls.filter(url => typeof url === 'string' && isInternalUrl(url)) }))
        : [],
      lastSeenChangelogVersion: typeof parsed.lastSeenChangelogVersion === 'string' ? parsed.lastSeenChangelogVersion : null,
      seenWhatsNewTours: Array.isArray(parsed.seenWhatsNewTours) ? parsed.seenWhatsNewTours : [],
      openAllLinksInNewTab: typeof parsed.openAllLinksInNewTab === 'boolean' ? parsed.openAllLinksInNewTab : false,
      tabBarDisabled: typeof parsed.tabBarDisabled === 'boolean' ? parsed.tabBarDisabled : false,
      showOnboarding: typeof parsed.showOnboarding === 'boolean' ? parsed.showOnboarding : true,
      blockCtrlB: typeof parsed.blockCtrlB === 'boolean' ? parsed.blockCtrlB : false,
      windowsNotifications: typeof parsed.windowsNotifications === 'boolean' ? parsed.windowsNotifications : true,
      telemetry: typeof parsed.telemetry === 'boolean' ? parsed.telemetry : true,
      adminPasswordHash: typeof parsed.adminPasswordHash === 'string' ? parsed.adminPasswordHash : '',
      adminLockOnRestart: parsed.adminLockOnRestart === true,
      rapportSeenAt: Number.isFinite(parsed.rapportSeenAt) ? parsed.rapportSeenAt : 0,
      adminUnlocked: parsed.adminUnlocked === true && parsed.adminLockOnRestart !== true,
      rapportServerAutostart: parsed.rapportServerAutostart === true,
      debugUnlocked: parsed.debugUnlocked === true,
      notClockedMode: notClockedModeFrom(parsed),
      preferencesChosen: typeof parsed.preferencesChosen === 'boolean' ? parsed.preferencesChosen : false,
      setupVersion: Number.isInteger(parsed.setupVersion) ? parsed.setupVersion : 0,
      darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : false,
      softColors: typeof parsed.softColors === 'boolean' ? parsed.softColors : true,
      betaUpdates: typeof parsed.betaUpdates === 'boolean' ? parsed.betaUpdates : RUNNING_PRERELEASE,
      appTheme: themes.isTheme(parsed.appTheme) ? parsed.appTheme : themes.DEFAULT_THEME,
      // Eenmalig (1.3.0): wie nog op de oude standaard "handmatig" stond, gaat
      // naar zon op/onder. Wie bewust systeem of vaste tijden koos, houdt dat;
      // daarna blijft ieders eigen keuze gewoon bewaard (sunDefaultDone).
      themeMode: (parsed.sunDefaultDone !== true && (parsed.themeMode === 'handmatig' || parsed.themeMode === undefined))
        ? 'zon'
        : (THEME_MODES.includes(parsed.themeMode) ? parsed.themeMode : 'zon'),
      sunDefaultDone: true,
      themeTimes: validThemeTimes(parsed.themeTimes),
      themeSunOffset: validSunOffsets(parsed.themeSunOffset),
      // Versie waarvoor de poort aan staat: na een update gaat hij vanzelf dicht.
      debugPort: parsed.debugPort === app.getVersion() ? parsed.debugPort : false
    };
    if (!zoomResetDone) saveSettings();
  } catch {
    // Nog geen instellingenbestand of het is ongeldig; standaardwaarden blijven staan.
  }
}

// Eerst naar een tijdelijk bestand en dan hernoemen: valt de stroom uit
// tijdens het schrijven, dan blijft het oude settings.json heel.
function saveSettings() {
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(`${settingsPath}.tmp`, JSON.stringify(appSettings, null, 2));
    fs.renameSync(`${settingsPath}.tmp`, settingsPath);
  } catch (error) {
    console.error('Instellingen opslaan mislukt:', error.message);
  }
}

function clampZoom(factor) {
  // Afronden op hele procenten: anders loopt 1 + 0.1 + 0.1 op tot 1.2000000000000002.
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor)) * 100) / 100;
}

function setZoomFactor(factor) {
  appSettings.zoomFactor = clampZoom(factor);
  for (const view of tabs.values()) {
    view.webContents.zoomFactor = appSettings.zoomFactor;
  }
  for (const { view } of detachedWindows.values()) {
    view.webContents.zoomFactor = appSettings.zoomFactor;
  }
  saveSettings();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('zoom-changed', appSettings.zoomFactor);
  }
}

function adjustZoom(direction) {
  const delta = direction === 'in' ? ZOOM_STEP : -ZOOM_STEP;
  setZoomFactor(appSettings.zoomFactor + delta);
}

// Alles wat een webpagina in een tab "extern" wil openen gaat hierlangs.
// shell.openExternal() geeft de URL rechtstreeks aan Windows, dus zonder
// deze check kan een pagina ook file://, ms-msdt:, search-ms: e.d. openen
// en daarmee programma's op de pc laten starten. Alleen gewone web- en
// mail-/bellinks gaan door naar de standaardapp.
const SAFE_EXTERNAL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

function openExternalSafe(url) {
  try {
    if (SAFE_EXTERNAL_PROTOCOLS.includes(new URL(url).protocol)) shell.openExternal(url);
  } catch {
    // Ongeldige URL: niets openen.
  }
}

// Tabbalk en balk van een los venster: nooit wegnavigeren of pop-ups openen.
// Anders vervangt bv. een op de balk gesleept bestand de hele balk, en krijgt
// dat bestand de preload (electronAPI) erbij.
function stayOnOwnPage(webContents) {
  webContents.on('will-navigate', (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function isRefreshShortcut(input) {
  return input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r');
}

// CHANGELOG.md staat met de nieuwste versie bovenaan. Om niet afhankelijk te
// zijn van die volgorde kiezen we de sectie met het hoogste versienummer
// ("## [x.y.z] - datum").
function getLatestChangelogEntry() {
  try {
    const content = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf-8').replace(/\r\n/g, '\n');
    const sections = content.split(/\n(?=## )/).filter(section => section.startsWith('## '));
    if (sections.length === 0) return content.trim();
    // Ook bètaversies (## [1.3.0-beta.1]). Bij dezelfde x.y.z is de gewone
    // versie nieuwer dan de bèta's ervan; bèta's onderling op nummer.
    const versionOf = (section) => {
      const match = section.match(/^## \[(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?\]/);
      return match
        ? { parts: match.slice(1, 4).map(Number), pre: match[4] || null }
        : { parts: [-1, -1, -1], pre: null };
    };
    const compare = (a, b) => {
      for (let i = 0; i < 3; i++) {
        if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
      }
      if (a.pre === b.pre) return 0;
      if (a.pre === null) return 1;
      if (b.pre === null) return -1;
      return a.pre.localeCompare(b.pre, undefined, { numeric: true });
    };
    const newest = sections.reduce((best, section) => (
      compare(versionOf(section), versionOf(best)) > 0 ? section : best
    ));
    return newest.trim();
  } catch (error) {
    return `Changelog kon niet worden geladen: ${error.message}`;
  }
}

// Na een update: index.html beslist wat er getoond wordt - een
// "Nieuw in deze versie"-rondleiding als die er is en nog niet gezien is,
// anders de laatste changelog-entry. Bij een gloednieuwe installatie
// (previousVersion === null) niets: dan loopt de volledige rondleiding al.
function maybeShowChangelogNotice() {
  const currentVersion = app.getVersion();
  const previousVersion = appSettings.lastSeenChangelogVersion;
  appSettings.lastSeenChangelogVersion = currentVersion;
  saveSettings();

  if (previousVersion === currentVersion) return;
  mainWindow.webContents.send('whats-new', {
    isNewInstall: previousVersion === null,
    changelog: getLatestChangelogEntry(),
    seenTours: appSettings.seenWhatsNewTours,
    preferencesChosen: appSettings.preferencesChosen,
    setupVersion: appSettings.setupVersion
  });
}

function openStartTabs() {
  const configured = appSettings.startTabs.length > 0
    ? appSettings.startTabs
    : [{ url: START_URL, locked: true }];
  // Tabbalk uit (één scherm): alleen de eerste starttab.
  const toOpen = appSettings.tabBarDisabled ? configured.slice(0, 1) : configured;
  toOpen.forEach((tab, index) => createTab(tab.url, index === 0, !!tab.locked && !appSettings.tabBarDisabled));
}

function logUpdater(message, error) {
  const details = error ? `${message}: ${error.stack || error.message || error}` : message;
  const logLine = `[${new Date().toISOString()}] ${details}\n`;
  console.log(`[Updater] ${details}`);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), logLine);
  } catch {
    // Logging must never prevent the app from starting.
  }
}

// Bèta-updates: een bèta is een GitHub-release met "Set as a pre-release" en
// een versie als 1.3.0-beta.1. Zonder deze instelling vraagt de updater
// GitHub om de "laatste release", en daar slaat GitHub pre-releases altijd
// over. Mét de instelling telt de nieuwste release, bèta of niet.
// Nooit terug naar een oudere versie: wie de instelling uitzet terwijl hij op
// een bèta zit, blijft daarop tot de volgende gewone versie (die is nieuwer).
function applyUpdateChannel() {
  autoUpdater.allowPrerelease = !!appSettings.betaUpdates;
  autoUpdater.allowDowngrade = false;
}

// ---------- Kritieke updates ----------
//
// Een update is kritiek als de beschrijving van de GitHub-release de regel
// "Kritieke update" bevat (de updater haalt die tekst bij elke controle op;
// achteraf aanpassen kan dus ook). Daarbij optioneel:
//   - "minimale versie: 1.2.1": kritiek voor iedereen onder die versie. Zet
//     die regel ook in latere releases, anders mist wie de kritieke update
//     overslaat hem (de updater ziet alleen de nieuwste release).
//     Zonder deze regel: kritiek voor iedereen onder de nieuwe versie.
//   - "Reden: ...": korte uitleg in de melding.
// Zie "Updatemelding" hieronder voor wat de gebruiker dan ziet.
// De regels zelf staan in rules.js (getest in scripts/test-rules.js).

// ---------- Updatemelding ----------
//
// Elke gevonden update (bij opstarten en bij de controle van elk uur) komt als
// melding in beeld (index.html, #update-notice), in twee standen:
//   - gewoon: "Nu updaten" / "Later". Later = pas bij de volgende start weer
//     (het bolletje bij de instellingen blijft staan).
//   - kritiek (zie criticalUpdateFrom): direct downloaden, zwaardere melding,
//     "Later" = over een uur weer. De app blijft wel bruikbaar: misschien is
//     iemand net met iets belangrijks bezig.
// Bij afsluiten wordt een al gedownloade update altijd geïnstalleerd.
function sendUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed() && pendingUpdate) {
    mainWindow.webContents.send('update-notice-state', pendingUpdate);
  }
}

function showUpdateNotice() {
  if (!pendingUpdate || !mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(updateReminderTimer);
  updateReminderTimer = null;
  updateNoticeOpen = true;
  applyActiveTabBounds();
  mainWindow.webContents.send('update-notice-show', pendingUpdate);
}

function hideUpdateNotice() {
  updateNoticeOpen = false;
  applyActiveTabBounds();
}

// Testmodus, alleen bij npm start (nooit in de geïnstalleerde app): de
// updatemelding nabootsen om hem te bekijken, zonder echte download/herstart.
//   npm start -- --test-update=gewoon   of   npm start -- --test-update=kritiek
const TEST_UPDATE_MODE = app.isPackaged
  ? null
  : ((process.argv.find(arg => arg.startsWith('--test-update=')) || '').split('=')[1] || null);

function startTestUpdate() {
  if (!TEST_UPDATE_MODE) return;
  const critical = TEST_UPDATE_MODE === 'kritiek';
  logUpdater(`TEST: ${critical ? 'kritieke' : 'gewone'} update nagebootst`);
  handleUpdateAvailable({
    version: '9.9.9',
    releaseName: 'v9.9.9',
    releaseNotes: critical
      ? '<p><strong>Kritieke update</strong></p><p>Reden: dit is een test van de melding</p>'
      : '<p>Testupdate</p>'
  });
}

function fakeTestDownload() {
  const timer = setInterval(() => {
    if (!pendingUpdate) return clearInterval(timer);
    pendingUpdate.percent = Math.min(100, pendingUpdate.percent + 9);
    if (pendingUpdate.percent >= 100) {
      clearInterval(timer);
      pendingUpdate.downloading = false;
      pendingUpdate.downloaded = true;
    }
    sendUpdateState();
  }, 250);
}

function downloadPendingUpdate() {
  if (!pendingUpdate || pendingUpdate.downloading || pendingUpdate.downloaded) return;
  pendingUpdate.downloading = true;
  pendingUpdate.error = null;
  sendUpdateState();
  if (TEST_UPDATE_MODE) {
    fakeTestDownload();
    return;
  }
  logUpdater(`Download gestart voor ${pendingUpdate.version}${pendingUpdate.critical ? ' (kritiek)' : ''}`);
  autoUpdater.downloadUpdate().catch((error) => {
    if (!pendingUpdate) return;
    pendingUpdate.downloading = false;
    pendingUpdate.error = error.message;
    sendUpdateState();
  });
}

function handleUpdateAvailable(updateInfo) {
  const critical = criticalUpdateFrom(updateInfo, app.getVersion());
  if (!pendingUpdate || pendingUpdate.version !== updateInfo.version) {
    clearTimeout(updateReminderTimer);
    updateReminderTimer = null;
    pendingUpdate = {
      version: updateInfo.version,
      critical: false,
      reason: '',
      beta: String(updateInfo.version).includes('-'),
      downloading: false,
      downloaded: false,
      percent: 0,
      error: null
    };
  }
  // Kan achteraf veranderen: de release-tekst wordt bij elke controle gelezen.
  pendingUpdate.critical = !!critical;
  pendingUpdate.reason = critical ? critical.reason : '';

  if (pendingUpdate.critical) {
    logUpdater(`Kritieke update: ${pendingUpdate.version}${pendingUpdate.reason ? ` (${pendingUpdate.reason})` : ''}`);
    downloadPendingUpdate();
    if (!updateNoticeOpen && !updateReminderTimer) showUpdateNotice();
    else sendUpdateState();
    return;
  }
  if (updatePostponedVersion === pendingUpdate.version) return; // "Later" gekozen
  if (updateNoticeOpen) sendUpdateState();
  else showUpdateNotice();
}

// Tijdens het installeren is de app helemaal dicht (anders kan de installer
// de bestanden niet vervangen), dus ook het laadscherm. Zonder iets in beeld
// lijkt het alsof de app kapot is. Daarom een los venstertje
// (update-window.ps1, via Windows' eigen PowerShell) dat blijft staan tot de
// nieuwe versie zichtbaar is opgestart. Het script en het logo gaan eerst naar
// een tijdelijke map: de app-bestanden worden tijdens de installatie vervangen
// (en zitten in app.asar, waar PowerShell niet bij kan).
// Gestart via wscript: een direct (detached) gestarte PowerShell stopt meteen
// zonder console, en een niet-detached proces sluit Windows mee af met de
// app. wscript start PowerShell verborgen en los van de app.
// Resolvet zodra het venstertje in beeld is (of na een paar seconden toch).
// Mappen van showUpdatingWindow van eerdere updates opruimen (het script zelf
// kan dat niet: het logo staat nog open zolang het venster er is). Alleen
// mappen ouder dan een uur, zodat een lopende update niets kwijtraakt.
function removeOldUpdateFolders() {
  const tmp = require('os').tmpdir();
  try {
    for (const name of fs.readdirSync(tmp)) {
      if (!name.startsWith('singeling-update-')) continue;
      const dir = path.join(tmp, name);
      if (Date.now() - fs.statSync(dir).mtimeMs > 60 * 60 * 1000) fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Opruimen is nooit belangrijk genoeg om de start te hinderen.
  }
}

function showUpdatingWindow(version, { maxSeconds = 180, processName = 'Singeling App' } = {}) {
  return new Promise((resolve) => {
    try {
      const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'singeling-update-'));
      const scriptPath = path.join(dir, 'update-window.ps1');
      const logoPath = path.join(dir, 'logo.png');
      const marker = path.join(dir, 'shown');
      const launcherPath = path.join(dir, 'start.vbs');
      fs.writeFileSync(scriptPath, fs.readFileSync(path.join(__dirname, 'update-window.ps1')));
      const logoFile = darkActive() ? 'assets/singeling-logo.png' : 'assets/singeling-logo-licht.png';
      fs.writeFileSync(logoPath, fs.readFileSync(path.join(__dirname, logoFile)));
      // In VBScript is "" een aanhalingsteken binnen een string.
      const quoted = (value) => `""${String(value).replace(/"/g, '')}""`;
      const args = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', quoted(scriptPath),
        '-OldPid', String(process.pid),
        '-Version', quoted(version || ''),
        '-Dark', darkActive() ? '1' : '0',
        '-LogoPath', quoted(logoPath),
        '-Marker', quoted(marker),
        '-MaxSeconds', String(maxSeconds),
        '-ProcessName', quoted(processName)
      ];
      fs.writeFileSync(launcherPath, `CreateObject("WScript.Shell").Run "powershell.exe ${args.join(' ')}", 0, False\r\n`);
      const child = require('child_process').spawn('wscript.exe', ['//nologo', '//B', launcherPath], {
        detached: true, stdio: 'ignore', windowsHide: true
      });
      child.on('error', () => resolve(false));
      child.unref();
      const started = Date.now();
      const poll = setInterval(() => {
        if (fs.existsSync(marker) || Date.now() - started > 5000) {
          clearInterval(poll);
          resolve(fs.existsSync(marker));
        }
      }, 100);
    } catch (error) {
      logUpdater('Venstertje tijdens updaten kon niet starten', error);
      resolve(false);
    }
  });
}

// Hoofdknop: "Nu updaten" (download starten), "Opnieuw proberen" of, als hij
// klaar is, installeren en herstarten.
let installingUpdate = false;

ipcMain.on('update-notice-install', async (event) => {
  if (event.sender !== mainWindow.webContents || !pendingUpdate) return;
  if (pendingUpdate.downloaded) {
    if (installingUpdate) return;
    installingUpdate = true;
    if (TEST_UPDATE_MODE) {
      // Test: het venstertje 8 seconden laten zien, niet echt herstarten.
      logUpdater('TEST: zou nu installeren en herstarten');
      await showUpdatingWindow(pendingUpdate.version, { maxSeconds: 8, processName: 'bestaat-niet' });
      hideUpdateNotice();
      mainWindow.webContents.send('update-notice-hide');
      pendingUpdate = null;
      installingUpdate = false;
      return;
    }
    logUpdater('Installeren bevestigd, app wordt opnieuw gestart');
    await showUpdatingWindow(pendingUpdate.version);
    // Stil installeren (geen installatievensters, de installer krijgt /S) en
    // daarna vanzelf weer opstarten. Zonder deze opties toont de updater de
    // begeleide installer (oneClick: false) met "Volgende/Installeren".
    // Kan zonder beheerdersrechten: de app staat per gebruiker (perMachine: false).
    autoUpdater.quitAndInstall(true, true);
  } else {
    downloadPendingUpdate();
  }
});

ipcMain.on('update-notice-later', (event) => {
  if (event.sender !== mainWindow.webContents || !pendingUpdate) return;
  hideUpdateNotice();
  if (pendingUpdate.critical) {
    logUpdater('Kritieke update: herinnering over 1 uur');
    clearTimeout(updateReminderTimer);
    updateReminderTimer = setTimeout(() => {
      updateReminderTimer = null;
      showUpdateNotice();
    }, CRITICAL_REMINDER_MS);
  } else {
    logUpdater(`Update ${pendingUpdate.version}: later (weer bij de volgende start)`);
    updatePostponedVersion = pendingUpdate.version;
  }
});

function setupAutoUpdater() {
  if (!app.isPackaged) return Promise.resolve(false);

  applyUpdateChannel();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (message) => logUpdater(message),
    warn: (message) => logUpdater(`WARN ${message}`),
    error: (message) => logUpdater(`ERROR ${message}`),
    debug: (message) => logUpdater(`DEBUG ${message}`)
  };
  logUpdater(`Updatecontrole gestart voor versie ${app.getVersion()}`);

  let settleUpdateCheck = () => {};
  const updateCheckResult = new Promise((resolve) => {
    settleUpdateCheck = resolve;
  });
  let updateCheckSettled = false;
  const resolveUpdateCheck = (updateAvailable) => {
    if (updateCheckSettled) return;
    updateCheckSettled = true;
    settleUpdateCheck(updateAvailable);
  };

  autoUpdater.on('update-available', (updateInfo) => {
    logUpdater(`Update beschikbaar: ${updateInfo.version}`);
    resolveUpdateCheck(true);
    updateAvailableInfo = updateInfo;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-badge-changed', { available: true, version: updateInfo.version });
    }
    handleUpdateAvailable(updateInfo);
  });

  autoUpdater.on('update-not-available', () => {
    logUpdater('Geen update beschikbaar');
    updateAvailableInfo = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-badge-changed', { available: false, version: null });
    }
    resolveUpdateCheck(false);
  });

  autoUpdater.on('download-progress', (progress) => {
    logUpdater(`Downloadvoortgang: ${Math.round(progress.percent)}%`);
    if (!pendingUpdate) return;
    pendingUpdate.percent = Math.round(progress.percent);
    sendUpdateState();
  });

  autoUpdater.on('update-downloaded', () => {
    logUpdater('Update volledig gedownload');
    if (!pendingUpdate) return;
    pendingUpdate.downloading = false;
    pendingUpdate.downloaded = true;
    pendingUpdate.percent = 100;
    sendUpdateState();
  });

  autoUpdater.on('error', (error) => {
    logUpdater('Updatecontrole of download mislukt', error);
    resolveUpdateCheck(false);
    // Mislukte download: in de melding zelf ("Opnieuw proberen"). Een
    // mislukte controle (bv. geen internet) blijft stil; volgende keer weer.
    if (pendingUpdate && pendingUpdate.downloading) {
      pendingUpdate.downloading = false;
      pendingUpdate.error = error.message;
      sendUpdateState();
    }
  });

  autoUpdater.checkForUpdates().catch((error) => {
    logUpdater('Updatecontrole mislukt', error);
    resolveUpdateCheck(false);
  });

  return updateCheckResult;
}

// Stille controle: hergebruikt de listeners die setupAutoUpdater() al één
// keer geregistreerd heeft. NIET setupAutoUpdater() zelf opnieuw aanroepen -
// dat zou de listeners dubbel registreren (dubbele dialogen per update).
function checkForUpdatesInBackground() {
  if (!app.isPackaged) return;
  logUpdater('Achtergrond-updatecontrole gestart');
  autoUpdater.checkForUpdates().catch((error) => {
    logUpdater('Achtergrond-updatecontrole mislukt', error);
  });
}

function scheduleDailyUpdateCheck() {
  if (dailyUpdateCheckScheduled || !app.isPackaged) return;
  dailyUpdateCheckScheduled = true;
  setInterval(checkForUpdatesInBackground, DAILY_UPDATE_CHECK_INTERVAL);
}

// Voor de "Nu zoeken naar updates"-knop in instellingen: geen storende
// dialoog (dat zou de instellingen-UI overlappen), gewoon het resultaat
// teruggeven zodat het paneel het inline kan tonen.
function requestUpdateCheck() {
  if (!app.isPackaged) return Promise.resolve({ status: 'not-packaged' });

  // Zelf op de knop gedrukt: een eerder "Later" telt dan niet meer.
  updatePostponedVersion = null;
  return autoUpdater.checkForUpdates()
    .then(() => (
      updateAvailableInfo
        ? { status: 'available', version: updateAvailableInfo.version }
        : { status: 'not-available' }
    ))
    .catch((error) => {
      logUpdater('Handmatige updatecontrole mislukt', error);
      return { status: 'error', message: error.message };
    });
}

function getViewBounds() {
  const bounds = mainWindow.getContentBounds();
  // De tabinhoud is een native laag die altijd over de HTML-chrome heen
  // tekent - dus een in-pagina elementje zoals de update-melding zou anders
  // meteen onzichtbaar onder de actieve tab verdwijnen. Door de view hier
  // naar beneden te schuiven blijft er ruimte voor die balk vrij.
  const topOffset = TABBAR_HEIGHT + (updateBannerOpen ? UPDATE_BANNER_HEIGHT : 0);
  return { x: 0, y: topOffset, width: bounds.width, height: bounds.height - topOffset };
}

function applyActiveTabBounds() {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  tabs.get(activeTabId).setBounds(
    (onboardingActive || settingsPanelOpen || changelogNoticeOpen || tabOverviewOpen || updateNoticeOpen) ? { x: 0, y: 0, width: 0, height: 0 } : getViewBounds()
  );
}

function sendNavigationState(tabId) {
  if (isDetachedTab(tabId)) {
    sendDetachedState(tabId);
    return;
  }
  const view = tabs.get(tabId);
  if (!view || !mainWindow || mainWindow.isDestroyed()) return;

  let canGoBack = false;
  let canGoForward = false;
  try {
    canGoBack = findOtherPageIndex(view.webContents.navigationHistory, -1) !== -1;
    canGoForward = findOtherPageIndex(view.webContents.navigationHistory, 1) !== -1;
  } catch {
    // Navigation history is not ready yet.
  }

  // De terugknop in de tabbalk moet ook klikbaar zijn als er geen in-page
  // geschiedenis is maar wel een tab om naar terug te gaan (zie
  // 'navigate-active-tab'/ELECTRON_BACK_BUTTON hieronder) - anders lijkt hij
  // uitgeschakeld precies in het geval waarin hij wél iets zou doen.
  const canGoBackToTab = parentTabs.has(tabId) || previousTabs.has(tabId);
  const effectiveCanGoBack = canGoBack || canGoBackToTab;

  mainWindow.webContents.send('navigation-state-changed', {
    tabId,
    canGoBack: effectiveCanGoBack,
    canGoForward
  });
}

function openButtonInNewTab(view, button, parentTabId) {
  const url = view.webContents.getURL();
  const newTabId = openInNewTabFromTab(parentTabId, url, false);
  const newView = tabs.get(newTabId);
  if (!newView) return;

  newView.webContents.once('did-finish-load', () => {
    newView.webContents.executeJavaScript(`
      (() => {
        const details = ${JSON.stringify(button)};
        const candidates = [...document.querySelectorAll('*')];
        const element = candidates.find(candidate => {
          if (details.id && candidate.id === details.id) return true;
          if (details.testId && candidate.getAttribute('data-testid') === details.testId) return true;
          if (details.ariaLabel && candidate.getAttribute('aria-label') === details.ariaLabel) return true;
          if (details.name && candidate.getAttribute('name') === details.name) return true;
          return details.text && candidate.textContent.trim() === details.text &&
            candidate.matches('button, [role="button"], input[type="button"], input[type="submit"]');
        });
        if (element) {
          element.click();
        }
      })();
    `).catch(() => {});
  });
}

const clickableElementScript = (x, y) => `
  (() => {
    let element = document.elementFromPoint(${Number(x)}, ${Number(y)});
    while (element && element !== document.body) {
      const isClickable = element.matches(
        'button, [role="button"], input[type="button"], input[type="submit"]'
      );
      if (isClickable) return {
        tag: element.tagName,
        id: element.id,
        testId: element.getAttribute('data-testid'),
        ariaLabel: element.getAttribute('aria-label'),
        name: element.getAttribute('name'),
        text: element.textContent.trim().slice(0, 200)
      };
      element = element.parentElement;
    }
    return null;
  })();
`;

function inspectPage(view, x, y) {
  view.webContents.openDevTools({ mode: 'detach' });
  view.webContents.inspectElement(Number(x), Number(y));
}

// Een tab die louter als (leeg) doel van window.open() bestond en waarvan de
// navigatie naar een extern doel net geblokkeerd is (naar de standaardbrowser
// gestuurd), blijft anders voor altijd op about:blank staan - onbruikbaar en
// verwarrend. Sluit 'm dan automatisch. Uitgesteld via setImmediate: we zitten
// nog midden in de will-navigate/will-redirect-afhandeling van deze webContents
// zelf, meteen sluiten zou die events kunnen verstoren.
function closeIfStillBlank(view, tabId) {
  setImmediate(() => {
    if (!tabs.has(tabId)) return;
    let currentUrl = '';
    try {
      currentUrl = view.webContents.getURL();
    } catch {
      currentUrl = '';
    }
    if (!currentUrl || currentUrl === 'about:blank') {
      closeTab(tabId);
    }
  });
}

// Index van de dichtstbijzijnde geschiedenisregel (direction -1 = terug,
// +1 = vooruit) die op een ANDER pad zit dan de huidige pagina, of -1 als die
// er niet is. Regels met hetzelfde pad (alleen een andere querystring/hash,
// zoals een subtabblad binnen een order) en niet-http(s)-regels (about:blank
// van een window.open()-tab) tellen niet mee.
//
// Belangrijk voor de orderpagina van de site: die spiegelt het subtabblad
// twee kanten op (URL -> tabblad én tabblad -> URL via replaceState). Wisselt
// alleen ?tab= terwijl de pagina open blijft (bv. terug van
// ...?tab=production&scrollTo=... naar ...?tab=kwaliteit), dan corrigeren die
// twee elkaar eindeloos en springt het scherm ~4x per seconde heen en weer.
// Door zulke regels over te slaan komt de pagina altijd vers binnen.
function findOtherPageIndex(navigationHistory, direction) {
  const entries = navigationHistory.getAllEntries();
  const activeIndex = navigationHistory.getActiveIndex();
  const currentPath = pagePath(entries[activeIndex] && entries[activeIndex].url);
  for (let i = activeIndex + direction; i >= 0 && i < entries.length; i += direction) {
    const path = pagePath(entries[i].url);
    if (path && path !== currentPath) return i;
  }
  return -1;
}

// Vastgezette tabs openen navigatie altijd in een NIEUWE tab; losse tabs navigeren gewoon door
//
// skipFirstNavigation: bij een tab die via createTab() zelf loadURL() aanroept
// moet dat eerste "will-navigate" (indien Electron 'm toch afvuurt) helemaal
// genegeerd worden. Bij een LEEG venster dat via window.open() is aangemaakt
// (zie setWindowOpenHandler hieronder) is er geen loadURL() van ons geweest -
// de eerste navigatie DAAR is juist de echte bestemming. Die moet nog wel op
// een extern domein gecontroleerd worden (anders laadt bv. een Moneybird-
// koppeling alsnog eerst binnen de app en blijft de tab na de onvermijdelijke
// geblokkeerde vervolgredirect voorgoed leeg vastzitten) - maar NIET via de
// "vergrendeld/alles-in-nieuwe-tab"-regel omgeleid worden, want dat zou deze
// tab (die de window.open()-referentie in de openende pagina moet blijven
// vertegenwoordigen) evengoed leeg en vastzittend achterlaten.
// Zet de class "dark" op de pagina aan of uit volgens de instelling. Alleen op
// pagina's van de app zelf; inlogpagina's (Microsoft e.d.) blijven ongemoeid.
// De achtergrondkleur van de view voorkomt een witte flits tijdens het laden.
// Alleen pagina's van de app zelf krijgen de donkere achtergrond. Andere
// inhoud (bv. de specificatie-preview: HTML die de app in een leeg venster
// schrijft en die van een witte pagina uitgaat, of een PDF) houdt wit, anders
// schijnt de donkere achtergrond door en staat de zwarte tekst op zwart.
// Oogcomfort (zachtere kleuren, zie soft-mode.js): alleen in licht,
// zachtgrijs i.p.v. fel wit. Donker blijft zoals het is.
// Donker zoals het er nu echt uitziet. Het thema "Origineel" (de app zoals
// hij is, themes.js isOriginal) kent geen licht/donker: dan altijd licht. De
// keuze zelf (appSettings.darkMode, ook de automatische wissel) blijft
// bewaard en geldt weer bij een ander thema. Zo ook bij een thema met maar één
// stand (themes.js fixedMode): dan altijd die stand.
function darkActive() {
  const mode = themes.fixedMode(activeTheme());
  if (mode) return mode === 'dark';
  return !!appSettings.darkMode && !themes.isOriginal(activeTheme());
}

// Oogcomfort geldt niet bij een thema met een vast palet (themes.js): dat
// heeft zijn eigen uitstraling. De instelling zelf blijft bewaard.
// softActive() is de stand zelf (de chrome, losse vensters en het
// hulpkaartje krijgen die als class en kijken zelf of het licht is);
// softLightActive() is of de pagina's nu echt zachter worden.
function softActive() {
  return !!appSettings.softColors && themes.supportsSoft(activeTheme());
}

function softLightActive() {
  return softActive() && !darkActive();
}

// Thema's zijn nog bèta: alleen wie bèta-updates aan heeft ziet de keuze en
// het gekozen thema. Zet iemand bèta uit, dan blijft de keuze bewaard maar
// geldt het standaardthema.
function themesAvailable() {
  return !!appSettings.betaUpdates;
}

function activeTheme() {
  return themesAvailable() ? appSettings.appTheme : themes.DEFAULT_THEME;
}

// Kleur van de pagina-achtergrond bij een thema, of null bij het standaardthema.
function themedBackground() {
  return themes.themeBackground(activeTheme(), darkActive(), softActive());
}

// Achtergrond van een app-pagina tijdens het laden, per thema.
function pageBackground() {
  const themed = themedBackground();
  if (themed) return themed;
  if (darkActive()) return DARK_MODE_BACKGROUND;
  return softLightActive() ? SOFT_MODE_BACKGROUND : '#ffffff';
}

// fade: het oude beeld loopt in 0,6 s over in het nieuwe (View Transitions:
// één momentopname die vervaagt, i.p.v. elk element apart laten meekleuren,
// wat op de zware pagina's hapert). Met "animaties uit" in Windows direct.
const PAGE_FADE_CSS = '::view-transition-group(root),::view-transition-old(root),::view-transition-new(root){animation-duration:600ms;animation-timing-function:ease}';

function applyDarkMode(view, { fade = false } = {}) {
  if (view.webContents.isDestroyed()) return;
  const internal = isInternalUrl(view.webContents.getURL());
  view.setBackgroundColor(internal ? pageBackground() : '#ffffff');
  if (!internal) return;
  const toggle = `document.documentElement.classList.toggle('dark', ${darkActive()});
     document.documentElement.classList.toggle('sg-original', ${themes.isOriginal(activeTheme())});
     document.documentElement.classList.toggle('sg-wallpaper', ${themes.hasWallpaper(activeTheme())});
     document.documentElement.classList.toggle('sg-soft', ${softLightActive()});
     for (const name of ${JSON.stringify(themes.THEME_CLASSES)}) {
       document.documentElement.classList.toggle(name, name === ${JSON.stringify('sg-theme-' + activeTheme())});
     }`;
  view.webContents.executeJavaScript(fade
    ? `(() => {
        const run = () => { ${toggle} };
        if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return run();
        const style = document.createElement('style');
        style.textContent = ${JSON.stringify(PAGE_FADE_CSS)};
        document.head.appendChild(style);
        document.startViewTransition(run).finished.finally(() => style.remove());
      })()`
    : toggle
  ).catch(() => {});
}

// CSS van het gekozen thema (themes.js) in een Singeling-pagina. Alleen het
// actieve thema, en bij een wissel de vorige eruit; een volledige
// paginalading haalt alles zelf al weg (dan komt dom-ready hier opnieuw).
const themeCssKeys = new WeakMap(); // webContents -> sleutel van insertCSS

async function insertThemeCss(view) {
  const contents = view.webContents;
  if (contents.isDestroyed() || !isInternalUrl(contents.getURL())) return;
  const previousKey = themeCssKeys.get(contents);
  themeCssKeys.delete(contents);
  if (previousKey) contents.removeInsertedCSS(previousKey).catch(() => {});
  const css = themes.pageThemeCss(activeTheme());
  if (!css) return;
  const key = await contents.insertCSS(css).catch(() => null);
  if (key && !contents.isDestroyed()) themeCssKeys.set(contents, key);
}

// Classes op <html> voor de pagina-aanpassingen uit page-tweaks.js.
// Doorzichtige tinten dicht maken, alleen bij een thema met achtergrond: het
// script loopt alle CSS-regels van de pagina af, dat is zonde zonder thema.
// Het script zelf draait per pagina maar één keer (window.__sgSolidTints).
function applySolidTints(view) {
  if (view.webContents.isDestroyed() || !isInternalUrl(view.webContents.getURL())) return;
  if (themes.hasWallpaper(activeTheme())) view.webContents.executeJavaScript(SOLID_TINTS_SCRIPT).catch(() => {});
}

function applyPageTweaks(view) {
  if (view.webContents.isDestroyed() || !isInternalUrl(view.webContents.getURL())) return;
  view.webContents.executeJavaScript(
    `document.documentElement.classList.toggle('sg-not-clocked-subtiel', ${appSettings.notClockedMode === 'subtiel'});
     document.documentElement.classList.toggle('sg-not-clocked-uit', ${appSettings.notClockedMode === 'uit'});`
  ).catch(() => {});
}

function attachNavigationHandlers(view, tabId, { skipFirstNavigation = true } = {}) {
  let isInitialLoad = true;

  // dom-ready komt eerder dan did-finish-load, dus het thema staat er al
  // voordat de pagina zichtbaar is opgebouwd. insertCSS blijft gelden tot de
  // volgende volledige paginalading en wordt dan hier opnieuw gezet.
  view.webContents.on('dom-ready', () => {
    if (isInternalUrl(view.webContents.getURL())) {
      view.webContents.insertCSS(DARK_MODE_CSS).catch(() => {});
      view.webContents.insertCSS(SOFT_MODE_CSS).catch(() => {});
      view.webContents.insertCSS(PAGE_TWEAKS_CSS).catch(() => {});
      insertThemeCss(view);
      applySolidTints(view);
    }
    applyDarkMode(view);
    applyPageTweaks(view);
    // Voorbeeld voor het taboverzicht zodra de pagina wat is opgebouwd.
    setTimeout(() => {
      if (tabs.get(activeTabId) === view) captureTabThumbnail(tabId);
    }, 1500);
    // Wacht het overgangsgordijn op deze tab? Dan nog heel even de pagina
    // laten renderen en het gordijn daarna wegfaden.
    if (curtainWaitingFor === view) {
      curtainWaitingFor = null;
      clearTimeout(curtainTimer);
      curtainTimer = setTimeout(revealCurtain, CURTAIN_NEW_TAB_SETTLE_MS);
    }
  });
  // Bijgewerkt via ELECTRON_FOCUS_EDITABLE in de console-message-handler
  // hieronder (focusin/focusout-listener die in de pagina geïnjecteerd
  // wordt). Zo weten we bij Ctrl+B of de focus in een tekstveld staat, zonder
  // dat we hier synchroon de DOM van de pagina kunnen opvragen.
  let isFocusOnEditableField = false;

  // F5/Ctrl+R moeten de tabinhoud verversen (zoals de vernieuwen-knop), niet
  // het standaard Chromium-gedrag volgen dat de hele view hard herlaadt.
  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (isRefreshShortcut(input)) {
      event.preventDefault();
      view.webContents.reload();
      return;
    }

    if (!(input.control || input.meta)) return;
    if (input.key === '+' || input.key === '=') {
      event.preventDefault();
      adjustZoom('in');
    } else if (input.key === '-') {
      event.preventDefault();
      adjustZoom('out');
    } else if (input.key === '0') {
      event.preventDefault();
      setZoomFactor(DEFAULT_ZOOM);
    } else if (input.key.toLowerCase() === 'l' && !isDetachedTab(tabId)) {
      // Ctrl+L: het veld "Link openen" in de tabbalk (zoals in een browser).
      event.preventDefault();
      mainWindow.webContents.focus();
      mainWindow.webContents.send('open-link-field');
    } else if (appSettings.blockCtrlB && input.key.toLowerCase() === 'b' && !isFocusOnEditableField) {
      // De website vangt Ctrl+B zelf af om de zijbalk in/uit te klappen, wat
      // vetgedrukt typen in tekstvelden onmogelijk maakt. Dit onderdrukt de
      // toetscombinatie al vóórdat de pagina 'm te zien krijgt - maar alleen
      // als de focus niet in een tekstveld staat, anders kan daar ook geen
      // Ctrl+B meer voor vetgedrukt gebruikt worden.
      event.preventDefault();
    }
  });

  // Ctrl+scrollen op de pagina: Electron meldt dit via 'zoom-changed'.
  view.webContents.on('zoom-changed', (event, zoomDirection) => {
    adjustZoom(zoomDirection);
  });

  view.webContents.on('will-navigate', (event, url) => {
    // Inlogstappen altijd in-place laten doorlopen (ook in een vergrendelde
    // tab), zodat POSTs intact blijven en de sessie in de app terechtkomt.
    if (isAuthUrl(url)) {
      isInitialLoad = false;
      return;
    }
    if (isInitialLoad) {
      isInitialLoad = false;
      if (skipFirstNavigation) return;
      // Leeg window.open()-venster: alleen een extern doel afvangen, verder
      // gewoon laten laden in deze tab (zie uitleg bij skipFirstNavigation).
      if (!isInternalUrl(url)) {
        event.preventDefault();
        openExternalSafe(url);
        closeIfStillBlank(view, tabId);
      }
      return;
    }
    if (!isInternalUrl(url)) {
      event.preventDefault();
      openExternalSafe(url);
      closeIfStillBlank(view, tabId);
      return;
    }
    // Pas na de externe-sitecheck: een achtergebleven vlag mag nooit een
    // externe site in de tab laten laden.
    if (internalNavigations.has(tabId)) {
      internalNavigations.delete(tabId);
      return;
    }
    if (!isDetachedTab(tabId) && !appSettings.tabBarDisabled && (lockedTabs.has(tabId) || appSettings.openAllLinksInNewTab)) {
      event.preventDefault();
      switchToOpenTab(url, tabId) || createTab(url, true, false, tabId);
    }
    // Anders (of in een los venster): laat de navigatie gewoon hier plaatsvinden.
  });

  view.webContents.on('will-redirect', (event, url) => {
    if (!isInternalUrl(url) && !isAuthUrl(url)) {
      event.preventDefault();
      openExternalSafe(url);
      closeIfStillBlank(view, tabId);
    }
  });

  view.webContents.on('did-navigate', (event, url) => {
    internalNavigations.delete(tabId);
    sendNavigationState(tabId);
    // De tabnaam wordt uit de URL afgeleid. Binnen de site (pushState) meldt
    // de geïnjecteerde ELECTRON_URL_UPDATE dat al, maar bij een volledige
    // paginalading (redirect, doorklik in een losse tab, herladen) bleef de
    // naam anders op de oude pagina staan.
    if (!isDetachedTab(tabId) && mainWindow && !mainWindow.isDestroyed() && url && url !== 'about:blank') {
      mainWindow.webContents.send('update-tab-url', { tabId, url });
    }
    if (url) telemetry.visit(tabId, url);
  });

  view.webContents.on('render-process-gone', () => telemetry.crash());

  view.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
    if (isMainFrame) telemetry.visit(tabId, url);
    // Terug binnen de webapp blijft op dezelfde pagina; ook dan de vlag wissen.
    internalNavigations.delete(tabId);
    sendNavigationState(tabId);
  });

  // Het inlogvenster (zie hieronder) mag alleen inlog- en app-pagina's tonen;
  // een andere link daarin gaat naar de browser, nieuwe vensters niet.
  view.webContents.on('did-create-window', (popup) => {
    popup.webContents.on('will-navigate', (event, url) => {
      if (isAuthUrl(url) || isInternalUrl(url)) return;
      event.preventDefault();
      openExternalSafe(url);
    });
    popup.webContents.setWindowOpenHandler(({ url }) => {
      openExternalSafe(url);
      return { action: 'deny' };
    });
  });

  view.webContents.setWindowOpenHandler((details) => {
    if (details.url && details.url !== 'about:blank') {
      // Inlog-popup (bv. MSAL loginPopup): als echt popupvenster toestaan,
      // anders verliest de pagina haar window.opener-koppeling en mislukt
      // het afronden van de login.
      if (isAuthUrl(details.url)) {
        return { action: 'allow' };
      }
      openLinkFromTab(tabId, view, details.url);
      return { action: 'deny' };
    }

    // Sommige knoppen (bv. PDF-preview) openen eerst een leeg venster via window.open()
    // en navigeren dat pas later, zodra de PDF asynchroon is opgebouwd. Bij 'deny' is de
    // window.open()-referentie in de pagina ongeldig, waardoor die latere navigatie in
    // het niets verdwijnt en de nieuwe tab blanco blijft. Daarom hier zelf een tab
    // aanmaken en die WebContents teruggeven, zodat de referentie geldig blijft.
    const newTabId = `tab-${++tabCounter}`;
    return {
      action: 'allow',
      createWindow: (options) => {
        const newView = new WebContentsView(options);
        mainWindow.contentView.addChildView(newView);
        newView.setBounds(getViewBounds());
        newView.webContents.zoomFactor = appSettings.zoomFactor;
        // Bewust géén donkere achtergrond: zo'n leeg venster krijgt meestal
        // een PDF of door de app geschreven HTML (specificatie-preview) die
        // van wit uitgaat. Wordt het toch een app-pagina, dan zet
        // applyDarkMode (dom-ready) de donkere achtergrond alsnog.
        newView.setBackgroundColor('#ffffff');
        attachNavigationHandlers(newView, newTabId, { skipFirstNavigation: false });
        tabs.set(newTabId, newView);
        parentTabs.set(newTabId, tabId);
        mainWindow.webContents.send('tab-created', { tabId: newTabId, url: 'about:blank' });
        switchTab(newTabId);
        // Nooit zelf een los venster openen: vanuit een los venster komt de
        // nieuwe tab in het hoofdvenster, en dat halen we naar voren.
        if (isDetachedTab(tabId)) mainWindow.focus();
        return newView.webContents;
      }
    };
  });

  view.webContents.on('context-menu', (event, params) => {
    if (params.linkURL) {
      let linkProtocol;
      try {
        linkProtocol = new URL(params.linkURL).protocol;
      } catch {
        return;
      }
      if (!['http:', 'https:'].includes(linkProtocol)) return;

      const external = !isInternalUrl(params.linkURL);
      if (!external && appSettings.tabBarDisabled && !isDetachedTab(tabId)) return;
      const newTabLabel = isDetachedTab(tabId) ? 'Link openen in nieuw tabblad (hoofdvenster)' : 'Link openen in nieuw tabblad';
      const menu = Menu.buildFromTemplate([
        {
          label: external ? 'Link openen in browser' : newTabLabel,
          click: () => {
            if (external) openExternalSafe(params.linkURL);
            else openInNewTabFromTab(tabId, params.linkURL);
          }
        }
      ]);
      popupTabMenu(menu, tabId, params.x, params.y);
      return;
    }

    if (params.isEditable || params.selectionText) {
      const editItems = [];
      if (params.editFlags.canCut) editItems.push({ label: 'Knippen', role: 'cut' });
      if (params.editFlags.canCopy) editItems.push({ label: 'Kopiëren', role: 'copy' });
      if (params.editFlags.canPaste) editItems.push({ label: 'Plakken', role: 'paste' });
      if (editItems.length > 0) {
        popupTabMenu(Menu.buildFromTemplate(editItems), tabId, params.x, params.y);
        return;
      }
    }

    view.webContents.executeJavaScript(clickableElementScript(params.x, params.y), true).then(button => {
      const menuItems = [];
      if (button && !(appSettings.tabBarDisabled && !isDetachedTab(tabId))) {
        menuItems.push({
          label: isDetachedTab(tabId) ? 'Knop openen in nieuw tabblad (hoofdvenster)' : 'Knop openen in nieuw tabblad',
          click: () => openButtonInNewTab(view, button, tabId)
        });
      } else {
        menuItems.push({
          label: 'Pagina inspecteren',
          click: () => inspectPage(view, params.x, params.y)
        });
      }
      menuItems.push({
        label: 'Pagina vernieuwen',
        click: () => view.webContents.reload()
      });

      popupTabMenu(Menu.buildFromTemplate(menuItems), tabId, params.x, params.y);
    }).catch(() => {});
  });

  // Alleen een los venster toont de paginatitel; de tabbalk leidt de naam
  // uit de URL af (update-tab-url).
  view.webContents.on('page-title-updated', () => {
    if (isDetachedTab(tabId)) sendDetachedState(tabId);
  });

  // Vang SPA route-wijzigingen (pushState/replaceState) af in de webview
  view.webContents.on('did-finish-load', () => {
    sendNavigationState(tabId);
    view.webContents.executeJavaScript(`
      // did-finish-load kan meerdere keren afgaan voor dezelfde pagina (bv. bij
      // een login-redirect of tussenliggende laadstappen), zonder dat de JS-
      // context (window) opnieuw wordt aangemaakt. Zonder deze guard werden de
      // pushState-override en de click-listener dan telkens opnieuw toegevoegd
      // bovenop de vorige, waardoor één klik meerdere keren afging en een tab
      // 2x (of vaker) werd geopend. Bij een echte volledige herlaadbeurt is
      // window weer schoon, dus dan installeert dit zich gewoon opnieuw.
      window.__electronForceNewTab = ${appSettings.openAllLinksInNewTab};
      // Los venster of tabbalk uit (geen tabbalk): links en knoppen blijven in dit scherm.
      window.__electronDetached = ${isDetachedTab(tabId) || appSettings.tabBarDisabled};
      // Ook na herladen (F5, login-redirect) moet de pagina het slot nog weten.
      window.__electronTabLocked = ${lockedTabs.has(tabId)};
      if (!window.__electronHandlersInstalled) {
        window.__electronHandlersInstalled = true;

        // Wijst url naar een oudercontext van de huidige pagina (bv.
        // /sales-orders vanuit /sales-orders/123)? Gebruikt door de
        // pushState-override én de click-listener, zodat beide hetzelfde
        // beslissen. De startpagina (/) telt nooit als "terug": elk pad begint
        // met /, dus anders werd bv. "Dashboard Klokken" (link naar /) in de
        // navigatie altijd als terugknop gezien en nooit geopend.
        const isParentPath = (url) => {
          const destination = new URL(url, window.location.href);
          const destPath = destination.pathname.replace(/\\/$/, '');
          const currentPath = window.location.pathname.replace(/\\/$/, '');
          return destination.origin === window.location.origin &&
            destPath !== '' &&
            destPath !== currentPath &&
            currentPath.startsWith(destPath + '/');
        };

        // Terug: main.js kiest eerdere pagina in deze tab, de brontab, een
        // tab waar url al open staat, of opent url hier (__electronGoInPage).
        // url is de lijst waar "terug" heen hoort (leeg = geen).
        const backTo = (url) => console.log('ELECTRON_BACK_BUTTON:' + (url || ''));
        // Ouderpagina van de huidige: /customers/3360 -> /customers. Nooit /.
        const parentOfCurrent = () => {
          const parent = window.location.pathname.replace(/\\/$/, '').replace(/\\/[^/]*$/, '');
          return parent ? window.location.origin + parent : '';
        };
        // Binnen de webapp navigeren zonder herladen: zelf pushState (langs
        // onze override, die dit dan doorlaat) en de router laten meelezen.
        window.__electronGoInPage = (url) => {
          window.__electronInPageNav = true;
          try {
            history.pushState({ usr: null, key: Math.random().toString(36).slice(2, 10), idx: ((history.state && history.state.idx) || 0) + 1 }, '', url);
          } finally {
            window.__electronInPageNav = false;
          }
          window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        };

        ['pushState', 'replaceState'].forEach(type => {
          const original = history[type];
          history[type] = function(...args) {
            const nextUrl = new URL(args[2] || window.location.href, window.location.href);
            // Veel SPA's roepen pushState/replaceState ook aan voor interne
            // state (bv. een subtabblad of filter in de querystring van
            // dezelfde pagina, zoals sales-orders/29539 -> ...?tab=productie),
            // niet alleen om echt naar een andere pagina te navigeren. Alleen
            // als het PAD verandert is het een "echte" nieuwe pagina/link; bij
            // een pad dat gelijk blijft (enkel query/hash anders) laten we het
            // gewoon normaal in dezelfde tab gebeuren, anders krijg je bij elke
            // interne tabwissel binnen bv. een order óók een nieuw tabblad.
            const isRealNavigation = nextUrl.pathname !== window.location.pathname;
            // Navigatie naar een oudercontext van het huidige pad (bv. een
            // breadcrumb "Verkooporders" vanuit /sales-orders/123 terug naar
            // /sales-orders) is terugnavigatie, geen "nieuwe" bestemming -
            // forceer daar dus ook geen nieuw tabblad voor.
            const isBreadcrumbBack = isParentPath(nextUrl.href);
            // Klikbare rijen/kaarten/knoppen (bv. een offerte in de lijst bij
            // Quotations) zijn geen <a href>, dus de linkhandler hieronder
            // ziet ze niet: de site navigeert zelf via pushState. Een
            // pushState vlak na zo'n klik behandelen we daarom als linkklik
            // en openen we - net als echte links - in een nieuw tabblad.
            // Uitloggen (naar /auth) moet uiteraard in deze tab blijven.
            const fromRowClick = type === 'pushState' &&
              !nextUrl.pathname.startsWith('/auth') &&
              Date.now() - (window.__electronRowClickAt || 0) < 1000;
            if (fromRowClick) window.__electronRowClickAt = 0;
            // "Factuur maken"/"Pakbon maken" zitten in een pop-up en navigeren
            // pas NA het aanmaken op de server naar de nieuwe factuur/pakbon.
            // Die moeten - anders dan "Opslaan"/"Aanmaken" in andere
            // formulieren - wel in een eigen tabblad openen, zodat de order
            // blijft staan. Ruimer tijdvenster omdat het aanmaken even duurt.
            const fromNewTabAction = type === 'pushState' &&
              Date.now() - (window.__electronNewTabActionAt || 0) < 15000;
            if (fromNewTabAction && isRealNavigation) window.__electronNewTabActionAt = 0;
            // Een resultaat gekozen in de zoekbalk bovenin ("Singeling Launch
            // Pad"): dat is een pop-up, en kiezen kan met de muis of met Enter,
            // dus fromRowClick ziet het niet. Zie de click-/keydown-listeners.
            const fromLaunchPad = type === 'pushState' &&
              Date.now() - (window.__electronLaunchPadAt || 0) < 2000;
            if (fromLaunchPad && isRealNavigation) window.__electronLaunchPadAt = 0;
            // Een knop zonder link die naar de lijst terug navigeert (bv.
            // "← Verkoopoffertes" op een offerte) is een terugknop: net als
            // "Terug" en breadcrumb-links via main.js (brontab, of anders hier).
            if (!window.__electronDetached && !window.__electronInPageNav && fromRowClick && isBreadcrumbBack) {
              backTo(nextUrl.href);
              return;
            }
            if (!window.__electronDetached && !window.__electronInPageNav && isRealNavigation && !isBreadcrumbBack && (fromRowClick || fromNewTabAction || fromLaunchPad || window.__electronTabLocked || window.__electronForceNewTab)) {
              console.log('ELECTRON_LOCKED_NAVIGATE:' + nextUrl.href);
              return;
            }
            // Vangnet voor een tab-lus in de site zelf (zie findOtherPageIndex
            // in main.js): de pagina zet de URL dan in hoog tempo om en om
            // tussen twee adressen op hetzelfde pad. Na 8x binnen 2 seconden
            // met maar 2 verschillende adressen herladen we de pagina één
            // keer; vers geladen klopt het tabblad weer met de URL. Hoogstens
            // eens per 10 seconden, zodat een herlaadlus onmogelijk is.
            if (type === 'replaceState' && !isRealNavigation) {
              const now = Date.now();
              const log = (window.__electronReplaceLog || []).filter(entry => now - entry.at < 2000);
              log.push({ at: now, href: nextUrl.href });
              window.__electronReplaceLog = log;
              if (log.length >= 8 && new Set(log.map(entry => entry.href)).size <= 2) {
                let lastReload = 0;
                try { lastReload = Number(sessionStorage.getItem('__electronLoopReloadAt')) || 0; } catch {}
                if (now - lastReload > 10000) {
                  try { sessionStorage.setItem('__electronLoopReloadAt', String(now)); } catch {}
                  window.__electronReplaceLog = [];
                  console.log('ELECTRON_TAB_LOOP_RELOAD:' + window.location.href);
                  window.location.reload();
                  return;
                }
              }
            }
            const result = original.apply(this, args);
            console.log('ELECTRON_URL_UPDATE:' + window.location.href);
            return result;
          };
        });

        window.addEventListener('popstate', () => {
          console.log('ELECTRON_URL_UPDATE:' + window.location.href);
        });

        // Elke link/knop opent bij ons standaard een NIEUW tabblad (nieuwe
        // WebContentsView, dus een eigen lege paginageschiedenis). Een
        // terugknop die de native history.back()/history.go(-1) gebruikt
        // (i.p.v. een link of pushState naar een vaste URL) heeft in zo'n
        // verse tab dus NIETS om naar terug te gaan - history.length is dan
        // 1, en history.back() is een stille no-op. Dit was de daadwerkelijke
        // oorzaak achter meerdere eerdere "terugknop doet niks"-meldingen.
        // Omleiden naar onze eigen ELECTRON_BACK_BUTTON-afhandeling (die al
        // eerst echte in-pagina geschiedenis probeert, en anders teruggaat
        // naar de tab waar dit tabblad uit geopend is) lost dit voor elke
        // knop op, ongeacht het label.
        history.back = function() {
          backTo(parentOfCurrent());
        };
        const originalGo = history.go.bind(history);
        history.go = function(delta) {
          if (delta === undefined || delta < 0) {
            backTo(parentOfCurrent());
            return;
          }
          return originalGo(delta);
        };

        // Houdt bij of de focus in een tekstveld staat, zodat Ctrl+B daar
        // nog steeds gewoon voor vetgedrukt kan werken, ook als de instelling
        // "Ctrl+B blokkeren" aanstaat (zie ELECTRON_FOCUS_EDITABLE hieronder).
        const isEditableTarget = (el) => !!el && (
          el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
        );
        document.addEventListener('focusin', (event) => {
          console.log('ELECTRON_FOCUS_EDITABLE:' + isEditableTarget(event.target));
        });
        document.addEventListener('focusout', () => {
          console.log('ELECTRON_FOCUS_EDITABLE:false');
        });

        // Pop-up open (donkere achtergrondlaag van de webapp, shadcn/Radix:
        // .fixed.inset-0 met data-state="open")? Dan dimt de tabbalk mee in
        // dezelfde kleur, zie ELECTRON_MODAL in main.js.
        let modalCheckQueued = false;
        const reportModal = () => {
          modalCheckQueued = false;
          const overlay = [...document.querySelectorAll('.fixed.inset-0[data-state="open"]')]
            .find(el => !/^(transparent|rgba\\(0, 0, 0, 0\\))$/.test(getComputedStyle(el).backgroundColor));
          const color = overlay ? getComputedStyle(overlay).backgroundColor : '';
          if (color === window.__electronModalColor) return;
          window.__electronModalColor = color;
          console.log('ELECTRON_MODAL:' + color);
        };
        new MutationObserver(() => {
          if (!modalCheckQueued) { modalCheckQueued = true; requestAnimationFrame(reportModal); }
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
        reportModal();

        // Aantal meldingen bij het belletje (knop met svg.lucide-bell, het
        // getal staat in een rondje ernaast) naar main.js: taakbalk en
        // Windows-melding, zie ELECTRON_BADGE. Een timer i.p.v.
        // requestAnimationFrame: die staat stil in een tab op de achtergrond
        // of een geminimaliseerd venster, en juist dan moet dit doorkomen.
        // Een 0 telt pas als hij 3 seconden blijft: bij een paginawissel staat
        // het belletje even zonder getal. Anders verdween het rondje op de
        // taakbalk telkens, en gaf "0 -> 5" daarna een valse Windows-melding.
        let badgeTimer = null;
        let zeroTimer = null;
        const reportBadge = (zeroConfirmed = false) => {
          const bell = [...document.querySelectorAll('button')].find(button => button.querySelector('svg.lucide-bell'));
          if (!bell) return; // Geen belletje (bv. inlogpagina): niets melden.
          const count = parseInt(bell.textContent.replace(/\\D/g, ''), 10) || 0;
          if (count > 0) {
            clearTimeout(zeroTimer);
            zeroTimer = null;
          } else if (!zeroConfirmed) {
            if (!zeroTimer) zeroTimer = setTimeout(() => { zeroTimer = null; reportBadge(true); }, 3000);
            return;
          }
          if (count === window.__electronBadgeCount) return;
          window.__electronBadgeCount = count;
          console.log('ELECTRON_BADGE:' + count);
        };
        // Berichtje in de pagina zelf als er een melding bijkomt terwijl je in
        // de app zit (main.js updateNotificationCount). Klikken opent het
        // belletje; na 6 seconden verdwijnt het vanzelf. In de accentkleur van
        // het thema (--primary, met --primary-foreground als tekst): valt op en
        // past toch bij elk thema.
        window.__electronShowNotice = (title) => {
          document.getElementById('sg-notice')?.remove();
          const notice = document.createElement('button');
          notice.id = 'sg-notice';
          notice.type = 'button';
          notice.setAttribute('role', 'status');
          notice.style.cssText = 'position:fixed;top:14px;right:18px;z-index:2147483647;display:flex;align-items:center;gap:10px;' +
            'padding:10px 14px;border-radius:10px;border:0;background:hsl(var(--primary));' +
            'color:hsl(var(--primary-foreground));font:inherit;font-size:13px;text-align:left;cursor:pointer;' +
            'box-shadow:0 8px 24px rgba(0,0,0,.18);animation:sg-notice-in .2s ease-out;';
          notice.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>' +
            '<span><strong style="display:block;font-weight:600"></strong><span style="opacity:.85">Klik om te bekijken</span></span>';
          notice.querySelector('strong').textContent = title;
          if (!document.getElementById('sg-notice-style')) {
            const style = document.createElement('style');
            style.id = 'sg-notice-style';
            style.textContent = '@keyframes sg-notice-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
              '@media (prefers-reduced-motion: reduce){#sg-notice{animation:none!important}}';
            document.head.appendChild(style);
          }
          notice.addEventListener('click', (event) => {
            event.stopPropagation();
            notice.remove();
            [...document.querySelectorAll('button')].find(button => button.querySelector('svg.lucide-bell'))?.click();
          });
          document.body.appendChild(notice);
          // Muis erop: blijft staan; muis eraf: nog 3 seconden.
          let hideTimer = setTimeout(() => notice.remove(), 6000);
          notice.addEventListener('mouseenter', () => clearTimeout(hideTimer));
          notice.addEventListener('mouseleave', () => {
            hideTimer = setTimeout(() => notice.remove(), 3000);
          });
        };

        new MutationObserver(() => {
          clearTimeout(badgeTimer);
          badgeTimer = setTimeout(() => reportBadge(), 300);
        }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        reportBadge();

        // Enter in de zoekbalk-pop-up kiest het geselecteerde resultaat. Dat is
        // geen klik, dus hier apart onthouden (capture: vóór de site zelf).
        document.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          window.__electronLaunchPadAt =
            document.querySelector('[data-cmd-item][data-selected="true"]') ? Date.now() : 0;
        }, true);

        // Eén gecombineerde click-listener (in plaats van twee losse), zodat de
        // terugknop-check altijd EERST loopt. Anders kan een "Terug"/"Vorige"
        // die als <a href> (in plaats van <button>) is gebouwd, al door de
        // linkhandler zijn afgevangen (en dus als nieuw tabblad geopend worden)
        // vóórdat de terugknop-check er zelfs maar naar kijkt.
        document.addEventListener('click', (event) => {
          // De site navigeert meestal niet via <a href>, maar via een eigen
          // click-handler op een rij, kaart of knop (bv. een offerte bij
          // Quotations, een issuekaart, de klantnaam bij Verkooporders) die
          // daarna pushState doet. Onthoud daarom het tijdstip van elke klik,
          // zodat de pushState-override hierboven die navigatie - net als een
          // echte link - in een nieuw tabblad kan openen. Klikken binnen
          // formulieren en dialogen tellen niet mee: "Opslaan"/"Aanmaken" die
          // daarna naar de nieuwe detailpagina springt hoort in dezelfde tab.
          // Klikken die op dezelfde pagina blijven (filters, subtabbladen,
          // verwijderen) doen geen pad-wijzigende pushState en merken hier
          // dus niets van.
          const isPlainClick = !event.button && !event.target.closest(
            'a[href], input, select, textarea, form, [role="dialog"], [role="alertdialog"], [contenteditable]'
          );
          window.__electronRowClickAt = isPlainClick ? Date.now() : 0;
          // Resultaat in de zoekbalk-pop-up (Launch Pad): die items zijn
          // [data-cmd-item]-elementen, zie fromLaunchPad hierboven.
          window.__electronLaunchPadAt = !event.button && event.target.closest('[data-cmd-item]') ? Date.now() : 0;

          // Als iets anders (de eigen router/click-handler van de site) deze
          // klik al heeft afgehandeld (bv. preventDefault + eigen pushState-
          // navigatie), moeten wij niet ook nog eens zelfstandig een tab
          // openen. Dat gaf een dubbel geopende tab per klik.
          if (event.defaultPrevented) return;

          // Een element telt alleen als "terugknop" als het HELE label (los van
          // pijltjes/leestekens) precies zo'n woord is, bv. "Terug" of "‹ Vorige".
          // Anders matcht bv. een periodefilter "Vorige maand" ook als woord
          // "vorige" en springt de app onterecht terug naar het vorige tabblad.
          const backWords = ['back', 'terug', 'vorige', 'previous'];
          const isBackLabel = (value) => {
            if (!value) return false;
            const stripped = value.toLowerCase().replace(/[^a-z]/g, '');
            return backWords.includes(stripped);
          };

          const clickable = event.target.closest(
            'a[href], button, [role="button"], input[type="button"], input[type="submit"]'
          );
          // Zie fromNewTabAction in de pushState-override hierboven. Elke
          // andere klik (bv. "Annuleren") wist het weer.
          const newTabActions = ['factuurmaken', 'pakbonmaken', 'facturenaanmaken'];
          const actionLabel = clickable ? clickable.textContent.toLowerCase().replace(/[^a-z]/g, '') : '';
          window.__electronNewTabActionAt = newTabActions.includes(actionLabel) ? Date.now() : 0;

          if (!clickable) return;

          const isBackButton = [
            clickable.textContent,
            clickable.getAttribute('aria-label'),
            clickable.getAttribute('title'),
            clickable.getAttribute('data-testid')
          ].some(isBackLabel);

          // Alleen als het DICHTSTBIJZIJNDE interactieve element zelf de link
          // is behandelen we dit als een linkklik. Een onafhankelijke zoektocht
          // naar 'a[href]' verderop in de boom (los van clickable) ving ook
          // knoppen af die toevallig ergens BINNEN een omliggende <a> zitten
          // (bv. een "bewerken"-potloodje in een klikbare kaart) - dan werd de
          // klik gekaapt en de link geopend/genavigeerd in plaats van de knop
          // zijn eigen actie te laten gebeuren.
          const isLink = clickable.tagName === 'A' && clickable.hasAttribute('href');

          // Breadcrumb-achtige links (bv. "Verkooporders" bovenaan een order)
          // wijzen naar een oudercontext van de huidige URL (/sales-orders/123
          // -> /sales-orders) zonder dat hun tekst "Terug"/"Vorige" is. Zonder
          // deze check werden ze als gewone link behandeld en dus - zoals alle
          // links - in een nieuw tabblad geopend, i.p.v. terug te gaan naar de
          // tab waar de order uit geopend is.
          // Links in het hoofdmenu (zijbalk) zijn geen breadcrumb: vanuit
          // /assemblies/123 moet "Assemblies" in het menu gewoon de lijst
          // openen, niet terugspringen naar de tab waar je vandaan kwam.
          const isMenuLink = isLink &&
            !!clickable.closest('aside, [data-sidebar], nav:not([aria-label*="breadcrumb" i])');
          let isBreadcrumbBack = false;
          try {
            isBreadcrumbBack = isLink && !isMenuLink && isParentPath(clickable.href);
          } catch {
            // Ongeldige href: geen breadcrumb.
          }

          // In een los venster is er geen brontab om naar terug te gaan; daar
          // navigeert een breadcrumb-link dus gewoon (zie hieronder).
          if (isBackButton || (isBreadcrumbBack && !window.__electronDetached)) {
            // Terugknoppen (en breadcrumb-achtige "terug naar de lijst"-links)
            // zijn een uitzondering op "alle links in nieuwe tab": die moeten
            // gewoon terugnavigeren, niet iets nieuws openen.
            backTo(isBreadcrumbBack ? clickable.href : parentOfCurrent());
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          // In een los venster gewone links door de site zelf laten afhandelen
          // (dan blijven ze in dit venster).
          if (!isLink || window.__electronDetached) return;
          const link = clickable;
          if (link.target === '_blank' || link.hasAttribute('download')) return;

          const url = new URL(link.href, window.location.href);
          if (!['http:', 'https:'].includes(url.protocol)) return;

          event.preventDefault();
          // stopImmediatePropagation (niet stopPropagation): dat blokkeert ook
          // een eventuele andere click-listener die de site zelf al op
          // document/hetzelfde element heeft hangen, zodat die niet ook nog
          // eens zelf gaat navigeren (en zo een dubbel geopende tab geeft).
          event.stopImmediatePropagation();
          console.log('ELECTRON_LINK_CLICK:' + url.href);
        }, true);
      }
    `).catch(() => {});
  });

  // Vang signalen uit de tab op en stuur ze door naar de juiste tabactie
  view.webContents.on('console-message', (event) => {
    const message = event.message;

    if (message.startsWith('ELECTRON_LINK_CLICK:')) {
      const url = message.replace('ELECTRON_LINK_CLICK:', '');
      if (isAuthUrl(url)) view.webContents.loadURL(url);
      else openLinkFromTab(tabId, view, url);
      return;
    }

    if (message.startsWith('ELECTRON_LOCKED_NAVIGATE:')) {
      openLinkFromTab(tabId, view, message.replace('ELECTRON_LOCKED_NAVIGATE:', ''));
      return;
    }

    if (message.startsWith('ELECTRON_BACK_BUTTON')) {
      const target = message.slice('ELECTRON_BACK_BUTTON:'.length);
      // Gebruikt bewust de 'view' uit de sluiting van attachNavigationHandlers
      // (niet tabs.get(tabId)): die laatste is leeg voor een losgetrokken tab
      // (zie detachTab), waardoor in-pagina "terug" binnen zo'n los venster
      // anders zou stoppen met werken.
      // Sla geschiedenisregels over die op hetzelfde pad zitten: een subtabblad
      // of filter (bv. sales-orders/123 -> ...?tab=kwaliteit) doet ook een
      // pushState. Een kale goBack() ging dan terug naar hetzelfde order met
      // een ander subtabblad (de pagina "glitchte" tussen de tabs) i.p.v.
      // terug naar de lijst of de brontab.
      const previousPageIndex = findOtherPageIndex(view.webContents.navigationHistory, -1);
      if (previousPageIndex !== -1) {
        internalNavigations.add(tabId);
        view.webContents.navigationHistory.goToIndex(previousPageIndex);
        return;
      }

      // Alleen als deze tab in de tabbalk zit (niet los, tabbalk niet uit):
      // de tab waar dit tabblad uit geopend is, en anders een tab waar de
      // lijst (target) al open staat. Niet de laatst bekeken tab: dat kon
      // van alles zijn. Deze tab blijft open.
      const inTabBar = !isDetachedTab(tabId) && !appSettings.tabBarDisabled;
      const parentTabId = parentTabs.get(tabId);
      if (inTabBar && parentTabId && tabs.has(parentTabId)) {
        switchTab(parentTabId, { recordHistory: false });
        return;
      }
      if (inTabBar && target && switchToOpenTab(target, tabId)) return;

      // Nergens om naar terug te gaan: de lijst hier openen, zonder herladen
      // als het kan. Zo werkt "terug" overal hetzelfde, ook als de brontab
      // al dicht is.
      if (target && isInternalUrl(target)) {
        view.webContents.executeJavaScript(`window.__electronGoInPage(${JSON.stringify(target)});`)
          .catch(() => { if (!view.webContents.isDestroyed()) view.webContents.loadURL(target); });
      }
      return;
    }

    if (message.startsWith('ELECTRON_URL_UPDATE:')) {
      if (isDetachedTab(tabId)) {
        sendDetachedState(tabId);
        return;
      }
      const newUrl = message.replace('ELECTRON_URL_UPDATE:', '');
      mainWindow.webContents.send('update-tab-url', { tabId, url: newUrl });
      return;
    }

    if (message.startsWith('ELECTRON_FOCUS_EDITABLE:')) {
      isFocusOnEditableField = message.endsWith('true');
      return;
    }

    if (message.startsWith('ELECTRON_BADGE:')) {
      updateNotificationCount(Number(message.slice('ELECTRON_BADGE:'.length)) || 0, tabId);
      return;
    }

    if (message.startsWith('ELECTRON_MODAL:')) {
      // Los venster heeft geen tabbalk om te dimmen.
      if (!isDetachedTab(tabId)) mainWindow.webContents.send('tab-modal', { tabId, color: message.slice('ELECTRON_MODAL:'.length) });
    }
  });
}

function createTab(url, makeActive = true, lockTab = false, parentTabId = null) {
  if (!isInternalUrl(url)) {
    openExternalSafe(url);
    return null;
  }

  // Tabbalk uit (één scherm): geen nieuwe tab, maar hier openen. Alleen een
  // preview via window.open() wordt nog wel een eigen tab (zie
  // setWindowOpenHandler); de tabbalk laat dan even de tabs zien.
  if (appSettings.tabBarDisabled && activeTabId && tabs.has(activeTabId) && !isDetachedTab(activeTabId)) {
    tabs.get(activeTabId).webContents.loadURL(url);
    return activeTabId;
  }

  const tabId = `tab-${++tabCounter}`;

  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.contentView.addChildView(view);
  // Alleen de actieve tab mag echte afmetingen krijgen; anders blijft een
  // niet-actieve tab (bv. een tweede starttab) zichtbaar bovenop de rest.
  view.setBounds(makeActive ? getViewBounds() : { x: 0, y: 0, width: 0, height: 0 });
  view.webContents.zoomFactor = appSettings.zoomFactor;
  view.setBackgroundColor(pageBackground());
  view.webContents.loadURL(url);

  attachNavigationHandlers(view, tabId);
  tabs.set(tabId, view);
  if (parentTabId && tabs.has(parentTabId)) parentTabs.set(tabId, parentTabId);

  if (lockTab) lockedTabs.add(tabId);

  // Laat de tabbar (index.html) weten dat er een nieuwe tab is
  mainWindow.webContents.send('tab-created', { tabId, url });

  if (lockTab) {
    mainWindow.webContents.send('tab-lock-changed', { tabId, locked: true });
  }

  if (makeActive) switchTab(tabId);
  return tabId;
}

// recordHistory=false wordt gebruikt bij "terug"-navigatie: dan mag de
// previousTabs-koppeling van de tab waar we heen gaan niet overschreven
// worden, anders wijzen twee tabs elkaar aan als "vorige tab" en pingpongt
// de terugknop voor altijd tussen diezelfde twee tabs heen en weer.
function switchTab(tabId, { recordHistory = true } = {}) {
  const target = tabs.get(tabId);
  if (!target) return;

  if (recordHistory && activeTabId && activeTabId !== tabId) {
    previousTabs.set(tabId, activeTabId);
  }

  // Laatste kans voor een voorbeeld van de tab die we verlaten (zolang die
  // nog in beeld is; lukt het niet, dan blijft het vorige voorbeeld staan).
  if (activeTabId && activeTabId !== tabId) captureTabThumbnail(activeTabId);

  for (const [id, view] of tabs) {
    if (id !== tabId) view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  const isRealSwitch = activeTabId && activeTabId !== tabId;
  activeTabId = tabId;
  // Gordijn vóór het tonen van de nieuwe tab, zodat die geen moment
  // half-opgebouwd in beeld komt.
  if (isRealSwitch) coverActiveView(target);
  applyActiveTabBounds();
  mainWindow.webContents.send('tab-switched', tabId);
  sendNavigationState(tabId);
}

// ---------- Overgangsgordijn bij wisselen/openen van tabs ----------
//
// Een tabpagina is een native laag; die kunnen we niet zelf laten faden, en
// een fade binnen de pagina zelf flitst eerst volledig in beeld voordat het
// script draait. Daarom een apart laagje (het "gordijn") in de
// achtergrondkleur van de app: dat gaat bij het wisselen meteen dekkend
// over de pagina, de tab wisselt en bouwt zich eronder op, en daarna faded
// het gordijn weg. Bij een nieuwe tab wacht het tot de pagina er staat.
//
// Het gordijn heeft als view-achtergrond de dekkende kleur; die wordt pas
// doorzichtig vlak voor het wegfaden. Zo is het ook dekkend als de pagina
// van het gordijn zelf nog geen nieuw beeld heeft getekend.
const CURTAIN_SWITCH_DELAY_MS = 60;
const CURTAIN_NEW_TAB_SETTLE_MS = 100;
const CURTAIN_NEW_TAB_MAX_WAIT_MS = 1500;
const CURTAIN_FADE_MS = 250;
// Wisselen tussen licht en donker: rustiger dan een tabwissel.
const CURTAIN_THEME_DELAY_MS = 120;
const CURTAIN_THEME_FADE_MS = 600;
const LIGHT_MODE_BACKGROUND = '#f6f7f9'; // = --background van de lichte app (210 17% 97%)
const CURTAIN_HTML = `<!doctype html><html><body style="margin:0;overflow:hidden">
<div id="c" style="position:fixed;inset:0"></div>
<script>
  const c = document.getElementById('c');
  window.cover = (color) => {
    c.getAnimations().forEach(a => a.cancel());
    c.style.background = color;
    c.style.opacity = '1';
  };
  window.reveal = (ms) => {
    c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
  };
</script></body></html>`;

let curtain = null;
let curtainTimer = null;
let curtainWaitingFor = null;

function curtainColor() {
  const themed = themedBackground();
  if (themed) return themed;
  if (darkActive()) return DARK_MODE_BACKGROUND;
  return softLightActive() ? SOFT_MODE_BACKGROUND : LIGHT_MODE_BACKGROUND;
}

function createCurtain() {
  curtain = new WebContentsView({
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  curtain.setBackgroundColor(curtainColor());
  curtain.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(CURTAIN_HTML)}`);
  mainWindow.contentView.addChildView(curtain);
  curtain.setBounds({ x: 0, y: 0, width: 0, height: 0 });
}

// color: kleur van het gordijn (standaard het huidige thema; bij omschakelen
// van licht/donker juist de oude kleur, zodat het nieuwe thema eronder
// tevoorschijn komt). revealDelay/fadeMs overschrijven de tabwissel-tijden.
function coverActiveView(view, { color = curtainColor(), revealDelay = CURTAIN_SWITCH_DELAY_MS, fadeMs = CURTAIN_FADE_MS, waitForLoad = true } = {}) {
  if (!curtain || curtain.webContents.isDestroyed()) return;
  // Tabinhoud is dan toch verborgen (zie applyActiveTabBounds).
  if (onboardingActive || settingsPanelOpen || changelogNoticeOpen || tabOverviewOpen || updateNoticeOpen) return;
  // Windows' "Animatie-effecten" uit -> gewoon direct wisselen.
  if (systemPreferences.getAnimationSettings().prefersReducedMotion) return;

  clearTimeout(curtainTimer);
  curtain.setBackgroundColor(color);
  curtain.webContents.executeJavaScript(`cover(${JSON.stringify(color)});`).catch(() => {});
  mainWindow.contentView.addChildView(curtain); // opnieuw toevoegen = bovenop leggen
  curtain.setBounds(getViewBounds());

  if (waitForLoad && view.webContents.isLoading()) {
    // Nieuwe of ladende tab: wegfaden zodra de pagina er staat (dom-ready in
    // attachNavigationHandlers), met een maximum zodat je nooit blijft wachten.
    curtainWaitingFor = view;
    curtainTimer = setTimeout(revealCurtain, CURTAIN_NEW_TAB_MAX_WAIT_MS);
  } else {
    curtainWaitingFor = null;
    curtainTimer = setTimeout(() => revealCurtain(fadeMs), revealDelay);
  }
}

function revealCurtain(fadeMs = CURTAIN_FADE_MS) {
  clearTimeout(curtainTimer);
  curtainWaitingFor = null;
  if (!curtain || curtain.webContents.isDestroyed()) return;
  curtain.setBackgroundColor('#00000000');
  curtain.webContents.executeJavaScript(`reveal(${fadeMs});`).catch(() => {});
  curtainTimer = setTimeout(() => {
    if (curtain.webContents.isDestroyed()) return;
    curtain.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    curtain.setBackgroundColor(curtainColor());
  }, fadeMs + 40);
}

// ---------- Hulp-venstertje onder de hulpknop in de tabbalk ----------
//
// De tabinhoud is een native laag die over de HTML-chrome heen tekent, dus
// een uitklapvenster in index.html zou eronder verdwijnen. Daarom een eigen
// kleine laag (zoals het gordijn) die bovenop alles komt, precies zo groot
// als het kaartje. Sluit bij een klik ernaast (blur), Esc of de knop opnieuw.
const HELP_POPOVER_WIDTH = 380;
const HELP_POPOVER_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root {
    --bg: #1e2127; --border: rgba(255, 255, 255, 0.1); --text: #f4f5f6;
    --text-2: #c5c9cf; --muted: #9da3ac; --accent: #ff5100;
    --shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }
  html.light {
    --bg: #ffffff; --border: #dfe2e6; --text: #16181d;
    --text-2: #32363c; --muted: #6b7178; --shadow: 0 12px 30px rgba(22, 24, 29, 0.16);
  }
  html.light.soft {
    --bg: #efefec; --border: #cdcdc8; --text: #2b2d31;
    --text-2: #45484e; --muted: #62666c;
  }
  html, body { margin: 0; background: transparent; overflow: hidden; }
  body { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif; padding: 0 12px 16px; }
  .card {
    position: relative; padding: 14px 16px 15px; background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow);
    animation: in 0.18s cubic-bezier(0.2, 0, 0, 1) both;
  }
  .card::before {
    content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 2px; background: var(--accent);
  }
  h1 { margin: 0 0 10px; font-size: 13.5px; font-weight: 600; }
  .item + .item { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
  .q { font-size: 12.5px; font-weight: 600; color: var(--text); }
  .a { margin-top: 3px; font-size: 12.5px; line-height: 1.45; color: var(--text-2); }
  .a b { color: var(--accent); font-weight: 600; }
  .hint { font-size: 11.5px; color: var(--muted); }
  @keyframes in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .who { margin-top: 6px; font-size: 12.5px; color: var(--text); }
  .who b { color: var(--accent); font-weight: 600; }
  .soon {
    margin-top: 12px; padding: 8px 10px; border-radius: 4px; font-size: 12px; line-height: 1.4;
    color: var(--text-2); background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .soon b { color: var(--accent); }
  .report-buttons { display: flex; gap: 8px; margin-top: 8px; }
  .report-buttons button {
    flex: 1; padding: 8px 10px; border-radius: 4px; border: 1px solid var(--border); cursor: pointer;
    background: transparent; color: var(--text); font: inherit; font-size: 12.5px; font-weight: 600;
  }
  .report-buttons button:hover { border-color: var(--accent); color: var(--accent); }
  [hidden] { display: none !important; }
</style></head><body><div class="card">
  <h1>Iets gevonden dat niet goed gaat?</h1>
  <div class="item">
    <div class="q">De app zelf doet raar</div>
    <div class="a">Het gaat om de "schil" om de pagina's heen: de balk met tabbladen en knoppen hier bovenin. Bijvoorbeeld: de app start of sluit niet goed, tabbladen of vensters doen vreemd, of een update lukt niet.</div>
    <div class="who" id="who-nick">Stuur <b>Nick</b> een bericht via Slack.</div>
    <div class="report-buttons" id="report" hidden>
      <button type="button" data-melding="bug">Bug melden</button>
      <button type="button" data-melding="idee">Idee insturen</button>
    </div>
  </div>
  <div class="item">
    <div class="q">Er klopt iets niet op een pagina, of je mist iets</div>
    <div class="a">Het gaat om alles wat ín het scherm staat, het Singeling-productiesysteem: orders, offertes, facturen, pakbonnen, klokken, dashboards en planning. Bijvoorbeeld: een foutmelding, een getal dat niet klopt, of een functie die je graag zou hebben.</div>
    <div class="who">Neem contact op met <b>Laurens</b>.</div>
  </div>
  <div class="item hint">Twijfel je? Vraag het gewoon aan een van beiden.</div>
  <div class="soon" id="soon"><b>Binnenkort:</b> dan kun je een probleem ook direct hier melden. Houd deze knop dus in de gaten!</div>
</div>
<style id="theme-style"></style>
<script>
  window.setTheme = (dark, soft, themeCss) => {
    document.documentElement.classList.toggle('light', !dark);
    document.documentElement.classList.toggle('soft', !!soft);
    document.documentElement.classList.toggle('themed', !!themeCss);
    document.getElementById('theme-style').textContent = themeCss || '';
  };
  window.measure = () => Math.ceil(document.body.getBoundingClientRect().height);
  // Meldknoppen (in plaats van "stuur Nick een bericht") alleen als deze
  // installatie een rapport-adres heeft; main.js vangt de klik op via
  // console-message (dit venstertje heeft geen preload).
  window.setReports = (on) => {
    document.getElementById('report').hidden = !on;
    document.getElementById('who-nick').hidden = on;
    document.getElementById('soon').hidden = on;
  };
  for (const button of document.querySelectorAll('[data-melding]')) {
    button.addEventListener('click', () => console.log('SG_MELDING:' + button.dataset.melding));
  }
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.blur(); });
</script></body></html>`;

let helpPopover = null;
let helpPopoverOpen = false;
let helpPopoverClosedAt = 0;

function ensureHelpPopover() {
  if (helpPopover && !helpPopover.webContents.isDestroyed()) return helpPopover;
  helpPopover = new WebContentsView({
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  helpPopover.setBackgroundColor('#00000000');
  helpPopover.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(HELP_POPOVER_HTML)}`);
  helpPopover.webContents.on('blur', () => closeHelpPopover());
  helpPopover.webContents.on('console-message', (event) => {
    const type = event.message.startsWith('SG_MELDING:') && event.message.slice('SG_MELDING:'.length);
    if (type === 'bug' || type === 'idee') {
      closeHelpPopover();
      openMeldingForm(type).catch(() => {});
    }
  });
  helpPopover.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closeHelpPopover();
  });
  return helpPopover;
}

function closeHelpPopover() {
  if (!helpPopoverOpen) return;
  helpPopoverOpen = false;
  helpPopoverClosedAt = Date.now();
  if (helpPopover && !helpPopover.webContents.isDestroyed()) {
    helpPopover.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('help-popover-changed', false);
}

// anchor: { right, bottom } van de hulpknop in de tabbalk (CSS-pixels).
async function openHelpPopover(anchor) {
  const view = ensureHelpPopover();
  if (view.webContents.isLoading()) await new Promise(resolve => view.webContents.once('did-finish-load', resolve));
  await view.webContents.executeJavaScript(`setTheme(${darkActive()}, ${softActive()}, ${JSON.stringify(themes.helpPopoverThemeCss(activeTheme()))}); setReports(${telemetry.available()});`).catch(() => {});
  const height = await view.webContents.executeJavaScript('measure();').catch(() => 200);
  const { width: windowWidth } = mainWindow.getContentBounds();
  // Rechts uitgelijnd op de knop (het kaartje heeft 12px marge rondom).
  const x = Math.max(0, Math.min(Math.round(anchor.right) - HELP_POPOVER_WIDTH + 12, windowWidth - HELP_POPOVER_WIDTH));
  mainWindow.contentView.addChildView(view); // opnieuw toevoegen = bovenop leggen
  view.setBounds({ x, y: Math.round(anchor.bottom) + 4, width: HELP_POPOVER_WIDTH, height });
  // Animatie opnieuw laten spelen.
  view.webContents.executeJavaScript(`(() => { const c = document.querySelector('.card'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; })();`).catch(() => {});
  helpPopoverOpen = true;
  view.webContents.focus();
  mainWindow.webContents.send('help-popover-changed', true);
}

// ---------- Meldscherm (bug of idee, via het kevertje) ----------
//
// Eerst een schermafbeelding van de pagina waar je was (straks ligt het
// meldscherm eroverheen), dan het scherm in de tabbalk openen. Versturen gaat
// via telemetry.submitMelding: lukt het niet, dan later vanzelf.
async function openMeldingForm(type) {
  const view = tabs.get(activeTabId);
  let screenshot = null;
  let page = '';
  if (view && !view.webContents.isDestroyed()) {
    try {
      const url = new URL(view.webContents.getURL());
      if (isInternalUrl(url.href)) page = (url.pathname + url.search).slice(0, 300);
      let image = await view.webContents.capturePage();
      if (image.getSize().width > 1400) image = image.resize({ width: 1400, quality: 'good' });
      for (const quality of [70, 50, 35]) {
        const data = `data:image/jpeg;base64,${image.toJPEG(quality).toString('base64')}`;
        if (data.length < 1400 * 1024) { screenshot = data; break; }
      }
    } catch {
      // Geen schermafbeelding: de melding kan ook zonder.
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-melding', { type, screenshot, page });
}

ipcMain.handle('send-melding', async (event, melding) => {
  if (event.sender !== mainWindow.webContents || !melding || typeof melding !== 'object') return 'invalid';
  const clean = {
    type: melding.type === 'idee' ? 'idee' : 'bug',
    title: String(melding.title || '').slice(0, 120),
    text: String(melding.text || '').slice(0, 5000),
    name: String(melding.name || '').slice(0, 80),
    page: String(melding.page || '').slice(0, 300),
    screenshot: typeof melding.screenshot === 'string' && melding.screenshot.startsWith('data:image/jpeg;base64,') ? melding.screenshot : null,
    theme: activeTheme(),
    dark: darkActive()
  };
  if (!clean.title.trim() && !clean.text.trim()) return 'invalid';
  return telemetry.submitMelding(clean);
});

ipcMain.on('toggle-help-popover', (event, anchor) => {
  if (event.sender !== mainWindow.webContents || !anchor) return;
  if (helpPopoverOpen) {
    closeHelpPopover();
    return;
  }
  // Klik op de knop terwijl het open was: de blur (klik buiten het
  // venstertje) heeft het net al gesloten; niet meteen weer openen.
  if (Date.now() - helpPopoverClosedAt < 300) return;
  openHelpPopover(anchor).catch(() => {});
});

// ---------- Voorbeeldjes voor het taboverzicht ----------
//
// Windows/Chromium kan geen screenshot maken van een tab die niet in beeld
// is (die staat op 0x0). Daarom maken we het voorbeeld van de actieve tab op
// drie momenten: kort na het laden, net vóór het wegwisselen en bij het
// openen van het overzicht. Bewust geen interval, zodat het niets kost
// zolang je gewoon werkt. Eén verkleind voorbeeld per tab, alleen in het
// geheugen; weg zodra de tab sluit. Een tab die nooit actief is geweest
// heeft nog geen voorbeeld.
const tabThumbnails = new Map(); // tabId -> data-URL (jpeg)
const THUMBNAIL_WIDTH = 480;

async function captureTabThumbnail(tabId) {
  const view = tabs.get(tabId);
  if (!view || view.webContents.isDestroyed() || view.getBounds().width === 0) return;
  try {
    const image = await view.webContents.capturePage();
    // Tab tijdens het vastleggen gesloten of losgekoppeld: niet meer bewaren.
    if (image.isEmpty() || tabs.get(tabId) !== view) return;
    const small = image.resize({ width: THUMBNAIL_WIDTH, quality: 'good' });
    tabThumbnails.set(tabId, `data:image/jpeg;base64,${small.toJPEG(75).toString('base64')}`);
  } catch {
    // Pagina net weg of nog niet getekend; volgende keer opnieuw.
  }
}

function closeTab(tabId) {
  const view = tabs.get(tabId);
  if (!view) return;

  // Beide defensief: een view/webContents die al kapot is (bv. na een
  // geblokkeerde externe navigatie of een gecrashte renderer) mag het sluiten
  // nooit laten crashen - dat is een main-process exception en gooit de HELE
  // app onderuit, niet alleen dit tabblad.
  removeTabFromBar(tabId, view);
  try {
    if (view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  } catch {
    // Al gesloten/vervallen.
  }
}

// Tab uit de tabbalk halen (sluiten of loskoppelen): alle administratie
// opruimen, ook verwijzingen van andere tabs ernaar (anders blijft hun
// terugknop naar een tab wijzen die er niet meer is), en als dit de actieve
// tab was een andere kiezen.
function removeTabFromBar(tabId, view) {
  // Zelfde volgorde als bij de terugknop: eerst terug naar de tab waaruit
  // deze geopend is, pas daarna naar de laatst bekeken tab.
  const fallbackTabId = parentTabs.get(tabId) || previousTabs.get(tabId);
  const wasActive = activeTabId === tabId;

  try {
    mainWindow.contentView.removeChildView(view);
  } catch {
    // Al losgekoppeld; niets meer te doen.
  }
  tabs.delete(tabId);
  tabThumbnails.delete(tabId);
  lockedTabs.delete(tabId);
  internalNavigations.delete(tabId);
  tabNotificationCounts.delete(tabId);
  telemetry.forgetTab(tabId);
  for (const map of [parentTabs, previousTabs]) {
    map.delete(tabId);
    for (const [id, otherTabId] of map) {
      if (otherTabId === tabId) map.delete(id);
    }
  }
  mainWindow.webContents.send('tab-closed', tabId);

  if (!wasActive) return;
  if (fallbackTabId && tabs.has(fallbackTabId)) {
    switchTab(fallbackTabId);
    return;
  }
  const remaining = [...tabs.keys()];
  if (remaining.length > 0) {
    switchTab(remaining[remaining.length - 1]);
  } else {
    activeTabId = null;
    createTab(START_URL);
  }
}

function closeOtherTabs(tabId) {
  if (!tabs.has(tabId)) return;

  for (const otherTabId of [...tabs.keys()]) {
    if (otherTabId !== tabId && !lockedTabs.has(otherTabId)) {
      closeTab(otherTabId);
    }
  }

  if (tabs.has(tabId)) switchTab(tabId);
}

// Een tab uit de tabbalk slepen en loslaten buiten de balk maakt er een eigen
// los Windows-venster van (dat je daarna net als elk ander venster naar een
// tweede scherm kunt verslepen). De tab verdwijnt daarbij volledig uit de
// tabbalk-administratie, alsof hij gesloten is - alleen blijft de webContents
// zelf in leven, nu in het nieuwe venster.
//
// Zo'n venster heeft geen eigen tabbalk, alleen een smalle balk met terug,
// vooruit, vernieuwen en de paginatitel (detached.html). Links en knoppen die
// normaal een nieuwe tab openen, openen daarom in het venster zelf. Alleen de
// expliciete keuze "... in nieuw tabblad" (rechtermuisknop) en knoppen die een
// leeg venster openen (bv. PDF-preview) gaan naar het hoofdvenster.
// Bewust: de app opent zelf nooit een los venster; dat doet alleen de
// gebruiker door een tab uit de balk te slepen.
const DETACHED_BAR_HEIGHT = TABBAR_HEIGHT;

function isDetachedTab(tabId) {
  return detachedWindows.has(tabId);
}

// Het venster waar een tab in zit (voor bv. rechtermuisknop-menu's).
function ownerWindowOf(tabId) {
  const detached = detachedWindows.get(tabId);
  return detached ? detached.window : mainWindow;
}

// Menu tonen in het venster van de tab. In het hoofdvenster op de
// opgegeven plek (zoals altijd); in een los venster bij de muis.
function popupTabMenu(menu, tabId, x, y) {
  if (isDetachedTab(tabId)) menu.popup({ window: ownerWindowOf(tabId) });
  else menu.popup({ window: mainWindow, x, y });
}

// Pad zonder query/hash (zoals bij isRealNavigation); null voor about:blank
// e.d. Gebruikt door switchToOpenTab en findOtherPageIndex.
function pagePath(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch {
    return null;
  }
}

// Staat deze pagina al in een andere tab open? Dan daarheen i.p.v. een
// dubbele tab. De tab waar de link vandaan komt telt niet mee.
// ---------- Anonieme gebruiksgegevens ----------
//
// Zie telemetry.js: welk thema, welke pagina-soorten, hoeveel CPU en geheugen.
// Alleen met telemetry.config.json naast de app (adres + sleutel van
// tools/rapport-server, niet in git) én de schakelaar in Instellingen aan.
const telemetryConfig = loadConfig(__dirname);
const telemetry = createTelemetry({
  dir: app.getPath('userData'),
  appVersion: app.getVersion(),
  config: telemetryConfig,
  isEnabled: () => appSettings.telemetry,
  // CPU: 100 = één hele kern. Het deel van de pagina waar je op staat komt
  // van het proces van die tab (kan ook andere tabs van dezelfde site omvatten).
  getMetrics: () => {
    const view = tabs.get(activeTabId);
    const pid = view && !view.webContents.isDestroyed() ? view.webContents.getOSProcessId() : -1;
    let totalCpu = 0;
    let activeCpu = 0;
    let memKb = 0;
    for (const metric of app.getAppMetrics()) {
      totalCpu += metric.cpu.percentCPUUsage;
      memKb += metric.memory.workingSetSize;
      if (metric.pid === pid) activeCpu += metric.cpu.percentCPUUsage;
    }
    const windowFocused = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused() && !mainWindow.isMinimized();
    // Voorgrond = een van de app-vensters (ook een los venster) heeft de focus.
    const anyFocused = !!BrowserWindow.getFocusedWindow() && !(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized());
    return { totalCpu, activeCpu, memMb: memKb / 1024, windowFocused, anyFocused };
  },
  getActive: () => {
    const view = tabs.get(activeTabId);
    return view && !view.webContents.isDestroyed() ? pageKind(view.webContents.getURL()) : null;
  },
  getSnapshot: () => ({
    theme: activeTheme(), dark: darkActive(), themeMode: appSettings.themeMode, soft: softActive(),
    zoom: Math.round(appSettings.zoomFactor * 100) / 100, tabBarDisabled: appSettings.tabBarDisabled,
    allLinksNewTab: appSettings.openAllLinksInNewTab, beta: appSettings.betaUpdates,
    notifications: appSettings.windowsNotifications, notClocked: appSettings.notClockedMode,
    tabs: tabs.size, detached: detachedWindows.size, startTabs: appSettings.startTabs.length,
    groups: appSettings.tabGroups.length, displays: screen.getAllDisplays().length
  })
});

// ---------- Meldingen (belletje van de webapp) ----------
//
// Elke tab meldt het getal bij het belletje (ELECTRON_BADGE). Alle tabs tonen
// dezelfde meldingen, dus de laatste melding telt voor het taakbalkicoon
// (index.html tekent het rondje, zie set-taskbar-badge).
// Een Windows-melding alleen als het getal in een tab zelf omhooggaat: niet
// als tabs even van elkaar verschillen (net gelezen in tab A, tab B meldt
// nog zijn oude getal), niet bij de eerste telling van een tab (start,
// nieuwe tab, herladen), en één keer als meerdere tabs dezelfde zien.
let notificationCount = 0;
const tabNotificationCounts = new Map(); // tabId -> laatste getal van die tab
let lastNotificationAt = 0;
let notificationTabId = null;
let lastNotification = null; // vasthouden, anders ruimt JS hem op en werkt klikken niet

function updateNotificationCount(count, tabId) {
  const tabPrevious = tabNotificationCounts.get(tabId);
  tabNotificationCounts.set(tabId, count);
  if (count !== notificationCount) {
    notificationCount = count;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('notification-count', count);
  }
  if (tabPrevious === undefined || count <= tabPrevious) return;
  if (Date.now() - lastNotificationAt < 10 * 1000) return;
  lastNotificationAt = Date.now();
  notificationTabId = tabId;
  const added = count - tabPrevious;
  const title = added === 1 ? 'Nieuwe melding' : `${added} nieuwe meldingen`;

  // Zit je in de app: een berichtje in de tab die je bekijkt, geen
  // Windows-melding (zie __electronShowNotice in het paginascript).
  const activeView = tabs.get(activeTabId);
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused() && activeView && !activeView.webContents.isDestroyed()) {
    activeView.webContents.executeJavaScript(`window.__electronShowNotice && window.__electronShowNotice(${JSON.stringify(title)});`).catch(() => {});
    return;
  }

  // Instellingen > Algemeen; het getal op de taakbalk blijft altijd.
  if (!appSettings.windowsNotifications || !Notification.isSupported()) return;
  const notification = new Notification({
    title: `${title} voor jou`,
    body: 'Klik om de Singeling App te openen.',
    icon: path.join(__dirname, 'assets/singeling-logo.png')
  });
  // Klikken: app naar voren, op de tab die de melding zag.
  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (tabs.has(notificationTabId)) switchTab(notificationTabId);
  });
  lastNotification = notification;
  notification.show();
}

ipcMain.on('set-taskbar-badge', (event, dataUrl) => {
  if (event.sender !== mainWindow.webContents || process.platform !== 'win32') return;
  const count = notificationCount || 0;
  mainWindow.setOverlayIcon(
    count > 0 && typeof dataUrl === 'string' ? nativeImage.createFromDataURL(dataUrl) : null,
    count > 0 ? `${count} ongelezen ${count === 1 ? 'melding' : 'meldingen'}` : ''
  );
});

function switchToOpenTab(url, fromTabId) {
  const path = pagePath(url);
  const match = path && [...tabs.entries()].find(([id, view]) =>
    id !== fromTabId && !isDetachedTab(id) && pagePath(view.webContents.getURL()) === path);
  if (!match) return null;
  switchTab(match[0]);
  return match[0];
}

// Een link of knop die normaal een nieuwe tab opent.
function openLinkFromTab(tabId, view, url) {
  if (!isInternalUrl(url)) {
    openExternalSafe(url);
  } else if (isDetachedTab(tabId) || appSettings.tabBarDisabled) {
    view.webContents.loadURL(url);
  } else {
    switchToOpenTab(url, tabId) || createTab(url, true, false, tabId);
  }
}

// Expliciet "in nieuw tabblad": vanuit een los venster in het hoofdvenster.
// reuseOpenTab=false bij openButtonInNewTab: die opent bewust dezelfde pagina.
function openInNewTabFromTab(tabId, url, reuseOpenTab = true) {
  const newTabId = (reuseOpenTab && switchToOpenTab(url, tabId)) || createTab(url, true, false, tabId);
  if (newTabId && isDetachedTab(tabId) && mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
  return newTabId;
}

function sendDetachedState(tabId) {
  const detached = detachedWindows.get(tabId);
  if (!detached || detached.window.isDestroyed() || detached.view.webContents.isDestroyed()) return;
  const { webContents } = detached.view;
  let canGoBack = false;
  let canGoForward = false;
  try {
    canGoBack = findOtherPageIndex(webContents.navigationHistory, -1) !== -1;
    canGoForward = findOtherPageIndex(webContents.navigationHistory, 1) !== -1;
  } catch {
    // Geschiedenis nog niet beschikbaar.
  }
  const title = webContents.getTitle();
  detached.window.setTitle(title ? `${title} - Singeling App` : 'Singeling App');
  detached.window.webContents.send('detached-state', { canGoBack, canGoForward, title });
}

// [tabId, { window, view }] van het losse venster waar de balk bij hoort.
function detachedEntryForBar(sender) {
  return [...detachedWindows.entries()]
    .find(([, detached]) => !detached.window.isDestroyed() && detached.window.webContents === sender);
}

ipcMain.on('detached-window-control', (event, action) => {
  const entry = detachedEntryForBar(event.sender);
  if (!entry) return;
  const { window: detachedWindow } = entry[1];
  if (action === 'minimize') detachedWindow.minimize();
  else if (action === 'toggle-maximize') detachedWindow.isMaximized() ? detachedWindow.unmaximize() : detachedWindow.maximize();
  else if (action === 'close') detachedWindow.close();
});

ipcMain.on('detached-navigate', (event, action) => {
  const entry = detachedEntryForBar(event.sender);
  if (!entry) return;
  const [tabId, { view }] = entry;
  const history = view.webContents.navigationHistory;
  const index = action === 'back' ? findOtherPageIndex(history, -1)
    : action === 'forward' ? findOtherPageIndex(history, 1) : -1;
  if (index !== -1) {
    internalNavigations.add(tabId);
    history.goToIndex(index);
  } else if (action === 'reload') {
    view.webContents.reload();
  }
});

function detachTab(tabId, screenX, screenY) {
  const view = tabs.get(tabId);
  if (!view) return;

  removeTabFromBar(tabId, view);
  createDetachedWindow(view, tabId, screenX, screenY);
}

function createDetachedWindow(view, tabId, screenX, screenY) {
  // Op het scherm plaatsen waar de muis zich bevindt (kan dus al het tweede
  // scherm zijn als de gebruiker daar naartoe gesleept heeft), losjes
  // gecentreerd rond het loslaatpunt.
  const width = 1000;
  const height = 700;
  const display = screen.getDisplayNearestPoint({ x: screenX, y: screenY });
  const x = Math.round(Math.min(
    Math.max(screenX - width / 2, display.workArea.x),
    display.workArea.x + display.workArea.width - width
  ));
  const y = Math.round(Math.min(
    Math.max(screenY - 20, display.workArea.y),
    display.workArea.y + display.workArea.height - height
  ));

  const detachedWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    title: 'Singeling App',
    icon: path.join(__dirname, 'assets/icon.ico'),
    autoHideMenuBar: true,
    // Geen Windows-titelbalk: de balk (detached.html) is de titelbalk, met
    // dezelfde eigen vensterknoppen als het hoofdvenster.
    titleBarStyle: 'hidden',
    backgroundColor: detachedBarColor(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'detached-preload.js')
    }
  });

  // Het venster zelf toont de smalle balk (detached.html); de pagina komt
  // daaronder.
  detachedWindow.on('page-title-updated', (event) => event.preventDefault());
  stayOnOwnPage(detachedWindow.webContents);
  detachedWindow.loadFile(path.join(__dirname, 'detached.html'), {
    query: { theme: darkActive() ? 'dark' : 'light', soft: softActive() ? '1' : '0' }
  });
  detachedWindow.webContents.once('did-finish-load', () => {
    sendNavigationState(tabId);
    detachedWindow.webContents.send('detached-chrome-theme', themes.chromeThemeCss(activeTheme()));
  });

  detachedWindow.contentView.addChildView(view);
  const layoutView = () => {
    const bounds = detachedWindow.getContentBounds();
    view.setBounds({
      x: 0,
      y: DETACHED_BAR_HEIGHT,
      width: bounds.width,
      height: Math.max(0, bounds.height - DETACHED_BAR_HEIGHT)
    });
  };
  layoutView();
  detachedWindow.on('resize', layoutView);
  const sendMaximized = () => {
    if (!detachedWindow.isDestroyed()) detachedWindow.webContents.send('detached-maximized', detachedWindow.isMaximized());
  };
  detachedWindow.on('maximize', sendMaximized);
  detachedWindow.on('unmaximize', sendMaximized);

  detachedWindows.set(tabId, { window: detachedWindow, view });
  // Vanaf nu blijven links en knoppen in dit venster (zie
  // __electronDetached in de pagina-scripts en openLinkFromTab).
  view.webContents.executeJavaScript('window.__electronDetached = true;').catch(() => {});

  detachedWindow.on('closed', () => {
    detachedWindows.delete(tabId);
    try {
      if (view.webContents && !view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    } catch {
      // Al vervallen.
    }
  });
}

// IPC vanuit index.html (tabbar UI)
ipcMain.on('switch-tab', (event, tabId) => {
  if (event.sender === mainWindow.webContents) switchTab(tabId);
});
ipcMain.on('close-tab', (event, tabId) => {
  if (event.sender === mainWindow.webContents) closeTab(tabId);
});
ipcMain.on('detach-tab', (event, { tabId, screenX, screenY }) => {
  if (event.sender !== mainWindow.webContents || !tabs.has(tabId)) return;
  detachTab(tabId, screenX, screenY);
});
ipcMain.on('request-new-tab', (event, url) => {
  if (event.sender === mainWindow.webContents) createTab(url || START_URL);
});

// ---------- Link invoeren (knop in de tabbalk) ----------
//
// Een zelf geplakte/getypte link mag alleen naar het productiesysteem zelf.
// Bewust een eigen kanaal: createTab() stuurt externe links naar de browser,
// maar hier wordt alles buiten ons domein gewoon geweigerd.
// Toegestaan: een volledige link ("https://snglng.lovable.app/quotations/1"),
// zonder https:// ("snglng.lovable.app/quotations/1") of alleen het pad
// ("quotations/1" of "/quotations/1").
function normalizeEnteredLink(text) {
  let value = String(text || '').trim();
  if (!value || value.length > 2000) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const looksLikeHost = /^[^/\s?#]+\.[^/\s?#]+(\/|$|\?|#)/.test(value);
  if (!hasScheme && !looksLikeHost) {
    value = new URL(value.replace(/^\/*/, '/'), START_URL).href; // alleen een pad
  } else if (!hasScheme) {
    value = `https://${value}`;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !isInternalUrl(url.href)) return null;
  return url.href;
}

ipcMain.handle('open-entered-link', (event, text) => {
  if (event.sender !== mainWindow.webContents) return { ok: false };
  const url = normalizeEnteredLink(text);
  if (!url) return { ok: false };
  switchToOpenTab(url, null) || createTab(url, true, false, activeTabId);
  return { ok: true, url };
});
ipcMain.on('navigate-active-tab', (event, action) => {
  if (event.sender !== mainWindow.webContents || !activeTabId) return;

  const view = tabs.get(activeTabId);
  if (!view) return;

  // Net als ELECTRON_BACK_BUTTON: sla regels op hetzelfde pad over (zie
  // findOtherPageIndex), anders kan de orderpagina in een tab-lus schieten.
  const history = view.webContents.navigationHistory;
  const backIndex = action === 'back' ? findOtherPageIndex(history, -1) : -1;
  const forwardIndex = action === 'forward' ? findOtherPageIndex(history, 1) : -1;

  if (backIndex !== -1) {
    internalNavigations.add(activeTabId);
    history.goToIndex(backIndex);
  } else if (action === 'back' && (parentTabs.has(activeTabId) || previousTabs.has(activeTabId))) {
    switchTab(parentTabs.get(activeTabId) || previousTabs.get(activeTabId), { recordHistory: false });
  } else if (forwardIndex !== -1) {
    internalNavigations.add(activeTabId);
    history.goToIndex(forwardIndex);
  } else if (action === 'reload') {
    view.webContents.reload();
  }
});
ipcMain.on('show-tab-context-menu', (event, { tabId, x, y }) => {
  if (event.sender !== mainWindow.webContents || !tabs.has(tabId)) return;

  const locked = lockedTabs.has(tabId);
  const currentUrl = tabs.get(tabId).webContents.getURL();
  const isStartTab = appSettings.startTabs.some(tab => tab.url === currentUrl);
  // Alleen app-pagina's bewaren (geen about:blank van een PDF-voorbeeld e.d.).
  const canSave = isInternalUrl(currentUrl);

  const groupSubmenu = appSettings.tabGroups.map(group => ({
    label: group.name,
    type: 'checkbox',
    checked: group.urls.includes(currentUrl),
    click: () => {
      const urlIndex = group.urls.indexOf(currentUrl);
      if (urlIndex !== -1) group.urls.splice(urlIndex, 1);
      else group.urls.push(currentUrl);
      saveSettings();
      mainWindow.webContents.send('tab-groups-changed', appSettings.tabGroups);
    }
  }));
  if (groupSubmenu.length > 0) groupSubmenu.push({ type: 'separator' });
  groupSubmenu.push({
    label: '+ Nieuwe tabgroup',
    click: () => {
      const newGroup = {
        id: `group-${Date.now()}`,
        name: `Tabgroep ${appSettings.tabGroups.length + 1}`,
        urls: [currentUrl]
      };
      appSettings.tabGroups.push(newGroup);
      saveSettings();
      mainWindow.webContents.send('tab-groups-changed', appSettings.tabGroups);
      // Tabgroepen beheer je in het taboverzicht; open dat met de naam van de
      // nieuwe groep klaar om direct over te typen.
      mainWindow.webContents.send('open-tab-overview', { focusGroupId: newGroup.id });
    }
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'Sluit alle behalve deze',
      click: () => closeOtherTabs(tabId)
    },
    {
      label: locked ? 'Tab ontgrendelen' : 'Tab vergrendelen',
      click: () => {
        const nextLocked = !lockedTabs.has(tabId);
        if (nextLocked) lockedTabs.add(tabId);
        else lockedTabs.delete(tabId);
        tabs.get(tabId).webContents.executeJavaScript(`window.__electronTabLocked = ${nextLocked};`).catch(() => {});
        mainWindow.webContents.send('tab-lock-changed', { tabId, locked: nextLocked });
      }
    },
    {
      label: 'Openen bij opstarten',
      type: 'checkbox',
      checked: isStartTab,
      enabled: canSave || isStartTab,
      click: () => {
        const index = appSettings.startTabs.findIndex(tab => tab.url === currentUrl);
        if (index !== -1) {
          appSettings.startTabs.splice(index, 1);
        } else {
          appSettings.startTabs.push({ url: currentUrl, locked: lockedTabs.has(tabId) });
        }
        saveSettings();
        mainWindow.webContents.send('start-tabs-changed', appSettings.startTabs);
      }
    },
    {
      label: 'Toevoegen aan tabgroup',
      enabled: canSave,
      submenu: groupSubmenu
    }
  ]);
  menu.popup({ window: mainWindow, x, y });
});
ipcMain.on('zoom-in', (event) => {
  if (event.sender === mainWindow.webContents) adjustZoom('in');
});
ipcMain.on('zoom-out', (event) => {
  if (event.sender === mainWindow.webContents) adjustZoom('out');
});
ipcMain.on('zoom-reset', (event) => {
  if (event.sender === mainWindow.webContents) setZoomFactor(DEFAULT_ZOOM);
});
ipcMain.on('remove-start-tab', (event, index) => {
  if (event.sender !== mainWindow.webContents) return;
  if (index < 0 || index >= appSettings.startTabs.length) return;
  appSettings.startTabs.splice(index, 1);
  saveSettings();
  mainWindow.webContents.send('start-tabs-changed', appSettings.startTabs);
});
ipcMain.on('set-start-tab-locked', (event, { index, locked }) => {
  if (event.sender !== mainWindow.webContents) return;
  if (index < 0 || index >= appSettings.startTabs.length) return;
  appSettings.startTabs[index].locked = !!locked;
  saveSettings();
  mainWindow.webContents.send('start-tabs-changed', appSettings.startTabs);
});
ipcMain.handle('get-changelog', (event) => {
  if (event.sender !== mainWindow.webContents) return '';
  try {
    return fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf-8');
  } catch (error) {
    return `Changelog kon niet worden geladen: ${error.message}`;
  }
});
// Eigen vensterknoppen in de tabbalk (CUSTOM_WINDOW_CONTROLS).
ipcMain.on('window-control', (event, action) => {
  if (event.sender !== mainWindow.webContents) return;
  if (action === 'minimize') minimizeWithAnimation();
  else if (action === 'toggle-maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
});

ipcMain.handle('get-settings', (event) => {
  if (event.sender !== mainWindow.webContents) return null;
  return {
    zoomFactor: appSettings.zoomFactor,
    startTabs: appSettings.startTabs,
    tabGroups: appSettings.tabGroups,
    openAllLinksInNewTab: appSettings.openAllLinksInNewTab,
    tabBarDisabled: appSettings.tabBarDisabled,
    showOnboarding: appSettings.showOnboarding,
    // Eerste start na een update (niet na een nieuwe installatie): dan is de
    // korte "Nieuw in deze versie"-rondleiding verplicht (welkomstscherm in
    // index.html). lastSeenChangelogVersion wordt pas bijgewerkt na "Start"
    // (maybeShowChangelogNotice).
    // Instellingen > Debug alleen bij npm start en in een bètaversie.
    debugAvailable: DEBUG_AVAILABLE,
    debugPort: !!appSettings.debugPort,
    debugPortNumber: DEBUG_PORT,
    // Eerste start na een installatie: de volledige uitleg is dan verplicht.
    firstStartAfterInstall: appSettings.lastSeenChangelogVersion === null,
    firstStartAfterUpdate: appSettings.lastSeenChangelogVersion !== null
      && appSettings.lastSeenChangelogVersion !== app.getVersion(),
    blockCtrlB: appSettings.blockCtrlB,
    windowsNotifications: appSettings.windowsNotifications,
    telemetry: appSettings.telemetry,
    telemetryAvailable: !!telemetryConfig,
    debugUnlocked: appSettings.debugUnlocked,
    notClockedMode: appSettings.notClockedMode,
    // Keuzescherm (thema + klokmelding) al gezien? Zonder dit veld dacht
    // index.html bij elke start van niet en kwam het scherm steeds terug.
    preferencesChosen: appSettings.preferencesChosen,
    setupVersion: appSettings.setupVersion,
    darkMode: appSettings.darkMode,
    softColors: appSettings.softColors,
    themeMode: appSettings.themeMode,
    themeTimes: appSettings.themeTimes,
    themeSunOffset: appSettings.themeSunOffset,
    betaUpdates: appSettings.betaUpdates,
    appTheme: appSettings.appTheme,
    themes: themes.themeCatalog(),
    previewFontCss: themes.previewFontCss(),
    themesAvailable: themesAvailable(),
    softSupported: themes.supportsSoft(activeTheme()),
    originalTheme: themes.isOriginal(activeTheme()),
    fixedMode: themes.fixedMode(activeTheme()),
    chromeThemeCss: themes.chromeThemeCss(activeTheme()),
    customWindowControls: CUSTOM_WINDOW_CONTROLS,
    appVersion: app.getVersion(),
    windowMaximized: mainWindow.isMaximized(),
    updateVersion: updateAvailableInfo ? updateAvailableInfo.version : null
  };
});
// Oogcomfort: zachtere kleuren aan/uit. Net als bij licht/donker eerst het
// gordijn in de oude kleur, zodat de nieuwe kleuren er rustig onder vandaan
// komen.
// Kleurenthema (themes.js). Zelfde overgang als bij oogcomfort.
ipcMain.on('set-app-theme', (event, id) => {
  if (event.sender !== mainWindow.webContents || !themes.isTheme(id) || !themesAvailable()) return;
  if (id === appSettings.appTheme) return;
  const previousColor = curtainColor();
  appSettings.appTheme = id;
  saveSettings();
  applyThemeChange(previousColor);
});

function detachedBarColor() {
  return themes.themeBarColor(activeTheme(), darkActive(), softActive())
    || (darkActive() ? '#0f1115' : '#ffffff');
}

// De chrome-kleuren van het thema naar de tabbalk (index.html), plus of de
// keuze zichtbaar is.
function sendChromeTheme() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('chrome-theme-changed', {
    appTheme: appSettings.appTheme,
    themesAvailable: themesAvailable(),
    softSupported: themes.supportsSoft(activeTheme()),
    originalTheme: themes.isOriginal(activeTheme()),
    fixedMode: themes.fixedMode(activeTheme()),
    css: themes.chromeThemeCss(activeTheme())
  });
}

function applyThemeChange(previousColor) {
  if (activeTabId && tabs.has(activeTabId)) {
    coverActiveView(tabs.get(activeTabId), {
      color: previousColor,
      revealDelay: CURTAIN_THEME_DELAY_MS,
      fadeMs: CURTAIN_THEME_FADE_MS,
      waitForLoad: false
    });
  }
  for (const view of tabs.values()) {
    insertThemeCss(view);
    applyDarkMode(view);
    applySolidTints(view);
  }
  sendChromeTheme();
  const css = themes.chromeThemeCss(activeTheme());
  for (const detached of detachedWindows.values()) {
    insertThemeCss(detached.view);
    applyDarkMode(detached.view);
    applySolidTints(detached.view);
    if (!detached.window.isDestroyed()) {
      detached.window.setBackgroundColor(detachedBarColor());
      detached.window.webContents.send('detached-chrome-theme', css);
      detached.window.webContents.send('detached-soft', softActive());
      detached.window.webContents.send('detached-theme', darkActive());
    }
  }
}

ipcMain.on('set-soft-colors', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  const previousColor = curtainColor();
  appSettings.softColors = !!value;
  saveSettings();
  if (activeTabId && tabs.has(activeTabId)) {
    coverActiveView(tabs.get(activeTabId), {
      color: previousColor,
      revealDelay: CURTAIN_THEME_DELAY_MS,
      fadeMs: CURTAIN_THEME_FADE_MS,
      waitForLoad: false
    });
  }
  for (const view of tabs.values()) applyDarkMode(view);
  for (const detached of detachedWindows.values()) {
    applyDarkMode(detached.view);
    if (!detached.window.isDestroyed()) {
      detached.window.setBackgroundColor(detachedBarColor());
      detached.window.webContents.send('detached-soft', softActive());
    }
  }
});
ipcMain.on('set-beta-updates', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  const previousTheme = activeTheme();
  const previousColor = curtainColor();
  appSettings.betaUpdates = !!value;
  saveSettings();
  // Thema's zijn nog bèta (zie themesAvailable): het gekozen thema gaat aan
  // of uit, en de keuze in de instellingen verschijnt of verdwijnt.
  if (activeTheme() !== previousTheme) applyThemeChange(previousColor);
  else sendChromeTheme();
  if (!app.isPackaged) return;
  applyUpdateChannel();
  // Meteen stil opnieuw kijken, zodat het update-bolletje klopt met de
  // nieuwe instelling (bv. een bèta die nu wel/niet meer telt).
  checkForUpdatesInBackground();
});
ipcMain.on('set-block-ctrl-b', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.blockCtrlB = !!value;
  saveSettings();
});
ipcMain.on('set-windows-notifications', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.windowsNotifications = !!value;
  saveSettings();
});
// ---------- Beheer: rapport-server in de app ----------
//
// Instellingen > Debug > Beheer. Ontgrendelen met een eigen wachtwoord: de
// eerste keer kies je het, daarna alleen nog de scrypt-hash in settings.json
// (nooit het wachtwoord zelf, en niets in de code). Ingelogd blijft ingelogd
// na een herstart, tot je vergrendelt. Wachtwoord vergeten: adminPasswordHash
// in settings.json leegmaken.
//
// De server (rapport/server.js) gebruikt als sleutel voor het insturen die
// uit telemetry.config.json, dezelfde die de apps van collega's hebben. De
// leessleutel voor het overzicht maken we bij elke start opnieuw aan en
// staat alleen in het geheugen.
const RAPPORT_VIEW_KEY = crypto.randomBytes(24).toString('hex');
const RAPPORT_DATA_DIR = path.join(app.getPath('userData'), 'rapport-data');
let rapportServer = null;
let rapportError = '';

function rapportPort() {
  try { return Number(new URL(telemetryConfig.url).port) || 8787; } catch { return 8787; }
}

// Meldingen die op schijf staan, ook als de server uit staat.
function countStoredMeldingen() {
  try { return fs.readdirSync(path.join(RAPPORT_DATA_DIR, 'meldingen')).filter(name => name.endsWith('.json')).length; } catch { return 0; }
}

// Nieuwe meldingen: open (niet gearchiveerd) en binnengekomen na het laatste
// keer kijken. Alleen terwijl de server draait (en je bent ingelogd): zo ziet
// niemand anders dit balletje, want alleen bij jou draait de server.
function unseenMeldingen() {
  if (!appSettings.adminUnlocked || !rapportServer || !rapportServer.running()) return 0;
  const dir = path.join(RAPPORT_DATA_DIR, 'meldingen');
  // Bestandsnamen beginnen met het tijdstip van binnenkomst (zelfde opmaak,
  // dus op naam te vergelijken): alleen wat na het laatste kijken kwam hoeft
  // gelezen te worden, hoeveel meldingen er ook in totaal zijn.
  const since = new Date(appSettings.rapportSeenAt).toISOString().replace(/[:.]/g, '-');
  let count = 0;
  try {
    for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json') && n > since)) {
      if (!JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).archivedAt) count += 1;
    }
  } catch { /* geen map of een kapot bestand: tel gewoon wat er is */ }
  return count;
}

function sendRapportBadge() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('rapport-badge', unseenMeldingen());
}

function rapportStatus() {
  const running = !!rapportServer && rapportServer.running();
  return {
    unlocked: appSettings.adminUnlocked,
    hasPassword: !!appSettings.adminPasswordHash,
    available: !!telemetryConfig,
    running,
    autostart: appSettings.rapportServerAutostart,
    lockOnRestart: appSettings.adminLockOnRestart,
    stored: countStoredMeldingen(),
    unseen: unseenMeldingen(),
    address: `${os.hostname()}:${rapportPort()}`,
    dataDir: RAPPORT_DATA_DIR,
    error: rapportError,
    dashboardUrl: running ? `http://localhost:${rapportPort()}/?key=${RAPPORT_VIEW_KEY}` : null
  };
}

async function startRapportServer() {
  if (!telemetryConfig) {
    rapportError = 'Deze installatie heeft geen telemetry.config.json, dus geen sleutel voor de server.';
    return;
  }
  try {
    rapportServer = rapportServer || createRapportServer({
      token: telemetryConfig.token, viewToken: RAPPORT_VIEW_KEY, port: rapportPort(), dataDir: RAPPORT_DATA_DIR,
      log: (line) => console.log(`[Rapport] ${line}`),
      onMelding: sendRapportBadge
    });
    await rapportServer.start();
    rapportError = '';
    sendRapportBadge();
  } catch (error) {
    rapportError = error && error.code === 'EADDRINUSE'
      ? `Poort ${rapportPort()} is al in gebruik. Draait de losse server (npm run rapport) nog?`
      : `Starten lukt niet: ${error && error.message}`;
  }
}

async function stopRapportServer() {
  if (rapportServer) await rapportServer.stop();
  sendRapportBadge(); // server uit: geen balletje
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  return `${salt.toString('hex')}:${crypto.scryptSync(password, salt, 32).toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

ipcMain.handle('admin-status', (event) => (event.sender === mainWindow.webContents ? rapportStatus() : null));

ipcMain.handle('admin-unlock', (event, password) => {
  if (event.sender !== mainWindow.webContents || typeof password !== 'string') return { ok: false };
  if (!appSettings.adminPasswordHash) {
    if (password.length < 6) return { ok: false, reason: 'kort' };
    appSettings.adminPasswordHash = hashPassword(password); // eerste keer: dit wordt het wachtwoord
  } else if (!passwordMatches(password, appSettings.adminPasswordHash)) {
    return { ok: false, reason: 'fout' };
  }
  appSettings.adminUnlocked = true;
  saveSettings();
  return { ok: true, status: rapportStatus() };
});


ipcMain.handle('rapport-server', async (event, action) => {
  if (event.sender !== mainWindow.webContents || !appSettings.adminUnlocked) return null;
  if (action === 'seen') {
    appSettings.rapportSeenAt = Date.now();
    saveSettings();
    sendRapportBadge();
  }
  if (action === 'start') await startRapportServer();
  if (action === 'stop') await stopRapportServer();
  if (action === 'lock-on' || action === 'lock-off') {
    appSettings.adminLockOnRestart = action === 'lock-on';
    saveSettings();
  }
  if (action === 'autostart-on' || action === 'autostart-off') {
    appSettings.rapportServerAutostart = action === 'autostart-on';
    saveSettings();
  }
  return rapportStatus();
});

// Gewone versie: Debug pas zichtbaar na Ctrl+Shift+Alt+D (index.html); de
// app onthoudt dat. De debugpoort en testschermen blijven alleen in bèta/npm start.
ipcMain.on('unlock-debug', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.debugUnlocked = true;
  saveSettings();
});

ipcMain.on('set-telemetry', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.telemetry = !!value;
  saveSettings();
});
ipcMain.on('set-not-clocked-mode', (event, mode) => {
  if (event.sender !== mainWindow.webContents || !NOT_CLOCKED_MODES.includes(mode)) return;
  appSettings.notClockedMode = mode;
  saveSettings();
  // Direct effect voor al open tabs (ook in losse vensters), zonder herladen.
  for (const view of tabs.values()) applyPageTweaks(view);
  for (const { view } of detachedWindows.values()) applyPageTweaks(view);
});
// ---------- Licht/donker automatisch ----------
//
// Naast handmatig (de knop in de tabbalk) kan het thema automatisch wisselen:
//   - 'systeem': volgt de Windows-instelling (licht/donker voor apps)
//   - 'tijden':  donker tussen twee vaste tijden (bv. 18:00 - 07:00)
//   - 'zon':     donker na zonsondergang tot zonsopkomst, met voor licht en
//                donker elk een eigen verschuiving in minuten. Zon op/onder
//                wordt hier berekend
//                voor Singeling in Wormerveer (geen internet nodig).
// De knop in de tabbalk werkt dan als tijdelijke uitzondering: die geldt tot
// het volgende omslagmoment (of tot Windows wisselt), daarna neemt de
// automatische stand het weer over.
const SUN_LOCATION = { lat: 52.49, lon: 4.79 }; // Wormerveer
let themeOverride = null; // { dark, until: Date | null }

// Zonsopkomst/-ondergang (UTC-tijdstippen als Date) op de kalenderdag van
// "date" ("Almanac for Computers"-methode, nauwkeurig tot op een paar minuten).
function sunTimes(date, { lat, lon } = SUN_LOCATION) {
  const rad = Math.PI / 180;
  const dayStart = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfYear = Math.round((dayStart - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
  const lngHour = lon / 15;
  const calc = (rising) => {
    const t = dayOfYear + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    const L = ((M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634) % 360 + 360) % 360;
    let RA = ((Math.atan(0.91764 * Math.tan(L * rad)) / rad) % 360 + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null; // poolnacht/-dag (niet in Nederland)
    const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const UT = (((H + RA - 0.06571 * t - 6.622 - lngHour) % 24) + 24) % 24;
    return new Date(dayStart + UT * 3600000);
  };
  return { sunrise: calc(true), sunset: calc(false) };
}

function atTime(date, hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Wanneer licht en donker vandaag (en morgen) beginnen volgens de instelling.
function themeMoments(now) {
  if (appSettings.themeMode === 'tijden') {
    const moments = [];
    for (const day of [0, 1]) {
      const base = addDays(now, day);
      moments.push({ at: atTime(base, appSettings.themeTimes.light), dark: false });
      moments.push({ at: atTime(base, appSettings.themeTimes.dark), dark: true });
    }
    return moments;
  }
  const lightMs = appSettings.themeSunOffset.light * 60000;
  const darkMs = appSettings.themeSunOffset.dark * 60000;
  const moments = [];
  for (const day of [-1, 0, 1]) {
    const { sunrise, sunset } = sunTimes(addDays(now, day));
    if (sunrise) moments.push({ at: new Date(sunrise.getTime() + lightMs), dark: false });
    if (sunset) moments.push({ at: new Date(sunset.getTime() + darkMs), dark: true });
  }
  return moments;
}

// { dark, nextChange } volgens de automatische stand, of null bij handmatig.
function scheduledTheme(now = new Date()) {
  if (appSettings.themeMode === 'handmatig') return null;
  if (appSettings.themeMode === 'systeem') return { dark: nativeTheme.shouldUseDarkColors, nextChange: null };
  const moments = themeMoments(now).sort((a, b) => a.at - b.at);
  // Stand van het laatste moment vóór nu; bij 'tijden' kan dat gisteren zijn
  // (bv. donker vanaf 18:00 en het is nu 03:00): dan geldt het laatste van
  // vandaag teruggerekend, d.w.z. de stand van het laatste moment van de dag.
  const past = moments.filter(moment => moment.at <= now);
  const current = past.length > 0 ? past[past.length - 1] : moments[moments.length - 1];
  const next = moments.find(moment => moment.at > now) || null;
  return { dark: current.dark, nextChange: next ? next.at : null };
}

// Thema daadwerkelijk omzetten (met het gordijn), en de tabbalk bijwerken.
function setDarkModeValue(value) {
  if (!!value === appSettings.darkMode) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    appSettings.darkMode = !!value;
    saveSettings();
    return;
  }
  applyDarkModeChange(!!value);
  mainWindow.webContents.send('dark-mode-changed', appSettings.darkMode);
}

// Controle (elke minuut, bij een wijziging van de instelling en als Windows
// van thema wisselt): zet het thema op de automatische stand, tenzij de
// knop in de tabbalk tijdelijk iets anders heeft gekozen.
function applyThemeSchedule() {
  // Tijdens de instelassistent (en de rondleiding) wisselt de app niet
  // vanzelf: je kiest daar zelf, en na afloop geldt de automatische stand
  // alsnog (onboarding-ended).
  if (onboardingActive) return;
  const now = new Date();
  const scheduled = scheduledTheme(now);
  if (!scheduled) {
    themeOverride = null;
    return;
  }
  if (themeOverride && themeOverride.until && now >= themeOverride.until) themeOverride = null;
  setDarkModeValue(themeOverride ? themeOverride.dark : scheduled.dark);
}

// Bij het opstarten (vóór het venster er is): meteen het juiste thema, zonder
// animatie. Daarna elke minuut controleren.
let themeScheduleStarted = false;

function startThemeSchedule() {
  if (themeScheduleStarted) return;
  themeScheduleStarted = true;
  const scheduled = scheduledTheme();
  if (scheduled && scheduled.dark !== appSettings.darkMode) {
    appSettings.darkMode = scheduled.dark;
    saveSettings();
  }
  setInterval(applyThemeSchedule, 60 * 1000);
  nativeTheme.on('updated', () => {
    if (appSettings.themeMode !== 'systeem') return;
    themeOverride = null; // Windows wisselt: dat telt weer
    applyThemeSchedule();
  });
}

function formatClock(date) {
  return date ? date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '–';
}

// Voor het instellingenscherm: wanneer het vandaag licht/donker wordt.
function themeScheduleInfo() {
  const { sunrise, sunset } = sunTimes(new Date());
  const { light, dark } = appSettings.themeSunOffset;
  const scheduled = scheduledTheme();
  return {
    sunrise: formatClock(sunrise),
    sunset: formatClock(sunset),
    lightFrom: formatClock(sunrise && new Date(sunrise.getTime() + light * 60000)),
    darkFrom: formatClock(sunset && new Date(sunset.getTime() + dark * 60000)),
    nextChange: scheduled && scheduled.nextChange ? formatClock(scheduled.nextChange) : null,
    overridden: !!themeOverride
  };
}

ipcMain.handle('get-theme-schedule-info', (event) => {
  if (event.sender !== mainWindow.webContents) return null;
  return themeScheduleInfo();
});

ipcMain.on('set-theme-schedule', (event, { mode, times, sunOffset } = {}) => {
  if (event.sender !== mainWindow.webContents || !THEME_MODES.includes(mode)) return;
  appSettings.themeMode = mode;
  if (times) appSettings.themeTimes = validThemeTimes(times);
  if (sunOffset !== undefined) appSettings.themeSunOffset = validSunOffsets(sunOffset);
  saveSettings();
  themeOverride = null;
  applyThemeSchedule();
});

ipcMain.on('set-dark-mode', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  // Bij een automatische stand: tijdelijke uitzondering tot het volgende
  // omslagmoment (bij 'systeem' tot Windows wisselt).
  const scheduled = scheduledTheme();
  if (scheduled) {
    themeOverride = scheduled.dark === !!value ? null : { dark: !!value, until: scheduled.nextChange };
  }
  applyDarkModeChange(!!value);
});

function applyDarkModeChange(value) {
  // De pagina loopt rustig over in de nieuwe kleuren (applyDarkMode fade),
  // in hetzelfde tempo als de tabbalk, i.p.v. in één klap om te springen.
  const wasDark = darkActive();
  appSettings.darkMode = !!value;
  saveSettings();
  if (darkActive() === wasDark) return; // bv. bij het thema "Origineel"
  fadeTitleBarOverlay(wasDark, darkActive(), CURTAIN_THEME_FADE_MS);
  // Direct effect voor al open tabs, zonder herladen. Ook in losse vensters.
  // Wat je ziet (de actieve tab, losse vensters) loopt rustig over, net als
  // de tabbalk; de rest wisselt direct.
  for (const [id, view] of tabs) applyDarkMode(view, { fade: id === activeTabId });
  for (const detached of detachedWindows.values()) {
    applyDarkMode(detached.view, { fade: true });
    if (!detached.window.isDestroyed()) {
      detached.window.setBackgroundColor(detachedBarColor());
      detached.window.webContents.send('detached-theme', darkActive());
    }
  }
}

ipcMain.on('set-show-onboarding', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.showOnboarding = !!value;
  saveSettings();
});
// Tabbalk uit (één scherm). Bij aanzetten gaan de andere tabs dicht, zodat
// er echt één scherm overblijft; open pagina's krijgen meteen het nieuwe
// gedrag voor links en knoppen.
ipcMain.on('set-tab-bar-disabled', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.tabBarDisabled = !!value;
  saveSettings();
  if (appSettings.tabBarDisabled) {
    for (const tabId of [...tabs.keys()]) {
      if (tabId !== activeTabId && !isDetachedTab(tabId)) closeTab(tabId);
    }
  }
  for (const [tabId, view] of tabs) {
    if (isDetachedTab(tabId)) continue;
    view.webContents.executeJavaScript(`window.__electronDetached = ${appSettings.tabBarDisabled};`).catch(() => {});
  }
});

ipcMain.on('set-open-all-links-in-new-tab', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.openAllLinksInNewTab = !!value;
  saveSettings();
  // Direct effect voor al open tabs, zonder dat ze herladen hoeven te worden
  // (zelfde aanpak als bij het (ont)vergrendelen van een tab).
  for (const view of tabs.values()) {
    view.webContents.executeJavaScript(`window.__electronForceNewTab = ${appSettings.openAllLinksInNewTab};`).catch(() => {});
  }
});
ipcMain.handle('check-for-updates-now', (event) => {
  if (event.sender !== mainWindow.webContents) return { status: 'error' };
  return requestUpdateCheck();
});
ipcMain.on('rename-tab-group', (event, { id, name }) => {
  if (event.sender !== mainWindow.webContents) return;
  const group = appSettings.tabGroups.find(g => g.id === id);
  if (!group) return;
  const trimmed = (name || '').trim();
  if (trimmed) group.name = trimmed;
  saveSettings();
  mainWindow.webContents.send('tab-groups-changed', appSettings.tabGroups);
});
ipcMain.on('remove-tab-group', (event, id) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.tabGroups = appSettings.tabGroups.filter(g => g.id !== id);
  saveSettings();
  mainWindow.webContents.send('tab-groups-changed', appSettings.tabGroups);
});
ipcMain.on('remove-tab-group-url', (event, { groupId, urlIndex }) => {
  if (event.sender !== mainWindow.webContents) return;
  const group = appSettings.tabGroups.find(g => g.id === groupId);
  if (!group || urlIndex < 0 || urlIndex >= group.urls.length) return;
  group.urls.splice(urlIndex, 1);
  saveSettings();
  mainWindow.webContents.send('tab-groups-changed', appSettings.tabGroups);
});
ipcMain.on('open-tab-group', (event, groupId) => {
  if (event.sender !== mainWindow.webContents) return;
  const group = appSettings.tabGroups.find(g => g.id === groupId);
  if (!group || group.urls.length === 0) return;
  group.urls.forEach((url, index) => createTab(url, index === 0));
});
ipcMain.on('app-notice-accepted', (event) => {
  if (event.sender === mainWindow.webContents && tabs.size === 0) {
    openStartTabs();
    maybeShowChangelogNotice();
  }
});
ipcMain.on('changelog-notice-opened', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  changelogNoticeOpen = true;
  applyActiveTabBounds();
});
// Keuzescherm na de rondleiding (thema + klokmelding) is doorlopen.
// Instelassistent doorlopen (bevat ook het oude keuzescherm).
ipcMain.on('mark-setup-done', (event, version) => {
  if (event.sender !== mainWindow.webContents || !Number.isInteger(version)) return;
  appSettings.setupVersion = Math.max(appSettings.setupVersion, version);
  appSettings.preferencesChosen = true;
  saveSettings();
});
// Debugpoort aan/uit: werkt pas na een herstart (zie appendSwitch bovenaan),
// dus meteen herstarten.
ipcMain.on('set-debug-port', (event, value) => {
  if (event.sender !== mainWindow.webContents || !DEBUG_AVAILABLE) return;
  appSettings.debugPort = value ? app.getVersion() : false;
  saveSettings();
  app.relaunch();
  app.quit();
});

// Instellingen > Debug (alleen bij npm start en in een bètaversie):
// de app herstarten alsof hij net geïnstalleerd of bijgewerkt is, zodat je de
// echte schermen bij de start ziet (welkomstscherm, instelassistent, "Nieuw in
// deze versie"). Alleen de velden daarvoor gaan terug; tabs, thema en de
// rest van de instellingen blijven.
ipcMain.on('debug-simulate-start', (event, { mode, fromVersion, seenTours } = {}) => {
  if (event.sender !== mainWindow.webContents || !DEBUG_AVAILABLE) return;
  if (mode === 'install') {
    Object.assign(appSettings, {
      lastSeenChangelogVersion: null, setupVersion: 0, preferencesChosen: false,
      seenWhatsNewTours: [], showOnboarding: true
    });
  } else if (mode === 'update' && typeof fromVersion === 'string' && Array.isArray(seenTours)) {
    // Zoals iemand die op fromVersion zat: keuzescherm toen al gezien, de
    // instelassistent (nieuwer) nog niet.
    Object.assign(appSettings, {
      lastSeenChangelogVersion: fromVersion, setupVersion: 0, preferencesChosen: true,
      seenWhatsNewTours: seenTours.map(String)
    });
  } else {
    return;
  }
  saveSettings();
  app.relaunch();
  app.quit();
});
ipcMain.on('mark-whats-new-seen', (event, ids) => {
  if (event.sender !== mainWindow.webContents || !Array.isArray(ids)) return;
  appSettings.seenWhatsNewTours = [...new Set([...appSettings.seenWhatsNewTours, ...ids.map(String)])];
  saveSettings();
});
ipcMain.on('changelog-notice-closed', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  changelogNoticeOpen = false;
  applyActiveTabBounds();
});
ipcMain.on('onboarding-started', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  onboardingActive = true;
  applyActiveTabBounds();
  // Staat de app vanzelf op donker (automatisch: zon, tijden of Windows),
  // dan begint de assistent in licht. Een eigen keuze voor donker
  // (handmatig of via de knop) blijft staan.
  if (scheduledTheme() && !themeOverride && appSettings.darkMode) setDarkModeValue(false);
});
ipcMain.on('onboarding-ended', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  onboardingActive = false;
  applyActiveTabBounds();
  applyThemeSchedule(); // nu alsnog de automatische stand
});
// Taboverzicht: eerst het voorbeeld van de actieve tab vernieuwen (die is
// nu nog in beeld), dan alle voorbeelden teruggeven.
ipcMain.handle('get-tab-thumbnails', async (event) => {
  if (event.sender !== mainWindow.webContents) return {};
  if (activeTabId) await captureTabThumbnail(activeTabId);
  return Object.fromEntries(tabThumbnails);
});
ipcMain.on('tab-overview-opened', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  tabOverviewOpen = true;
  applyActiveTabBounds();
});
// Bij sluiten komt de (eventueel net gekozen) tab via het gordijn in beeld,
// in dezelfde kleur als de achtergrond van het overzicht.
ipcMain.on('tab-overview-closed', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  tabOverviewOpen = false;
  if (activeTabId && tabs.has(activeTabId)) coverActiveView(tabs.get(activeTabId));
  applyActiveTabBounds();
});
ipcMain.on('settings-panel-opened', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  settingsPanelOpen = true;
  applyActiveTabBounds();
});
ipcMain.on('settings-panel-closed', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  settingsPanelOpen = false;
  // Net als bij het taboverzicht: de pagina komt via het gordijn terug.
  if (activeTabId && tabs.has(activeTabId)) coverActiveView(tabs.get(activeTabId));
  applyActiveTabBounds();
});
ipcMain.on('update-banner-opened', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  updateBannerOpen = true;
  applyActiveTabBounds();
});
ipcMain.on('update-banner-closed', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  updateBannerOpen = false;
  applyActiveTabBounds();
});
ipcMain.on('copy-to-clipboard', (event, text) => {
  if (event.sender !== mainWindow.webContents) return;
  clipboard.writeText(text);
});

// Vensterknoppen (minimaliseren/maximaliseren/sluiten) rechts in de tabbalk:
//   false = de echte Windows-knoppen (titleBarOverlay); Windows tekent ze, wij
//           kiezen alleen de kleuren. Snap-indeling bij hover blijft werken.
//   true  = eigen knoppen in index.html, volledig in Singeling-stijl. Nadeel:
//           geen Windows 11 snap-indeling bij hover over maximaliseren.
const CUSTOM_WINDOW_CONTROLS = true;

// Kleuren van de Windows-knoppen rechtsboven; gelijk aan --bar-bg en --text
// van de tabbalk in index.html. Hoogte 37 i.p.v. 38, zodat de 1px onderrand
// van de tabbalk ook onder de knoppen zichtbaar blijft.
const TITLEBAR_OVERLAY_HEIGHT = TABBAR_HEIGHT - 1;
const TITLEBAR_COLORS = {
  dark: { color: '#0f1115', symbolColor: '#f4f5f6' },
  light: { color: '#ffffff', symbolColor: '#16181d' }
};

function titleBarOverlayColors(darkMode) {
  return { ...TITLEBAR_COLORS[darkMode ? 'dark' : 'light'], height: TITLEBAR_OVERLAY_HEIGHT };
}

// Laat de Windows-knoppen in hetzelfde tempo van kleur wisselen als de
// tabbalk (THEME_SWITCH_MS in index.html), i.p.v. in één keer om te springen.
let titleBarFadeTimer = null;

function fadeTitleBarOverlay(fromDark, toDark, duration) {
  if (CUSTOM_WINDOW_CONTROLS || !mainWindow || mainWindow.isDestroyed()) return;
  clearInterval(titleBarFadeTimer);
  const from = TITLEBAR_COLORS[fromDark ? 'dark' : 'light'];
  const to = TITLEBAR_COLORS[toDark ? 'dark' : 'light'];
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => {
    const value = Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t);
    return value.toString(16).padStart(2, '0');
  }).join('');
  const start = Date.now();
  titleBarFadeTimer = setInterval(() => {
    if (mainWindow.isDestroyed()) {
      clearInterval(titleBarFadeTimer);
      return;
    }
    const t = Math.min(1, (Date.now() - start) / duration);
    mainWindow.setTitleBarOverlay({
      color: mix(from.color, to.color, t),
      symbolColor: mix(from.symbolColor, to.symbolColor, t),
      height: TITLEBAR_OVERLAY_HEIGHT
    });
    if (t === 1) clearInterval(titleBarFadeTimer);
  }, 30);
}

const SPLASH_FADE_MS = 550;
const MAIN_WINDOW_FADE_MS = 500;

// Laat een venster van doorzichtig naar volledig zichtbaar gaan (ease-out).
// Werkt via de vensterdoorzichtigheid van Windows, dus inclusief de
// tabinhoud (WebContentsViews) die de HTML zelf niet kan animeren.
function fadeInWindow(win, duration) {
  const start = Date.now();
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(timer);
      return;
    }
    const progress = Math.min(1, (Date.now() - start) / duration);
    win.setOpacity(1 - Math.pow(1 - progress, 3));
    if (progress === 1) clearInterval(timer);
  }, 16);
}

// ---------- Venster-animaties: sluiten, minimaliseren, terughalen ----------
//
// Het venster zelf kan niet krimpen of vervormen (de tabinhoud is een native
// laag). Daarom: screenshot van de tabbalk + de actieve tab, die in een
// doorzichtig hulpvenster ("snapshot-overlay") op exact dezelfde plek zetten,
// het echte venster onzichtbaar maken en het hulpvenster laten animeren:
//   - sluiten:        inklappen tot een lichtende lijn ("tv uit")
//   - minimaliseren:  dezelfde tv uit, maar tot een lichtpuntje dat daarna
//                     naar de taakbalk zakt (zodat je ziet waar de app zit)
//   - terughalen:     precies andersom: het puntje komt uit de taakbalk
//                     omhoog en klapt open tot het venster
// Het hulpvenster wordt één keer aangemaakt en blijft (verborgen) bestaan,
// zodat een animatie direct kan starten zonder eerst een venster te laden.
const CLOSE_ANIMATION_MS = 560;
const MINIMIZE_ANIMATION_MS = 640;
const RESTORE_ANIMATION_MS = 580;
const TV_EASE = 'cubic-bezier(0.5, 0, 0.7, 0.4)';
const SNAPSHOT_OVERLAY_HTML = `<!doctype html><html><head><style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  body { --tx: 50; }
  #screen {
    position: absolute; inset: 0; transform-origin: center;
    background-repeat: no-repeat; background-size: 100% 100%;
    will-change: transform, filter, opacity;
  }

  /* Het lichtpuntje waar het venster in opgaat. Start in het midden en
     reist naar --tx (het taakbalkicoon) onderaan het venster. */
  #dot {
    position: absolute; left: 50%; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px;
    border-radius: 50%; opacity: 0;
    background: radial-gradient(circle, #fff 0 28%, #ffc39a 42%, #ff5100 68%, rgba(255, 81, 0, 0) 72%);
    box-shadow: 0 0 18px 6px rgba(255, 81, 0, 0.65), 0 0 4px 1px rgba(255, 255, 255, 0.9);
    --dx: calc((var(--tx) - 50) * 1vw);
    --dy: calc(50vh - 4px);
  }

  /* Korte gloed op de plek waar het puntje de taakbalk "in gaat". */
  #land {
    position: absolute; bottom: 0; left: calc(var(--tx) * 1%); width: 90px; height: 3px;
    border-radius: 3px; opacity: 0; transform: translateX(-50%) scaleX(0.2);
    background: linear-gradient(90deg, transparent, #ff5100 25%, #fff2e6 50%, #ff5100 75%, transparent);
    box-shadow: 0 0 12px 2px rgba(255, 81, 0, 0.7);
  }

  body.off #screen { animation: tv-off ${CLOSE_ANIMATION_MS}ms linear both; }
  body.off #dot { animation: dot-fade ${CLOSE_ANIMATION_MS}ms linear both; }

  body.minimize #screen { animation: tv-dot ${MINIMIZE_ANIMATION_MS}ms linear both; }
  body.minimize #dot { animation: dot-travel ${MINIMIZE_ANIMATION_MS}ms linear both; }
  body.minimize #land { animation: land ${MINIMIZE_ANIMATION_MS}ms linear both; }
  body.restore #screen { animation: tv-dot ${RESTORE_ANIMATION_MS}ms linear reverse both; }
  body.restore #dot { animation: dot-travel ${RESTORE_ANIMATION_MS}ms linear reverse both; }
  body.restore #land { animation: land ${RESTORE_ANIMATION_MS}ms linear reverse both; }
  body.ready #screen { opacity: 0; }
  /* Klaargezet maar nog niet gestart (zie start()): toont het eerste beeld. */
  body.hold #screen, body.hold #dot, body.hold #land { animation-play-state: paused !important; }

  /* Sluiten: zelfde tempo als tv-dot (lijn na ~150 ms, puntje na ~250 ms),
     daarna dooft het puntje ter plekke uit (dot-fade). */
  @keyframes tv-off {
    0% { opacity: 1; transform: none; filter: none; animation-timing-function: ${TV_EASE}; }
    27% { opacity: 1; transform: scale(1, 0.006); filter: brightness(2.2); animation-timing-function: ${TV_EASE}; }
    45% { opacity: 1; transform: scale(0.012, 0.006); filter: brightness(3); }
    50%, 100% { opacity: 0; transform: scale(0.004, 0.006); filter: brightness(3); }
  }

  @keyframes dot-fade {
    0%, 41% { opacity: 0; transform: scale(0.3); }
    49% { opacity: 1; transform: scale(1.5); animation-timing-function: ease-out; }
    57% { opacity: 1; transform: scale(1); animation-timing-function: ease-in; }
    100% { opacity: 0; transform: scale(0.2); }
  }

  /* Eerste helft: tv uit, tot een puntje in het midden. */
  @keyframes tv-dot {
    0% { opacity: 1; transform: none; filter: none; animation-timing-function: ${TV_EASE}; }
    24% { opacity: 1; transform: scale(1, 0.006); filter: brightness(2.2); animation-timing-function: ${TV_EASE}; }
    40% { opacity: 1; transform: scale(0.012, 0.006); filter: brightness(3); }
    44%, 100% { opacity: 0; transform: scale(0.004, 0.006); filter: brightness(3); }
  }

  /* Tweede helft: het puntje licht op en zakt (versnellend) naar de taakbalk. */
  @keyframes dot-travel {
    0%, 36% { opacity: 0; transform: translate(0, 0) scale(0.3); }
    43% { opacity: 1; transform: translate(0, 0) scale(1.5); animation-timing-function: ease-out; }
    50% { opacity: 1; transform: translate(0, 0) scale(1); animation-timing-function: cubic-bezier(0.45, 0, 0.7, 0.5); }
    93% { opacity: 1; transform: translate(var(--dx), var(--dy)) scale(0.75); }
    100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.2); }
  }

  @keyframes land {
    0%, 88% { opacity: 0; transform: translateX(-50%) scaleX(0.2); }
    95% { opacity: 1; transform: translateX(-50%) scaleX(1); }
    100% { opacity: 0; transform: translateX(-50%) scaleX(0.6); }
  }
</style></head><body><div id="screen"></div><div id="dot"></div><div id="land"></div>
<script>
  const body = document.body;
  const screenEl = document.getElementById('screen');
  let snapshotUrl = null;

  const loadImage = (src) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  // Screenshot (lagen) samenvoegen tot één beeld. opts: { tx, width, height }
  window.setSnapshot = async (layers, opts) => {
    body.className = '';
    body.style.setProperty('--tx', opts.tx);
    const { width, height } = opts;
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    for (const layer of layers) {
      const img = await loadImage(layer.src);
      if (img) ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
    snapshotUrl = URL.createObjectURL(blob);
    await loadImage(snapshotUrl);
    screenEl.style.backgroundImage = 'url(' + snapshotUrl + ')';
    // Even laten opbouwen. Bewust een timer i.p.v. requestAnimationFrame: dit
    // venster is op dat moment verborgen, en een verborgen venster tekent geen
    // frames (dan zou dit nooit klaar zijn).
    await new Promise(resolve => setTimeout(resolve, 30));
  };

  // Animatie (her)starten via de class op body.
  window.play = (cls) => {
    body.className = '';
    void body.offsetWidth;
    body.className = cls;
  };

  // Wachten tot dit venster echt n frames op het scherm heeft gezet. Met een
  // maximum: een verborgen venster tekent geen frames.
  window.nextFrames = (n) => new Promise(resolve => {
    const fallback = setTimeout(resolve, 150);
    const step = () => {
      if (--n <= 0) {
        clearTimeout(fallback);
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });

  // Zoals play(), maar de animatie staat eerst op het eerste beeld stil en
  // loopt pas als er weer frames getekend worden. Anders loopt de klok al
  // terwijl Windows nog bezig is met het wisselen van vensters, en mis je het
  // begin (het venster "springt" dan meteen naar half ingeklapt).
  window.start = async (cls) => {
    body.className = '';
    void body.offsetWidth;
    body.className = cls + ' hold';
    void body.offsetWidth;
    await nextFrames(2);
    body.classList.remove('hold');
  };
</script></body></html>`;

let appQuitting = false;
let closeAnimationRunning = false;

// Afsluiten via de app zelf (bv. update installeren) of een tweede ronde na
// de animatie: dan niet (nog eens) animeren.
app.on('before-quit', () => {
  appQuitting = true;
  telemetry.flush({ final: true });
});

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function toJpegDataUrl(image) {
  return `data:image/jpeg;base64,${image.toJPEG(85).toString('base64')}`;
}

function animationsDisabled() {
  return systemPreferences.getAnimationSettings().prefersReducedMotion;
}

// Lagen in de volgorde waarin ze over elkaar liggen: eerst de HTML-chrome
// (tabbalk), dan de actieve tab op zijn eigen plek eronder.
async function captureWindowLayers() {
  const bounds = mainWindow.getContentBounds();
  const view = activeTabId ? tabs.get(activeTabId) : null;
  const pageVisible = view && !view.webContents.isDestroyed() && view.getBounds().width > 0;
  const [chrome, page] = await Promise.all([
    mainWindow.webContents.capturePage(),
    pageVisible ? view.webContents.capturePage() : Promise.resolve(null)
  ]);
  const layers = [];
  if (!chrome.isEmpty()) {
    layers.push({ src: toJpegDataUrl(chrome), x: 0, y: 0, width: bounds.width, height: bounds.height });
  }
  if (page && !page.isEmpty()) layers.push({ src: toJpegDataUrl(page), ...view.getBounds() });
  if (layers.length === 0) throw new Error('Geen screenshot');
  return { bounds, layers };
}

// Waar het lichtpuntje naartoe gaat: midden onderaan het scherm (waar in
// Windows 11 de taakbalkiconen staan), als percentage van de vensterbreedte.
function taskbarTargetPercent(bounds) {
  const { workArea } = screen.getDisplayMatching(bounds);
  const targetX = workArea.x + workArea.width / 2;
  return Math.max(8, Math.min(92, ((targetX - bounds.x) / bounds.width) * 100));
}

let snapshotOverlay = null;
let snapshotOverlayLoaded = null;

function ensureSnapshotOverlay() {
  if (snapshotOverlay && !snapshotOverlay.isDestroyed()) return snapshotOverlayLoaded;
  snapshotOverlay = new BrowserWindow({
    ...mainWindow.getContentBounds(),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  snapshotOverlayLoaded = snapshotOverlay.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(SNAPSHOT_OVERLAY_HTML)}`);
  return snapshotOverlayLoaded;
}

// Screenshot in het hulpvenster zetten op de plek van het hoofdvenster.
// Afbeeldingen via een script i.p.v. in de URL: een data-URL met
// schermvullende screenshots wordt te lang.
async function loadSnapshot({ bounds, layers }) {
  await ensureSnapshotOverlay();
  snapshotOverlay.setBounds(bounds);
  const opts = { tx: taskbarTargetPercent(bounds), width: bounds.width, height: bounds.height };
  await snapshotOverlay.webContents.executeJavaScript(
    `setSnapshot(${JSON.stringify(layers)}, ${JSON.stringify(opts)});`
  );
  return snapshotOverlay;
}

function playOverlay(overlay, cls) {
  return overlay.webContents.executeJavaScript(`play(${JSON.stringify(cls)});`).catch(() => {});
}

// Hulpvenster tonen (met de screenshot), wachten tot het echt op het scherm
// staat, dan pas het hoofdvenster onzichtbaar maken en de animatie starten
// zodra Windows klaar is met die wissel. Zo begint de animatie echt bij 100%.
async function swapToOverlayAndStart(overlay, cls) {
  overlay.showInactive();
  await overlay.webContents.executeJavaScript('nextFrames(2);').catch(() => {});
  mainWindow.setOpacity(0);
  await overlay.webContents.executeJavaScript(`start(${JSON.stringify(cls)});`).catch(() => {});
}

async function playCloseAnimation() {
  closeAnimationRunning = true;
  const overlay = await loadSnapshot(await captureWindowLayers());

  // Eerst het hulpvenster tonen en even laten tekenen, dan pas het echte
  // venster verbergen, zodat er geen moment niets te zien is.
  // Hoofdvenster onzichtbaar maken i.p.v. hide(): bij hide() speelt Windows
  // een eigen overgang af die door onze animatie heen hapert.
  await swapToOverlayAndStart(overlay, 'off');

  setTimeout(() => {
    if (!overlay.isDestroyed()) overlay.destroy();
    if (!mainWindow.isDestroyed()) mainWindow.destroy(); // -> 'closed' -> app.quit()
  }, CLOSE_ANIMATION_MS + 50);
}

// ---- Minimaliseren en terughalen ----
//
// Minimaliseren via onze eigen knop: eerst de animatie, dan pas echt
// minimaliseren; de screenshot blijft in het (verborgen) hulpvenster staan
// voor het terughalen. Minimaliseert Windows het venster op een andere manier
// (Win+D, klik op het taakbalkicoon), dan hoort de app dat pas achteraf: dan
// speelt de gewone Windows-animatie en is er geen verse screenshot, dus bij
// terughalen alleen een fade-in.
let minimizingByApp = false;
let snapshotReadyForRestore = false;
let restoreAnimationPending = false;

async function minimizeWithAnimation() {
  if (animationsDisabled() || minimizingByApp || !mainWindow.isVisible()) {
    mainWindow.minimize();
    return;
  }
  minimizingByApp = true;
  snapshotReadyForRestore = false;
  try {
    const overlay = await loadSnapshot(await captureWindowLayers());
    await swapToOverlayAndStart(overlay, 'minimize');
    await wait(MINIMIZE_ANIMATION_MS);
    mainWindow.minimize();
    overlay.hide();
    playOverlay(overlay, 'ready');
    snapshotReadyForRestore = true;
  } catch {
    mainWindow.minimize();
  } finally {
    // Pas als het venster echt geminimaliseerd is weer zichtbaar maken,
    // anders is het voorbeeld in de taakbalk leeg.
    setTimeout(() => {
      if (!mainWindow.isDestroyed() && !restoreAnimationPending) mainWindow.setOpacity(1);
      minimizingByApp = false;
    }, 250);
  }
}

// Windows stuurt WM_SYSCOMMAND/SC_RESTORE net vóórdat een geminimaliseerd
// venster terugkomt (klik op het taakbalkicoon, Alt+Tab). Op dat moment het
// venster onzichtbaar maken, zodat het via onze animatie in beeld komt i.p.v.
// eerst even "kaal" te verschijnen.
const WM_SYSCOMMAND = 0x0112;
const SC_RESTORE = 0xF120;

function setupMinimizeRestoreAnimations() {
  // Hulpvenster alvast aanmaken, zodat de eerste animatie niet hapert.
  ensureSnapshotOverlay();

  if (process.platform === 'win32') {
    mainWindow.hookWindowMessage(WM_SYSCOMMAND, (wParam) => {
      // wParam is een Buffer ter grootte van een pointer (8 bytes in 64-bit).
      const command = wParam.length >= 8 ? Number(wParam.readBigUInt64LE(0) & 0xFFF0n) : (wParam.readUInt32LE(0) & 0xFFF0);
      if (command !== SC_RESTORE || !mainWindow.isMinimized() || animationsDisabled()) return;
      restoreAnimationPending = true;
      mainWindow.setOpacity(0);
    });
  }

  mainWindow.on('minimize', () => {
    // Niet via onze knop: de oude screenshot klopt niet meer.
    if (!minimizingByApp) snapshotReadyForRestore = false;
  });

  mainWindow.on('restore', async () => {
    if (!restoreAnimationPending) {
      snapshotReadyForRestore = false;
      return;
    }
    restoreAnimationPending = false;
    // Vangnet: het venster mag nooit onzichtbaar blijven.
    const safety = setTimeout(() => {
      if (!mainWindow.isDestroyed()) mainWindow.setOpacity(1);
    }, 1500);
    try {
      const overlay = snapshotOverlay;
      const bounds = mainWindow.getContentBounds();
      const overlayBounds = overlay && !overlay.isDestroyed() ? overlay.getBounds() : null;
      const fits = snapshotReadyForRestore && overlayBounds &&
        overlayBounds.width === bounds.width && overlayBounds.height === bounds.height;
      snapshotReadyForRestore = false;
      if (!fits) {
        fadeInWindow(mainWindow, RESTORE_ANIMATION_MS);
        return;
      }
      overlay.setBounds(bounds);
      playOverlay(overlay, 'restore');
      overlay.showInactive();
      await wait(RESTORE_ANIMATION_MS);
      mainWindow.setOpacity(1);
      await wait(40);
      if (!overlay.isDestroyed()) {
        overlay.hide();
        playOverlay(overlay, '');
      }
    } catch {
      if (!mainWindow.isDestroyed()) mainWindow.setOpacity(1);
    } finally {
      clearTimeout(safety);
    }
  });
}

// Wacht tot de pagina in het hoofdvenster de breedte van het (net
// gemaximaliseerde) venster heeft en daarop opnieuw getekend is. Met een
// maximum, zodat het venster nooit onzichtbaar blijft hangen.
function waitForFullWidthLayout(maxWaitMs = 800) {
  const targetWidth = mainWindow.getContentBounds().width;
  const check = mainWindow.webContents.executeJavaScript(`
    new Promise(resolve => {
      const start = performance.now();
      const tick = () => {
        if (window.innerWidth >= ${targetWidth} - 2 || performance.now() - start > ${maxWaitMs}) {
          requestAnimationFrame(() => resolve());
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });
  `).catch(() => {});
  const timeout = new Promise(resolve => setTimeout(resolve, maxWaitMs + 200));
  return Promise.race([check, timeout]);
}

function createWindow() {
  // Eerst het automatische licht/donker, zodat ook het laadscherm klopt.
  startThemeSchedule();
  const splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  // Thema en versie meegeven, zodat het splash-scherm meteen in licht/donker
  // verschijnt en altijd het echte versienummer toont.
  splashWindow.loadFile('splash.html', {
    // Laadscherm altijd in de gewone kleuren (ook met Oogcomfort aan); bij
    // een thema volgt alleen de laadbalk de accentkleur.
    query: {
      theme: darkActive() ? 'dark' : 'light',
      version: app.getVersion(),
      accent: themes.themeAccent(activeTheme(), darkActive()) || ''
    }
  });
  const splashStartTime = Date.now();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: `Singeling App v${app.getVersion()}`,
    icon: path.join(__dirname, 'assets/icon.ico'),
    show: false,
    autoHideMenuBar: true,
    // Geen Windows-titelbalk: de tabbalk is de titelbalk (die is al
    // sleepbaar via -webkit-app-region: drag). De echte Windows-knoppen
    // (minimaliseren/maximaliseren/sluiten) tekent Windows rechts in de
    // tabbalk, in de kleuren van het huidige thema.
    titleBarStyle: 'hidden',
    // Zonder overlay tekent Windows geen knoppen; dan doet index.html dat.
    ...(CUSTOM_WINDOW_CONTROLS ? {} : { titleBarOverlay: titleBarOverlayColors(darkActive()) }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  stayOnOwnPage(mainWindow.webContents);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  createCurtain();

  // Alle tab-aanmaak (createTab) is aan mainWindow gekoppeld, dus zonder
  // mainWindow raakt de app sowieso onbruikbaar. Sluit dan ook meteen
  // eventuele losgetrokken vensters mee i.p.v. ze als wees te laten hangen.
  mainWindow.on('closed', () => {
    app.quit();
  });

  // Sluiten (kruisje, Alt+F4, taakbalk) speelt eerst de tv-uit-animatie af.
  // Niet bij afsluiten via de app zelf, geminimaliseerd venster (niets te
  // zien) of met Windows' "Animatie-effecten" uit.
  setupMinimizeRestoreAnimations();
  mainWindow.on('resize', closeHelpPopover);

  mainWindow.on('close', (event) => {
    if (closeAnimationRunning) {
      event.preventDefault(); // animatie loopt al; tweede klik negeren
      return;
    }
    if (appQuitting || !mainWindow.isVisible() || mainWindow.isMinimized()) return;
    if (systemPreferences.getAnimationSettings().prefersReducedMotion) return;
    event.preventDefault();
    playCloseAnimation().catch(() => {
      if (!mainWindow.isDestroyed()) mainWindow.destroy();
    });
  });

  // Kopiëren/plakken via het rechtermuisknop-menu voor invoervelden in de
  // tabbalk/instellingen zelf (bv. een tabgroep hernoemen). Rechtsklikken op
  // een tab wordt al elders afgehandeld (die stopt propagation), dus botst
  // hier niet mee.
  mainWindow.webContents.on('context-menu', (event, params) => {
    if (!(params.isEditable || params.selectionText)) return;
    const editItems = [];
    if (params.editFlags.canCut) editItems.push({ label: 'Knippen', role: 'cut' });
    if (params.editFlags.canCopy) editItems.push({ label: 'Kopiëren', role: 'copy' });
    if (params.editFlags.canPaste) editItems.push({ label: 'Plakken', role: 'paste' });
    if (editItems.length === 0) return;
    Menu.buildFromTemplate(editItems).popup({ window: mainWindow, x: params.x, y: params.y });
  });

  // Als de focus op de tabbalk zelf ligt (i.p.v. in de paginainhoud), moet
  // F5/Ctrl+R nog steeds de actieve tab verversen i.p.v. de tabbalk zelf.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !isRefreshShortcut(input)) return;
    event.preventDefault();
    if (activeTabId && tabs.has(activeTabId)) {
      tabs.get(activeTabId).webContents.reload();
    }
  });

  mainWindow.on('resize', () => {
    applyActiveTabBounds();
  });

  // De eigen maximaliseerknop wisselt tussen "maximaliseren" en "herstellen".
  const sendMaximizedState = () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-maximized-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMaximizedState);
  mainWindow.on('unmaximize', sendMaximizedState);

  mainWindow.once('ready-to-show', () => {
    const elapsedTime = Date.now() - splashStartTime;
    const minimumSplashTime = 5000;
    const remainingTime = minimumSplashTime - elapsedTime;

    // Overgang splash -> app: eerst speelt het splash-scherm zijn
    // afscheidsanimatie af (CSS in splash.html), pas daarna verschijnt het
    // hoofdvenster en faded het in.
    const finish = () => {
      if (splashWindow.isDestroyed()) {
        showMainWindow();
        return;
      }
      splashWindow.webContents.executeJavaScript(`document.body.classList.add('leaving');`).catch(() => {});
      setTimeout(() => {
        if (!splashWindow.isDestroyed()) splashWindow.close();
        showMainWindow();
      }, SPLASH_FADE_MS);
    };

    const showMainWindow = () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.setOpacity(0);
        mainWindow.maximize();
        mainWindow.show();
        // Pas infaden als de pagina op de gemaximaliseerde breedte staat:
        // anders zie je de welkomstmelding nog even op de oude (smallere)
        // plek, links van het midden, voordat hij naar het midden springt.
        waitForFullWidthLayout().then(() => {
          if (mainWindow.isDestroyed()) return;
          fadeInWindow(mainWindow, MAIN_WINDOW_FADE_MS);
          mainWindow.webContents.send('window-shown');
        });
        // Geen zichtbare "controleren op updates"-melding meer: de controle
        // loopt gewoon stil op de achtergrond (een gevonden update toont
        // alsnog zijn eigen dialoog, zie setupAutoUpdater).
        setupAutoUpdater().then(() => {
          scheduleDailyUpdateCheck();
        });
        if (TEST_UPDATE_MODE) setTimeout(startTestUpdate, 3000);
      }
    };

    if (remainingTime > 0) {
      setTimeout(finish, remainingTime);
    } else {
      finish();
    }
  });
}

app.whenReady().then(() => {
  setTimeout(removeOldUpdateFolders, 30 * 1000);

  // Electron staat standaard ELKE toestemmingsvraag toe (camera, microfoon,
  // locatie, meldingen, ...), ook voor externe pagina's zoals de
  // inlogschermen. Alleen de eigen app krijgt die rechten nog.
  const isTrustedOrigin = (url) => !!url && isInternalUrl(url);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrustedOrigin(details.requestingUrl || webContents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return isTrustedOrigin(requestingOrigin);
  });

  loadSettings();
  telemetry.start();
  if (appSettings.adminUnlocked && appSettings.rapportServerAutostart) startRapportServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});