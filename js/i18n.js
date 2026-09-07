import fa from '../locales/fa.js?v=14';
import { validateLocaleDictionary } from './schema.js?v=14';

const supported = new Set(['fa', 'en']);
let active = fa;

function assertLocale(locale) {
  const errors = validateLocaleDictionary(locale);
  if (errors.length) throw new Error(`Invalid locale dictionary: ${errors.join('; ')}`);
}

assertLocale(fa);

export async function setLocale(code) {
  const normalized = supported.has(code) ? code : 'fa';
  if (normalized === 'en') {
    const module = await import('../locales/en.js?v=14');
    assertLocale(module.default);
    active = module.default;
  } else {
    active = fa;
  }
  document.documentElement.lang = active.code;
  document.documentElement.dir = active.dir;
  return active;
}

export function localeCode() {
  return active.code;
}

export function localeDirection() {
  return active.dir;
}

export function t(key, values = {}) {
  const template = active.messages[key];
  if (typeof template !== 'string') {
    console.warn(`Missing locale message: ${key}`);
    return key;
  }
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
}

export function formatNumber(value) {
  return new Intl.NumberFormat(active.code === 'fa' ? 'fa-IR' : 'en', { useGrouping: false }).format(value);
}

export function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat(active.code === 'fa' ? 'fa-IR' : 'en', {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function localizeField(value) {
  if (value && typeof value === 'object') return value[active.code] || value.en || value.fa || '';
  return typeof value === 'string' ? value : '';
}

export function countryName(code, fallback = code) {
  try {
    return new Intl.DisplayNames([active.code === 'fa' ? 'fa' : 'en'], { type: 'region' }).of(code) || fallback;
  } catch {
    return fallback;
  }
}
