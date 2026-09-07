const CACHE_NAME = 'champions-tool-v8';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable.png', '/apple-touch-icon.png', '/data/pokedb/reg-ma-environment.json'];
// Item icons come from a build-time manifest generated off the item catalog's iconRef fields
// (see the luxraykit-precache-manifest plugin in vite.config.ts). It used to be a hand-written
// array in this file, which drifted from the catalog every time an item was added.
const PRECACHE_MANIFEST_URL = '/precache-manifest.json';

// Item icons are pre-cached lazily: install won't fail on individual misses, nor on a missing
// or unparsable manifest (a static deploy without the build step still gets a working shell).
async function itemIconsFromManifest() {
  try {
    const response = await fetch(PRECACHE_MANIFEST_URL, { cache: 'no-cache' });
    if (!response.ok) return [];
    const manifest = await response.json();
    return Array.isArray(manifest?.itemIcons) ? manifest.itemIcons : [];
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).then(async () => {
        const itemIcons = await itemIconsFromManifest();
        await Promise.allSettled(itemIcons.map((url) =>
          cache.add(url).catch(() => { /* skip individual failures */ })
        ));
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
