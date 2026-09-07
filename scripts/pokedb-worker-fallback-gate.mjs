import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ENVIRONMENT_LATEST_URL = 'https://luxraykit.com/api/environment/latest';
export const DEFAULT_STATIC_SNAPSHOT_PATH = resolve(ROOT, 'public/data/pokedb/reg-ma-environment.json');
/**
 * How far the committed static fallback may trail the upstream source before it is refreshed even
 * though the Worker is perfectly healthy. Without this the fallback only ever moved when the
 * Worker broke, so a Worker that never breaks left the second layer frozen (it sat on M-4 data
 * well into M-5). Override with STATIC_SNAPSHOT_MAX_LAG_DAYS.
 */
export const DEFAULT_STATIC_SNAPSHOT_MAX_LAG_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * PokeDB publishes "YYYY-MM-DD HH:mm:ss" with no zone marker; it is JST. Same normalization as
 * the frontend's parseEnvironmentSourceTime — keep the two in step.
 */
export function parsePokeDbSourceTime(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}+09:00`
    : value;
  return Date.parse(normalized);
}

/** Newest `battles.*.updatedAt` in a snapshot, as epoch ms (NaN when none is readable). */
export function snapshotSourceTime(snapshot) {
  const times = Object.values(snapshot?.battles ?? {})
    .map((battle) => parsePokeDbSourceTime(battle?.updatedAt))
    .filter((time) => Number.isFinite(time));
  return times.length > 0 ? Math.max(...times) : Number.NaN;
}

export function evaluateStaticSnapshotLag({ staticSourceTime, latestSourceTime, maxLagDays }) {
  // No probe value in the response headers: we cannot tell lag from a stalled upstream, so do not
  // start a crawl on a guess.
  if (!Number.isFinite(latestSourceTime)) {
    return { shouldRefresh: false, reason: 'static-lag-unknown-source' };
  }
  if (!Number.isFinite(staticSourceTime)) {
    return { shouldRefresh: true, reason: 'static-snapshot-unreadable' };
  }
  const lagDays = Math.round(((latestSourceTime - staticSourceTime) / MS_PER_DAY) * 10) / 10;
  return lagDays > maxLagDays
    ? { shouldRefresh: true, reason: 'static-snapshot-lagging', lagDays }
    : { shouldRefresh: false, reason: 'static-snapshot-current', lagDays };
}

export function evaluateWorkerEnvironmentHealth({
  responseOk,
  cacheState,
  sourceStatus,
  latestSourceUpdatedAt,
  staticSourceTime,
  maxLagDays = DEFAULT_STATIC_SNAPSHOT_MAX_LAG_DAYS,
}) {
  if (!responseOk) {
    return { shouldRefresh: true, reason: 'worker-endpoint-unhealthy' };
  }
  if (sourceStatus !== 'ok') {
    return { shouldRefresh: true, reason: `worker-source-${sourceStatus ?? 'unknown'}` };
  }
  if (cacheState !== 'fresh') {
    return { shouldRefresh: true, reason: `worker-cache-${cacheState ?? 'unknown'}` };
  }
  // The Worker (layer 1) is fine. The static file (layer 2) is maintained independently and can
  // still be arbitrarily old, so gate on its own age before declaring nothing to do.
  const lag = evaluateStaticSnapshotLag({
    staticSourceTime,
    latestSourceTime: parsePokeDbSourceTime(latestSourceUpdatedAt),
    maxLagDays,
  });
  return lag.shouldRefresh
    ? lag
    : { shouldRefresh: false, reason: 'worker-fresh', ...(lag.lagDays === undefined ? {} : { lagDays: lag.lagDays }) };
}

export async function readStaticSnapshotSourceTime(path = DEFAULT_STATIC_SNAPSHOT_PATH) {
  try {
    return snapshotSourceTime(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return Number.NaN;
  }
}

export function configuredMaxLagDays(value = process.env.STATIC_SNAPSHOT_MAX_LAG_DAYS) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STATIC_SNAPSHOT_MAX_LAG_DAYS;
}

export async function checkWorkerEnvironmentHealth({
  fetcher = fetch,
  url = process.env.LUXRAYKIT_ENVIRONMENT_LATEST_URL ?? DEFAULT_ENVIRONMENT_LATEST_URL,
  timeoutMs = Number(process.env.LUXRAYKIT_WORKER_HEALTH_TIMEOUT_MS ?? 15_000),
  staticSnapshotPath = DEFAULT_STATIC_SNAPSHOT_PATH,
  maxLagDays = configuredMaxLagDays(),
} = {}) {
  try {
    const response = await fetcher(`${url}?fallback-check=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const cacheState = response.headers.get('x-luxray-cache-state');
    const sourceStatus = response.headers.get('x-luxray-source-status');
    const latestSourceUpdatedAt = response.headers.get('x-luxray-latest-source-updated-at');
    const staticSourceTime = await readStaticSnapshotSourceTime(staticSnapshotPath);
    return {
      ...evaluateWorkerEnvironmentHealth({
        responseOk: response.ok,
        cacheState,
        sourceStatus,
        latestSourceUpdatedAt,
        staticSourceTime,
        maxLagDays,
      }),
      status: response.status,
      cacheState,
      sourceStatus,
      latestSourceUpdatedAt,
    };
  } catch (error) {
    return {
      shouldRefresh: true,
      reason: 'worker-health-check-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
