export const DEFAULT_ENVIRONMENT_LATEST_URL = 'https://luxraykit.com/api/environment/latest';

export function evaluateWorkerEnvironmentHealth({ responseOk, cacheState, sourceStatus }) {
  if (!responseOk) {
    return { shouldRefresh: true, reason: 'worker-endpoint-unhealthy' };
  }
  if (sourceStatus !== 'ok') {
    return { shouldRefresh: true, reason: `worker-source-${sourceStatus ?? 'unknown'}` };
  }
  if (cacheState !== 'fresh') {
    return { shouldRefresh: true, reason: `worker-cache-${cacheState ?? 'unknown'}` };
  }
  return { shouldRefresh: false, reason: 'worker-fresh' };
}

export async function checkWorkerEnvironmentHealth({
  fetcher = fetch,
  url = process.env.LUXRAYKIT_ENVIRONMENT_LATEST_URL ?? DEFAULT_ENVIRONMENT_LATEST_URL,
  timeoutMs = Number(process.env.LUXRAYKIT_WORKER_HEALTH_TIMEOUT_MS ?? 15_000),
} = {}) {
  try {
    const response = await fetcher(`${url}?fallback-check=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const cacheState = response.headers.get('x-luxray-cache-state');
    const sourceStatus = response.headers.get('x-luxray-source-status');
    return {
      ...evaluateWorkerEnvironmentHealth({
        responseOk: response.ok,
        cacheState,
        sourceStatus,
      }),
      status: response.status,
      cacheState,
      sourceStatus,
    };
  } catch (error) {
    return {
      shouldRefresh: true,
      reason: 'worker-health-check-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
