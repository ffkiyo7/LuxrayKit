import { useCallback, useEffect, useRef } from 'react';
import { currentDepth, pushHistoryLayer } from './useHashRoute';

/**
 * A full-screen view that lives in component state rather than in the URL (the member
 * editor's pickers) is invisible to the history stack, so Android's back button skipped
 * past it and popped the editor's own route — throwing away the unsaved draft. `open()`
 * pushes a same-URL entry for the view; the back button then pops only that and `onPop`
 * closes the view. `close()` is for the view's own UI (返回, a pick): it takes the entry back
 * off so the next back press is not swallowed by a stale layer.
 */
export function useHistoryLayer(onPop: () => void) {
  const layer = useRef<number | null>(null);
  const onPopRef = useRef(onPop);
  useEffect(() => {
    onPopRef.current = onPop;
  });

  useEffect(() => {
    const handlePopState = () => {
      if (layer.current !== null && currentDepth() < layer.current) {
        layer.current = null;
        onPopRef.current();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Unmounted with the layer still on top: do not leave a dead entry behind.
      if (layer.current !== null && currentDepth() === layer.current) window.history.back();
      layer.current = null;
    };
  }, []);

  const open = useCallback(() => {
    if (layer.current === null) layer.current = pushHistoryLayer();
  }, []);

  const close = useCallback(() => {
    if (layer.current === null) return;
    const onTop = currentDepth() === layer.current;
    layer.current = null;
    if (onTop) window.history.back();
  }, []);

  return { open, close };
}
