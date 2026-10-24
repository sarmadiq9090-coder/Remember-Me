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
  paperclip: '<path d="m21 11-9 9a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.7 5.7l-10 10a2 2 0 0 1-2.8-2.8L16 5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8m-8 4h5"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.note}</svg>`; }
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Locale for every date, time and number, with the chosen digits and optionally the Hijri calendar.
function locale(hijri = false) {
  const extensions = [...(hijri ? ['ca-islamic-umalqura'] : []), ...(uiDigits === 'auto' ? [] : ['nu-' + uiDigits])];
  return (uiLanguage === 'en' ? 'en-US' : 'ar-IQ') + (extensions.length ? '-u-' + extensions.join('-') : '');
}
// Counts keep plain digits unless a digit style was chosen explicitly.
function num(value) { return uiDigits === 'auto' ? String(value) : Number(value).toLocaleString(locale()); }
function localDateValue(date) { const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function isToday(value) { return value && new Date(value).toDateString() === new Date().toDateString(); }
function timeLabel(value) { return new Date(value).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }); }
function dateLabel(value) { if (!value) return ''; const d = new Date(value); return `${isToday(value) ? tr('اليوم', 'Today') : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}${tr('، ', ', ')}${timeLabel(value)}`; }
async function api(action, payload) { const result = await window.waqt.call(action, payload); if (!result.ok) throw new Error(result.error); return result.value; }
function fileSize(bytes) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
function fileBadge(name) { const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : 'FILE'; return ext.slice(0, 5); }
function isImageFile(record) { return /\.(png|jpe?g|webp|gif|bmp|ico|avif)$/i.test(record.name); }
function photoMarkup(record) {
  return `<button type="button" class="inline-photo" data-file-id="${esc(record.id)}" title="${tr('فتح', 'Open')} ${esc(record.name)}"><img data-preview-id="${esc(record.id)}" alt="${esc(record.name)}" decoding="async"><span class="photo-placeholder">${tr('جارٍ تحميل الصورة…', 'Loading image…')}</span><span class="photo-caption"><bdi>${esc(record.name)}</bdi></span></button>`;
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
  const failed = () => { container.classList.add('photo-failed'); container.querySelector('.photo-placeholder').textContent = tr('المعاينة غير متاحة • اضغط لفتح الملف', 'Preview unavailable • click to open'); };
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
  const row = `<div class="attachment-item"><button type="button" class="attachment-open" data-file-id="${esc(record.id)}" title="${tr('فتح', 'Open')} ${esc(record.name)}"><span class="file-badge ${kind}">${esc(fileBadge(record.name))}</span><span class="attachment-name"><bdi>${esc(record.name)}</bdi><small dir="ltr">${fileSize(record.size)}</small></span>${icon('arrowLeft')}</button>${removable ? `<button type="button" class="attachment-remove icon-button" data-remove-file="${esc(record.id)}" aria-label="${tr('إزالة', 'Remove')} ${esc(record.name)}" title="${tr('إزالة المرفق', 'Remove attachment')}">${icon('x')}</button>` : ''}</div>`;
  return isImageFile(record) ? `<div class="image-attachment">${photoMarkup(record)}${row}</div>` : row;
}
hydrateIcons();
