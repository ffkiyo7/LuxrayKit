import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { buildHash, defaultRoute, parentRoute, parseHashRoute, type Route } from '../lib/hashRoute';

/**
 * useHashRoute — the browser half of hash routing.
 *
 * Several components read the route independently (AppShell, EnvironmentPage, TeamPage,
 * DexPage), so the hook is backed by one module-level store instead of per-instance state:
 * a `useSyncExternalStore` over `location.hash` keeps every consumer on the same value in
 * the same render pass.
 *
 * Navigation uses `history.pushState` / `replaceState` rather than assigning
 * `location.hash`, for two reasons: it lets us stamp a depth counter into `history.state`
 * (see `back()`), and it makes the state update synchronous instead of waiting for the
 * async `hashchange`. `hashchange` and `popstate` are still subscribed to, so browser
 * back/forward, the Android hardware back button and tests that poke
 * `window.location.hash` directly all stay in sync.
 */

const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('hashchange', notify);
    window.addEventListener('popstate', notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('hashchange', notify);
      window.removeEventListener('popstate', notify);
    }
  };
};

const readHash = () => (typeof window === 'undefined' ? '' : window.location.hash);

const getServerSnapshot = () => '';

type HistoryState = { lkDepth?: number } | null;

/**
 * How many entries this app pushed onto the session history since the tab landed here.
 * Stored in `history.state` (not a module variable) so it survives reloads and stays
 * correct after the user presses the browser's own back/forward buttons.
 */
const currentDepth = () => {
  if (typeof window === 'undefined') return 0;
  const state = window.history.state as HistoryState;
  return typeof state?.lkDepth === 'number' && state.lkDepth > 0 ? state.lkDepth : 0;
};

export type NavigateOptions = { replace?: boolean };

export type HashRouter = {
  route: Route;
  navigate: (route: Route, options?: NavigateOptions) => void;
  back: () => void;
};

export function useHashRoute(): HashRouter {
  const hash = useSyncExternalStore(subscribe, readHash, getServerSnapshot);
  const route = useMemo(() => parseHashRoute(hash), [hash]);

  // Normalize an empty or unrecognized hash to the canonical home route. replaceState
  // keeps this off the history stack, so the first 返回 does not bounce through a
  // phantom entry.
  useEffect(() => {
    const canonical = buildHash(parseHashRoute(window.location.hash));
    if (window.location.hash !== canonical) {
      window.history.replaceState({ lkDepth: currentDepth() }, '', canonical);
      notify();
    }
  }, [hash]);

  const navigate = useCallback((next: Route, options?: NavigateOptions) => {
    const nextHash = buildHash(next);
    const depth = currentDepth();
    if (options?.replace) {
      window.history.replaceState({ lkDepth: depth }, '', nextHash);
    } else {
      if (window.location.hash === nextHash) return;
      window.history.pushState({ lkDepth: depth + 1 }, '', nextHash);
    }
    notify();
  }, []);

  const back = useCallback(() => {
    // Only pop when the entry underneath is one of ours. Opened cold on a deep link
    // (share URL, bookmark) the stack below us belongs to whatever site sent the user
    // here, so we replace into the parent route instead of leaving the app.
    if (currentDepth() > 0) {
      window.history.back();
      return;
    }
    const current = parseHashRoute(window.location.hash);
    const parent = parentRoute(current);
    navigate(parent.name === current.name ? defaultRoute : parent, { replace: true });
  }, [navigate]);

  return { route, navigate, back };
}
