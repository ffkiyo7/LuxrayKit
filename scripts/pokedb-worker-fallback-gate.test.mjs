import { describe, expect, it, vi } from 'vitest';
import {
  checkWorkerEnvironmentHealth,
  evaluateWorkerEnvironmentHealth,
} from './pokedb-worker-fallback-gate.mjs';

describe('PokeDB Worker fallback gate', () => {
  it('skips the VPS snapshot crawl only when the Worker is healthy and fresh', () => {
    expect(evaluateWorkerEnvironmentHealth({
      responseOk: true,
      cacheState: 'fresh',
      sourceStatus: 'ok',
    })).toEqual({ shouldRefresh: false, reason: 'worker-fresh' });
  });

  it.each([
    [{ responseOk: false, cacheState: null, sourceStatus: null }, 'worker-endpoint-unhealthy'],
    [{ responseOk: true, cacheState: 'stale', sourceStatus: 'ok' }, 'worker-cache-stale'],
    [{ responseOk: true, cacheState: 'fresh', sourceStatus: 'degraded' }, 'worker-source-degraded'],
    [{ responseOk: true, cacheState: null, sourceStatus: 'ok' }, 'worker-cache-unknown'],
  ])('runs the VPS fallback for %j', (input, reason) => {
    expect(evaluateWorkerEnvironmentHealth(input)).toEqual({ shouldRefresh: true, reason });
  });

  it('reads the production health headers without consuming the response body', async () => {
    const fetcher = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: {
        'x-luxray-cache-state': 'fresh',
        'x-luxray-source-status': 'ok',
      },
    }));

    await expect(checkWorkerEnvironmentHealth({ fetcher, timeoutMs: 1000 })).resolves.toMatchObject({
      shouldRefresh: false,
      reason: 'worker-fresh',
      status: 200,
      cacheState: 'fresh',
      sourceStatus: 'ok',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('fails open to the VPS fallback when the Worker health request throws', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network unavailable');
    });

    await expect(checkWorkerEnvironmentHealth({ fetcher, timeoutMs: 1000 })).resolves.toMatchObject({
      shouldRefresh: true,
      reason: 'worker-health-check-failed',
      error: 'network unavailable',
    });
  });
});
