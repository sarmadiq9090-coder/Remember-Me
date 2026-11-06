'use strict';
const { STORE_LINKS } = require('../../platform/about');

// The one-time Store rating request (ui/main/rating.js). Both answers are saved, so it is never asked again;
// "rate" also opens the app's review page in the Microsoft Store.
module.exports = ctx => ({
  ratingPrompt: { run: async payload => {
    if (!ctx.windowsStore) throw new Error('only the Microsoft Store version asks for a rating');
    ctx.store.change(s => { s.settings.ratingAsked = true; });
    if (payload.choice === 'rate') await ctx.openStoreLink(STORE_LINKS.get('rate'));
  } },
});
