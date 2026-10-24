'use strict';
const { dueTasks } = require('../../core/tasks');
const { nextOccurrence } = require('../../core/repeat');
const { LOCALES, DEFAULT: DEFAULT_LOCALE, findLocale } = require('../../../ui/lib/translate');

module.exports = ctx => ({
  state: { readOnly: true, run: () => ({ ...ctx.store.state, dataPath: ctx.app.getPath('userData'), packaged: ctx.app.isPackaged, recovered: ctx.store.recovered, driveBackup: ctx.driveBackup.status(), updates: ctx.updates.status(), openTask: ctx.takeOpenRequest() }) },
  alerts: { readOnly: true, run: () => {
    const now = new Date(), { store } = ctx;
    // next is when a repeating reminder comes back after Done, shown under the Done button.
    return ctx.activeAlerts().map(t => ({ ...t, files: (t.attachments || []).map(id => store.state.attachments.find(a => a.id === id)).filter(Boolean),
      next: t.repeat && t.repeat !== 'none' && t.scheduleAt ? nextOccurrence(t.scheduleAt, t.repeat, now, t) : null }));
  } },
  language: { readOnly: true, run: () => ({ language: ctx.language(), palette: ctx.store.state.settings.palette }) },
  locale: { run: payload => {
    const code = LOCALES.some(l => l.code === payload.code) ? payload.code : ctx.language();
    return { ...findLocale(code), messages: ctx.messages(code), fallback: ctx.messages(DEFAULT_LOCALE) };
  } },
  open: { readOnly: true, run: payload => { ctx.openInMain(payload.id && ctx.store.state.tasks.some(t => t.id === payload.id && !t.deletedAt) ? payload.id : null); } },
  preview: { run: () => {
    const { tr } = ctx;
    if (dueTasks(ctx.store.state).length) throw new Error(tr("A real reminder is showing now. Try the preview after you finish it."));
    ctx.preview = { id: '__preview', title: tr("Time for a short break ☕"), body: tr("This is a preview alert. It stays visible until you choose Done or Snooze. Snoozing here only closes the preview."), dueAt: new Date().toISOString(), priority: 'normal', category: 'personal' };
  } },
});
