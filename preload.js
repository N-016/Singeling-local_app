const { contextBridge, ipcRenderer } = require('electron');

const incomingChannels = ['tab-created', 'tab-switched', 'update-tab-url', 'tab-closed', 'tab-lock-changed', 'navigation-state-changed', 'zoom-changed', 'start-tabs-changed', 'tab-groups-changed', 'open-settings-panel', 'show-changelog-notice', 'update-badge-changed'];

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
  setDarkMode: (value) => ipcRenderer.send('set-dark-mode', value),
  checkForUpdatesNow: () => ipcRenderer.invoke('check-for-updates-now'),
  getChangelog: () => ipcRenderer.invoke('get-changelog'),
  notifyChangelogNoticeClosed: () => ipcRenderer.send('changelog-notice-closed'),
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