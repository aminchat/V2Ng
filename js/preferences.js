import { validateCountryData } from './schema.js?v=15';

const STORAGE_KEY = 'emdadgar.preferences.v1';
const SUPPORTED_LOCALES = new Set(['fa', 'en']);

export function suggestedLocale() {
  return /^fa(?:-|$)/i.test(navigator.language || '') ? 'fa' : 'en';
}

export function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || value.completed !== true || !SUPPORTED_LOCALES.has(value.locale) || !/^[A-Z]{2}$/.test(value.country || '')) return null;
    return { locale: value.locale, country: value.country, completed: true };
  } catch {
    return null;
  }
}

export function savePreferences({ locale, country }) {
  if (!SUPPORTED_LOCALES.has(locale) || !/^[A-Z]{2}$/.test(country || '')) throw new Error('Invalid preferences');
  const value = { locale, country, completed: true };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  return value;
}

export async function loadCountryData() {
  const response = await fetch('./data/countries.json?v=15', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Country data HTTP ${response.status}`);
  const data = await response.json();
  const errors = validateCountryData(data);
  if (errors.length) throw new Error(`Invalid country data: ${errors.join('; ')}`);
  return data;
}

export function emergencyContact(profile) {
  if (profile?.ems?.number) return { ...profile.ems, type: 'ems' };
  if (profile?.general?.number && profile.general.usableForAmbulance) return { ...profile.general, type: 'general' };
  return null;
}

export function telephoneHref(number) {
  const dialable = String(number || '').replace(/[^+0-9]/g, '');
  return dialable ? `tel:${dialable}` : '';
}
