'use strict';
// Quick add from anywhere (issue #82): the global shortcut from Settings opens the small quick-add
// window (windows.showQuickAdd). Electron's globalShortcut is passed in, so this loads in plain Node tests.
function createQuickAdd(ctx, globalShortcut) {
  let registered = null, wanted, conflict = false;
  // enabled and shortcut are the saved choice; active is whether the shortcut works now, and conflict
  // that Windows refused it because another app holds it.
  function status() {
    const { quickAdd, quickAddShortcut } = ctx.store.state.settings;
    return { enabled: quickAdd, shortcut: quickAddShortcut, active: !!registered, conflict };
  }
  // Registers the saved shortcut while quick add is on, after letting go of the old one. It tries again
  // only when the switch or the shortcut changes, so a shortcut another app holds is reported once, not retried.
  function apply() {
    const { quickAdd, quickAddShortcut } = ctx.store.state.settings, want = quickAdd ? quickAddShortcut : null;
    if (want === wanted) return status();
    wanted = want; conflict = false;
    if (registered) { globalShortcut.unregister(registered); registered = null; }
    if (want) {
      let ok;
      try { ok = globalShortcut.register(want, () => ctx.windows.showQuickAdd()); } catch { ok = false; }
      if (ok) registered = want;
      else { conflict = true; ctx.log.warn('quick-add-shortcut-unavailable', null, { shortcut: want }); }
    }
    return status();
  }
  function stop() {
    if (registered) globalShortcut.unregister(registered);
    registered = null; wanted = undefined;
  }
  return { apply, status, stop };
}
module.exports = { createQuickAdd };
