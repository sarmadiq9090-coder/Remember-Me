// The Microsoft Store version's first start copies the data of the version installed from the website
// (src/platform/data-folder.js). If both versions keep running, every reminder shows twice, so a banner
// suggests uninstalling the old one. It stays, across restarts, until it is dismissed.
const installerNotice = document.createElement('div');
installerNotice.className = 'settings-card startup-warning'; installerNotice.hidden = true;
installerNotice.innerHTML = '<h2></h2><p></p><div class="dialog-footer"><button type="button" class="primary" data-dismiss></button></div>';
document.querySelector('.page-heading').after(installerNotice);
// 'show' after the import, 'dismissed' once dealt with; without storage it shows until dismissed in this session.
let installerNoticeDismissed = false;
function installerNoticeState() { try { return localStorage.getItem('installerCopyNotice'); } catch { return null; } }
function saveInstallerNoticeState(value) { try { localStorage.setItem('installerCopyNotice', value); } catch { /* storage unavailable */ } }
installerNotice.querySelector('[data-dismiss]').addEventListener('click', () => { installerNoticeDismissed = true; saveInstallerNoticeState('dismissed'); installerNotice.hidden = true; });
function renderInstallerNotice() {
  if (state.importedFromInstaller && !installerNoticeState()) saveInstallerNoticeState('show');
  const saved = installerNoticeState();
  installerNotice.hidden = installerNoticeDismissed || saved === 'dismissed' || !(state.importedFromInstaller || saved === 'show') || view === 'settings';
  installerNotice.querySelector('h2').textContent = tr("Uninstall the old Remember Me");
  installerNotice.querySelector('p').textContent = tr("Your tasks and notes were copied from the Remember Me installed from the website, and they are safe here. If both copies run, every reminder shows twice. Uninstall the old one in Windows Settings → Apps → Installed apps, where it is listed as Remember Me, not Remember Me Reminders.");
  installerNotice.querySelector('[data-dismiss]').textContent = tr("Dismiss");
}
