'use strict';
const MAX_REPEATS = 6;
// Plays the reminder sound again while an alert stays unanswered: every `minutes` after the alert
// appeared or last changed, at most MAX_REPEATS times. The state lives in memory only.
// Call the returned function on every scan with the shown reminder's id (null when there is none,
// or when sound is off) and the interval in minutes (0 turns it off).
function createRepeatBeep(beep, clock = () => Date.now()) {
  let shown = null, last = 0, count = 0;
  return function update(id, minutes) {
    if (!id || !minutes) { shown = null; return; }
    const now = clock();
    if (id !== shown) { shown = id; last = now; count = 0; return; }
    if (count < MAX_REPEATS && now - last >= minutes * 60000) { beep(); count++; last = now; }
  };
}
module.exports = { createRepeatBeep, MAX_REPEATS };
