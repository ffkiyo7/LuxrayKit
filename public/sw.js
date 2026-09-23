// Replaced at build time by the luxraykit-precache-manifest Vite plugin (scripts/precache-manifest.mjs)
// with this build's version, every emitted /assets/* file and the item icons. Embedding the list
// makes each deploy a byte-different sw.js, which is what makes the browser install an update at
// all, and ties the precache list to the exact build that produced it. The literal below is what
// `vite dev` serves: nothing hashed to precache.
const BUILD = { version: 'dev', assets: [], itemIcons: [] };

const CACHE_PREFIX = 'luxraykit-';
/** One cache per build: the shell and its hashed chunks, always from the same deploy. */
const CACHE_NAME = `${CACHE_PREFIX}shell-${BUILD.version}`;
/** Sprites and item icons: named by id, stable across deploys, not worth re-downloading each one. */
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime`;
const SHELL_URL = '/';
const APP_SHELL = [SHELL_URL, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable.png', '/apple-touch-icon.png', '/data/pokedb/reg-ma-environment.json'];
const HASHED_ASSETS = new Set(BUILD.assets);
const SHELL_PATHS = new Set(APP_SHELL);
/**
 * Every lookup ignores Vary. The precache is filled by the worker's own fetch (no Origin header)
 * while the page's module scripts are CORS requests that carry one, so a server answering
 * `Vary: Origin` (vite preview does) would make every precached chunk miss offline. Everything
 * cached here is a same-origin static file whose body does not depend on request headers.
 */
const MATCH = { ignoreVary: true };

/**
 * The shell must reference only chunks this worker precaches. A deploy landing between the
 * sw.js fetch and this one would hand us the next build's index.html; failing install leaves the
 * current worker in charge and the browser retries on the next navigation.
 */
async function assertShellMatchesBuild(response) {
  const html = await response.clone().text();
  const stray = (html.match(/\/assets\/[^"'\s)]+/g) ?? []).filter((path) => !HASHED_ASSETS.has(path));
  if (stray.length > 0) throw new Error(`index.html references assets outside this build: ${stray.join(', ')}`);
}

async function precacheShell(cache) {
  await Promise.all(APP_SHELL.map(async (url) => {
    // `reload` skips the HTTP cache: a revalidated-but-stale index.html is exactly the mismatch
    // assertShellMatchesBuild exists to stop.
    const response = await fetch(new Request(url, { cache: 'reload' }));
    if (!response.ok) throw new Error(`precache ${url}: HTTP ${response.status}`);
    if (url === SHELL_URL) await assertShellMatchesBuild(response);
    await cache.put(url, response);
  }));
}

/** Hashed names are content-addressed: a copy held by an older build's cache is the same bytes. */
async function precacheHashedAssets(cache) {
  await Promise.all(BUILD.assets.map(async (url) => {
    const existing = await caches.match(url, MATCH);
    if (existing) return cache.put(url, existing);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`precache ${url}: HTTP ${response.status}`);
    return cache.put(url, response);
  }));
}

/** Nice to have offline; a missing icon must never block the update. */
async function precacheItemIcons() {
  const cache = await caches.open(RUNTIME_CACHE);
  await Promise.allSettled(BUILD.itemIcons.map(async (url) => {
    if (await cache.match(url, MATCH)) return;
    await cache.add(url);
  }));
}

self.addEventListener('install', (event) => {
  // No skipWaiting here. An update waits until the page asks for it (SKIP_WAITING below), so a
  // running tab keeps its own build's cache — and the lazy chunks it has not loaded yet — until
  // the user chooses to reload. The first install has nothing to wait for and activates at once.
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await precacheShell(cache);
      await precacheHashedAssets(cache);
      await precacheItemIcons();
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Also sweeps the pre-2026-09 `champions-tool-v*` caches.
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Network response for the page; a copy goes into `cacheName` while the event is kept alive. */
function fetchAndStore(event, cacheName) {
  const network = fetch(event.request);
  const stored = network.then(async (response) => {
    if (!response.ok) return;
    const copy = response.clone();
    const cache = await caches.open(cacheName);
    await cache.put(event.request, copy);
  });
  event.waitUntil(stored.catch(() => undefined));
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate' && (url.pathname === SHELL_URL || url.pathname === '/index.html')) {
    // The app is one page with hash routing. Serve this build's own shell so the page and the
    // chunks it asks for always come from the same deploy — a newer index.html against an older
    // precache is the offline white screen. New builds arrive through the update prompt.
    event.respondWith(
      caches.open(CACHE_NAME)
        .then((cache) => cache.match(SHELL_URL, MATCH))
        .then((cached) => cached ?? fetch(request)),
    );
    return;
  }

  if (HASHED_ASSETS.has(url.pathname)) {
    // Content-addressed and precached: the network is only a fallback for a lost cache entry.
    event.respondWith(caches.match(request, MATCH).then((cached) => cached ?? fetchAndStore(event, CACHE_NAME)));
    return;
  }

  // Everything else (the environment snapshot, sprites, icons) is served from cache and refreshed
  // in the background; the network error only surfaces when there is no copy at all.
  const network = fetchAndStore(event, SHELL_PATHS.has(url.pathname) ? CACHE_NAME : RUNTIME_CACHE);
  event.respondWith(caches.match(request, MATCH).then((cached) => cached ?? network));
});
