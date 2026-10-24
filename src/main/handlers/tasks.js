'use strict';
const { saveTask, completeTask, skipOccurrence, undoComplete, toggleStep, snoozeTask } = require('../../core/tasks');

module.exports = ctx => ({
  saveTask: { run: payload => { ctx.store.change(s => saveTask(s, payload)); } },
  complete: { run: (payload, { fromAlert }) => {
    if (payload.id === '__preview') { ctx.preview = null; return undefined; }
    // done is null when the reminder was already handled (a double click or another window).
    const done = ctx.store.change(s => completeTask(s, payload.id, new Date(), { expectedDueAt: payload.expectedDueAt }));
    if (done && fromAlert) ctx.undoable = { ...done, title: ctx.store.state.tasks.find(t => t.id === done.id)?.title || '', until: Date.now() + ctx.UNDO_MS };
    return done;
  } },
  skip: { run: payload => {
    if (payload.id === '__preview') throw new Error(ctx.tr('The preview does not repeat.'));
    return ctx.store.change(s => skipOccurrence(s, payload.id, payload.expectedDueAt, new Date()));
  } },
  undoComplete: { run: (payload, { fromAlert }) => {
    const { undoable } = ctx;
    if (fromAlert && (!undoable || undoable.id !== payload.id || undoable.copyId !== payload.copyId)) throw new Error(ctx.tr("It is too late to undo."));
    ctx.store.change(s => undoComplete(s, payload.id, String(payload.copyId || '')));
    ctx.undoable = null;
  } },
  toggleStep: { run: payload => { ctx.store.change(s => toggleStep(s, payload.id, String(payload.stepId || ''))); } },
  undoable: { readOnly: true, run: () => { const { undoable } = ctx; return undoable && undoable.until > Date.now() ? undoable : null; } },
  snooze: { run: payload => {
    if (payload.id === '__preview') {
      if (!payload.until || Date.parse(payload.until) <= Date.now()) throw new Error(ctx.tr('Choose a later time.'));
      ctx.preview = null;
      return undefined;
    }
    return ctx.store.change(s => snoozeTask(s, payload.id, payload.until, new Date(), { expectedDueAt: payload.expectedDueAt }));
  } },
  reopen: { run: payload => { ctx.store.change(s => { const t = s.tasks.find(t => t.id === payload.id); if (t) { t.completedAt = null; t.dueAt = null; t.scheduleAt = null; t.repeat = 'none'; t.snoozedAt = null; } }); } },
});
