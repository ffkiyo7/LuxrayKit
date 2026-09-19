import { useLayoutEffect, useRef } from 'react';

const canScroll = () => typeof window !== 'undefined' && typeof window.scrollTo === 'function';

const historyDepth = () => {
  const state = window.history.state as { lkDepth?: number } | null;
  return typeof state?.lkDepth === 'number' ? state.lkDepth : 0;
};

/**
 * Every screen shares the window scroll, so a row tapped far down a list would open the next
 * screen at that same offset. Going forward (the router pushed an entry) starts at the top;
 * going back is left to the browser's own scroll restoration.
 */
export function useScrollResetOnPush(routeKey: string) {
  const depthRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!canScroll()) return;
    const depth = historyDepth();
    const previous = depthRef.current;
    depthRef.current = depth;
    if (previous !== null && depth > previous) window.scrollTo({ top: 0, left: 0 });
  }, [routeKey]);
}

/**
 * For a full-page view swapped in by local state rather than a route (the editor's pickers):
 * top on the way in, and the opener's offset back on the way out.
 */
export function useScrollResetWhileMounted() {
  useLayoutEffect(() => {
    if (!canScroll()) return undefined;
    const openerOffset = window.scrollY;
    window.scrollTo({ top: 0, left: 0 });
    // A microtask: by then the opener is back in the DOM, and nothing has painted yet.
    return () => queueMicrotask(() => window.scrollTo({ top: openerOffset, left: 0 }));
  }, []);
}
