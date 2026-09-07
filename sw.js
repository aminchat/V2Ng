const CACHE_PREFIX = 'emdadgar-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v12`;
const RECOVERY_WORKER_VERSIONS = new Set([null, '5', '6', '7', '8', '9']);
const RECOVERY_SHELL_CACHES = new Set([
  `${CACHE_PREFIX}shell-v5`,
  `${CACHE_PREFIX}shell-v6`,
  `${CACHE_PREFIX}shell-v7`,
  `${CACHE_PREFIX}shell-v8`,
  `${CACHE_PREFIX}shell-v9`,
]);
const SHELL_FILES = [
  './',
  './index.html',
  './css/app.css?v=12',
  './js/app.js?v=12',
  './js/engine.js?v=12',
  './js/kb.js?v=12',
  './js/schema.js?v=12',
  './js/i18n.js?v=12',
  './js/preferences.js?v=12',
  './locales/fa.js?v=12',
  './data/countries.json?v=12',
  './manifest.webmanifest?v=12',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const existingCaches = await caches.keys();
    const activeWorker = self.registration.active;
    const activeVersion = activeWorker
      ? new URL(activeWorker.scriptURL).searchParams.get('v')
      : null;
    const needsRecovery = Boolean(activeWorker) && (
      RECOVERY_WORKER_VERSIONS.has(activeVersion)
      || existingCaches.some((key) => RECOVERY_SHELL_CACHES.has(key))
    );
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES.map((url) => new Request(url, { cache: 'reload' })));

    // v5–v9 can strand the page before app.js can display the normal update action.
    // Taking control does not reload an open emergency flow; it only repairs later requests.
    if (needsRecovery) await self.skipWaiting();
  })());
});

// Activation is user-controlled: app.js sends this message from the visible update banner.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isWithinScope(url) {
  return url.origin === self.location.origin && url.href.startsWith(self.registration.scope);
}

async function networkFirst(request, fallbackKey = request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(new Request(request, { cache: 'no-cache' }));
    if (response.ok) await cache.put(fallbackKey, response.clone());
    return response;
  } catch {
    return (await cache.match(fallbackKey)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!isWithinScope(url)) return;

  // Both language KB snapshots deliberately bypass HTTP caching; the app validates and
  // commits them atomically to separate IndexedDB stores. English is therefore on-demand.
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.pathname.startsWith(`${scopePath}kb/`) || url.pathname.startsWith(`${scopePath}kb-en/`)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  // Online loads receive fresh shell assets; offline loads fall back to the current shell cache.
  event.respondWith(networkFirst(event.request));
});
