'use strict';
// Do Not Disturb from the tray. settings.pausedUntil is null when reminders run normally, the ISO
// time a pause ends, or UNTIL_RESUMED for a pause that lasts until the user resumes.
const UNTIL_RESUMED = 'manual';
const CHOICES = ['hour', 'tomorrow', 'manual'];

// When a pause chosen now ends: in an hour, tomorrow at 8:00 local time, or never on its own.
function pauseEnd(choice, now = new Date()) {
  if (choice === 'hour') return new Date(now.getTime() + 3600000).toISOString();
  if (choice === 'tomorrow') {
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    end.setHours(8, 0, 0, 0);
    return end.toISOString();
  }
  if (choice === 'manual') return UNTIL_RESUMED;
  throw new Error('Unknown pause.');
}
// The saved value if it is one, otherwise null (no pause).
function validPause(value) {
  if (value === UNTIL_RESUMED) return value;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function isPaused(pausedUntil, now = Date.now()) {
  return pausedUntil === UNTIL_RESUMED || (typeof pausedUntil === 'string' && Date.parse(pausedUntil) > now);
}
// The alerts to show: none while paused, except a preview the user just asked for. Hidden
// reminders stay due and appear when the pause ends.
function shownAlerts(alerts, paused) {
  return paused && alerts.some(alert => alert.id !== '__preview') ? [] : alerts;
}

// Reads and writes settings.pausedUntil through the app's store. check() clears a pause that has
// ended, so it is called on every scan.
function createPause({ read, write, clock = () => Date.now() }) {
  return {
    pause(choice) { write(pauseEnd(choice, new Date(clock()))); },
    resume() { if (read() !== null) write(null); },
    check() {
      const value = read();
      if (value === null) return false;
      if (isPaused(value, clock())) return true;
      write(null);
      return false;
    },
  };
}
module.exports = { UNTIL_RESUMED, CHOICES, pauseEnd, validPause, isPaused, shownAlerts, createPause };
