// Settings cards: Google Drive backup, updates and About.
function renderDriveBackup() {
  const backup = state.driveBackup;
  if (!backup) return;
  $('drive-folder').textContent = backup.folder || tr("No sync folder selected yet");
  $('drive-automatic').checked = backup.automatic;
  $('drive-automatic').disabled = !backup.folder || backup.busy;
  $('drive-keep').value = String(backup.keep || 0);
  $('drive-keep').disabled = !backup.folder || backup.busy;
  $('choose-drive-folder').disabled = backup.busy;
  $('drive-now').disabled = !backup.folder || backup.busy;
  $('drive-now-label').textContent = backup.busy ? tr("Preparing and copying files…") : backup.pending ? tr("Retry backup") : tr("Back up now");
  $('drive-open').hidden = !backup.folder;
  const last = backup.lastCopiedAt ? dateLabel(backup.lastCopiedAt) : null;
  // When a retried copy reused an earlier snapshot, say when its data is from.
  const snapshot = backup.snapshotAt && backup.lastCopiedAt && Date.parse(backup.lastCopiedAt) - Date.parse(backup.snapshotAt) > 60000 ? dateLabel(backup.snapshotAt) : '';
  const stale = !backup.stale ? '' : !last ? tr("The Google Drive folder has been unavailable for over a day, and no backup has reached your account yet. Open Google Drive and sign in.") : tr("The Google Drive folder has been unavailable for over a day; no new backups have reached your account since {last}. Open Google Drive and sign in.", { last });
  $('drive-status').textContent = stale || backup.error || (backup.busy ? tr("Saving a local copy, then copying it to the Drive folder…") : backup.lastCopiedAt ? tr('Last copy to the sync folder: {last}{snapshot}. Check the Google Drive icon to confirm the upload finished.', { last, snapshot: snapshot ? tr(' (data from {date})', { date: snapshot }) : '' }) : tr("Install Google Drive and sign in, then choose a folder inside it. Google Drive uploads the copies when you are online."));
  if (!stale && !backup.error && backup.skipped?.length) $('drive-status').textContent += ' ' + skippedText(backup.skipped);
  $('drive-status').classList.toggle('backup-error', !!(stale || backup.error || backup.skipped?.length));
  $('drive-local').textContent = backup.lastLocalPath ? tr("A local copy is also kept on your PC.") : '';
}
// Rebuilds a block only when its content changes, so focus and clicks are not lost on refresh.
function setMarkup(el, html) { if (el.dataset.markup !== html) { el.dataset.markup = html; el.innerHTML = html; hydrateIcons(el); } }
function renderUpdateNotice() {
  const updates = state.updates, notice = $('update-notice');
  if (updates?.banner) setMarkup(notice, `<span data-icon="download"></span><p>${esc(tr("Version {next} is ready. Restart to update", { next: updates.next }))}</p><button class="primary" data-update="installUpdate">${tr("Restart now")}</button><button class="text-button" data-update="dismissUpdate">${tr("Later")}</button>`);
  else if (state.settings.autoUpdate === null) setMarkup(notice, `<span data-icon="info"></span><p>${tr("Remember Me can check GitHub for new versions and install them when you restart. Nothing else is sent.")}</p><button class="primary" data-update="allow">${tr("Allow")}</button><button class="text-button" data-update="decline">${tr("Not now")}</button>`);
  notice.hidden = !updates?.banner && state.settings.autoUpdate !== null;
}
function updateStatus(updates) {
  const next = updates.next, checked = updates.checkedAt ? dateLabel(updates.checkedAt) : '';
  switch (updates.state) {
    case 'checking': return tr("Checking for a new version…");
    case 'downloading': return tr("Downloading version {next}… {percent}%", { next, percent: updates.percent });
    case 'ready': return tr("Version {next} is ready and installs when you restart.", { next });
    case 'installing': return tr("Saving a safety copy of your data, then installing the update…");
    case 'latest': return tr("You have the latest version ({version}). Last checked: {checked}", { version: updates.version, checked });
    case 'error': return tr("Couldn't check for updates. Check your internet connection.");
    case 'unavailable': return tr("Updates work in the installed app only.");
    default: return tr("Current version {version}.", { version: updates.version });
  }
}
function renderUpdatesCard() {
  const updates = state.updates, busy = ['checking', 'downloading', 'installing'].includes(updates.state);
  setMarkup($('updates-card'), `<h2>${tr("Updates")}</h2><label class="setting-row"><div><strong>${tr("Check for updates automatically")}</strong><p>${tr("Checks GitHub once a day and downloads new versions in the background. Nothing else is sent.")}</p></div><input class="switch" id="setting-updates" type="checkbox"></label><div class="setting-row"><p id="update-status">${esc(updateStatus(updates))}</p><button class="soft-button" data-update="checkUpdates"${busy ? ' disabled' : ''}>${tr("Check now")}</button></div>`);
  $('setting-updates').checked = state.settings.autoUpdate === true;
}
// Settings → About. Links are sent as IDs from main's fixed list (src/platform/about.js), never as URLs.
const ABOUT_LINKS = [
  ['github', 'user', msg('Developed by Sarmad'), null, 'github.com/sarmadiq9090-coder'],
  ['repo', 'code', msg('Source code on GitHub'), null, 'github.com/sarmadiq9090-coder/Remember-Me'],
  ['releases', 'list', msg("What's new"), msg('Release notes for every version')],
  ['issues', 'flag', msg('Report a problem'), msg('Report a bug or suggest an idea')],
  ['privacy', 'shield', msg('Privacy'), msg('No account, no tracking, your data stays on your PC')],
  ['license', 'file', msg('License: MIT'), msg('Free and open source')],
];
function renderAboutCard() {
  const updates = state.updates, busy = ['checking', 'downloading', 'installing'].includes(updates.state);
  const links = ABOUT_LINKS.map(([id, iconName, title, detail, raw]) => `<button type="button" class="about-link" data-link="${id}"><span class="about-link-icon" data-icon="${iconName}"></span><span class="about-link-text"><strong>${tr(title)}</strong><small dir="auto">${detail ? tr(detail) : esc(raw)}</small></span><span class="about-link-open" data-icon="external"></span></button>`).join('');
  setMarkup($('about-card'), `<div class="about-head"><span class="about-icon" aria-hidden="true">${brandMark()}</span><div><span class="eyebrow">${tr('About')}</span><h2>${tr('Remember Me')}</h2><p class="about-version">${esc(tr('Version {version}', { version: updates.version }))}</p><p>${tr('Tasks, notes and reminders that stay on your PC.')}</p></div></div><div class="about-links">${links}</div><div class="setting-row"><p class="about-update-status">${esc(updateStatus(updates))}</p><button class="soft-button" data-update="checkUpdates"${busy ? ' disabled' : ''}>${tr('Check for updates')}</button></div><div class="setting-row"><div><strong>${tr('Diagnostic info')}</strong><p>${tr('Versions, language and theme only, to add to a problem report. Never your tasks, notes or files.')}</p></div><button class="soft-button" id="copy-diagnostics"><span data-icon="copy"></span> ${tr('Copy diagnostic info')}</button></div><div class="setting-row"><div><strong>${tr('App log')}</strong><p>${tr('A local record of app events and errors, without the titles of your tasks or notes or your file names. Attach it to a problem report if asked.')}</p></div><button class="soft-button" id="open-logs"><span data-icon="file"></span> ${tr('Open log folder')}</button></div><p class="about-footnote"><bdi>${tr('Built with Electron')}</bdi> • <bdi>© 2026 ${tr('Sarmad')}</bdi></p>`);
}
$('about-card').addEventListener('click', async e => {
  const link = e.target.closest('[data-link]');
  try {
    if (link) await api('openLink', { link: link.dataset.link });
    else if (e.target.closest('#open-logs')) await api('openLogs');
    else if (e.target.closest('#copy-diagnostics')) { await api('copyDiagnostics'); toast(tr('Diagnostic info copied. Paste it into your report.')); }
  } catch (error) { toast(error.message); }
});
async function showAbout() {
  if (!state) await refresh();
  setView('settings');
  $('about-card').scrollIntoView({ block: 'start' });
  $('about-card').focus({ preventScroll: true });
}
