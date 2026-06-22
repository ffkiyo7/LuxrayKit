// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewportMetrics } from './useVisualViewportMetrics';

type MutableVisualViewport = VisualViewport & {
  dispatch: (type: 'resize' | 'scroll') => void;
};

const installVisualViewport = (height: number, offsetTop: number) => {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const viewport = {
    width: 390,
    height,
    offsetLeft: 0,
    offsetTop,
    pageLeft: 0,
    pageTop: offsetTop,
    scale: 1,
    onresize: null,
    onscroll: null,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const registered = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      registered.add(listener);
      listeners.set(type, registered);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatchEvent: vi.fn(),
    dispatch(type: 'resize' | 'scroll') {
      const event = new Event(type);
      listeners.get(type)?.forEach((listener) => {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      });
    },
  } as unknown as MutableVisualViewport;

  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  return viewport;
};

function Harness() {
  const metrics = useVisualViewportMetrics();
  return <output data-testid="metrics">{JSON.stringify(metrics)}</output>;
}

describe('useVisualViewportMetrics', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  });

  it('tracks visual viewport changes as local metrics', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    const viewport = installVisualViewport(500, 20);

    render(<Harness />);
    expect(screen.getByTestId('metrics').textContent).toBe(
      JSON.stringify({ height: 500, offsetTop: 20, bottomInset: 324 }),
    );

    Object.assign(viewport, { height: 700, offsetTop: 0, pageTop: 0 });
    act(() => viewport.dispatch('resize'));

    expect(screen.getByTestId('metrics').textContent).toBe(
      JSON.stringify({ height: 700, offsetTop: 0, bottomInset: 144 }),
    );
  });

  it('removes visual viewport listeners on unmount', () => {
    const viewport = installVisualViewport(500, 20);
    const rendered = render(<Harness />);

    rendered.unmount();

    expect(viewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(viewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
