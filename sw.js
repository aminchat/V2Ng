const CACHE_PREFIX = 'emdadgar-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v7`;
const SHELL_FILES = [
  './',
  './index.html',
  './css/app.css?v=7',
  './js/app.js?v=7',
  './js/engine.js',
  './js/kb.js',
  './js/schema.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(
      SHELL_FILES.map((url) => new Request(url, { cache: 'reload' })),
    )),
  );
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

  // KB snapshots deliberately bypass HTTP caching; the app validates and commits them
  // atomically to IndexedDB before use.
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.pathname.startsWith(`${scopePath}kb/`)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  // Online loads receive fresh shell assets; offline loads fall back to shell-v7.
  event.respondWith(networkFirst(event.request));
});
