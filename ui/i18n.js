// Interface language. Pages and scripts hold English source text; translations come from
// ui/locales/<code>.json through the main process (the windows have no network or file access).
let uiLanguage = 'en', uiDigits = 'auto', uiLocale = findLocale('en'), uiMessages = {}, uiFallback = {};
const originalText = new WeakMap();
const originalAttrs = new WeakMap();
const localeCache = new Map();
function tr(key, params) { return translate(uiMessages, uiFallback, uiLocale.intl, key, params, value => num(value)); }
// Accepts a language code, or { language, digits } as the alert window receives it.
async function setLanguage(language, digits) {
  if (language && typeof language === 'object') ({ language, digits } = language);
  uiDigits = digits === 'arab' || digits === 'latn' ? digits : 'auto';
  const code = findLocale(language).code;
  if (!localeCache.has(code)) localeCache.set(code, api('locale', { code }).catch(error => { localeCache.delete(code); throw error; }));
  const data = await localeCache.get(code);
  uiLanguage = code; uiLocale = data; uiMessages = data.messages || {}; uiFallback = data.fallback || {};
  document.documentElement.lang = code; document.documentElement.dir = data.dir;
  document.title = tr(document.body.classList.contains('alert-body') ? 'Remember Me • Reminder' : 'Remember Me • Your day');
  // Static text keeps its English source and is translated on every switch. User content sits in
  // translate="no" containers, so a task called "Settings" is never translated.
  const skip = node => node.closest('[translate="no"], script, style');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => (skip(node.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let node; while ((node = walker.nextNode())) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node), trimmed = source.trim();
    if (trimmed) node.nodeValue = source.replace(trimmed, tr(node.parentElement.dataset.i18n || trimmed));
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
    if (skip(el)) continue;
    if (!originalAttrs.has(el)) originalAttrs.set(el, {});
    const saved = originalAttrs.get(el);
    for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) if (el.hasAttribute(attr)) { saved[attr] ??= el.getAttribute(attr); el.setAttribute(attr, tr(saved[attr])); }
  }
}
