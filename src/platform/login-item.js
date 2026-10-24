'use strict';
const path = require('node:path');
const ARGS = ['--background'];
// Executables older versions registered, next to the current one in the install folder.
const LEGACY_EXECUTABLES = ['Waqt.exe'];

function setLoginItem(app, enabled, execPath) {
  app.setLoginItemSettings({ openAtLogin: enabled, path: execPath, args: ARGS });
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
module.exports = { setLoginItem, refreshLoginItem };
