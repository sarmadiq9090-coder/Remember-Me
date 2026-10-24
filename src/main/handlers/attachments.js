'use strict';
const { storageUsage, removeOrphans, opensAsProgram, importFiles, resolveAttachment, MAX_ATTACHMENTS } = require('../../data/attachments');
const { formatSize } = require('../../../ui/lib/translate');

module.exports = ctx => {
  const { tr } = ctx, { dialog, shell } = ctx.electron;
  const folder = () => ctx.app.getPath('userData');
  // The alert window may open or preview only files of a reminder it is showing.
  const ofActiveAlert = (event, id) => event.sender !== ctx.alertWindow?.webContents || ctx.activeAlerts().some(t => (t.attachments || []).includes(id));
  return {
    attachFiles: { run: async payload => {
      const remaining = Math.min(MAX_ATTACHMENTS, Math.max(0, Number(payload?.remaining) || 0));
      if (!remaining) throw new Error(tr('You have reached the limit of 20 attachments.'));
      const result = await dialog.showOpenDialog(ctx.mainWindow, { title: tr('Add attachments: PDF, Excel and other files'), properties: ['openFile', 'multiSelections'], filters: [
        { name: tr('All files'), extensions: ['*'] }, { name: tr('Images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }, { name: 'PDF', extensions: ['pdf'] }, { name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm', 'csv'] }, { name: tr('Documents'), extensions: ['docx', 'doc', 'txt', 'rtf'] }
      ] });
      if (result.canceled) return [];
      if (result.filePaths.length > remaining) throw new Error(tr('You can add {count} more files to this item.', { count: remaining }));
      const records = await importFiles(folder(), result.filePaths);
      ctx.store.change(s => { s.attachments.push(...records); });
      return records;
    } },
    openAttachment: { readOnly: true, run: async (payload, { event }) => {
      if (!ofActiveAlert(event, payload.id)) throw new Error(tr('This attachment does not belong to an active reminder.'));
      const { file, record } = resolveAttachment(ctx.store.state, folder(), payload.id);
      if (opensAsProgram(record.name)) shell.showItemInFolder(file);
      else {
        const error = await shell.openPath(file);
        if (error) throw new Error(tr('The file could not be opened. Make sure an app for this file type, such as a PDF reader or Excel, is installed.'));
      }
    } },
    imagePreview: { readOnly: true, run: async (payload, { event }) => {
      if (!ofActiveAlert(event, payload.id)) throw new Error(tr('This image does not belong to an active reminder.'));
      return ctx.imagePreview(ctx.store.state, folder(), payload.id);
    } },
    storage: { readOnly: true, run: () => storageUsage(ctx.store.state, folder()) },
    cleanOrphans: { run: async () => {
      const usage = await storageUsage(ctx.store.state, folder());
      if (!usage.orphans) return usage;
      const size = formatSize(usage.orphanBytes, ctx.localeTag());
      const { response } = await dialog.showMessageBox(ctx.mainWindow, { type: 'warning', title: tr("Clean up attachments"),
        message: tr("{count} unused attachments ({size}) will be deleted.", { count: usage.orphans, size }),
        detail: tr("No task or note uses these files, including completed tasks. Backups keep their own copies."),
        buttons: [tr("Cancel"), tr("Delete")], defaultId: 0, cancelId: 0 });
      if (response !== 1) return undefined;
      ctx.log.info('clean-orphans', { count: (await removeOrphans(ctx.store, folder())).count });
      return storageUsage(ctx.store.state, folder());
    } },
  };
};
