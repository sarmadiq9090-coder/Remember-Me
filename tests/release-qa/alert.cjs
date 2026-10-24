// The sticky alert: chips, queue navigation, the keyboard guard, snooze presets, Pick a time,
// Snooze all, Done with Undo, Skip on a repeat and Open task. Then early notices and Remind me again.
const { launch, check, sleep, iso, bad } = require('./harness.cjs');
async function run() {
  const s = await launch();
  const tasks = async () => (await s.value('state')).tasks;
  const byTitle = async title => (await tasks()).find(t => t.title === title && !t.completedAt);
  // Three overdue reminders: one repeating with high priority, one with a note, one plain.
  await s.value('saveTask', { title: 'Water plants', dueAt: iso(Date.now() - 3 * 3600e3), repeat: 'daily', priority: 'high' });
  await s.value('saveTask', { title: 'Call the bank', body: 'Ask about the card', dueAt: iso(Date.now() - 2 * 60e3) });
  await s.value('saveTask', { title: 'Pay rent', dueAt: iso(Date.now() - 60e3) });
  let alert = await s.alertPage();
  await check('alert', 'appears with the oldest reminder first and "1 of 3"', async () => {
    if (!alert) bad('no alert window');
    await alert.waitForFunction(() => document.getElementById('alert-position').textContent.includes('3'));
    const v = await alert.evaluate(() => [document.getElementById('alert-title').textContent, document.getElementById('alert-position').textContent, document.getElementById('alert-queue').hidden]);
    return v[0] === 'Water plants' && v[1] === '1 of 3' && !v[2] ? v.join(' | ') : bad(v.join(' | '));
  });
  await check('alert', 'chips show overdue age, priority and the repeat', async () => {
    const chips = await alert.locator('#alert-chips').innerText();
    return /Overdue/.test(chips) && /High priority/.test(chips) && /Daily/.test(chips) ? chips.replace(/\s+/g, ' ') : bad(chips);
  });
  await check('alert', 'Skip is offered for the repeat, and "Next" shows when it returns', async () => {
    const v = await alert.evaluate(() => [document.getElementById('alert-skip').hidden, document.getElementById('alert-next-time').hidden, document.getElementById('alert-next-time').textContent]);
    return !v[0] && !v[1] ? v[2] : bad(JSON.stringify(v));
  });
  await check('alert', 'Enter does nothing before the user interacts with the alert', async () => {
    await alert.keyboard.press('Enter'); await sleep(800);
    const t = await byTitle('Water plants');
    return t && t.dueAt === (await byTitle('Water plants')).dueAt && (await alert.locator('#alert-title').innerText()) === 'Water plants' ? true : bad('Enter acted');
  });
  await check('alert', 'next and previous move through the queue', async () => {
    await alert.locator('#alert-next').click(); await sleep(200);
    const a = await alert.locator('#alert-title').innerText();
    await alert.locator('#alert-next').click(); await sleep(200);
    const b = await alert.locator('#alert-title').innerText();
    const nextDisabled = await alert.locator('#alert-next').isDisabled();
    await alert.locator('#alert-prev').click(); await alert.locator('#alert-prev').click(); await sleep(200);
    const c = await alert.locator('#alert-title').innerText();
    return a === 'Call the bank' && b === 'Pay rent' && nextDisabled && c === 'Water plants' ? `${a} → ${b} → ${c}` : bad(`${a} → ${b} → ${c}, next disabled ${nextDisabled}`);
  });
  await check('alert', 'the note shows, and Snooze all is offered with 3 queued', async () => {
    await alert.locator('#alert-next').click(); await sleep(200);
    const note = await alert.locator('#alert-note').innerText();
    const all = await alert.locator('#alert-snooze-all').innerText();
    await alert.locator('#alert-prev').click(); await sleep(200);
    return note === 'Ask about the card' && /3/.test(all) ? all : bad(`${note} | ${all}`);
  });
  await check('alert', 'Skip moves the repeat to its next occurrence without a completed copy', async () => {
    const before = await byTitle('Water plants');
    await alert.locator('#alert-skip').click(); await sleep(1200);
    const after = await byTitle('Water plants');
    const copies = (await tasks()).filter(t => t.sourceId === before.id).length;
    return Date.parse(after.dueAt) > Date.now() && copies === 0 ? `next ${new Date(after.dueAt).toLocaleString()}` : bad(`due ${after.dueAt}, copies ${copies}`);
  });
  await check('alert', 'after an interaction, Enter completes the shown reminder (Done)', async () => {
    await alert.waitForFunction(() => document.getElementById('alert-title').textContent === 'Call the bank');
    await alert.locator('#alert-title').click(); // a pointer interaction
    await alert.keyboard.press('Enter'); await sleep(1200);
    const done = (await tasks()).find(t => t.title === 'Call the bank');
    return done.completedAt ? true : bad('not completed');
  });
  await check('alert', 'Undo after Done brings the reminder back', async () => {
    await alert.locator('#alert-undo').waitFor({ state: 'visible', timeout: 3000 });
    await alert.locator('#alert-undo-button').click(); await sleep(1200);
    const t = (await tasks()).find(t => t.title === 'Call the bank');
    return !t.completedAt ? true : bad('still completed');
  });
  await check('alert', 'preset keys 1-5 snooze to the shown times, 6 opens Pick a time', async () => {
    const labels = await alert.locator('#snooze-grid [data-preset]').evaluateAll(bs => bs.map(b => `${b.dataset.preset}:${b.disabled ? 'off' : 'on'}`));
    await alert.locator('#alert-title').click();
    await alert.keyboard.press('Digit6'); await sleep(200);
    const pickerOpen = await alert.locator('#snooze-form').isVisible();
    await alert.keyboard.press('Escape'); await sleep(200);
    const closed = !(await alert.locator('#snooze-form').isVisible());
    const shown = await alert.locator('#alert-title').innerText();
    await alert.keyboard.press('Digit1'); await sleep(1200);
    const t = (await tasks()).find(x => x.title === shown);
    const minutes = Math.round((Date.parse(t.dueAt) - Date.now()) / 60e3);
    return pickerOpen && closed && minutes >= 8 && minutes <= 10 ? `${labels.join(' ')}; "${shown}" snoozed ${minutes} min` : bad(`${labels} picker ${pickerOpen}/${closed}, ${shown} in ${minutes} min`);
  });
  await check('alert', 'Pick a time snoozes to the chosen time', async () => {
    alert = await s.alertPage();
    const shown = await alert.locator('#alert-title').innerText();
    await alert.locator('[data-preset="pick"]').click();
    const when = new Date(Date.now() + 3 * 3600e3); when.setSeconds(0, 0);
    const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await alert.locator('#snooze-until').fill(local);
    await alert.locator('#snooze-form button[type="submit"], #snooze-form button').last().click(); await sleep(1200);
    const t = (await tasks()).find(x => x.title === shown);
    return Math.abs(Date.parse(t.dueAt) - when.getTime()) < 60e3 ? `${shown} at ${new Date(t.dueAt).toLocaleTimeString()}` : bad(`${shown} due ${t.dueAt}, wanted ${when.toISOString()}`);
  });
  // Snooze all with three queued.
  for (const title of ['Queue A', 'Queue B', 'Queue C']) await s.value('saveTask', { title, dueAt: iso(Date.now() - 5000) });
  await sleep(1500);
  await check('alert', 'Snooze all snoozes every queued reminder by an hour and closes the alert', async () => {
    alert = await s.alertPage();
    await alert.waitForFunction(() => !document.getElementById('alert-snooze-all').hidden);
    const count = await alert.evaluate(() => document.getElementById('alert-position').textContent);
    await alert.locator('#alert-snooze-all').click(); await sleep(2000);
    const queued = (await tasks()).filter(t => !t.completedAt && t.dueAt && Date.parse(t.dueAt) <= Date.now());
    const later = (await tasks()).filter(t => t.title.startsWith('Queue') && Date.parse(t.dueAt) > Date.now() + 50 * 60e3).length;
    return queued.length === 0 && later === 3 && !s.alertOpen() ? `${count} → all snoozed` : bad(`still due ${queued.map(t => t.title)}, later ${later}, alert open ${s.alertOpen()}`);
  });
  await check('alert', 'Open task opens that task in the main window editor', async () => {
    await s.value('saveTask', { title: 'Open me', dueAt: iso(Date.now() - 1000) });
    alert = await s.alertPage();
    await alert.waitForFunction(() => document.getElementById('alert-title').textContent === 'Open me');
    await alert.locator('#alert-open').click();
    await s.page.locator('#task-dialog[open]').waitFor({ timeout: 4000 });
    const title = await s.page.locator('#task-title').inputValue();
    await s.page.locator('#task-dialog .close-dialog').first().click();
    return title === 'Open me' ? true : bad(`editor shows ${title}`);
  });
  await check('alert', 'no page errors in either window', async () => s.errors.length ? bad(s.errors.join(' | ')) : true);
  // Early notice: saved before its notice time, it is recorded once when the time comes.
  await check('early notice', '"Coming up" is shown once at the lead time', async () => {
    await s.value('saveTask', { title: 'Meeting', dueAt: iso(Date.now() + 5 * 60e3 + 3000), remindBefore: 5 });
    await sleep(6000);
    const early = await s.app.evaluate(() => globalThis.waqtTest.early);
    const hits = early.filter(m => m.title.includes('Meeting'));
    return hits.length === 1 ? `${hits[0].title} — ${hits[0].body}` : bad(JSON.stringify(early));
  });
  await check('remind again', 'the setting saves and reloads (sounds are off in test mode)', async () => {
    const st = (await s.value('state')).settings;
    await s.value('settings', { ...st, remindAgain: 5 });
    await s.page.locator('[data-view="settings"]').click(); await sleep(300);
    return (await s.value('state')).settings.remindAgain === 5 && (await s.page.locator('#setting-remind-again').inputValue()) === '5' ? true : bad('not saved');
  });
  await s.close();
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
