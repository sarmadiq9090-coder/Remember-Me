let currentId;
const $ = id => document.getElementById(id);
async function refreshAlert() {
  try {
    setLanguage(await api('language'));
    const tasks = await api('alerts');
    // After the last Done the window stays briefly so it can be undone; show that instead of an empty card.
    document.body.classList.toggle('all-done', !tasks.length);
    $('alert-all-done').hidden = !!tasks.length;
    if (!tasks.length) { currentId = null; return; }
    const task = tasks[0];
    if (currentId !== task.id) { $('snooze-until').value = localDateValue(Date.now() + 3600000); $('alert-error').textContent = ''; }
    currentId = task.id;
    $('alert-title').textContent = task.title;
    $('alert-note').textContent = task.body || tr('خذ خطوتك التالية، أو اختر وقتًا يناسبك أكثر.','Take your next step, or choose a time that suits you better.');
    $('alert-time').textContent = dateLabel(task.dueAt);
    $('alert-files').innerHTML = (task.files || []).map(a => fileMarkup(a)).join('');
    $('alert-files').hidden = !task.files?.length;
    document.body.classList.toggle('has-files', !!task.files?.length);
    document.body.classList.toggle('has-photos', (task.files || []).some(isImageFile));
    hydratePreviews($('alert-files'));
    $('alert-queue').textContent = task.id === '__preview' ? tr('معاينة التنبيه • لا ينشئ تذكيرًا فعليًا','Alert preview • no real reminder is created') : tasks.length > 1 ? (uiLanguage === 'en' ? `${tasks.length} reminders waiting • shown one at a time` : `${tasks.length} تذكيرات بانتظارك • تُعرض واحدًا تلو الآخر`) : tr('مساحة صغيرة لشيء مهم','A small space for something important');
  } catch (e) { $('alert-error').textContent = e.message; }
}
async function act(action, until) {
  if (!currentId) return;
  const buttons = document.querySelectorAll('button'); buttons.forEach(b => b.disabled = true);
  try {
    await api(action, { id: currentId, until });
    if (action === 'complete') { const info = await api('undoable'); if (info) showUndo(info); }
    await refreshAlert();
  }
  catch (e) { $('alert-error').textContent = e.message; }
  finally { buttons.forEach(b => b.disabled = false); }
}
let undoTimer;
function showUndo(info) {
  $('alert-undo-text').textContent = uiLanguage === 'en' ? `Completed "${info.title}"` : `أُنجزت «${info.title}»`;
  Object.assign($('alert-undo').dataset, { id: info.id, copyId: info.copyId });
  $('alert-undo').hidden = false;
  clearTimeout(undoTimer); undoTimer = setTimeout(() => { $('alert-undo').hidden = true; }, Math.max(0, info.until - Date.now()));
}
$('alert-undo-button').addEventListener('click', async () => {
  const { id, copyId } = $('alert-undo').dataset;
  $('alert-undo').hidden = true;
  try { await api('undoComplete', { id, copyId }); await refreshAlert(); } catch (e) { $('alert-error').textContent = e.message; }
});
$('alert-complete').addEventListener('click', () => act('complete'));
document.querySelectorAll('[data-minutes]').forEach(b => b.addEventListener('click', () => act('snooze', new Date(Date.now() + Number(b.dataset.minutes) * 60000).toISOString())));
$('snooze-form').addEventListener('submit', e => { e.preventDefault(); const d = new Date($('snooze-until').value); if (!Number.isFinite(d.getTime())) { $('alert-error').textContent = tr('اختر موعدًا صالحًا.','Choose a valid time.'); return; } act('snooze', d.toISOString()); });
$('alert-open').addEventListener('click', async () => { try { await api('open'); } catch (e) { $('alert-error').textContent = e.message; } });
$('alert-files').addEventListener('click', async e => {
  const file = e.target.closest('[data-file-id]'); if (!file) return;
  try { await api('openAttachment', { id: file.dataset.fileId }); } catch (err) { $('alert-error').textContent = err.message; }
});
window.waqt.onUpdate(refreshAlert);
refreshAlert();
