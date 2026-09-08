import { validateKnowledgeBase, validateManifest } from './schema.js?v=15';

const FA_DB_NAME = 'emdadgar-kb';
const EN_DB_NAME = 'emdadgar-kb-en-v1';
const DB_VERSION = 2;
const SPECIAL_IDS = ['__symptoms', '__categories'];
const META_KEY = 'snapshot';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('خطای پایگاه داده'));
    if ('onblocked' in request) {
      request.onblocked = () => reject(createSyncError('ارتقای پایگاه داده توسط پنجرهٔ دیگری مسدود شده است.', 'DB_BLOCKED'));
    }
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('خطای تراکنش پایگاه داده'));
    transaction.onabort = () => reject(transaction.error || new Error('تراکنش پایگاه داده لغو شد'));
  });
}

function createSyncError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

async function openDatabase(name) {
  const request = indexedDB.open(name, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('cases')) db.createObjectStore('cases', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
  };
  const db = await requestResult(request);
  db.onversionchange = () => db.close();
  return db;
}

async function readLocalSnapshot(db) {
  const transaction = db.transaction(['cases', 'meta'], 'readonly');
  const rowsRequest = transaction.objectStore('cases').getAll();
  const metaRequest = transaction.objectStore('meta').get(META_KEY);
  const [rows, metadata] = await Promise.all([requestResult(rowsRequest), requestResult(metaRequest)]);
  await transactionDone(transaction);
  return { rows, metadata };
}

async function replaceLocalSnapshot(db, rows, metadata) {
  const transaction = db.transaction(['cases', 'meta'], 'readwrite');
  const casesStore = transaction.objectStore('cases');
  const metaStore = transaction.objectStore('meta');
  casesStore.clear();
  for (const row of rows) casesStore.put(row);
  metaStore.put({ key: META_KEY, ...metadata });
  await transactionDone(transaction);
}

function hydrateRows(rows) {
  const symptoms = rows.find((row) => row.id === '__symptoms')?.data;
  const categories = rows.find((row) => row.id === '__categories')?.data;
  const cases = Object.fromEntries(rows.filter((row) => !SPECIAL_IDS.includes(row.id)).map((row) => [row.id, row.data]));
  return { symptoms, categories, cases };
}

function validStoredSnapshot(rows, metadata) {
  if (!metadata || !Number.isInteger(metadata.kbVersion) || metadata.kbVersion < 1 || !Array.isArray(metadata.expectedIds) || !Array.isArray(rows)) return false;
  const rowIds = rows.map((row) => row.id).sort();
  const expectedIds = [...metadata.expectedIds].sort();
  if (rowIds.length !== expectedIds.length || rowIds.some((id, index) => id !== expectedIds[index])) return false;
  if (rows.some((row) => typeof row.hash !== 'string' || !Number.isInteger(row.version) || !row.data)) return false;
  const snapshot = hydrateRows(rows);
  return validateKnowledgeBase(snapshot.symptoms, snapshot.categories, snapshot.cases).length === 0;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchText(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw createSyncError(`دریافت ${url} ناموفق بود (${response.status}).`, 'HTTP_ERROR');
    return await response.text();
  } catch (error) {
    if (error?.code) throw error;
    if (error?.name === 'AbortError') throw createSyncError('زمان دریافت پایگاه دانش به پایان رسید.', 'TIMEOUT', error);
    throw createSyncError('ارتباط با پایگاه دانش برقرار نشد.', 'NETWORK_ERROR', error);
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw createSyncError(`دادهٔ ${label} JSON معتبر نیست.`, 'INVALID_JSON', error);
  }
}

export class KnowledgeBase {
  constructor({ locale = 'fa' } = {}) {
    this.locale = locale === 'en' ? 'en' : 'fa';
    this.root = this.locale === 'en' ? 'kb-en' : 'kb';
    this.dbName = this.locale === 'en' ? EN_DB_NAME : FA_DB_NAME;
    this.db = null;
    this.symptoms = {};
    this.categories = {};
    this.cases = {};
    this.metadata = null;
    this._syncPromise = null;
  }

  async load() {
    this.db = await openDatabase(this.dbName);
    const local = await readLocalSnapshot(this.db);
    if (validStoredSnapshot(local.rows, local.metadata)) {
      this._hydrate(local.rows, local.metadata);
      return { fromCache: true, metadata: this.metadata };
    }

    await this.sync({ allowRollback: true });
    return { fromCache: false, metadata: this.metadata };
  }

  async sync(options = {}) {
    if (this._syncPromise) return this._syncPromise;
    this._syncPromise = this._sync(options).finally(() => {
      this._syncPromise = null;
    });
    return this._syncPromise;
  }

  async _sync({ allowRollback = false } = {}) {
    if (!this.db) this.db = await openDatabase(this.dbName);
    const manifestText = await fetchText(`${this.root}/manifest.json`);
    const manifest = parseJson(manifestText, 'manifest');
    const manifestErrors = validateManifest(manifest, this.root);
    if (manifestErrors.length) throw createSyncError(`manifest نامعتبر است: ${manifestErrors.join(' | ')}`, 'INVALID_MANIFEST');
    if (!allowRollback && this.metadata?.kbVersion && manifest.kbVersion < this.metadata.kbVersion) {
      throw createSyncError('نسخهٔ دریافتی پایگاه دانش قدیمی‌تر از نسخهٔ نصب‌شده است.', 'ROLLBACK_REJECTED');
    }

    const local = await readLocalSnapshot(this.db);
    const localById = new Map(local.rows.map((row) => [row.id, row]));
    const definitions = [
      ...SPECIAL_IDS.map((id) => ({ id, ...manifest.entries[id] })),
      ...Object.entries(manifest.cases).map(([id, entry]) => ({ id, ...entry })),
    ];
    const stagedRows = [];
    const changed = [];

    await Promise.all(definitions.map(async (definition) => {
      const localRow = localById.get(definition.id);
      if (localRow?.hash === definition.hash && localRow.version === definition.version && localRow.data) {
        stagedRows.push(localRow);
        return;
      }
      const text = await fetchText(definition.url);
      const actualHash = await sha256(text);
      if (actualHash !== definition.hash) {
        throw createSyncError(`یکپارچگی فایل ${definition.id} تأیید نشد.`, 'HASH_MISMATCH');
      }
      const data = parseJson(text, definition.id);
      if (!SPECIAL_IDS.includes(definition.id) && data.id !== definition.id) {
        throw createSyncError(`شناسهٔ داخلی فایل ${definition.id} نادرست است.`, 'ID_MISMATCH');
      }
      stagedRows.push({ id: definition.id, version: definition.version, hash: definition.hash, data });
      changed.push(definition.id);
    }));

    const expectedIds = definitions.map((definition) => definition.id).sort();
    const previousIds = [...(this.metadata?.expectedIds || [])].sort();
    const idSetChanged = previousIds.length !== expectedIds.length || previousIds.some((id, index) => id !== expectedIds[index]);
    if (!allowRollback && this.metadata?.kbVersion === manifest.kbVersion && (changed.length || idSetChanged)) {
      throw createSyncError('محتوا بدون افزایش نسخهٔ پایگاه دانش تغییر کرده است.', 'VERSION_COLLISION');
    }

    stagedRows.sort((a, b) => a.id.localeCompare(b.id));
    const snapshot = hydrateRows(stagedRows);
    const validationErrors = validateKnowledgeBase(snapshot.symptoms, snapshot.categories, snapshot.cases);
    if (validationErrors.length) {
      throw createSyncError(`پایگاه دانش نامعتبر است: ${validationErrors.join(' | ')}`, 'INVALID_KB');
    }

    const metadata = {
      kbVersion: manifest.kbVersion,
      updatedAt: manifest.updatedAt,
      lastSync: new Date().toISOString(),
      expectedIds,
    };
    await replaceLocalSnapshot(this.db, stagedRows, metadata);
    this._hydrate(stagedRows, { key: META_KEY, ...metadata });
    return { changed, metadata: this.metadata };
  }

  _hydrate(rows, metadata) {
    const snapshot = hydrateRows(rows);
    this.symptoms = snapshot.symptoms;
    this.categories = snapshot.categories;
    this.cases = snapshot.cases;
    this.metadata = metadata;
  }

  listCases() {
    return Object.values(this.cases).sort((a, b) => a.title.localeCompare(b.title, this.locale));
  }
}
