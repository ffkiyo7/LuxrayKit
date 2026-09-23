import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- plain ESM build script, unit-tested from scripts/precache-manifest.test.mjs
import { injectPrecacheManifest } from '../scripts/precache-manifest.mjs';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://luxraykit.com';
const ENTRY = '/assets/index-abc.js';
const LAZY = '/assets/CalculatorPage-def.js';
const SHELL_HTML = `<script type="module" src="${ENTRY}"></script>`;

type Handler = (event: Record<string, unknown>) => void;

/** In-memory CacheStorage keyed by pathname, enough to run sw.js end to end. */
function fakeCaches(seed: Record<string, Record<string, string>> = {}) {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (key: Request | string) => store.get(pathOf(key))?.clone(),
      put: async (key: Request | string, response: Response) => void store.set(pathOf(key), response),
      add: async (key: string) => {
        const response = await globalFetch(key);
        if (!response.ok) throw new Error('add failed');
        store.set(pathOf(key), response);
      },
    };
  };
  for (const [name, entries] of Object.entries(seed)) {
    stores.set(name, new Map(Object.entries(entries).map(([path, body]) => [path, new Response(body)])));
  }
  let globalFetch: (input: Request | string) => Promise<Response> = async () => new Response('');
  return {
    stores,
    bindFetch: (fetcher: typeof globalFetch) => { globalFetch = fetcher; },
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (key: Request | string) => {
        for (const store of stores.values()) {
          const hit = store.get(pathOf(key));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
  };
}

function pathOf(key: { url: string } | string) {
  return new URL(typeof key === 'string' ? key : key.url, ORIGIN).pathname;
}

function loadWorker({
  build = { version: 'v2', assets: [ENTRY, LAZY], itemIcons: ['/assets/items/leftovers.png'] },
  network = {} as Record<string, string>,
  seed = {} as Record<string, Record<string, string>>,
} = {}) {
  const handlers: Record<string, Handler> = {};
  const storage = fakeCaches(seed);
  const fetcher = vi.fn(async (input: Request | string) => {
    const path = pathOf(input);
    if (path in network) return new Response(network[path], { status: 200 });
    if (path === '/') return new Response(SHELL_HTML);
    if (path === '/assets/items/leftovers.png' || path.startsWith('/assets/pokemon/') || path.startsWith('/icon') || path.startsWith('/apple') || path.startsWith('/manifest') || path.startsWith('/data/')) {
      return new Response(path);
    }
    if (path.includes('missing')) return new Response('', { status: 404 });
    if (build.assets.includes(path)) return new Response(`chunk ${path}`);
    throw new TypeError('offline');
  });
  storage.bindFetch(fetcher);
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, handler: Handler) => { handlers[type] = handler; },
  };
  // Node has no page URL to resolve sw.js's relative `new Request('/')` against.
  const WorkerRequest = class extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, ORIGIN), init);
    }
  };
  new Function('self', 'caches', 'fetch', 'Request', injectPrecacheManifest(source, build))(self, storage.api, fetcher, WorkerRequest);

  const lifecycle = async (type: 'install' | 'activate') => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[type]({ waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
  };
  const request = async (path: string, init: { mode?: string } = {}) => {
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers.fetch({
      // A plain object: Request.mode is read-only, and a navigation cannot be constructed.
      request: { url: `${ORIGIN}${path}`, method: 'GET', mode: init.mode ?? 'cors' },
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    const result = response ? await response : undefined;
    await Promise.all(pending);
    return result;
  };
  return { self, handlers, storage, fetcher, lifecycle, request };
}

describe('service worker source', () => {
  it('ships the placeholder the build replaces, and no hand-written icon list', () => {
    expect(source).toContain("const BUILD = { version: 'dev', assets: [], itemIcons: [] };");
    expect(source).not.toContain("'/assets/items/");
    expect(source).not.toContain('/data/vgcpastes/');
    expect(source).toContain('/data/pokedb/reg-ma-environment.json');
    // Retired in 2026-06 and deleted from public/; must not come back as a precache entry.
    expect(source).not.toContain('reg-ma-s1-environment.json');
  });
});

describe('service worker install', () => {
  it('precaches the shell and every hashed chunk into a per-build cache', async () => {
    const worker = loadWorker();
    await worker.lifecycle('install');

    const shell = worker.storage.stores.get('luxraykit-shell-v2')!;
    expect([...shell.keys()]).toEqual(expect.arrayContaining(['/', '/data/pokedb/reg-ma-environment.json', ENTRY, LAZY]));
    expect(worker.storage.stores.get('luxraykit-runtime')!.has('/assets/items/leftovers.png')).toBe(true);
    // An update waits for the page to ask; skipping here would swap builds under a running tab.
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('reuses a hashed chunk an older build already cached instead of downloading it again', async () => {
    const worker = loadWorker({ seed: { 'luxraykit-shell-v1': { [ENTRY]: 'old copy' } } });
    await worker.lifecycle('install');

    expect(worker.fetcher.mock.calls.map(([input]) => pathOf(input))).not.toContain(ENTRY);
    expect(await worker.storage.stores.get('luxraykit-shell-v2')!.get(ENTRY)!.text()).toBe('old copy');
  });

  it('fails install when index.html belongs to a different build', async () => {
    const worker = loadWorker({ network: { '/': '<script src="/assets/index-NEWER.js"></script>' } });
    await expect(worker.lifecycle('install')).rejects.toThrow('/assets/index-NEWER.js');
  });

  it('fails install when a chunk cannot be fetched, but not over a missing item icon', async () => {
    const broken = loadWorker({ build: { version: 'v2', assets: [ENTRY, '/assets/missing.js'], itemIcons: [] } });
    await expect(broken.lifecycle('install')).rejects.toThrow('/assets/missing.js: HTTP 404');

    const iconless = loadWorker({ build: { version: 'v2', assets: [ENTRY], itemIcons: ['/assets/items/missing.png'] } });
    await expect(iconless.lifecycle('install')).resolves.toBeUndefined();
  });
});

describe('service worker activate and update', () => {
  it('drops older builds and the legacy cache but keeps runtime sprites', async () => {
    const worker = loadWorker({
      seed: { 'champions-tool-v8': {}, 'luxraykit-shell-v1': {}, 'luxraykit-runtime': {}, 'luxraykit-shell-v2': {} },
    });
    await worker.lifecycle('activate');

    expect([...worker.storage.stores.keys()].sort()).toEqual(['luxraykit-runtime', 'luxraykit-shell-v2']);
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it('takes over only when the page sends SKIP_WAITING', () => {
    const worker = loadWorker();
    worker.handlers.message({ data: { type: 'something-else' } });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    worker.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(worker.self.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe('service worker fetch', () => {
  it('serves its own build shell for navigations, even when the network has a newer one', async () => {
    const worker = loadWorker();
    await worker.lifecycle('install');
    worker.fetcher.mockClear();

    const response = await worker.request('/', { mode: 'navigate' });
    expect(await response!.text()).toBe(SHELL_HTML);
    expect(worker.fetcher).not.toHaveBeenCalled();
  });

  it('serves precached chunks offline, including lazy pages never opened online', async () => {
    const worker = loadWorker();
    await worker.lifecycle('install');
    worker.fetcher.mockImplementation(async () => { throw new TypeError('offline'); });

    expect(await (await worker.request(LAZY))!.text()).toBe(`chunk ${LAZY}`);
  });

  it('keeps sprites in the runtime cache across builds', async () => {
    const worker = loadWorker();
    await worker.request('/assets/pokemon/445.png');
    expect(worker.storage.stores.get('luxraykit-runtime')!.has('/assets/pokemon/445.png')).toBe(true);
  });

  it('leaves cross-origin requests to the browser', async () => {
    const worker = loadWorker();
    let responded = false;
    worker.handlers.fetch({
      request: new Request('https://example.com/x.png'),
      respondWith: () => { responded = true; },
      waitUntil: () => undefined,
    });
    expect(responded).toBe(false);
  });

  it('always fetches API requests from the network without reading or writing the offline cache', async () => {
    const worker = loadWorker({ network: { '/api/environment/latest': '{"ok":true}' } });
    const match = vi.spyOn(worker.storage.api, 'match');

    const response = await worker.request('/api/environment/latest');
    expect(await response!.text()).toBe('{"ok":true}');
    expect(worker.fetcher).toHaveBeenCalledOnce();
    expect(match).not.toHaveBeenCalled();
    expect(worker.storage.stores.size).toBe(0);
  });
});
