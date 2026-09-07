/**
 * Anonymous page-view ping.
 *
 * No third-party script, no cookie, no identifier of any kind. One POST per route change
 * carrying four facts — the parameter-free route pattern, whether we are running as an
 * installed PWA, the active theme, and (added server-side) Cloudflare's two-letter country.
 * The Worker writes them to an Analytics Engine dataset; see DEVELOPER_GUIDE §6.7.
 *
 * Everything here fails silently on purpose: a metrics call must never surface an error to
 * someone trying to use the app, and it must never block a navigation.
 */

const PING_ENDPOINT = '/api/ping';

/**
 * Last pattern actually sent. Module-level rather than per-caller because several components
 * observe the route independently — this is what makes "同一路由重复不发" hold no matter how
 * many of them call in.
 */
let lastSentPattern: string | null = null;

/** Test seam: forget what was already reported. */
export const resetTrackedRoute = () => {
  lastSentPattern = null;
};

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari never implemented the display-mode media query for home-screen apps.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
};

const currentTheme = (): 'dark' | 'light' =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

export type TrackRouteOptions = {
  /** Set from `preferences.analyticsOptOut`; when true nothing is sent. */
  optOut?: boolean;
};

export function trackRoute(routePattern: string, { optOut = false }: TrackRouteOptions = {}) {
  if (optOut) return;
  // Dev servers would otherwise pollute the dataset with hot-reload navigation.
  if (import.meta.env.DEV) return;
  if (typeof window === 'undefined' || !routePattern) return;
  if (routePattern === lastSentPattern) return;

  const body = JSON.stringify({ route: routePattern, standalone: isStandalone(), theme: currentTheme() });

  try {
    // sendBeacon survives the page being backgrounded or closed mid-navigation, which is
    // exactly when the last page view of a session happens.
    if (typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(PING_ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (queued) {
        lastSentPattern = routePattern;
        return;
      }
    }
    void fetch(PING_ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => undefined);
    lastSentPattern = routePattern;
  } catch {
    // Offline, blocked by an extension, quota exhausted — all equally uninteresting here.
  }
}
