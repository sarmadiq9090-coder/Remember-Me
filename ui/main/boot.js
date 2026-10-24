// Update and Drive buttons, keyboard shortcuts, and the first refresh. Loaded last.
document.addEventListener('click', async e => {
  const button = e.target.closest('[data-update]');
  if (!button) return;
  const action = button.dataset.update;
  button.disabled = true;
  try {
    if (action === 'allow' || action === 'decline') await api('updateConsent', { enabled: action === 'allow' });
    else await api(action);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; await refresh(); }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'setting-updates') return;
  try { await api('updateConsent', { enabled: e.target.checked }); toast(tr("Settings saved.")); } catch (error) { toast(error.message); }
  await refresh();
});
$('drive-now').addEventListener('click', async () => { $('drive-now').disabled = true; const status = await driveAction('driveBackupNow'); if (status) toast(`${tr("Saved locally and to the Drive folder. Google Drive finishes the upload.")} ${skippedText(status.skipped)}`.trim()); });
$('drive-automatic').addEventListener('change', () => driveAction('driveAutomatic', { enabled: $('drive-automatic').checked }));
$('drive-keep').addEventListener('change', () => driveAction('driveKeep', { keep: Number($('drive-keep').value) }));
$('drive-install').addEventListener('click', () => driveAction('driveHelp'));
$('drive-open').addEventListener('click', () => driveAction('openDriveFolder'));
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  // e.code is the physical key, so the shortcuts also work while an Arabic, Russian or other layout is active.
  if (e.ctrlKey && !e.altKey && e.code === 'KeyN') { e.preventDefault(); view === 'notes' ? openNoteEditor() : openTaskEditor(); }
  if (e.ctrlKey && !e.altKey && e.code === 'KeyK') { e.preventDefault(); $('search').focus(); }
});
window.waqt.onUpdate(refresh);
window.waqt.onShow(section => { if (section === 'about') showAbout(); });
refresh().then(() => {
  if (state?.recovered) toast(tr("Your data was restored from backup after the original file could not be read."));
  else if (state?.driveBackup?.stale) toast(tr("Backups to Google Drive have been stalled for over a day. Open Settings for details."));
});
setInterval(() => { if (!document.querySelector('dialog[open]')) render(); }, 30000);
