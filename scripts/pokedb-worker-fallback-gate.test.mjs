import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  checkWorkerEnvironmentHealth,
  configuredMaxLagDays,
  evaluateStaticSnapshotLag,
  evaluateWorkerEnvironmentHealth,
  parsePokeDbSourceTime,
  readStaticSnapshotSourceTime,
  snapshotSourceTime,
} from './pokedb-worker-fallback-gate.mjs';

// PokeDB's own wall-clock strings, JST, no zone marker.
const day = (text) => Date.parse(`${text.replace(' ', 'T')}+09:00`);

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

describe('static fallback freshness', () => {
  it('reads PokeDB wall-clock timestamps as JST and takes the newest battle', () => {
    expect(parsePokeDbSourceTime('2026-07-18 23:58:00')).toBe(day('2026-07-18 23:58:00'));
    expect(parsePokeDbSourceTime('2026-07-18T14:58:00.000Z')).toBe(Date.parse('2026-07-18T14:58:00.000Z'));
    expect(parsePokeDbSourceTime('')).toBeNaN();
    expect(snapshotSourceTime({
      battles: {
        singles: { updatedAt: '2026-07-17 23:58:00' },
        doubles: { updatedAt: '2026-07-18 23:58:00' },
      },
    })).toBe(day('2026-07-18 23:58:00'));
    expect(snapshotSourceTime({ battles: {} })).toBeNaN();
  });

  it('refreshes a healthy-Worker day only once the static file trails past the budget', () => {
    const latestSourceUpdatedAt = '2026-09-05 23:58:00';
    const healthy = { responseOk: true, cacheState: 'fresh', sourceStatus: 'ok', latestSourceUpdatedAt };

    // Six days behind with a 7-day budget: still the cheap no-crawl path.
    expect(evaluateWorkerEnvironmentHealth({
      ...healthy,
      staticSourceTime: day('2026-08-30 23:58:00'),
    })).toEqual({ shouldRefresh: false, reason: 'worker-fresh', lagDays: 6 });

    // The real regression this guards: Worker permanently healthy, static file left on M-4.
    expect(evaluateWorkerEnvironmentHealth({
      ...healthy,
      staticSourceTime: day('2026-07-18 23:58:00'),
    })).toEqual({ shouldRefresh: true, reason: 'static-snapshot-lagging', lagDays: 49 });

    // Budget is configurable per host.
    expect(evaluateWorkerEnvironmentHealth({
      ...healthy,
      staticSourceTime: day('2026-09-03 23:58:00'),
      maxLagDays: 1,
    })).toEqual({ shouldRefresh: true, reason: 'static-snapshot-lagging', lagDays: 2 });
  });

  it('does not crawl on a guess when the probe header or the file is missing', () => {
    // No x-luxray-latest-source-updated-at: nothing to compare against.
    expect(evaluateStaticSnapshotLag({
      staticSourceTime: day('2026-07-18 23:58:00'),
      latestSourceTime: Number.NaN,
      maxLagDays: 7,
    })).toEqual({ shouldRefresh: false, reason: 'static-lag-unknown-source' });

    // Header present but the local file is missing/corrupt: that IS a reason to regenerate it.
    expect(evaluateStaticSnapshotLag({
      staticSourceTime: Number.NaN,
      latestSourceTime: day('2026-09-05 23:58:00'),
      maxLagDays: 7,
    })).toEqual({ shouldRefresh: true, reason: 'static-snapshot-unreadable' });
  });

  it('falls back to the default budget for missing or nonsense env values', () => {
    expect(configuredMaxLagDays(undefined)).toBe(7);
    expect(configuredMaxLagDays('not-a-number')).toBe(7);
    expect(configuredMaxLagDays('-1')).toBe(7);
    expect(configuredMaxLagDays('3')).toBe(3);
    expect(configuredMaxLagDays('0')).toBe(0);
  });

  it('reads the committed snapshot from disk and tolerates a missing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luxray-gate-'));
    const path = join(dir, 'reg-ma-environment.json');
    await writeFile(path, JSON.stringify({ battles: { singles: { updatedAt: '2026-07-18 23:58:00' } } }));

    await expect(readStaticSnapshotSourceTime(path)).resolves.toBe(day('2026-07-18 23:58:00'));
    await expect(readStaticSnapshotSourceTime(join(dir, 'absent.json'))).resolves.toBeNaN();
  });

  it('trips the crawl end-to-end from the live response headers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luxray-gate-'));
    const path = join(dir, 'reg-ma-environment.json');
    await writeFile(path, JSON.stringify({ battles: { singles: { updatedAt: '2026-07-18 23:58:00' } } }));
    const fetcher = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: {
        'x-luxray-cache-state': 'fresh',
        'x-luxray-source-status': 'ok',
        'x-luxray-latest-source-updated-at': '2026-09-05 23:58:00',
      },
    }));

    await expect(
      checkWorkerEnvironmentHealth({ fetcher, timeoutMs: 1000, staticSnapshotPath: path, maxLagDays: 7 }),
    ).resolves.toMatchObject({
      shouldRefresh: true,
      reason: 'static-snapshot-lagging',
      lagDays: 49,
      cacheState: 'fresh',
      sourceStatus: 'ok',
      latestSourceUpdatedAt: '2026-09-05 23:58:00',
    });
  });
});
