// The Start with Windows warning: a card in Settings and a dismissible banner.
// Reminders only fire while the app runs, so warn when it will not start with Windows but reminders are
// still to come: a card in Settings, and a banner elsewhere until it is dismissed for good.
// The Microsoft Store version can't tell whether Windows' startup task is on, so it shows only the
// banner, whose button opens Windows' Startup apps page and then dismisses it for good.
function startupNotice(dismissible) {
  const card = document.createElement('div');
  card.className = 'settings-card startup-warning'; card.hidden = true;
  card.innerHTML = `<h2></h2><p></p><div class="dialog-footer"><button type="button" class="primary" data-enable></button>${dismissible ? '<button type="button" class="text-button" data-dismiss></button>' : ''}</div>`;
  card.querySelector('[data-enable]').addEventListener('click', async e => {
    e.target.disabled = true;
    if (state.windowsStore) {
      try { await openStartupSettings(); dismissBanner(); card.hidden = true; } finally { e.target.disabled = false; }
      return;
    }
    try { await api('settings', { ...state.settings, startAtLogin: true }); await refresh(); toast(tr("Remember Me will now start with Windows.")); }
    catch (err) { toast(err.message); } finally { e.target.disabled = false; }
  });
  card.querySelector('[data-dismiss]')?.addEventListener('click', () => { dismissBanner(); card.hidden = true; });
  return card;
}
const startupCard = startupNotice(false), startupBanner = startupNotice(true);
$('settings-section').prepend(startupCard);
document.querySelector('.page-heading').after(startupBanner);
function dismissBanner() { try { localStorage.setItem('startupBannerDismissed', '1'); } catch { /* storage unavailable: it shows again next time */ } }
async function openStartupSettings() {
  try { await api('openStartupSettings'); toast(tr("In Startup apps, turn on Remember Me.")); } catch (error) { toast(error.message); }
}
$('open-startup-settings').addEventListener('click', openStartupSettings);
function bannerDismissed() { try { return localStorage.getItem('startupBannerDismissed') === '1'; } catch { return false; } }
function renderStartupWarning() {
  const upcoming = state.tasks.some(t => !t.completedAt && t.dueAt && Date.parse(t.dueAt) > Date.now());
  const needed = upcoming && (state.windowsStore || !state.settings.startAtLogin);
  startupCard.hidden = !needed || view !== 'settings' || !!state.windowsStore;
  startupBanner.hidden = !needed || view === 'settings' || bannerDismissed();
  for (const card of [startupCard, startupBanner]) {
    card.querySelector('h2').textContent = tr("Reminders only work while Remember Me is running");
    card.querySelector('p').textContent = state.windowsStore ? tr("You have upcoming reminders. Check that Remember Me is on in Windows' Startup apps, so a restart does not make you miss one.") : tr("You have upcoming reminders, but Start with Windows is off. Turn it on so a restart does not make you miss one.");
    card.querySelector('[data-enable]').textContent = state.windowsStore ? tr("Open startup settings") : tr("Turn on Start with Windows");
    const dismiss = card.querySelector('[data-dismiss]');
    if (dismiss) dismiss.textContent = tr("Dismiss");
  }
}
