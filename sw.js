const CACHE_PREFIX = 'emdadgar-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v3`;
const SHELL_FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
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
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES.map((url) => new Request(url, { cache: 'reload' })))),
  );
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!isWithinScope(url)) return;

  // Knowledge-base responses are deliberately not HTTP-cached. The app verifies a
  // complete snapshot and commits it atomically to IndexedDB before using it.
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.pathname.startsWith(`${scopePath}kb/`)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) || Response.error();
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
