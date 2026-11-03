// Settings → Quick add from anywhere (issue #82): the switch for the global shortcut and the shortcut itself.
// The shortcut button records the next key combination pressed on it; Escape or leaving it cancels.
const QUICK_ADD_RULE = msg('Use two of Ctrl, Alt and Shift with a letter, a digit, F1 to F12 or Space.');
const quickAddRows = document.createElement('div');
quickAddRows.innerHTML = '<label class="setting-row"><div><strong id="quickadd-setting-label"></strong><p></p><p class="quickadd-conflict" role="status"></p></div><input class="switch" id="setting-quick-add" type="checkbox"></label>'
  + '<div class="setting-row"><div><strong id="quickadd-shortcut-label"></strong><p class="quickadd-rule"></p></div><button type="button" class="soft-button quickadd-shortcut" id="quickadd-shortcut" aria-labelledby="quickadd-shortcut-label quickadd-shortcut"><kbd dir="ltr" translate="no"></kbd></button></div>';
$('setting-startup').closest('.setting-row').after(...quickAddRows.children);
let quickAddRecording = false;
function quickAddConflictText(status) { return status?.conflict ? tr('{shortcut} is used by another app. Choose another shortcut.', { shortcut: status.shortcut }) : ''; }
function renderQuickAddSetting() {
  const row = $('setting-quick-add').closest('.setting-row'), status = state.quickAdd;
  row.querySelector('strong').textContent = tr('Quick add from anywhere');
  row.querySelector('p').textContent = tr('Press the shortcut in any app to add a task without opening Remember Me.');
  row.querySelector('.quickadd-conflict').textContent = quickAddConflictText(status);
  $('setting-quick-add').checked = state.settings.quickAdd;
  $('quickadd-shortcut-label').textContent = tr('Shortcut');
  if (!quickAddRecording) { $('quickadd-shortcut').querySelector('kbd').textContent = state.settings.quickAddShortcut; $('quickadd-shortcut').closest('.setting-row').querySelector('.quickadd-rule').textContent = tr(QUICK_ADD_RULE); }
}
async function saveQuickAdd(changes) {
  try {
    await api('settings', { ...settingsPayload(), ...changes }); await refresh();
    toast(quickAddConflictText(state.quickAdd) || tr('Settings saved.'));
  } catch (err) { toast(err.message); await refresh(); }
}
function stopRecording() {
  quickAddRecording = false;
  $('quickadd-shortcut').classList.remove('recording');
  $('quickadd-shortcut').closest('.setting-row').querySelector('.quickadd-rule').classList.remove('error');
  renderQuickAddSetting();
}
$('setting-quick-add').addEventListener('change', e => saveQuickAdd({ quickAdd: e.target.checked }));
$('quickadd-shortcut').addEventListener('click', () => {
  if (quickAddRecording) return;
  quickAddRecording = true;
  $('quickadd-shortcut').classList.add('recording');
  $('quickadd-shortcut').querySelector('kbd').textContent = tr('Press the new shortcut…');
});
$('quickadd-shortcut').addEventListener('blur', () => { if (quickAddRecording) stopRecording(); });
$('quickadd-shortcut').addEventListener('keydown', e => {
  if (!quickAddRecording || e.key === 'Tab') return;
  // The keys go to the recorder only, not to Ctrl+N or Ctrl+K of the main window.
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { stopRecording(); return; }
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return;
  const shortcut = acceleratorFromKey(e);
  if (!shortcut) { $('quickadd-shortcut').closest('.setting-row').querySelector('.quickadd-rule').classList.add('error'); return; }
  stopRecording();
  saveQuickAdd({ quickAddShortcut: shortcut });
});
