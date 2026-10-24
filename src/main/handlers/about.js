'use strict';
const fs = require('node:fs');
const os = require('node:os');
const { linkUrl, diagnostics } = require('../../platform/about');

module.exports = ctx => {
  const { shell, clipboard } = ctx.electron;
  return {
    openLink: { readOnly: true, run: async payload => { await shell.openExternal(linkUrl(payload.link)); } },
    copyDiagnostics: { readOnly: true, run: () => {
      const value = diagnostics({ version: ctx.app.getVersion(), packaged: ctx.app.isPackaged, versions: process.versions, windows: os.release(), arch: process.arch,
        language: ctx.language(), theme: ctx.store.state.settings.theme });
      clipboard.writeText(value);
      return value;
    } },
    openLogs: { readOnly: true, run: async () => {
      // The folder appears with the first log line; create it so the button always opens something.
      fs.mkdirSync(ctx.log.folder, { recursive: true });
      const error = await shell.openPath(ctx.log.folder);
      if (error) throw new Error(ctx.tr("Couldn't open the log folder."));
    } },
    dataFolder: { readOnly: true, run: async () => { await shell.openPath(ctx.app.getPath('userData')); } },
  };
};
