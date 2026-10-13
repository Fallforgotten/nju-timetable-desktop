const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('assistant', {
  act: (action, term) => ipcRenderer.invoke('assistant:action', action, term),
  listen: callback => ipcRenderer.on('assistant:status', (_event, value) => callback(value))
});
