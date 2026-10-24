'use strict';
const path = require('node:path');
const { exportBackup } = require('../../data/attachments');
const { readBackup, restoreBackup } = require('../../data/backups');

module.exports = ctx => {
  const { tr } = ctx, { dialog, shell } = ctx.electron;
  const folder = () => ctx.app.getPath('userData');
  return {
    export: { readOnly: true, run: async () => {
      const result = await dialog.showOpenDialog(ctx.mainWindow, { title: tr("Choose where to save the backup with attachments"), properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled) return undefined;
      const skipped = [];
      const value = { folder: await exportBackup(ctx.store.state, folder(), result.filePaths[0], { skipped }), skipped };
      ctx.log.info('export', { attachments: ctx.store.state.attachments.length, skipped: skipped.length });
      return value;
    } },
    restore: { run: async () => {
      const result = await dialog.showOpenDialog(ctx.mainWindow, { title: tr("Choose a Remember Me backup folder"), properties: ['openDirectory'], defaultPath: path.join(folder(), 'backups') });
      if (result.canceled) return undefined;
      const backup = await readBackup(result.filePaths[0]);
      const { tasks, notes, attachments } = backup.state;
      const when = backup.createdAt ? new Date(backup.createdAt).toLocaleString(ctx.localeTag()) : tr("unknown");
      const { response } = await dialog.showMessageBox(ctx.mainWindow, { type: 'warning', title: tr("Restore a backup"),
        message: tr("This backup will replace all your current tasks and notes."),
        detail: [tr('Tasks: {tasks} • Notes: {notes} • Attachments: {attachments} • Backup date: {date}', { tasks: tasks.length, notes: notes.length, attachments: attachments.length, date: when }),
          backup.verified ? tr('Every file was verified.') : tr('Older backup without checksums: only file presence and sizes were checked.'),
          tr('A safety copy of your current data is saved in the backups folder first.')].join('\n'),
        buttons: [tr("Cancel"), tr("Restore")], defaultId: 0, cancelId: 0 });
      if (response !== 1) return undefined;
      ctx.preview = null;
      const value = await restoreBackup(folder(), ctx.store, backup);
      ctx.log.info('restore', { tasks: tasks.length, notes: notes.length, attachments: attachments.length, verified: backup.verified });
      // The restored language, theme and alert side apply at once; update consent stays as it was.
      ctx.rebuildTrayMenu(); ctx.placeAlert(); ctx.applyTheme(); ctx.updates.consentChanged();
      return value;
    } },
    chooseDriveFolder: { run: async () => {
      const result = await dialog.showOpenDialog(ctx.mainWindow, { title: tr("Choose a synced folder inside Google Drive"), properties: ['openDirectory', 'createDirectory'], defaultPath: ctx.driveBackup.status().folder || undefined });
      if (result.canceled) return undefined;
      await ctx.driveBackup.configure(result.filePaths[0]);
      return ctx.driveBackup.status();
    } },
    driveBackupNow: { run: () => ctx.driveBackup.run() },
    driveAutomatic: { run: payload => { ctx.driveBackup.setAutomatic(payload.enabled); } },
    driveKeep: { run: async payload => {
      const keep = payload.keep;
      const expired = await ctx.driveBackup.expired(keep);
      if (expired.length) {
        const { response } = await dialog.showMessageBox(ctx.mainWindow, { type: 'warning', title: tr("Delete old backups"),
          message: tr("{count} older automatic backups will be deleted.", { count: expired.length }),
          detail: tr("The newest copies and backups you exported yourself are kept. Copies removed from the Drive folder go to the Google Drive trash."),
          buttons: [tr("Cancel"), tr("Delete")], defaultId: 0, cancelId: 0 });
        if (response !== 1) return;
      }
      await ctx.driveBackup.setKeep(keep);
    } },
    driveHelp: { readOnly: true, run: async () => { await shell.openExternal('https://www.google.com/drive/download/'); } },
    openDriveFolder: { readOnly: true, run: async () => {
      const drive = ctx.driveBackup.status().folder;
      if (!drive) throw new Error(tr("Choose a Google Drive folder first."));
      const error = await shell.openPath(drive);
      if (error) throw new Error(tr("The Google Drive folder is not available right now."));
    } },
  };
};
