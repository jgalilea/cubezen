// Service worker: makes Cubezen installable and lets it open offline.
// Our own files go network-first (so a deploy shows up on the next load) and fall back to the
// cache when offline. Three.js comes from a versioned CDN URL that never changes: cache-first.
// Bump VERSION when the list below changes.
const VERSION = 'cubezen-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/style.css',
  'js/app.js', 'js/audio.js', 'js/composer.js',
  'js/world/main.js', 'js/world/build.js', 'js/world/textures.js', 'js/world/props.js', 'js/world/critters.js',
  'fonts/vt323.woff2', 'fonts/press-start-2p.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await Promise.all(CDN.map((url) => cache.add(new Request(url, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Give up on a slow network after a few seconds and use the cached copy.
const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req), timeout(4000)]);
    if (res.ok) cache.put(req.mode === 'navigate' ? './' : req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'cdn.jsdelivr.net') e.respondWith(cacheFirst(req));
});

// Clicking a timer notification brings the app back to the front.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (client) return client.focus();
    return self.clients.openWindow('./');
  })());
});
