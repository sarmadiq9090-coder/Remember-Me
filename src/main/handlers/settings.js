'use strict';
const { REMIND_AGAIN, PALETTES } = require('../../core/tasks');
const { LOCALES, DEFAULT: DEFAULT_LOCALE, findLocale } = require('../../../ui/lib/translate');
const { normalizeSnoozePresets, checkSnoozePreset, DEFAULT_SNOOZE_PRESETS } = require('../../../ui/lib/alert-format');
const { normalizeAccelerator } = require('../../../ui/lib/quickadd');

module.exports = ctx => ({
  settings: { run: payload => {
    const old = ctx.store.state.settings;
    // Snooze choices from the page are checked rather than quietly replaced, so a bad value is reported.
    const presets = payload.snoozePresets;
    if (presets !== undefined && !(Array.isArray(presets) && presets.length === DEFAULT_SNOOZE_PRESETS.length && [...presets].every(preset => checkSnoozePreset(preset)))) throw new Error(ctx.tr('Each snooze choice needs a valid time, or a length from 1 minute to 30 days.'));
    const settings = { sound: !!payload.sound, startAtLogin: !!payload.startAtLogin, alertSide: payload.alertSide === 'left' ? 'left' : 'right', language: LOCALES.some(l => l.code === payload.language) ? payload.language : DEFAULT_LOCALE,
      weekStart: [0, 1, 6].includes(payload.weekStart) ? payload.weekStart : 6, theme: ['light', 'dark'].includes(payload.theme) ? payload.theme : 'system', palette: PALETTES.includes(payload.palette) ? payload.palette : 'lavender',
      remindAgain: REMIND_AGAIN.includes(payload.remindAgain) ? payload.remindAgain : 0,
      // Callers that leave the snooze choices out keep the saved ones.
      snoozePresets: normalizeSnoozePresets(payload.snoozePresets ?? old.snoozePresets),
      // Callers that leave quick add out keep the saved choice and shortcut.
      quickAdd: typeof payload.quickAdd === 'boolean' ? payload.quickAdd : old.quickAdd,
      quickAddShortcut: payload.quickAddShortcut === undefined ? old.quickAddShortcut : normalizeAccelerator(payload.quickAddShortcut) };
    if (!settings.quickAddShortcut) throw new Error(ctx.tr('Use two of Ctrl, Alt and Shift with a letter, a digit, F1 to F12 or Space.'));
    if (old.startAtLogin !== settings.startAtLogin) ctx.setLogin(settings.startAtLogin);
    try { ctx.store.change(s => { s.settings = { ...s.settings, ...settings }; }); }
    catch (err) { if (old.startAtLogin !== settings.startAtLogin) ctx.setLogin(old.startAtLogin); throw err; }
    ctx.rebuildTrayMenu(); ctx.placeAlert(); ctx.applyTheme();
    // The global shortcut is registered again only when it or the switch changed; the state action reports a conflict.
    ctx.quickAdd.apply();
    // Native date, time and number fields keep the locale Chromium started with until a restart.
    return { restart: old.language !== settings.language && findLocale(settings.language).chromium !== ctx.controlsLocale };
  } },
  relaunch: { readOnly: true, run: () => { ctx.quitting = true; ctx.app.relaunch(); ctx.app.quit(); } },
  // Microsoft Store version only: Windows turns its startup task on or off, in Settings > Apps > Startup.
  openStartupSettings: { readOnly: true, run: async () => {
    if (!ctx.windowsStore) throw new Error('only the Microsoft Store version uses startup settings');
    await ctx.openStartupSettings();
  } },
});
