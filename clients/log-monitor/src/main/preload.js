const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('logMonitor', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  getAppDataDir: () => ipcRenderer.invoke('app:dataDir'),
  getTaskStats: () => ipcRenderer.invoke('taskStats:get'),
  updateWatch: (payload) => ipcRenderer.send('watch:update', payload),
  setConcurrency: (n) => ipcRenderer.send('uploader:setConcurrency', n),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  onUploaderStatus: (cb) => ipcRenderer.on('uploader:status', (_e, data) => cb(data))
});


