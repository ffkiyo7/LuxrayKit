import { useEffect, useState } from 'react';

export type VisualViewportMetrics = {
  height: number;
  offsetTop: number;
  bottomInset: number;
};

const readVisualViewportMetrics = (): VisualViewportMetrics => {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  return {
    height,
    offsetTop,
    bottomInset: viewport ? Math.max(0, window.innerHeight - height - offsetTop) : 0,
  };
};

export function useVisualViewportMetrics(enabled = true) {
  const [metrics, setMetrics] = useState(readVisualViewportMetrics);

  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    const update = () => setMetrics(readVisualViewportMetrics());

    update();
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return metrics;
}
