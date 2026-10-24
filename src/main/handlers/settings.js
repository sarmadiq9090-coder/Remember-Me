'use strict';
const { REMIND_AGAIN, PALETTES } = require('../../core/tasks');
const { LOCALES, DEFAULT: DEFAULT_LOCALE } = require('../../../ui/translate');

module.exports = ctx => ({
  settings: { run: payload => {
    const old = ctx.store.state.settings;
    const settings = { sound: !!payload.sound, startAtLogin: !!payload.startAtLogin, alertSide: payload.alertSide === 'left' ? 'left' : 'right', language: LOCALES.some(l => l.code === payload.language) ? payload.language : DEFAULT_LOCALE,
      weekStart: [0, 1, 6].includes(payload.weekStart) ? payload.weekStart : 6, theme: ['light', 'dark'].includes(payload.theme) ? payload.theme : 'system', palette: PALETTES.includes(payload.palette) ? payload.palette : 'lavender',
      remindAgain: REMIND_AGAIN.includes(payload.remindAgain) ? payload.remindAgain : 0 };
    if (old.startAtLogin !== settings.startAtLogin) ctx.setLogin(settings.startAtLogin);
    try { ctx.store.change(s => { s.settings = { ...s.settings, ...settings }; }); }
    catch (err) { if (old.startAtLogin !== settings.startAtLogin) ctx.setLogin(old.startAtLogin); throw err; }
    ctx.rebuildTrayMenu(); ctx.placeAlert(); ctx.applyTheme();
  } },
});
