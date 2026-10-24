const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('waqt', {
  call: (action, payload) => ipcRenderer.invoke('waqt:action', action, payload),
  onUpdate: (callback) => { const listener = () => callback(); ipcRenderer.on('waqt:update', listener); return () => ipcRenderer.removeListener('waqt:update', listener); },
});
