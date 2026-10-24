const icons = {
  check: '<path d="m5 12 4 4L19 6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  note: '<path d="M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V10zM14 3v7h7M7 14h10M7 17h7"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  arrowLeft: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  chevronBack: '<path d="m15 6-6 6 6 6"/>',
  chevronForward: '<path d="m9 6 6 6-6 6"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.1M3 12h.1M3 18h.1"/>',
  sort: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  flag: '<path d="M4 22V3m0 1c5-5 10 5 16 0v11c-6 5-11-5-16 0"/>',
  leaf: '<path d="M20 3c-9-1-17 3-17 10a7 7 0 0 0 7 7c8 0 10-9 10-17ZM3 22 15 10"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
  undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l6-6m-6 6 6 6"/>',
  skip: '<path d="m5 5 9 7-9 7zM19 5v14"/>',
  paperclip: '<path d="m21 11-9 9a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.7 5.7l-10 10a2 2 0 0 1-2.8-2.8L16 5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8m-8 4h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
  external: '<path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
};
function icon(name) { return `<svg class="icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.note}</svg>`; }
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Locale for every date, time and number. Digits are always Western (0-9), in Arabic too
// (ar-IQ would otherwise use Arabic-Indic digits), so labels keep their width and layout.
function locale() { return uiLocale.intl + '-u-nu-latn'; }
function num(value) { return String(value); }
// Required fields, number and date inputs report problems in the app's language, not the system's
// (Chromium's own messages follow the Windows language, with its digits).
document.addEventListener('invalid', e => {
  const field = e.target;
  const v = field.validity;
  field.setCustomValidity(v.valueMissing ? tr('Please fill in this field.')
    : v.rangeUnderflow || v.rangeOverflow ? tr('Enter a number from {min} to {max}.', { min: field.min, max: field.max })
    : v.badInput || v.typeMismatch || v.stepMismatch ? tr('Please enter a valid value.') : '');
}, true);
document.addEventListener('input', e => e.target.setCustomValidity?.(''), true);
// Week order for the repeat-day picker and labels: Saturday first unless the user chose another day.
function weekOrder(weekStart) { const start = [0, 1, 6].includes(weekStart) ? weekStart : 6; return Array.from({ length: 7 }, (_, i) => (start + i) % 7); }
function weekdayName(day, style = 'short') { return new Date(2026, 9, 25 + day).toLocaleDateString(locale(), { weekday: style }); }
// A short description of a task's repeat rule, such as "Sun – Thu" or "Every 3 days".
function repeatLabel(t, weekStart) {
  if (t.repeat === 'days') {
    const days = weekOrder(weekStart).filter(d => (t.repeatDays || []).includes(d)), order = weekOrder(weekStart);
    const contiguous = days.length >= 3 && days.length < 7 && days.every((d, i) => !i || order.indexOf(d) === order.indexOf(days[i - 1]) + 1);
    if (days.length === 7) return tr("Daily");
    return contiguous ? `${weekdayName(days[0])} – ${weekdayName(days.at(-1))}` : days.map(d => weekdayName(d)).join(tr(", "));
  }
  if (t.repeat === 'interval') { const n = t.repeatEvery; return tr('Every {count} days', { count: n }); }
  return { daily: tr("Daily"), weekly: tr("Weekly"), monthly: tr("Monthly"), yearly: tr("Yearly") }[t.repeat] || '';
}
function localDateValue(date) { const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function isToday(value) { return value && new Date(value).toDateString() === new Date().toDateString(); }
function timeLabel(value) { return new Date(value).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }); }
function dateLabel(value) { if (!value) return ''; const d = new Date(value); return `${isToday(value) ? tr("Today") : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}${tr(", ")}${timeLabel(value)}`; }
// Interface palettes (ui/styles/theme.css). The preload carries the saved one, so the first paint already uses it.
const PALETTES = ['lavender', 'ocean', 'forest', 'sunset', 'graphite', 'contrast'];
function applyPalette(palette) { document.documentElement.dataset.palette = PALETTES.includes(palette) ? palette : 'lavender'; }
applyPalette(globalThis.waqt?.palette);
// The saved language's code and direction from the preload, so the page is mirrored from its first paint.
// The body stays hidden (styles.css) until the page has been translated and filled in (showPage()), so
// it never shows its English source text; if that fails, it appears after 2 seconds anyway.
if (globalThis.waqt?.language) Object.assign(document.documentElement, { lang: globalThis.waqt.language, dir: globalThis.waqt.dir });
function showPage() { document.documentElement.dataset.ready = ''; }
if (typeof setTimeout === 'function') setTimeout(showPage, 2000);
// The app icon drawn with the --mark-* theme tokens, so it matches every palette and mode (issue #18).
// Same artwork as assets/icon.svg; small marks use the simplified glyph of assets/icon-small.svg.
// The Windows icon files stay fixed purple. Any element with data-brand-mark ("small" for the glyph) gets one.
let brandMarks = 0;
function brandMark(small = false) {
  const id = `brand-tile-${++brandMarks}`;
  const tile = `<defs><linearGradient id="${id}" x2="1" y2="1"><stop class="mark-tile-1"/><stop offset="1" class="mark-tile-2"/></linearGradient></defs>`;
  return small
    ? `<svg class="brand-svg mark-small" viewBox="0 0 16 16" aria-hidden="true">${tile}<rect width="16" height="16" rx="3.5" fill="url(#${id})"/><g class="mark-glyph"><rect x="6" y="1.5" width="2" height="2" rx=".75"/><path d="M3 6.5a4 4 0 0 1 8 0V9l1 1v1H2v-1l1-1z"/><path d="M5.5 12h3a1.5 1.5 0 0 1-3 0z"/></g><circle class="mark-badge" cx="12" cy="12" r="3.5" stroke-width="1"/><path class="mark-check" d="m10.4 12 1.1 1.1 2.1-2.3" stroke-width="1.25"/></svg>`
    : `<svg class="brand-svg" viewBox="0 0 256 256" aria-hidden="true">${tile}<rect x="8" y="8" width="240" height="240" rx="68" fill="url(#${id})"/><path class="mark-glyph" d="M78 151c13-14 11-32 12-52 1-21 16-38 38-38s37 17 38 38c1 20-1 38 12 52l9 11c4 6 0 13-7 13H76c-7 0-11-7-7-13z"/><path class="mark-clapper" d="M111 190c4 18 30 18 34 0" stroke-width="12"/><path class="mark-rays" d="M128 50v10M67 87l-9-10m131 10 9-10" stroke-width="10"/><circle class="mark-badge" cx="187" cy="169" r="35" stroke-width="7"/><path class="mark-check" d="m172 169 10 10 20-23" stroke-width="8"/></svg>`;
}
function hydrateBrandMarks(root = document) { root.querySelectorAll('[data-brand-mark]').forEach(el => { el.innerHTML = brandMark(el.dataset.brandMark === 'small'); }); }
async function api(action, payload) { const result = await window.waqt.call(action, payload); if (!result.ok) throw new Error(result.error); return result.value; }
// Tags are separated by commas or semicolons in any script: Latin, Arabic (، ؛) and CJK (、 ， ､ ；).
// The tag field is filled with tr(", "), which every locale translates to one of these.
const TAG_SEPARATORS = /[,;،؛、，､；]/;
function parseTags(text) { return text.split(TAG_SEPARATORS).map(t => t.trim()).filter(Boolean); }
function fileSize(bytes) { return formatSize(bytes, locale()); }
function fileBadge(name) { const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : tr('FILE@badge'); return ext.slice(0, 5); }
function isImageFile(record) { return /\.(png|jpe?g|webp|gif|bmp|ico|avif)$/i.test(record.name); }
function photoMarkup(record) {
  return `<button type="button" class="inline-photo" data-file-id="${esc(record.id)}" title="${tr("Open")} ${esc(record.name)}"><img data-preview-id="${esc(record.id)}" alt="${esc(record.name)}" decoding="async"><span class="photo-placeholder">${tr("Loading image…")}</span><span class="photo-caption"><bdi>${esc(record.name)}</bdi></span></button>`;
}
const previewCache = new Map();
let previewObserver;
const previewTargets = new Set();
async function loadPreview(img) {
  if (img.dataset.requested) return;
  img.dataset.requested = 'true';
  const id = img.dataset.previewId;
  let entry = previewCache.get(id);
  if (!entry || Date.now() - entry.time > 30000) {
    if (previewCache.size >= 60) previewCache.delete(previewCache.keys().next().value);
    entry = { time: Date.now(), promise: api('imagePreview', { id }).catch(() => null) };
    previewCache.set(id, entry);
  }
  const source = await entry.promise;
  if (!img.isConnected) return;
  const container = img.closest('.inline-photo');
  const failed = () => { container.classList.add('photo-failed'); container.querySelector('.photo-placeholder').textContent = tr("Preview unavailable • click to open"); };
  if (!source) { failed(); return; }
  img.addEventListener('load', () => container.classList.add('photo-loaded'), { once: true });
  img.addEventListener('error', failed, { once: true });
  img.src = source;
}
function hydratePreviews(root = document) {
  previewObserver ||= new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { previewObserver.unobserve(entry.target); previewTargets.delete(entry.target); loadPreview(entry.target); }
  }), { rootMargin: '150px' });
  for (const img of previewTargets) if (!img.isConnected) { previewObserver.unobserve(img); previewTargets.delete(img); }
  root.querySelectorAll('img[data-preview-id]:not([data-requested])').forEach(img => { previewTargets.add(img); previewObserver.observe(img); });
}
function fileMarkup(record, removable = false) {
  const kind = /\.(xlsx?|xlsm|csv)$/i.test(record.name) ? 'excel' : /\.pdf$/i.test(record.name) ? 'pdf' : 'other';
  const row = `<div class="attachment-item"><button type="button" class="attachment-open" data-file-id="${esc(record.id)}" title="${tr("Open")} ${esc(record.name)}"><span class="file-badge ${kind}">${esc(fileBadge(record.name))}</span><span class="attachment-name"><bdi>${esc(record.name)}</bdi><small dir="ltr">${fileSize(record.size)}</small></span>${icon('arrowLeft')}</button>${removable ? `<button type="button" class="attachment-remove icon-button" data-remove-file="${esc(record.id)}" aria-label="${tr("Remove")} ${esc(record.name)}" title="${tr("Remove attachment")}">${icon('x')}</button>` : ''}</div>`;
  return isImageFile(record) ? `<div class="image-attachment">${photoMarkup(record)}${row}</div>` : row;
}
hydrateIcons();
hydrateBrandMarks();
