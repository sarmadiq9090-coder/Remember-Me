'use strict';

module.exports = ctx => ({
  updateConsent: { run: payload => { ctx.store.change(s => { s.settings.autoUpdate = payload.enabled; }); ctx.updates.consentChanged(); } },
  checkUpdates: { readOnly: true, run: () => ctx.updates.check() },
  installUpdate: { readOnly: true, run: async () => {
    try { return await ctx.updates.restart(); }
    catch (error) { throw new Error(ctx.tr("Couldn't save a safety copy of your data, so the update was not installed. {reason}", { reason: ctx.errorText(error) }), { cause: error }); }
  } },
  dismissUpdate: { readOnly: true, run: () => { ctx.updates.dismiss(); } },
});
