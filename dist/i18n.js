import { integratedMessages } from './locales/integrated.js?v=20261113-integrated';
import { shellMessages } from './locales/shell.js?v=20261113-integrated';
import { flightMessages } from './locales/flight.js?v=20261113-integrated';
import { researchMessages } from './locales/research.js?v=20261113-integrated';
import { guideMessages } from './locales/guide.js?v=20261113-integrated';
import { dataMessages } from './locales/data.js?v=20261113-integrated';

const messages = { ...shellMessages, ...flightMessages, ...researchMessages, ...guideMessages, ...dataMessages, ...integratedMessages };
const normalize = value => String(value).replace(/\s+/g, ' ').trim();
const byText = new Map();
const byEnglish = new Map();
const textOrigins = new WeakMap();
const attributeOrigins = new WeakMap();
for (const [key, entry] of Object.entries(messages)) {
  if (!entry || typeof entry.en !== 'string' || typeof entry.zh !== 'string') {
    throw new Error(`Incomplete translation: ${key}`);
  }
  byEnglish.set(normalize(entry.en), entry);
  byText.set(normalize(entry.en), entry);
  byText.set(normalize(entry.zh), entry);
}
const STORAGE_KEY = 'fuel-atlas-language';
let language = 'zh';
let currentDocument = null;
let observer = null;
let pending = false;
const pendingRoots = new Set();
let translating = false;
const attributes = ['aria-label', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label'];

function interpolate(text, values) {
  return text.replace(/\{\{([\w.]+)\}\}/g, (token, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : token);
}

export function t(key, values = {}) {
  const entry = messages[key] || byText.get(normalize(key));
  return interpolate(entry ? entry[language] : String(key), values);
}

export const getLanguage = () => language;
export const getMessages = () => messages;

function translatedText(value, record) {
  const entry = record?.last === value ? record.entry : byEnglish.get(normalize(value)) || byText.get(normalize(value));
  if (!entry) return value;
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const translated = match[1] + entry[language] + match[3];
  if (record) { record.entry = entry; record.last = translated; }
  return translated;
}

function observe() {
  if (observer && currentDocument?.body) {
    observer.observe(currentDocument.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  }
}

// Translate text and accessibility attributes in place. Form controls, their
// values, event handlers, focus, imported quotations and motion objects survive.
export function translateTree(root = currentDocument || globalThis.document) {
  if (!root || translating) return;
  translating = true;
  observer?.disconnect();
  root.normalize?.();
  const visit = node => {
    if (node.nodeType === 3) {
      const origin = textOrigins.get(node) || {};
      const translated = translatedText(node.data, origin);
      if (origin.entry) textOrigins.set(node, origin);
      if (translated !== node.data) node.data = translated;
      return;
    }
    if (node.nodeType === 1) {
      if (['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(node.tagName) || node.hasAttribute('data-no-i18n') || (node.tagName === 'BUTTON' && node.hasAttribute('data-language'))) return;
      for (const attribute of attributes) {
        if (!node.hasAttribute(attribute)) continue;
        const origins = attributeOrigins.get(node) || new Map();
        const origin = origins.get(attribute) || {};
        const value = node.getAttribute(attribute), translated = translatedText(value, origin);
        if (origin.entry) { origins.set(attribute, origin); attributeOrigins.set(node, origins); }
        if (value !== translated) node.setAttribute(attribute, translated);
      }
      const hrefKey = node.getAttribute('data-i18n-href');
      if (node.tagName === 'A' && hrefKey) {
        const href = t(hrefKey);
        if (/^(?:\.{0,2}\/|#|https?:\/\/)/.test(href) && node.getAttribute('href') !== href) node.setAttribute('href', href);
      }
      const key = node.getAttribute('data-i18n');
      if (key && !node.children.length) {
        const value = t(key);
        if (node.textContent !== value) node.textContent = value;
        return;
      }
    }
    for (const child of [...node.childNodes]) visit(child);
  };
  visit(root);
  translating = false;
  observe();
}

function updateLanguageControls() {
  if (!currentDocument) return;
  currentDocument.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  currentDocument.documentElement.dataset.language = language;
  for (const panel of currentDocument.querySelectorAll('.workspace-panel')) panel.lang = currentDocument.documentElement.lang;
  for (const button of currentDocument.querySelectorAll('button[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  }
}

export function setLanguage(next, { persist = true, notify = true } = {}) {
  if (!['zh', 'en'].includes(next)) throw new RangeError('Unsupported interface language');
  language = next;
  if (persist) {
    try { currentDocument?.defaultView?.localStorage?.setItem(STORAGE_KEY, language); } catch { /* Locale remains usable when storage is disabled. */ }
  }
  updateLanguageControls();
  translateTree(currentDocument);
  if (notify && currentDocument) {
    const Event = currentDocument.defaultView.CustomEvent;
    currentDocument.dispatchEvent(new Event('languagechange', { detail: { language } }));
    translateTree(currentDocument);
  }
  if (currentDocument) currentDocument.documentElement.dataset.languageReady = 'true';
}

export function initI18n(doc = globalThis.document) {
  if (!doc?.body) return;
  if (currentDocument === doc) return;
  observer?.disconnect();
  currentDocument = doc;
  let stored;
  try { stored = doc.defaultView?.localStorage?.getItem(STORAGE_KEY); } catch { /* Default language below. */ }
  language = stored === 'en' ? 'en' : 'zh';
  for (const button of doc.querySelectorAll('button[data-language]')) {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  }
  const MutationObserver = doc.defaultView?.MutationObserver;
  observer = MutationObserver ? new MutationObserver(records => {
    if (translating) return;
    for (const record of records) pendingRoots.add(record.target);
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      const roots = [...pendingRoots]; pendingRoots.clear();
      for (const root of roots) {
        if (currentDocument?.body?.contains(root) && !roots.some(other => other !== root && other.contains?.(root))) translateTree(root);
      }
    });
  }) : null;
  const api = { t, getLanguage, setLanguage, translateTree, initI18n };
  globalThis.FuelI18n = api;
  if (doc.defaultView) doc.defaultView.FuelI18n = api;
  setLanguage(language, { persist: false });
}

if (typeof document !== 'undefined') {
  if (document.body && document.getElementById('language-zh')) initI18n(document);
  else document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('language-zh')) initI18n(document);
  }, { once: true });
}
