// Settings controls: remind again, language and week, appearance, note looks, backups.
// 'Remind me again every' row, built here (with tr()) so index.html and the i18n dictionary stay untouched.
const remindAgainRow = document.createElement('label');
remindAgainRow.className = 'setting-row';
remindAgainRow.innerHTML = '<div><strong></strong><p></p></div><select id="setting-remind-again"><option value="0"></option><option value="2"></option><option value="5"></option><option value="15"></option></select>';
$('setting-sound').closest('.setting-row').after(remindAgainRow);
function renderRemindAgain() {
  remindAgainRow.querySelector('strong').textContent = tr("Remind me again every");
  remindAgainRow.querySelector('p').textContent = tr("While an alert is unanswered, up to 6 times.");
  for (const option of $('setting-remind-again').options) option.textContent = { 0: tr("Off"), 2: tr("2 minutes"), 5: tr("5 minutes"), 15: tr("15 minutes") }[option.value];
  $('setting-remind-again').value = String(state.settings.remindAgain || 0);
}
function settingsPayload() {
  return { sound: $('setting-sound').checked, startAtLogin: $('setting-startup').checked, alertSide: $('setting-side').value, language: $('setting-language').value, weekStart: Number($('setting-week').value), theme: checked('theme-mode', state.settings.theme), palette: checked('palette', state.settings.palette), remindAgain: Number($('setting-remind-again').value) };
}
for (const id of ['setting-sound', 'setting-startup', 'setting-side', 'setting-language', 'setting-week', 'setting-remind-again']) $(id).addEventListener('change', async () => {
  try {
    const saved = await api('settings', settingsPayload()); await refresh();
    // Native date and time fields take a new language only when the app starts again.
    if (saved?.restart) toast(tr("Settings saved. Date and time fields switch to the new language after a restart."), () => api('relaunch'), { label: tr("Restart now") });
    else toast(tr('Settings saved.'));
  }
  catch (err) { toast(err.message); } await refresh();
});
// The value of a radio group in the page, or the saved one before the group is built.
function checked(name, saved) { return document.querySelector(`input[name="${name}"]:checked`)?.value ?? saved; }
// Settings → Appearance: mode and palette as radio groups (arrow keys move between options), built here with tr().
// Each preview card carries data-palette, so it shows that palette's real colors in the current mode.
const PALETTE_NAMES = [['lavender', msg('Lavender')], ['ocean', msg('Ocean')], ['forest', msg('Forest')], ['sunset', msg('Sunset')], ['graphite', msg('Graphite')], ['contrast', msg('High contrast')]];
const MODE_NAMES = [['system', msg('Same as Windows')], ['light', msg('Light')], ['dark', msg('Dark')]];
const paletteMock = () => `<span class="mock-side"><span class="mock-logo">${brandMark(true)}</span><i class="mock-nav on"></i><i class="mock-nav"></i><i class="mock-nav"></i></span><span class="mock-page"><i class="mock-hero"></i><span class="mock-row"><i class="mock-check"></i><i class="mock-line"></i></span><span class="mock-row"><i class="mock-check"></i><i class="mock-line short"></i></span><i class="mock-button"></i></span>`;
let appearanceLanguage, appearanceSaving = 0;
function renderAppearance() {
  const card = $('appearance-card');
  if (appearanceLanguage !== uiLanguage) {
    appearanceLanguage = uiLanguage;
    card.innerHTML = `<h2>${tr('Appearance')}</h2><div class="setting-row"><div><strong id="mode-label">${tr('Mode')}</strong><p>${tr('Light or dark, or the same as Windows.')}</p></div><div class="segmented" role="radiogroup" aria-labelledby="mode-label">${MODE_NAMES.map(([value, name]) => `<label><input type="radio" name="theme-mode" value="${value}"><span>${tr(name)}</span></label>`).join('')}</div></div>`
      + `<div class="palette-picker"><strong id="palette-label">${tr('Colors')}</strong><div class="palette-grid" role="radiogroup" aria-labelledby="palette-label">${PALETTE_NAMES.map(([id, name]) => `<label class="palette-card"><input type="radio" name="palette" value="${id}"><span class="palette-mock" data-palette="${id}" aria-hidden="true">${paletteMock()}</span><span class="palette-name">${tr(name)}</span><span class="palette-tick" aria-hidden="true">${icon('check')}</span></label>`).join('')}</div></div>`;
  }
  if (appearanceSaving) return;
  for (const [name, value] of [['theme-mode', state.settings.theme], ['palette', state.settings.palette]]) card.querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
}
// Note editor: paper colors and styles as radio groups, with a live preview (ids match src/core/tasks.js).
const NOTE_COLORS = [['cream', msg('Cream')], ['yellow', msg('Yellow')], ['orange', msg('Orange')], ['red', msg('Red')], ['pink', msg('Pink')], ['purple', msg('Purple')], ['blue', msg('Blue')], ['green', msg('Green')], ['gray', msg('Gray')], ['white', msg('White')]];
const NOTE_STYLES = [['plain', msg('Plain card')], ['sticky', msg('Sticky note')], ['lined', msg('Lined paper')]];
let noteLookLanguage;
function renderNoteLook() {
  if (noteLookLanguage === uiLanguage) return;
  noteLookLanguage = uiLanguage;
  $('note-look').innerHTML = `<div><span class="look-label" id="note-color-label">${tr('Note color')}</span><div class="swatches" role="radiogroup" aria-labelledby="note-color-label">${NOTE_COLORS.map(([id, name]) => `<label class="swatch" title="${tr(name)}"><input type="radio" name="note-color" value="${id}" aria-label="${tr(name)}"><span class="swatch-paper" data-paper="${id}">${icon('check')}</span></label>`).join('')}</div>`
    + `<span class="look-label" id="note-style-label">${tr('Style')}</span><div class="style-tiles" role="radiogroup" aria-labelledby="note-style-label">${NOTE_STYLES.map(([id, name]) => `<label class="style-tile"><input type="radio" name="note-style" value="${id}"><span class="style-sample paper" data-paper="cream" data-note-style="${id}" aria-hidden="true"><i></i><i></i><i></i></span>${tr(name)}</label>`).join('')}</div></div>`
    + '<div class="note-preview paper" data-paper="cream" data-note-style="plain" aria-hidden="true" translate="no"><strong dir="auto"></strong><p dir="auto"></p></div>';
}
function setNoteLook(color, style) {
  for (const [name, value] of [['note-color', color], ['note-style', style]]) $('note-look').querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
  updateNotePreview();
}
function updateNotePreview() {
  const color = checked('note-color', 'cream'), preview = $('note-look').querySelector('.note-preview');
  for (const paper of $('note-look').querySelectorAll('.style-sample, .note-preview')) paper.dataset.paper = color;
  preview.dataset.noteStyle = checked('note-style', 'plain');
  preview.querySelector('strong').textContent = $('note-title').value || tr('Note title');
  preview.querySelector('p').textContent = $('note-body').value;
}
$('note-look').addEventListener('change', updateNotePreview);
for (const id of ['note-title', 'note-body']) $(id).addEventListener('input', updateNotePreview);
$('appearance-card').addEventListener('change', async e => {
  // The palette shows at once; main then updates the alert window and the window backgrounds.
  if (e.target.name === 'palette') applyPalette(e.target.value);
  appearanceSaving++;
  try { await api('settings', settingsPayload()); } catch (err) { toast(err.message); } finally { appearanceSaving--; }
  await refresh();
});
// Names the attachments a backup had to leave out because their files are missing, with the task or note each belongs to.
function skippedText(skipped = []) {
  if (!skipped.length) return '';
  const list = skipped.map(s => s.itemTitle ? `${isolate(s.name)} (${isolate(s.itemTitle)})` : isolate(s.name)).join(tr(", "));
  return tr("{count} attachments were left out because their files are missing: {list}", { count: skipped.length, list });
}
$('export-data').addEventListener('click', async () => {
  $('export-data').disabled = true;
  try { const result = await api('export'); if (result) toast(result.skipped?.length ? `${tr("The backup folder was saved.")} ${skippedText(result.skipped)}` : tr("The backup folder was saved with all attachments.")); }
  catch (err) { toast(err.message); } finally { $('export-data').disabled = false; }
});
$('restore-data').addEventListener('click', async () => {
  $('restore-data').disabled = true;
  try { if (await api('restore')) { await refresh(); toast(tr("Backup restored. Your previous data was saved in the backups folder.")); } }
  catch (err) { toast(err.message); } finally { $('restore-data').disabled = false; }
});
$('clean-orphans').addEventListener('click', async () => {
  $('clean-orphans').disabled = true;
  try { const before = storage?.orphans; const usage = await api('cleanOrphans'); if (usage) { storage = usage; renderStorage(); if (usage.orphans < before) toast(tr("Unused attachments were deleted.")); } }
  catch (err) { toast(err.message); } finally { $('clean-orphans').disabled = false; }
});
$('open-data').addEventListener('click', async () => { try { await api('dataFolder'); } catch (err) { toast(err.message); } });
async function driveAction(action, payload) { try { const value = await api(action, payload); await refresh(); return value; } catch (error) { toast(error.message); await refresh(); } }
$('choose-drive-folder').addEventListener('click', () => driveAction('chooseDriveFolder'));
