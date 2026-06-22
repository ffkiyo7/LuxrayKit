// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoHideBottomNav } from './useAutoHideBottomNav';

function HookHarness({ scrollContainer }: { scrollContainer: HTMLElement }) {
  const { hidden } = useAutoHideBottomNav({
    enabled: true,
    scrollContainer,
    threshold: 10,
    idleDelay: 1000,
  });

  return <div data-testid="nav-state">{hidden ? 'hidden' : 'shown'}</div>;
}

const defineScrollMetric = (element: HTMLElement, name: 'clientHeight' | 'scrollHeight', value: number) => {
  Object.defineProperty(element, name, {
    configurable: true,
    value,
  });
};

const flushScrollFrame = () => {
  act(() => {
    vi.advanceTimersByTime(16);
  });
};

describe('useAutoHideBottomNav', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the nav shown when scrolling reaches the bottom edge', () => {
    vi.useFakeTimers();
    const scrollContainer = document.createElement('div');
    defineScrollMetric(scrollContainer, 'clientHeight', 400);
    defineScrollMetric(scrollContainer, 'scrollHeight', 1200);
    document.body.appendChild(scrollContainer);

    render(<HookHarness scrollContainer={scrollContainer} />);
    expect(screen.getByTestId('nav-state').textContent).toBe('shown');

    scrollContainer.scrollTop = 100;
    fireEvent.scroll(scrollContainer);
    flushScrollFrame();
    expect(screen.getByTestId('nav-state').textContent).toBe('hidden');

    scrollContainer.scrollTop = 800;
    fireEvent.scroll(scrollContainer);
    flushScrollFrame();
    expect(screen.getByTestId('nav-state').textContent).toBe('shown');
  });

  it('shows the nav again after a middle-page scroll comes to rest', () => {
    vi.useFakeTimers();
    const scrollContainer = document.createElement('div');
    defineScrollMetric(scrollContainer, 'clientHeight', 400);
    defineScrollMetric(scrollContainer, 'scrollHeight', 2000);
    document.body.appendChild(scrollContainer);

    render(<HookHarness scrollContainer={scrollContainer} />);

    scrollContainer.scrollTop = 240;
    fireEvent.scroll(scrollContainer);
    flushScrollFrame();
    expect(screen.getByTestId('nav-state').textContent).toBe('hidden');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('nav-state').textContent).toBe('shown');
  });

  it('preserves down-hide, up-show, and top-show behavior on long pages', () => {
    vi.useFakeTimers();
    const scrollContainer = document.createElement('div');
    defineScrollMetric(scrollContainer, 'clientHeight', 400);
    defineScrollMetric(scrollContainer, 'scrollHeight', 2000);
    document.body.appendChild(scrollContainer);

    render(<HookHarness scrollContainer={scrollContainer} />);

    scrollContainer.scrollTop = 240;
    fireEvent.scroll(scrollContainer);
    flushScrollFrame();
    expect(screen.getByTestId('nav-state').textContent).toBe('hidden');

    scrollContainer.scrollTop = 200;
    fireEvent.scroll(scrollContainer);
    flushScrollFrame();
    expect(screen.getByTestId('nav-state').textContent).toBe('shown');

    scrollContainer.scrollTop = 0;
    fireEvent.scroll(scrollContainer);
    flushScrollFrame();
    expect(screen.getByTestId('nav-state').textContent).toBe('shown');
  });
});
