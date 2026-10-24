// The Start with Windows warning: a card in Settings and a dismissible banner.
// Reminders only fire while the app runs, so warn when it will not start with Windows but reminders are
// still to come: a card in Settings, and a banner elsewhere until it is dismissed for good.
function startupNotice(dismissible) {
  const card = document.createElement('div');
  card.className = 'settings-card startup-warning'; card.hidden = true;
  card.innerHTML = `<h2></h2><p></p><div class="dialog-footer"><button type="button" class="primary" data-enable></button>${dismissible ? '<button type="button" class="text-button" data-dismiss></button>' : ''}</div>`;
  card.querySelector('[data-enable]').addEventListener('click', async e => {
    e.target.disabled = true;
    try { await api('settings', { ...state.settings, startAtLogin: true }); await refresh(); toast(tr("Remember Me will now start with Windows.")); }
    catch (err) { toast(err.message); } finally { e.target.disabled = false; }
  });
  card.querySelector('[data-dismiss]')?.addEventListener('click', () => { try { localStorage.setItem('startupBannerDismissed', '1'); } catch { /* storage unavailable: it shows again next time */ } card.hidden = true; });
  return card;
}
const startupCard = startupNotice(false), startupBanner = startupNotice(true);
$('settings-section').prepend(startupCard);
document.querySelector('.page-heading').after(startupBanner);
function bannerDismissed() { try { return localStorage.getItem('startupBannerDismissed') === '1'; } catch { return false; } }
function renderStartupWarning() {
  const needed = !state.settings.startAtLogin && state.tasks.some(t => !t.completedAt && t.dueAt && Date.parse(t.dueAt) > Date.now());
  startupCard.hidden = !needed || view !== 'settings';
  startupBanner.hidden = !needed || view === 'settings' || bannerDismissed();
  for (const card of [startupCard, startupBanner]) {
    card.querySelector('h2').textContent = tr("Reminders only work while Remember Me is running");
    card.querySelector('p').textContent = tr("You have upcoming reminders, but Start with Windows is off. Turn it on so a restart does not make you miss one.");
    card.querySelector('[data-enable]').textContent = tr("Turn on Start with Windows");
    const dismiss = card.querySelector('[data-dismiss]');
    if (dismiss) dismiss.textContent = tr("Dismiss");
  }
}
