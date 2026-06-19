// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByTestId('nav-state').textContent).toBe('hidden');

    scrollContainer.scrollTop = 800;
    fireEvent.scroll(scrollContainer);
    expect(screen.getByTestId('nav-state').textContent).toBe('shown');
  });
});
