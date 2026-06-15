import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

describe('service worker request strategy', () => {
  it('always fetches API requests from the network without reading or writing the offline cache', async () => {
    const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
    let fetchHandler: ((event: {
      request: Request;
      respondWith: (response: Promise<Response>) => void;
    }) => void) | undefined;
    const cache = { addAll: vi.fn(), add: vi.fn(), put: vi.fn() };
    const caches = {
      match: vi.fn(async () => undefined),
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const networkResponse = new Response('{"ok":true}', { status: 200 });
    const fetcher = vi.fn(async () => networkResponse);
    const serviceWorker = {
      location: { origin: 'https://luxraykit.com' },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
      addEventListener: vi.fn((type: string, handler: typeof fetchHandler) => {
        if (type === 'fetch') fetchHandler = handler;
      }),
    };

    new Function('self', 'caches', 'fetch', source)(serviceWorker, caches, fetcher);

    let responsePromise: Promise<Response> | undefined;
    fetchHandler?.({
      request: new Request('https://luxraykit.com/api/environment/latest'),
      respondWith: (response) => {
        responsePromise = response;
      },
    });

    expect(await responsePromise).toBe(networkResponse);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(caches.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
