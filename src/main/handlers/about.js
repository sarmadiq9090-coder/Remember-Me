'use strict';
const fs = require('node:fs');
const os = require('node:os');
const { linkUrl, diagnostics, STORE_LINKS } = require('../../platform/about');
const { appList, appLinkUrl } = require('../../platform/more-apps');

module.exports = ctx => {
  const { shell, clipboard } = ctx.electron;
  return {
    // Web pages open in the browser (https only); "More from FastKiwi" opens the publisher's page in the Microsoft Store.
    // The other FastKiwi apps (app:<id>, store:<id>) open their page on fastkiwi.app in the interface's language, or their Store page.
    openLink: { readOnly: true, run: async payload => {
      if (payload.link === 'moreApps') await ctx.openStoreLink(STORE_LINKS.get('moreApps'));
      else if (payload.link.startsWith('store:')) await ctx.openStoreLink(appLinkUrl(payload.link, ctx.language()));
      else if (payload.link.startsWith('app:')) await shell.openExternal(appLinkUrl(payload.link, ctx.language()));
      else await shell.openExternal(linkUrl(payload.link));
    } },
    // More from FastKiwi: the embedded list of the other apps, never fetched.
    otherApps: { readOnly: true, run: () => appList() },
    copyDiagnostics: { readOnly: true, run: () => {
      const value = diagnostics({ version: ctx.app.getVersion(), packaged: ctx.app.isPackaged, versions: process.versions, windows: os.release(), arch: process.arch,
        language: ctx.language(), theme: ctx.store.state.settings.theme });
      clipboard.writeText(value);
      return value;
    } },
    // Opens a pre-filled GitHub issue in the browser; the user reviews and submits it there.
    reportProblem: { readOnly: true, run: async () => { await ctx.problems.openReport('manual'); } },
    openLogs: { readOnly: true, run: async () => {
      // The folder appears with the first log line; create it so the button always opens something.
      fs.mkdirSync(ctx.log.folder, { recursive: true });
      const error = await shell.openPath(ctx.log.folder);
      if (error) throw new Error(ctx.tr("Couldn't open the log folder."));
    } },
    dataFolder: { readOnly: true, run: async () => { await shell.openPath(ctx.app.getPath('userData')); } },
  };
};
