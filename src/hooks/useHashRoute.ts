import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { buildHash, defaultRoute, parentRoute, parseHashRoute, type Route } from '../lib/hashRoute';
import { routeTransitionKind } from '../lib/routeTransition';

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

/**
 * The hash React renders from. It trails `location.hash` while a page transition is pending:
 * the URL changes synchronously, but the screen must keep showing the old route until the
 * browser has captured it, or the animation would slide the new page over itself.
 */
let committedHash: string | null = null;
let committedDepth = 0;
let transitionPending = false;
let transitionToken = 0;
// Last offset seen before a pop: Safari restores the previous screen's scroll before popstate,
// which would otherwise jump the outgoing page just before it is captured.
let lastScrollY = 0;

const commit = () => {
  committedHash = window.location.hash;
  committedDepth = currentDepth();
  listeners.forEach((listener) => listener());
};

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const runPageTransition = (kind: 'push' | 'pop') => {
  const root = document.documentElement;
  const restoredY = window.scrollY;
  const outgoingY = lastScrollY;
  const fixScroll = kind === 'pop' && restoredY !== outgoingY;
  if (fixScroll) window.scrollTo({ top: outgoingY, left: 0 });
  const token = ++transitionToken;
  root.dataset.pageTransition = kind;
  transitionPending = true;
  try {
    const transition = document.startViewTransition(() => {
      transitionPending = false;
      flushSync(commit);
      if (fixScroll) window.scrollTo({ top: restoredY, left: 0 });
    });
    void transition.finished.finally(() => {
      if (token === transitionToken) delete root.dataset.pageTransition;
    });
  } catch {
    transitionPending = false;
    delete root.dataset.pageTransition;
    commit();
  }
};

const notify = (event?: Event) => {
  // The pending transition commits whatever the URL says when it runs, so a second event for
  // the same move (popstate + hashchange) or a quick follow-up navigation folds into it.
  if (transitionPending) return;
  const kind =
    committedHash === null ? null : routeTransitionKind(committedHash, window.location.hash, committedDepth, currentDepth());
  const browserAnimated = (event as (PopStateEvent & { hasUAVisualTransition?: boolean }) | undefined)?.hasUAVisualTransition;
  if (!kind || browserAnimated || typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    commit();
    return;
  }
  runPageTransition(kind);
};

const trackScroll = () => {
  lastScrollY = window.scrollY;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('hashchange', notify);
    window.addEventListener('popstate', notify);
    window.addEventListener('scroll', trackScroll, { passive: true });
    lastScrollY = window.scrollY;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('hashchange', notify);
      window.removeEventListener('popstate', notify);
      window.removeEventListener('scroll', trackScroll);
    }
  };
};

const readHash = () => {
  if (typeof window === 'undefined') return '';
  // Nobody subscribed means nothing can be mid-transition: read the URL itself.
  if (committedHash === null || listeners.size === 0) {
    committedHash = window.location.hash;
    committedDepth = currentDepth();
  }
  return committedHash;
};

const getServerSnapshot = () => '';

type HistoryState = { lkDepth?: number } | null;

/**
 * How many entries this app pushed onto the session history since the tab landed here.
 * Stored in `history.state` (not a module variable) so it survives reloads and stays
 * correct after the user presses the browser's own back/forward buttons.
 */
export const currentDepth = () => {
  if (typeof window === 'undefined') return 0;
  const state = window.history.state as HistoryState;
  return typeof state?.lkDepth === 'number' && state.lkDepth > 0 ? state.lkDepth : 0;
};

/**
 * Push an entry for the *same* URL, one level deeper, so the hardware back button has
 * something inside the current screen to pop (see useHistoryLayer). Returns its depth.
 */
export const pushHistoryLayer = () => {
  const depth = currentDepth() + 1;
  window.history.pushState({ lkDepth: depth }, '', window.location.href);
  return depth;
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
      commit();
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
