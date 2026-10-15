// Preload voor de balk bovenin een losgetrokken venster (detached.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('detachedAPI', {
  navigate: (action) => ipcRenderer.send('detached-navigate', action),
  windowControl: (action) => ipcRenderer.send('detached-window-control', action),
  onState: (callback) => ipcRenderer.on('detached-state', (event, state) => callback(state)),
  onMaximized: (callback) => ipcRenderer.on('detached-maximized', (event, maximized) => callback(maximized)),
  onTheme: (callback) => ipcRenderer.on('detached-theme', (event, dark) => callback(dark))
});
