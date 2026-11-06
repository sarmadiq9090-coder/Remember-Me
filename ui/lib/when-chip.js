// Natural dates in quick add (the main window's quick-add row and the quick-add window): as you type
// "tomorrow 5pm" or «بكرة 5 العصر», a chip under the field shows the time it was understood as, the
// repeat, and the title that will be saved. When the phrase allows more than one time it asks, with a
// button per choice, and nothing is saved until one is picked. × keeps the text as typed. The reading
// itself happens in the main process (parseWhen action, src/core/natural-dates.js).
function whenQuestion(ask) {
  switch (ask) {
    case 'meridiem': return tr('Which time did you mean?');
    case 'day': return tr('Which day did you mean?');
    case 'time': return tr('At what time?');
    case 'past': return tr('That time has passed. Use this one instead?');
    default: return tr('Which one did you mean?');
  }
}
// The day of a choice, with its weekday so "next Thursday" can be checked at a glance, and day and time together.
function whenDay(value) {
  const d = new Date(value), today = new Date(), tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return d.toDateString() === today.toDateString() ? tr('Today') : d.toDateString() === tomorrow.toDateString() ? tr('Tomorrow')
    : d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
}
function whenLabel(value) { return whenDay(value) + tr(', ') + timeLabel(value); }
// input: the title field; chip: an empty element under it; weekStart(): Settings' first day of the week;
// skip(): true while another field already sets the time (the quick-add window's time field);
// onRender(shown): after each change of the chip.
function createWhenChip({ input, chip, weekStart = () => 6, skip = () => false, onRender = () => {} }) {
  let seen = { text: null, result: null }, picked = null, kept = null, timer = 0, asking = 0;
  // What a reading says apart from the title: a choice, or × (kept), holds while only the title changes.
  const key = value => JSON.stringify(value && { ...value, title: '' });
  const dropped = () => kept !== null && kept === key(seen.result);
  chip.classList.add('when-chip'); chip.setAttribute('role', 'status'); chip.setAttribute('translate', 'no'); chip.hidden = true;
  const current = () => (skip() || dropped() ? null : seen.text === input.value ? seen.result : undefined);
  async function read(text) {
    const ask = ++asking;
    let result;
    try { result = text.trim() ? await api('parseWhen', { text }) : null; } catch { result = null; }
    if (ask !== asking) return;
    if (key(seen.result) !== key(result)) picked = null;
    seen = { text, result };
    render();
  }
  function button(text, className, onClick, label) {
    const b = textElement('button', text, { type: 'button', className });
    if (label) { b.title = label; b.setAttribute('aria-label', label); }
    b.addEventListener('click', onClick);
    return b;
  }
  function render() { show(); onRender(!chip.hidden); }
  function show() {
    const result = current();
    chip.replaceChildren();
    chip.hidden = !result;
    chip.classList.remove('asking');
    if (!result) return;
    const keep = button('×', 'when-keep', () => { kept = key(seen.result); render(); input.focus(); }, tr('Keep the text as typed'));
    const due = picked || result.dueAt;
    if (!due) {
      chip.classList.add('asking');
      // Choices on one day show only their times, and choices at one time only their days; the shared part is said once.
      const sameDay = new Set(result.options.map(whenDay)).size === 1, sameTime = new Set(result.options.map(timeLabel)).size === 1;
      const shared = result.options.length < 2 ? '' : sameDay ? whenDay(result.options[0]) : sameTime ? timeLabel(result.options[0]) : '';
      const choices = result.options.map(option => button(shared ? (sameDay ? timeLabel(option) : whenDay(option)) : whenLabel(option), 'when-option', () => { picked = option; render(); input.focus(); }, whenLabel(option)));
      chip.append(textElement('span', whenQuestion(result.ask), { className: 'when-question' }));
      if (shared) chip.append(textElement('span', shared, { className: 'when-shared' }));
      chip.append(...choices, keep);
      return;
    }
    const mark = document.createElement('span'); mark.className = 'when-icon'; mark.innerHTML = icon('clock'); chip.append(mark);
    const repeat = result.repeat !== 'none' ? repeatLabel({ ...result, dueAt: due }, weekStart()) : '';
    chip.append(textElement('strong', tr('Due {when}', { when: whenLabel(due) }), { className: 'when-due' }));
    if (repeat) chip.append(textElement('span', repeat, { className: 'when-repeat' }));
    if (result.title !== input.value.trim()) chip.append(textElement('span', tr('Title: {title}', { title: result.title }), { className: 'when-title', dir: 'auto' }));
    chip.append(keep);
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => read(input.value), 120);
  });
  return {
    render,
    reset() { clearTimeout(timer); asking++; seen = { text: null, result: null }; picked = null; kept = null; render(); },
    // What to save, read at the moment of saving: { title } alone when there is no date, the title and
    // its time when the chip showed one, or { wait } with a message when the person must look first:
    // a phrase they have not seen yet, or a question they have not answered.
    async take() {
      const text = input.value;
      if (skip()) return { title: text };
      if (seen.text !== text) {
        // The chip still shows the reading before the last keystrokes; a different one must be seen first.
        const shown = chip.hidden ? null : key(current() ?? seen.result);
        clearTimeout(timer); await read(text);
        const now = current();
        if (now === undefined || (now && key(now) !== shown)) return { wait: tr('Check the time shown, then press Enter again.') };
      }
      const result = current();
      if (!result) return { title: text };
      const dueAt = picked || result.dueAt;
      if (!dueAt) { chip.querySelector('.when-option')?.focus(); return { wait: tr('Choose one of the options first.') }; }
      const rule = result.repeat === 'days' ? { repeatDays: result.repeatDays } : result.repeat === 'interval' ? { repeatEvery: result.repeatEvery } : {};
      return { title: result.title, dueAt, repeat: result.repeat, ...rule };
    },
  };
}
