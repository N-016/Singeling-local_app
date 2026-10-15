const { contextBridge, ipcRenderer } = require('electron');

const incomingChannels = ['update-notice-show', 'update-notice-state', 'update-notice-hide', 'tab-created', 'tab-switched', 'update-tab-url', 'tab-closed', 'tab-lock-changed', 'navigation-state-changed', 'zoom-changed', 'start-tabs-changed', 'tab-groups-changed', 'open-tab-overview', 'whats-new', 'update-badge-changed', 'window-shown', 'window-maximized-changed'];

contextBridge.exposeInMainWorld('electronAPI', {
  switchTab: (tabId) => ipcRenderer.send('switch-tab', tabId),
  closeTab: (tabId) => ipcRenderer.send('close-tab', tabId),
  requestNewTab: (url) => ipcRenderer.send('request-new-tab', url),
  navigateActiveTab: (action) => ipcRenderer.send('navigate-active-tab', action),
  setTabLocked: (tabId, locked) => ipcRenderer.send('set-tab-locked', { tabId, locked }),
  showTabContextMenu: (tabId, x, y) => ipcRenderer.send('show-tab-context-menu', { tabId, x, y }),
  detachTab: (tabId, { screenX, screenY }) => ipcRenderer.send('detach-tab', { tabId, screenX, screenY }),
  acceptAppNotice: () => ipcRenderer.send('app-notice-accepted'),
  notifyOnboardingStarted: () => ipcRenderer.send('onboarding-started'),
  notifyOnboardingEnded: () => ipcRenderer.send('onboarding-ended'),
  notifySettingsPanelOpened: () => ipcRenderer.send('settings-panel-opened'),
  notifySettingsPanelClosed: () => ipcRenderer.send('settings-panel-closed'),
  notifyUpdateBannerOpened: () => ipcRenderer.send('update-banner-opened'),
  notifyUpdateBannerClosed: () => ipcRenderer.send('update-banner-closed'),
  copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setOpenAllLinksInNewTab: (value) => ipcRenderer.send('set-open-all-links-in-new-tab', value),
  setShowOnboarding: (value) => ipcRenderer.send('set-show-onboarding', value),
  setBlockCtrlB: (value) => ipcRenderer.send('set-block-ctrl-b', value),
  setNotClockedMode: (mode) => ipcRenderer.send('set-not-clocked-mode', mode),
  markPreferencesChosen: () => ipcRenderer.send('mark-preferences-chosen'),
  setBetaUpdates: (value) => ipcRenderer.send('set-beta-updates', value),
  setDarkMode: (value) => ipcRenderer.send('set-dark-mode', value),
  windowControl: (action) => ipcRenderer.send('window-control', action),
  getTabThumbnails: () => ipcRenderer.invoke('get-tab-thumbnails'),
  notifyTabOverviewOpened: () => ipcRenderer.send('tab-overview-opened'),
  notifyTabOverviewClosed: () => ipcRenderer.send('tab-overview-closed'),
  checkForUpdatesNow: () => ipcRenderer.invoke('check-for-updates-now'),
  installUpdate: () => ipcRenderer.send('update-notice-install'),
  postponeUpdate: () => ipcRenderer.send('update-notice-later'),
  getChangelog: () => ipcRenderer.invoke('get-changelog'),
  notifyChangelogNoticeOpened: () => ipcRenderer.send('changelog-notice-opened'),
  notifyChangelogNoticeClosed: () => ipcRenderer.send('changelog-notice-closed'),
  markWhatsNewSeen: (ids) => ipcRenderer.send('mark-whats-new-seen', ids),
  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  zoomReset: () => ipcRenderer.send('zoom-reset'),
  removeStartTab: (index) => ipcRenderer.send('remove-start-tab', index),
  setStartTabLocked: (index, locked) => ipcRenderer.send('set-start-tab-locked', { index, locked }),
  renameTabGroup: (id, name) => ipcRenderer.send('rename-tab-group', { id, name }),
  removeTabGroup: (id) => ipcRenderer.send('remove-tab-group', id),
  removeTabGroupUrl: (groupId, urlIndex) => ipcRenderer.send('remove-tab-group-url', { groupId, urlIndex }),
  openTabGroup: (id) => ipcRenderer.send('open-tab-group', id),
  on: (channel, callback) => {
    if (!incomingChannels.includes(channel)) return undefined;

    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});