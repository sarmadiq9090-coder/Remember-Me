const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('waqt', {
  call: (action, payload) => ipcRenderer.invoke('waqt:action', action, payload),
  onUpdate: (callback) => { const listener = () => callback(); ipcRenderer.on('waqt:update', listener); return () => ipcRenderer.removeListener('waqt:update', listener); },
  // The tray's "New task". Carries no data, so the page only learns that it was chosen.
  onOpenEditor: (callback) => { const listener = () => callback(); ipcRenderer.on('waqt:open-editor', listener); return () => ipcRenderer.removeListener('waqt:open-editor', listener); },
  // The tray asks the main window to show a section by name (only 'about' today).
  onShow: (callback) => { const listener = (event, section) => callback(String(section)); ipcRenderer.on('waqt:show', listener); return () => ipcRenderer.removeListener('waqt:show', listener); },
});
