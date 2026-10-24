const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('waqt', {
  call: (action, payload) => ipcRenderer.invoke('waqt:action', action, payload),
  onUpdate: (callback) => { const listener = () => callback(); ipcRenderer.on('waqt:update', listener); return () => ipcRenderer.removeListener('waqt:update', listener); },
  // The tray's "New task". Carries no data, so the page only learns that it was chosen.
  onOpenEditor: (callback) => { const listener = () => callback(); ipcRenderer.on('waqt:open-editor', listener); return () => ipcRenderer.removeListener('waqt:open-editor', listener); },
});
