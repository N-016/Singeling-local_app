const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, clipboard, shell, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');

// Zonder deze lock start elke nieuwe poging een los proces dat om dezelfde
// cache- en instellingenbestanden in userData vecht met de al draaiende app
// (vandaar de "Access is denied"/quota-database-fouten bij dubbel opstarten).
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

const START_URL = 'https://snglng.lovable.app/qrm-connect';
const APP_HOSTNAME = new URL(START_URL).hostname;
const TABBAR_HEIGHT = 38;
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
let updateDialogOpen = false;
let updateProgressWindow = null;
let onboardingActive = false;
let settingsPanelOpen = false;
let changelogNoticeOpen = false;
let updateAvailableInfo = null;
// true = deze updatecontrole mag de "wil je downloaden?"-dialoog tonen (bij
// opstarten of een handmatige "nu controleren"-klik); false = stille
// achtergrondcontrole die alleen het bolletje bij het instellingen-icoon zet.
let pendingCheckIsInteractive = true;
let dailyUpdateCheckScheduled = false;
const DAILY_UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

// Instellingen worden per Windows-gebruiker opgeslagen (userData-map), zodat
// iedereen zijn eigen zoomniveau en starttabs heeft.
let appSettings = {
  zoomFactor: DEFAULT_ZOOM,
  startTabs: [], // [{ url, locked }]
  tabGroups: [], // [{ id, name, urls: [] }]
  lastSeenChangelogVersion: null,
  openAllLinksInNewTab: false,
  showOnboarding: true,
  blockCtrlB: false
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    appSettings = {
      zoomFactor: typeof parsed.zoomFactor === 'number' ? parsed.zoomFactor : DEFAULT_ZOOM,
      startTabs: Array.isArray(parsed.startTabs) ? parsed.startTabs : [],
      tabGroups: Array.isArray(parsed.tabGroups) ? parsed.tabGroups : [],
      lastSeenChangelogVersion: typeof parsed.lastSeenChangelogVersion === 'string' ? parsed.lastSeenChangelogVersion : null,
      openAllLinksInNewTab: typeof parsed.openAllLinksInNewTab === 'boolean' ? parsed.openAllLinksInNewTab : false,
      showOnboarding: typeof parsed.showOnboarding === 'boolean' ? parsed.showOnboarding : true,
      blockCtrlB: typeof parsed.blockCtrlB === 'boolean' ? parsed.blockCtrlB : false
    };
  } catch {
    // Nog geen instellingenbestand of het is ongeldig; standaardwaarden blijven staan.
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(appSettings, null, 2));
  } catch (error) {
    console.error('Instellingen opslaan mislukt:', error.message);
  }
}

function clampZoom(factor) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
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

function isInternalUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === APP_HOSTNAME || hostname.endsWith(`.${APP_HOSTNAME}`);
  } catch {
    return false;
  }
}

function isRefreshShortcut(input) {
  return input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r');
}

function getLatestChangelogEntry() {
  try {
    const content = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf-8');
    // CHANGELOG.md staat chronologisch oplopend (oudste eerst), dus de
    // laatste "## "-sectie in het bestand is de meest recente wijziging.
    const lastIdx = content.lastIndexOf('\n## ');
    if (lastIdx === -1) return content.trim();
    return content.slice(lastIdx + 1).trim();
  } catch (error) {
    return `Changelog kon niet worden geladen: ${error.message}`;
  }
}

function maybeShowChangelogNotice() {
  const currentVersion = app.getVersion();
  const previousVersion = appSettings.lastSeenChangelogVersion;
  appSettings.lastSeenChangelogVersion = currentVersion;
  saveSettings();

  // Niet tonen bij een gloednieuwe installatie (previousVersion === null) -
  // dan loopt de onboarding-rondleiding al, en zouden beide overlays botsen.
  // Wel tonen zodra de versie is veranderd t.o.v. de vorige keer opstarten.
  if (previousVersion === null || previousVersion === currentVersion) return;

  changelogNoticeOpen = true;
  applyActiveTabBounds();
  mainWindow.webContents.send('show-changelog-notice', getLatestChangelogEntry());
}

function openStartTabs() {
  const configured = appSettings.startTabs.length > 0
    ? appSettings.startTabs
    : [{ url: START_URL, locked: true }];
  configured.forEach((tab, index) => createTab(tab.url, index === 0, !!tab.locked));
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

function showUpdateProgress() {
  if (updateProgressWindow && !updateProgressWindow.isDestroyed()) return;

  updateProgressWindow = new BrowserWindow({
    width: 420,
    height: 170,
    parent: mainWindow,
    modal: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#292929',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  updateProgressWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(`
    <!doctype html>
    <html><head><meta charset="UTF-8"><style>
      body { margin: 0; padding: 26px; background: #292929; color: #fff; font: 14px "Segoe UI", sans-serif; }
      h1 { margin: 0 0 18px; font-size: 17px; font-weight: 600; }
      .bar { height: 8px; overflow: hidden; background: #555; border-radius: 4px; }
      .fill { width: 0%; height: 100%; background: #ff5e00; transition: width .2s ease; }
      .status { display: flex; justify-content: space-between; margin-top: 10px; color: #cfcfcf; }
    </style></head><body>
      <h1>Update downloaden...</h1>
      <div class="bar"><div id="fill" class="fill"></div></div>
      <div class="status"><span id="status">Even geduld...</span><span id="percent">0%</span></div>
    </body></html>
  `)}`);

  updateProgressWindow.once('ready-to-show', () => updateProgressWindow.show());
  updateProgressWindow.on('closed', () => {
    updateProgressWindow = null;
  });
}

function updateProgress(percent, status) {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
  updateProgressWindow.webContents.executeJavaScript(`
    document.getElementById('fill').style.width = '${percent}%';
    document.getElementById('percent').textContent = '${percent}%';
    document.getElementById('status').textContent = '${status}';
  `).catch(() => {});
}

function closeUpdateProgress() {
  if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
    updateProgressWindow.close();
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return Promise.resolve(false);

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

  autoUpdater.on('update-available', async (updateInfo) => {
    // Meteen resetten voor de volgende check (opstart-check, dagelijkse
    // achtergrondcheck of een handmatige klik in instellingen) - anders blijft
    // een latere check per ongeluk het gedrag van deze check overnemen.
    const isInteractive = pendingCheckIsInteractive;
    pendingCheckIsInteractive = true;

    logUpdater(`Update beschikbaar: ${updateInfo.version}`);
    resolveUpdateCheck(true);
    updateAvailableInfo = updateInfo;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-badge-changed', true);
    }

    // Achtergrondcontrole (dagelijks, of een stille handmatige check): geen
    // storende dialoog, alleen het bolletje bij het instellingen-icoon. De
    // gebruiker start de app later zelf opnieuw op; dan doorloopt de normale
    // (interactieve) opstart-check de rest van de flow.
    if (!isInteractive) return;

    if (updateDialogOpen || !mainWindow || mainWindow.isDestroyed()) return;
    updateDialogOpen = true;

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update beschikbaar',
      message: `Er is een nieuwe versie beschikbaar: v${updateInfo.version}.`,
      detail: 'Wil je deze update nu downloaden?',
      buttons: ['Nu downloaden', 'Niet nu'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    updateDialogOpen = false;
    if (result.response === 0) {
      logUpdater(`Download bevestigd voor ${updateInfo.version}`);
      showUpdateProgress();
      autoUpdater.downloadUpdate().catch((error) => {
        closeUpdateProgress();
        console.error('Update downloaden mislukt:', error.message);
      });
    } else {
      logUpdater(`Download afgewezen voor ${updateInfo.version}`);
    }
  });

  autoUpdater.on('update-not-available', () => {
    pendingCheckIsInteractive = true;
    logUpdater('Geen update beschikbaar');
    updateAvailableInfo = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-badge-changed', false);
    }
    resolveUpdateCheck(false);
  });

  autoUpdater.on('download-progress', (progress) => {
    logUpdater(`Downloadvoortgang: ${Math.round(progress.percent)}%`);
    updateProgress(Math.round(progress.percent), `${Math.round(progress.percent)}% gedownload`);
  });

  autoUpdater.on('update-downloaded', async () => {
    logUpdater('Update volledig gedownload');
    closeUpdateProgress();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update gedownload',
      message: 'De update is gedownload en klaar om te installeren.',
      detail: 'De app moet opnieuw worden gestart om de update te installeren.',
      buttons: ['Nu opnieuw starten', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response === 0) {
      logUpdater('Installatie bevestigd, app wordt opnieuw gestart');
      autoUpdater.quitAndInstall();
    } else {
      logUpdater('Installatie uitgesteld');
    }
  });

  autoUpdater.on('error', (error) => {
    const isInteractive = pendingCheckIsInteractive;
    pendingCheckIsInteractive = true;

    closeUpdateProgress();
    logUpdater('Updatecontrole of download mislukt', error);
    resolveUpdateCheck(false);

    // Een mislukte stille achtergrondcheck (bv. geen internet) mag niet als
    // storende foutmelding verschijnen; die krijgt gewoon volgende keer weer
    // een kans.
    if (isInteractive && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update mislukt',
        message: 'De update kon niet worden gedownload.',
        detail: error.message,
        buttons: ['OK'],
        noLink: true
      }).catch(() => {});
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
  pendingCheckIsInteractive = false;
  logUpdater('Dagelijkse achtergrond-updatecontrole gestart');
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

  pendingCheckIsInteractive = false;
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
  return { x: 0, y: TABBAR_HEIGHT, width: bounds.width, height: bounds.height - TABBAR_HEIGHT };
}

function applyActiveTabBounds() {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  tabs.get(activeTabId).setBounds(
    (onboardingActive || settingsPanelOpen || changelogNoticeOpen) ? { x: 0, y: 0, width: 0, height: 0 } : getViewBounds()
  );
}

function sendNavigationState(tabId) {
  const view = tabs.get(tabId);
  if (!view || !mainWindow || mainWindow.isDestroyed()) return;

  let canGoBack = false;
  let canGoForward = false;
  try {
    canGoBack = view.webContents.navigationHistory.canGoBack();
    canGoForward = view.webContents.navigationHistory.canGoForward();
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
  view.webContents.executeJavaScript(`window.__electronCanGoBack = ${effectiveCanGoBack};`).catch(() => {});
}

function openButtonInNewTab(view, button, parentTabId) {
  const url = view.webContents.getURL();
  const newTabId = createTab(url, true, false, parentTabId);
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
    `);
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
function attachNavigationHandlers(view, tabId, { skipFirstNavigation = true } = {}) {
  let isInitialLoad = true;
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
    if (isInitialLoad) {
      isInitialLoad = false;
      if (skipFirstNavigation) return;
      // Leeg window.open()-venster: alleen een extern doel afvangen, verder
      // gewoon laten laden in deze tab (zie uitleg bij skipFirstNavigation).
      if (!isInternalUrl(url)) {
        event.preventDefault();
        shell.openExternal(url);
        closeIfStillBlank(view, tabId);
      }
      return;
    }
    if (internalNavigations.has(tabId)) {
      internalNavigations.delete(tabId);
      return;
    }
    if (!isInternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
      closeIfStillBlank(view, tabId);
      return;
    }
    if (lockedTabs.has(tabId) || appSettings.openAllLinksInNewTab) {
      event.preventDefault();
      createTab(url, true, false, tabId);
    }
    // Anders: laat de navigatie gewoon in dit tabblad plaatsvinden.
  });

  view.webContents.on('will-redirect', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
      closeIfStillBlank(view, tabId);
    }
  });

  view.webContents.on('did-navigate', () => {
    internalNavigations.delete(tabId);
    sendNavigationState(tabId);
  });

  view.webContents.on('did-navigate-in-page', () => sendNavigationState(tabId));

  view.webContents.setWindowOpenHandler((details) => {
    if (details.url && details.url !== 'about:blank') {
      if (!isInternalUrl(details.url)) {
        shell.openExternal(details.url);
      } else {
        createTab(details.url, true, false, tabId);
      }
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
        attachNavigationHandlers(newView, newTabId, { skipFirstNavigation: false });
        tabs.set(newTabId, newView);
        parentTabs.set(newTabId, tabId);
        mainWindow.webContents.send('tab-created', { tabId: newTabId, url: 'about:blank' });
        switchTab(newTabId);
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
      const menu = Menu.buildFromTemplate([
        {
          label: external ? 'Link openen in browser' : 'Link openen in nieuw tabblad',
          click: () => {
            if (external) shell.openExternal(params.linkURL);
            else createTab(params.linkURL, true, false, tabId);
          }
        }
      ]);
      menu.popup({ window: mainWindow, x: params.x, y: params.y });
      return;
    }

    if (params.isEditable || params.selectionText) {
      const editItems = [];
      if (params.editFlags.canCut) editItems.push({ label: 'Knippen', role: 'cut' });
      if (params.editFlags.canCopy) editItems.push({ label: 'Kopiëren', role: 'copy' });
      if (params.editFlags.canPaste) editItems.push({ label: 'Plakken', role: 'paste' });
      if (editItems.length > 0) {
        Menu.buildFromTemplate(editItems).popup({ window: mainWindow, x: params.x, y: params.y });
        return;
      }
    }

    view.webContents.executeJavaScript(clickableElementScript(params.x, params.y), true).then(button => {
      const menuItems = [];
      if (button) {
        menuItems.push({
          label: 'Knop openen in nieuw tabblad',
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

      const menu = Menu.buildFromTemplate(menuItems);
      menu.popup({ window: mainWindow, x: params.x, y: params.y });
    }).catch(() => {});
  });

  view.webContents.on('page-title-updated', (event, title) => {
    mainWindow.webContents.send('update-tab-title', { tabId, title });
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
      if (!window.__electronHandlersInstalled) {
        window.__electronHandlersInstalled = true;

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
            if (isRealNavigation && (window.__electronTabLocked || window.__electronForceNewTab)) {
              console.log('ELECTRON_LOCKED_NAVIGATE:' + nextUrl.href);
              return;
            }
            const result = original.apply(this, args);
            console.log('ELECTRON_URL_UPDATE:' + window.location.href);
            return result;
          };
        });

        window.addEventListener('popstate', () => {
          console.log('ELECTRON_URL_UPDATE:' + window.location.href);
        });

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

        // Eén gecombineerde click-listener (in plaats van twee losse), zodat de
        // terugknop-check altijd EERST loopt. Anders kan een "Terug"/"Vorige"
        // die als <a href> (in plaats van <button>) is gebouwd, al door de
        // linkhandler zijn afgevangen (en dus als nieuw tabblad geopend worden)
        // vóórdat de terugknop-check er zelfs maar naar kijkt.
        document.addEventListener('click', (event) => {
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
          if (!clickable) return;

          const isBackButton = [
            clickable.textContent,
            clickable.getAttribute('aria-label'),
            clickable.getAttribute('title'),
            clickable.getAttribute('data-testid')
          ].some(isBackLabel);

          if (isBackButton) {
            // Terugknoppen zijn een uitzondering op "alle links in nieuwe tab":
            // die moeten gewoon terugnavigeren, niet iets nieuws openen.
            console.log('ELECTRON_BACK_BUTTON');
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          // Alleen als het DICHTSTBIJZIJNDE interactieve element zelf de link
          // is behandelen we dit als een linkklik. Een onafhankelijke zoektocht
          // naar 'a[href]' verderop in de boom (los van clickable) ving ook
          // knoppen af die toevallig ergens BINNEN een omliggende <a> zitten
          // (bv. een "bewerken"-potloodje in een klikbare kaart) - dan werd de
          // klik gekaapt en de link geopend/genavigeerd in plaats van de knop
          // zijn eigen actie te laten gebeuren.
          if (clickable.tagName !== 'A' || !clickable.hasAttribute('href')) return;
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
    `);
  });

  // Vang signalen uit de tab op en stuur ze door naar de juiste tabactie
  view.webContents.on('console-message', (event) => {
    const message = event.message;

    if (message.startsWith('ELECTRON_LINK_CLICK:')) {
      const url = message.replace('ELECTRON_LINK_CLICK:', '');
      if (!isInternalUrl(url)) shell.openExternal(url);
      else createTab(url, true, false, tabId);
      return;
    }

    if (message.startsWith('ELECTRON_LOCKED_NAVIGATE:')) {
      const url = message.replace('ELECTRON_LOCKED_NAVIGATE:', '');
      if (!isInternalUrl(url)) shell.openExternal(url);
      else createTab(url, true, false, tabId);
      return;
    }

    if (message === 'ELECTRON_BACK_BUTTON') {
      // Gebruikt bewust de 'view' uit de sluiting van attachNavigationHandlers
      // (niet tabs.get(tabId)): die laatste is leeg voor een losgetrokken tab
      // (zie detachTab), waardoor in-pagina "terug" binnen zo'n los venster
      // anders zou stoppen met werken.
      if (view.webContents.navigationHistory.canGoBack()) {
        internalNavigations.add(tabId);
        view.webContents.navigationHistory.goBack();
        return;
      }

      // Alleen relevant als deze tab nog in de tabbalk zit: eerst de tab
      // waar dit tabblad daadwerkelijk uit geopend is (parentTabs); pas als
      // dat er niet is, terugvallen op de laatst bekeken tab. Anders springt
      // de terugknop naar wat toevallig het laatst actief was, in plaats van
      // terug naar waar de pagina vandaan kwam. Een losgetrokken venster
      // heeft geen andere tabs om naar terug te vallen.
      const previousTabId = parentTabs.get(tabId) || previousTabs.get(tabId);
      if (previousTabId && tabs.has(previousTabId)) switchTab(previousTabId, { recordHistory: false });
      return;
    }

    if (message.startsWith('ELECTRON_URL_UPDATE:')) {
      const newUrl = message.replace('ELECTRON_URL_UPDATE:', '');
      mainWindow.webContents.send('update-tab-url', { tabId, url: newUrl });
      return;
    }

    if (message.startsWith('ELECTRON_FOCUS_EDITABLE:')) {
      isFocusOnEditableField = message.endsWith('true');
    }
  });
}

function createTab(url, makeActive = true, lockTab = false, parentTabId = null) {
  if (!isInternalUrl(url)) {
    shell.openExternal(url);
    return null;
  }

  const tabId = `tab-${++tabCounter}`;

  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.contentView.addChildView(view);
  // Alleen de actieve tab mag echte afmetingen krijgen; anders blijft een
  // niet-actieve tab (bv. een tweede starttab) zichtbaar bovenop de rest.
  view.setBounds(makeActive ? getViewBounds() : { x: 0, y: 0, width: 0, height: 0 });
  view.webContents.zoomFactor = appSettings.zoomFactor;
  view.webContents.loadURL(url);

  attachNavigationHandlers(view, tabId);
  tabs.set(tabId, view);
  if (parentTabId && tabs.has(parentTabId)) parentTabs.set(tabId, parentTabId);

  if (lockTab) {
    lockedTabs.add(tabId);
    view.webContents.executeJavaScript('window.__electronTabLocked = true;');
  }

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

  for (const [id, view] of tabs) {
    if (id !== tabId) view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  activeTabId = tabId;
  applyActiveTabBounds();
  mainWindow.webContents.send('tab-switched', tabId);
  sendNavigationState(tabId);
}

function closeTab(tabId) {
  const view = tabs.get(tabId);
  if (!view) return;

  // Zelfde volgorde als bij de terugknop: eerst terug naar de tab waaruit
  // deze geopend is, pas daarna naar de laatst bekeken tab.
  const fallbackTabId = parentTabs.get(tabId) || previousTabs.get(tabId);

  // Beide defensief: een view/webContents die al kapot is (bv. na een
  // geblokkeerde externe navigatie of een gecrashte renderer) mag het sluiten
  // nooit laten crashen - dat is een main-process exception en gooit de HELE
  // app onderuit, niet alleen dit tabblad.
  try {
    mainWindow.contentView.removeChildView(view);
  } catch {
    // Al losgekoppeld; niets meer te doen.
  }
  try {
    if (view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  } catch {
    // Al gesloten/vervallen.
  }
  tabs.delete(tabId);
  parentTabs.delete(tabId);
  previousTabs.delete(tabId);
  for (const [id, previousTabId] of previousTabs) {
    if (previousTabId === tabId) previousTabs.delete(id);
  }
  lockedTabs.delete(tabId);
  mainWindow.webContents.send('tab-closed', tabId);

  if (activeTabId === tabId) {
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
// Bewuste beperking: links die normaal een NIEUWE tab zouden openen (bv. een
// vergrendelde tab, of de "alles in nieuwe tab"-instelling) komen vanuit een
// losgetrokken venster gewoon weer in het hoofdvenster terecht - createTab()
// is nog steeds overal aan mainWindow gekoppeld. Alleen gewone in-place
// navigatie binnen het losgetrokken venster blijft daarin plaatsvinden.
function detachTab(tabId, screenX, screenY) {
  const view = tabs.get(tabId);
  if (!view) return;

  const fallbackTabId = parentTabs.get(tabId) || previousTabs.get(tabId);
  const wasActive = activeTabId === tabId;

  try {
    mainWindow.contentView.removeChildView(view);
  } catch {
    // Al losgekoppeld; niets meer te doen.
  }
  tabs.delete(tabId);
  parentTabs.delete(tabId);
  previousTabs.delete(tabId);
  for (const [id, previousTabId] of previousTabs) {
    if (previousTabId === tabId) previousTabs.delete(id);
  }
  lockedTabs.delete(tabId);
  mainWindow.webContents.send('tab-closed', tabId);

  if (wasActive) {
    if (fallbackTabId && tabs.has(fallbackTabId)) {
      switchTab(fallbackTabId);
    } else {
      const remaining = [...tabs.keys()];
      if (remaining.length > 0) {
        switchTab(remaining[remaining.length - 1]);
      } else {
        activeTabId = null;
        createTab(START_URL);
      }
    }
  }

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  detachedWindow.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width, height });

  detachedWindow.on('resize', () => {
    const bounds = detachedWindow.getContentBounds();
    view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  });

  detachedWindows.set(tabId, { window: detachedWindow, view });

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
ipcMain.on('switch-tab', (event, tabId) => switchTab(tabId));
ipcMain.on('close-tab', (event, tabId) => closeTab(tabId));
ipcMain.on('detach-tab', (event, { tabId, screenX, screenY }) => {
  if (event.sender !== mainWindow.webContents || !tabs.has(tabId)) return;
  detachTab(tabId, screenX, screenY);
});
ipcMain.on('request-new-tab', (event, url) => createTab(url || START_URL));
ipcMain.on('navigate-active-tab', (event, action) => {
  if (event.sender !== mainWindow.webContents || !activeTabId) return;

  const view = tabs.get(activeTabId);
  if (!view) return;

  if (action === 'back' && view.webContents.navigationHistory.canGoBack()) {
    internalNavigations.add(activeTabId);
    view.webContents.navigationHistory.goBack();
  } else if (action === 'back' && (parentTabs.has(activeTabId) || previousTabs.has(activeTabId))) {
    switchTab(parentTabs.get(activeTabId) || previousTabs.get(activeTabId), { recordHistory: false });
  } else if (action === 'forward' && view.webContents.navigationHistory.canGoForward()) {
    internalNavigations.add(activeTabId);
    view.webContents.navigationHistory.goForward();
  } else if (action === 'reload') {
    view.webContents.reload();
  }
});
ipcMain.on('set-tab-locked', (event, { tabId, locked }) => {
  if (event.sender !== mainWindow.webContents || !tabs.has(tabId)) return;

  if (locked) lockedTabs.add(tabId);
  else lockedTabs.delete(tabId);
  tabs.get(tabId).webContents.executeJavaScript(`window.__electronTabLocked = ${locked};`);
  mainWindow.webContents.send('tab-lock-changed', { tabId, locked });
});
ipcMain.on('show-tab-context-menu', (event, { tabId, x, y }) => {
  if (event.sender !== mainWindow.webContents || !tabs.has(tabId)) return;

  const locked = lockedTabs.has(tabId);
  const currentUrl = tabs.get(tabId).webContents.getURL();
  const isStartTab = appSettings.startTabs.some(tab => tab.url === currentUrl);

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
      mainWindow.webContents.send('open-settings-panel', { section: 'groups', focusGroupId: newGroup.id });
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
        tabs.get(tabId).webContents.executeJavaScript(`window.__electronTabLocked = ${nextLocked};`);
        mainWindow.webContents.send('tab-lock-changed', { tabId, locked: nextLocked });
      }
    },
    {
      label: 'Openen bij opstarten',
      type: 'checkbox',
      checked: isStartTab,
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
ipcMain.handle('get-settings', (event) => {
  if (event.sender !== mainWindow.webContents) return null;
  return {
    zoomFactor: appSettings.zoomFactor,
    startTabs: appSettings.startTabs,
    tabGroups: appSettings.tabGroups,
    openAllLinksInNewTab: appSettings.openAllLinksInNewTab,
    showOnboarding: appSettings.showOnboarding,
    blockCtrlB: appSettings.blockCtrlB
  };
});
ipcMain.on('set-block-ctrl-b', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.blockCtrlB = !!value;
  saveSettings();
});
ipcMain.on('set-show-onboarding', (event, value) => {
  if (event.sender !== mainWindow.webContents) return;
  appSettings.showOnboarding = !!value;
  saveSettings();
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
ipcMain.on('changelog-notice-closed', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  changelogNoticeOpen = false;
  applyActiveTabBounds();
});
ipcMain.on('onboarding-started', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  onboardingActive = true;
  applyActiveTabBounds();
});
ipcMain.on('onboarding-ended', (event) => {
  if (event.sender !== mainWindow.webContents) return;
  onboardingActive = false;
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
  applyActiveTabBounds();
});
ipcMain.on('copy-to-clipboard', (event, text) => {
  if (event.sender !== mainWindow.webContents) return;
  clipboard.writeText(text);
});

function createWindow() {
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
  splashWindow.loadFile('splash.html');
  splashWindow.webContents.once('did-finish-load', () => {
    // Het versienummer stond hardcoded in splash.html en liep zo bij elke
    // release uit de pas met de echte (titelbalk-)versie; nu overschrijven
    // we 'm hier met de werkelijke app.getVersion().
    splashWindow.webContents.executeJavaScript(
      `document.querySelector('.version-pill').textContent = 'v${app.getVersion()}';`
    ).catch(() => {});
  });
  const splashStartTime = Date.now();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: `Singeling App v${app.getVersion()}`,
    icon: path.join(__dirname, 'assets/icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Alle tab-aanmaak (createTab) is aan mainWindow gekoppeld, dus zonder
  // mainWindow raakt de app sowieso onbruikbaar. Sluit dan ook meteen
  // eventuele losgetrokken vensters mee i.p.v. ze als wees te laten hangen.
  mainWindow.on('closed', () => {
    app.quit();
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

  mainWindow.once('ready-to-show', () => {
    const elapsedTime = Date.now() - splashStartTime;
    const minimumSplashTime = 5000;
    const remainingTime = minimumSplashTime - elapsedTime;

    const finish = () => {
      if (!splashWindow.isDestroyed()) splashWindow.close();
      if (!mainWindow.isDestroyed()) {
        mainWindow.maximize();
        mainWindow.show();
        // Geen zichtbare "controleren op updates"-melding meer: de controle
        // loopt gewoon stil op de achtergrond (een gevonden update toont
        // alsnog zijn eigen dialoog, zie setupAutoUpdater).
        setupAutoUpdater().then(() => {
          scheduleDailyUpdateCheck();
        });
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
  loadSettings();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});