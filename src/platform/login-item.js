'use strict';
const path = require('node:path');
const ARGS = ['--background'];
// Executables older versions registered, next to the current one in the install folder.
const LEGACY_EXECUTABLES = ['Waqt.exe'];

// The Microsoft Store (MSIX) version can't use the HKCU Run key that app.setLoginItemSettings
// writes: a packaged app's registry writes go to its private copy of the registry, which Windows
// never reads at sign-in. Its package declares a startup task instead (tools/store.cjs), disabled
// until the user turns it on in Settings > Apps > Startup or Task Manager. Electron has no API to
// turn a startup task on, so the app opens that page for the user.
const STARTUP_TASK_ID = 'RememberMeStartup';
const STARTUP_SETTINGS = 'ms-settings:startupapps';
// The <desktop:Extension> the package manifest gets. Enabled="false": Remember Me starts with
// Windows only after the user turns it on, as the installer version does.
function startupTaskExtension(executable, displayName) {
  const xml = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
        <desktop:Extension Category="windows.startupTask" Executable="${xml(executable)}" EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask TaskId="${STARTUP_TASK_ID}" Enabled="false" DisplayName="${xml(displayName)}" />
        </desktop:Extension>`;
}
// The AppUserModelID of the installer version. It predates the Remember Me name: it names the start-with-Windows
// entry and taskbar group of v1.4.0, and matches the installer's appId, so it must stay the same for upgrades.
// The Store package has its own, <package family name>!RememberMe, which Windows gives it from the package
// identity; setting this one there would split its taskbar button from its pinned tile and Start entry.
const APP_USER_MODEL_ID = 'com.waqt.reminder';
function appUserModelId({ windowsStore = false } = {}) { return windowsStore ? null : APP_USER_MODEL_ID; }
// Returns false when nothing was registered (the Store version, whose startup task Windows manages).
function setLoginItem(app, enabled, execPath, { windowsStore = false } = {}) {
  if (windowsStore) return false;
  app.setLoginItemSettings({ openAtLogin: enabled, path: execPath, args: ARGS });
  return true;
}
// Points start with Windows at this executable again. Entries for the exe of an older version
// (Waqt.exe until v1.4) are removed first; if the user disabled the entry in Task Manager it
// stays disabled.
function refreshLoginItem(app, execPath) {
  const items = [];
  for (const exe of [execPath, ...LEGACY_EXECUTABLES.map(name => path.join(path.dirname(execPath), name))]) {
    for (const item of app.getLoginItemSettings({ path: exe, args: ARGS }).launchItems || []) items.push(item);
  }
  const enabled = items.every(item => item.enabled !== false);
  for (const item of items) app.setLoginItemSettings({ openAtLogin: false, name: item.name, path: item.path, args: item.args });
  app.setLoginItemSettings({ openAtLogin: true, path: execPath, args: ARGS, enabled });
}
module.exports = { APP_USER_MODEL_ID, appUserModelId, STARTUP_TASK_ID, STARTUP_SETTINGS, startupTaskExtension, setLoginItem, refreshLoginItem };
