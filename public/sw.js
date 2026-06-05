const CACHE_NAME = 'champions-tool-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/data/pokedb/reg-ma-s1-environment.json'];

// Item icons are pre-cached lazily: install won't fail on individual misses
const ITEM_ICONS = [
  '/assets/items/black-belt.png','/assets/items/black-glasses.png','/assets/items/bright-powder.png',
  '/assets/items/charcoal.png','/assets/items/choice-scarf.png','/assets/items/dragon-fang.png',
  '/assets/items/fairy-feather.png','/assets/items/focus-band.png','/assets/items/focus-sash.png',
  '/assets/items/hard-stone.png','/assets/items/kings-rock.png','/assets/items/leftovers.png',
  '/assets/items/light-ball.png','/assets/items/magnet.png','/assets/items/mental-herb.png',
  '/assets/items/metal-coat.png','/assets/items/miracle-seed.png','/assets/items/mystic-water.png',
  '/assets/items/never-melt-ice.png','/assets/items/poison-barb.png','/assets/items/quick-claw.png',
  '/assets/items/scope-lens.png','/assets/items/sharp-beak.png','/assets/items/shell-bell.png',
  '/assets/items/silk-scarf.png','/assets/items/silver-powder.png','/assets/items/soft-sand.png',
  '/assets/items/spell-tag.png','/assets/items/twisted-spoon.png','/assets/items/white-herb.png',
  '/assets/items/abomasite.png','/assets/items/absolite.png','/assets/items/aerodactylite.png',
  '/assets/items/aggronite.png','/assets/items/alakazite.png','/assets/items/altarianite.png',
  '/assets/items/ampharosite.png','/assets/items/audinite.png','/assets/items/banettite.png',
  '/assets/items/beedrillite.png','/assets/items/blastoisinite.png','/assets/items/cameruptite.png',
  '/assets/items/chandelurite.png','/assets/items/charizardite-x.png','/assets/items/charizardite-y.png',
  '/assets/items/chesnaughtite.png','/assets/items/chimechite.png','/assets/items/clefablite.png',
  '/assets/items/crabominite.png','/assets/items/delphoxite.png','/assets/items/dragoninite.png',
  '/assets/items/drampanite.png','/assets/items/emboarite.png','/assets/items/excadrite.png',
  '/assets/items/feraligite.png','/assets/items/floettite.png','/assets/items/froslassite.png',
  '/assets/items/galladite.png','/assets/items/garchompite.png','/assets/items/gardevoirite.png',
  '/assets/items/gengarite.png','/assets/items/glalitite.png','/assets/items/glimmoranite.png',
  '/assets/items/golurkite.png','/assets/items/greninjite.png','/assets/items/gyaradosite.png',
  '/assets/items/hawluchanite.png','/assets/items/heracronite.png','/assets/items/houndoominite.png',
  '/assets/items/kangaskhanite.png','/assets/items/lopunnite.png','/assets/items/lucarionite.png',
  '/assets/items/manectite.png','/assets/items/medichamite.png','/assets/items/meganiumite.png',
  '/assets/items/meowsticite.png','/assets/items/pidgeotite.png','/assets/items/pinsirite.png',
  '/assets/items/sablenite.png','/assets/items/scizorite.png','/assets/items/scovillainite.png',
  '/assets/items/sharpedonite.png','/assets/items/skarmorite.png','/assets/items/slowbronite.png',
  '/assets/items/starminite.png','/assets/items/steelixite.png','/assets/items/tyranitarite.png',
  '/assets/items/venusaurite.png','/assets/items/victreebelite.png',
  '/assets/items/aspear-berry.png','/assets/items/babiri-berry.png','/assets/items/charti-berry.png',
  '/assets/items/cheri-berry.png','/assets/items/chesto-berry.png','/assets/items/chilan-berry.png',
  '/assets/items/chople-berry.png','/assets/items/coba-berry.png','/assets/items/colbur-berry.png',
  '/assets/items/haban-berry.png','/assets/items/kasib-berry.png','/assets/items/kebia-berry.png',
  '/assets/items/leppa-berry.png','/assets/items/lum-berry.png','/assets/items/occa-berry.png',
  '/assets/items/oran-berry.png','/assets/items/passho-berry.png','/assets/items/payapa-berry.png',
  '/assets/items/pecha-berry.png','/assets/items/persim-berry.png','/assets/items/rawst-berry.png',
  '/assets/items/rindo-berry.png','/assets/items/roseli-berry.png','/assets/items/shuca-berry.png',
  '/assets/items/sitrus-berry.png','/assets/items/tanga-berry.png','/assets/items/wacan-berry.png',
  '/assets/items/yache-berry.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).then(() =>
        // Pre-cache item icons but don't block install on failures
        Promise.allSettled(ITEM_ICONS.map((url) =>
          cache.add(url).catch(() => { /* skip individual failures */ })
        ))
      )
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
