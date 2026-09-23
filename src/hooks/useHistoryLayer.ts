import { useCallback, useEffect, useRef } from 'react';
import { currentDepth, pushHistoryLayer } from './useHashRoute';

/**
 * A view that lives in component state rather than in the URL (the member editor's pickers,
 * the editor's unsaved-draft guard) is invisible to the history stack, so Android's back button
 * skipped past it and popped the editor's own route — throwing away the unsaved draft. `open()`
 * pushes a same-URL entry; the back button then pops only that and `onPop` runs. `close()` is
 * for the view's own UI (返回, a pick, save): it takes the entry back off so the next back press
 * is not swallowed by a stale layer.
 */
export function useHistoryLayer(onPop: () => void) {
  const layer = useRef<number | null>(null);
  const onPopRef = useRef(onPop);
  useEffect(() => {
    onPopRef.current = onPop;
  });

  const afterClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      if (afterClose.current) {
        const then = afterClose.current;
        afterClose.current = null;
        then();
        return;
      }
      if (layer.current !== null && currentDepth() < layer.current) {
        layer.current = null;
        onPopRef.current();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Deliberately no history.back() here. Unmounting with the layer on top means something
      // else tore the screen down (a replace navigation, a reset); popping now would take that
      // new entry off instead. A leftover same-URL entry costs one extra back press at worst.
      layer.current = null;
      afterClose.current = null;
    };
  }, []);

  const open = useCallback(() => {
    if (layer.current === null) layer.current = pushHistoryLayer();
  }, []);

  /**
   * `then` runs once the entry is actually gone. Leaving the screen right after closing needs
   * it: `history.back()` is async, so a second back (the screen's own route) issued in the same
   * tick would read the stale depth and race the first.
   */
  const close = useCallback((then?: () => void) => {
    const onTop = layer.current !== null && currentDepth() === layer.current;
    layer.current = null;
    if (onTop) {
      afterClose.current = then ?? null;
      window.history.back();
    } else {
      then?.();
    }
  }, []);

  return { open, close };
}
