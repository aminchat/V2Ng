/* Minimal browser-API smoke harness: exercises the real app startup without third-party packages. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'onboarding';
if (!['onboarding', 'english'].includes(mode)) throw new Error(`Unknown smoke mode: ${mode}`);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

class FakeRequest {
  constructor(operation) {
    setTimeout(() => {
      try {
        this.result = operation();
        this.onsuccess?.();
      } catch (error) {
        this.error = error;
        this.onerror?.();
      }
    }, 0);
  }
}

const databases = new Map();
class FakeStore {
  constructor(rows, keyPath) { this.rows = rows; this.keyPath = keyPath; }
  getAll() { return new FakeRequest(() => [...this.rows.values()].map((value) => structuredClone(value))); }
  get(key) { return new FakeRequest(() => structuredClone(this.rows.get(key))); }
  clear() { this.rows.clear(); return new FakeRequest(() => undefined); }
  put(value) { this.rows.set(value[this.keyPath], structuredClone(value)); return new FakeRequest(() => value[this.keyPath]); }
}
class FakeTransaction {
  constructor(db) {
    this.db = db;
    setTimeout(() => this.oncomplete?.(), 40);
  }
  objectStore(name) { return new FakeStore(this.db.stores.get(name), name === 'cases' ? 'id' : 'key'); }
}
class FakeDatabase {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
  }
  createObjectStore(name) { this.stores.set(name, new Map()); }
  transaction() { return new FakeTransaction(this); }
  close() {}
}
const indexedDB = {
  open(name) {
    const isNew = !databases.has(name);
    const db = databases.get(name) || new FakeDatabase();
    databases.set(name, db);
    const request = { result: db };
    setTimeout(() => {
      if (isNew) request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request;
  },
};

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.value = '';
    this.listeners = {};
    this._html = '';
  }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  setAttribute() {}
  focus() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const elements = new Map();
for (const id of ['app', 'route-announcer', 'sync-announcer', 'app-update', 'app-update-now', 'app-update-later', 'app-update-title']) {
  elements.set(id, new FakeElement(id));
}
const documentStub = {
  documentElement: {},
  visibilityState: 'visible',
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  },
  querySelector(selector) {
    return ['.skip-link', '#app-update p'].includes(selector) ? new FakeElement() : null;
  },
  querySelectorAll() { return []; },
  addEventListener() {},
};
class WindowStub extends EventTarget {
  matchMedia() { return { matches: false, addEventListener() {} }; }
}

globalThis.window = new WindowStub();
globalThis.document = documentStub;
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, userAgent: 'Emdadgar smoke harness', platform: 'Linux', maxTouchPoints: 0 },
  configurable: true,
});
globalThis.location = { hash: '#/', reload() {} };
globalThis.history = {
  length: 1,
  back() {},
  replaceState(_state, _title, url) { location.hash = url; },
};
globalThis.localStorage = {
  getItem(key) {
    if (mode === 'english' && key === 'emdadgar.preferences.v1') {
      return JSON.stringify({ locale: 'en', country: 'FI', completed: true });
    }
    return null;
  },
  setItem() {},
};
globalThis.requestAnimationFrame = (callback) => callback();
globalThis.indexedDB = indexedDB;

let networkEnabled = true;
globalThis.fetch = async (url) => {
  if (!networkEnabled) throw new TypeError('Offline smoke mode');
  const relative = String(url).replace(/^\.\//, '').split('?')[0];
  const file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file)) return new Response('', { status: 404 });
  return new Response(readFileSync(file), { status: 200 });
};

let completed = false;
window.addEventListener('emdadgar:boot-complete', () => { completed = true; });
await import('../js/app.js');
for (let attempt = 0; attempt < 100 && !completed; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
if (!completed) throw new Error('App did not emit boot-complete');
const html = elements.get('app').innerHTML;

if (mode === 'onboarding') {
  if (!html.includes('onboarding-language') || !html.includes('onboarding-country') || !html.includes('onboarding-urgent')) {
    throw new Error('First-run language, country, or urgent route is missing');
  }
  console.log('first-run onboarding smoke OK');
} else {
  if (!html.includes('Take urgent action') || !html.includes('Check the person’s condition') || !html.includes('Guides and settings') || !html.includes('112')) {
    throw new Error('Focused English home and selected-country emergency call did not render');
  }
  if (html.includes('Browse all guidance') || html.includes('install-card') || html.includes('contact-card')) {
    throw new Error('Secondary content leaked onto the focused home screen');
  }
  if (document.documentElement.lang !== 'en' || document.documentElement.dir !== 'ltr') {
    throw new Error('English document language/direction was not applied');
  }
  networkEnabled = false;
  const { KnowledgeBase } = await import('../js/kb.js');
  const offlineKb = new KnowledgeBase({ locale: 'en' });
  const offlineResult = await offlineKb.load();
  if (!offlineResult.fromCache || offlineKb.listCases().length !== 35) {
    throw new Error('Downloaded English KB did not reopen from IndexedDB while offline');
  }
  console.log('English startup and offline reopen smoke OK');
}
