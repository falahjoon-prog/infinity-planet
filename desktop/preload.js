// Minimal, safe bridge exposed to the RHC City web app as window.rhcDesktop.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rhcDesktop', {
  platform: process.platform,
  version: '4.0.0',
  notify: (title, body, href) => ipcRenderer.send('rhc:notify', { title, body, href }),
  setBadge: (count) => ipcRenderer.send('rhc:badge', count),
  onNavigate: (cb) => ipcRenderer.on('rhc:navigate', (_e, href) => cb(href)),
  setServer: (url) => ipcRenderer.invoke('rhc:set-server', url),
  getServer: () => ipcRenderer.invoke('rhc:get-server'),
});
