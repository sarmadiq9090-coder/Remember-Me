let currentId, currentDue, queueSize = 0, busy = false;
const $ = id => document.getElementById(id);
async function refreshAlert() {
  try {
    setLanguage(await api('language'));
    const tasks = await api('alerts'); if (!tasks.length) return;
    const task = tasks[0]; queueSize = tasks.length;
    if (currentId !== task.id) { $('snooze-until').value = localDateValue(Date.now() + 3600000); $('alert-error').textContent = ''; }
    currentId = task.id; currentDue = task.dueAt ?? null;
    $('alert-title').textContent = task.title;
    $('alert-note').textContent = task.body || tr('خذ خطوتك التالية، أو اختر وقتًا يناسبك أكثر.','Take your next step, or choose a time that suits you better.');
    $('alert-time').textContent = dateLabel(task.dueAt);
    $('alert-files').innerHTML = (task.files || []).map(a => fileMarkup(a)).join('');
    $('alert-files').hidden = !task.files?.length;
    document.body.classList.toggle('has-files', !!task.files?.length);
    document.body.classList.toggle('has-photos', (task.files || []).some(isImageFile));
    hydratePreviews($('alert-files'));
    $('alert-queue').textContent = task.id === '__preview' ? tr('معاينة التنبيه • لا ينشئ تذكيرًا فعليًا','Alert preview • no real reminder is created') : tasks.length > 1 ? (uiLanguage === 'en' ? `1 / ${tasks.length} • ${tasks.length} reminders waiting • shown one at a time` : `1 / ${tasks.length} • ${tasks.length} تذكيرات بانتظارك • تُعرض واحدًا تلو الآخر`) : tr('مساحة صغيرة لشيء مهم','A small space for something important');
  } catch (e) { $('alert-error').textContent = e.message; }
}
// act('skip') skips a repeating reminder's current occurrence; the alert layout work places its button.
async function act(action, until) {
  if (!currentId || busy) return;
  busy = true;
  const buttons = document.querySelectorAll('button'); buttons.forEach(b => b.disabled = true);
  const shown = currentId;
  try {
    // The due time lets the main process ignore a second click on a reminder that was already handled.
    await api(action, { id: shown, until, expectedDueAt: currentDue }); await refreshAlert();
    // The next queued reminder took this place: pause briefly so a repeated click cannot act on it unseen.
    if (currentId !== shown) {
      $('alert-queue').textContent = `${action === 'complete' ? tr('تمّت - التذكير التالي', 'Done - next reminder') : action === 'skip' ? tr('تخطّيتها - التذكير التالي', 'Skipped - next reminder') : tr('أُجّلت - التذكير التالي', 'Snoozed - next reminder')}${queueSize > 1 ? ` • 1 / ${queueSize}` : ''}`;
      await new Promise(resolve => setTimeout(resolve, 600));
      await refreshAlert();
    }
  }
  catch (e) { $('alert-error').textContent = e.message; }
  finally { busy = false; buttons.forEach(b => b.disabled = false); }
}
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
