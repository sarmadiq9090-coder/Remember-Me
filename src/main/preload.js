const { contextBridge, ipcRenderer } = require('electron');
// The palette, language and direction the window was opened with (main's additionalArguments),
// applied before the first paint.
const flag = name => (process.argv.find(arg => arg.startsWith(`--waqt-${name}=`)) || '').slice(`--waqt-${name}=`.length);
const palette = flag('palette'), language = /^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$/.test(flag('language')) ? flag('language') : '';
const dir = flag('dir') === 'rtl' ? 'rtl' : 'ltr';
contextBridge.exposeInMainWorld('waqt', {
  palette, language, dir,
  call: (action, payload) => ipcRenderer.invoke('waqt:action', action, payload),
  onUpdate: (callback) => { const listener = () => callback(); ipcRenderer.on('waqt:update', listener); return () => ipcRenderer.removeListener('waqt:update', listener); },
  // The tray asks the main window to show a section by name (only 'about' today).
  onShow: (callback) => { const listener = (event, section) => callback(String(section)); ipcRenderer.on('waqt:show', listener); return () => ipcRenderer.removeListener('waqt:show', listener); },
});
