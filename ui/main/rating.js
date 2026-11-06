// Microsoft Store version only: after a first real success (ratingDue in ui/lib/rating.js), a banner asks
// once for a rating in the Store. Either button records the answer, so it never shows again. No rewards.
const ratingPrompt = document.createElement('div');
ratingPrompt.className = 'settings-card startup-warning'; ratingPrompt.hidden = true;
ratingPrompt.innerHTML = '<h2></h2><p></p><div class="dialog-footer"><button type="button" class="primary" data-rate></button><button type="button" class="text-button" data-later></button></div>';
document.querySelector('.page-heading').after(ratingPrompt);
for (const [selector, choice] of [['[data-rate]', 'rate'], ['[data-later]', 'later']]) {
  ratingPrompt.querySelector(selector).addEventListener('click', async () => {
    ratingPrompt.hidden = true;
    try { await api('ratingPrompt', { choice }); } catch (error) { toast(error.message); }
  });
}
function renderRatingPrompt() {
  ratingPrompt.hidden = !ratingDue(state) || view === 'settings';
  ratingPrompt.querySelector('h2').textContent = tr("Is Remember Me helping you?");
  ratingPrompt.querySelector('p').textContent = tr("A rating in the Microsoft Store helps other people find it. It takes a moment, and Remember Me won't ask again.");
  ratingPrompt.querySelector('[data-rate]').textContent = tr("Rate in the Store");
  ratingPrompt.querySelector('[data-later]').textContent = tr("Not now");
}
