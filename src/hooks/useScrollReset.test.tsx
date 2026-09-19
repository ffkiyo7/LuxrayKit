// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollResetOnPush, useScrollResetWhileMounted } from './useScrollReset';

function Routed({ routeKey }: { routeKey: string }) {
  useScrollResetOnPush(routeKey);
  return null;
}

function Overlay() {
  useScrollResetWhileMounted();
  return null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '#/');
});

describe('useScrollResetOnPush', () => {
  it('scrolls to the top when the router pushed an entry, and leaves a back alone', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    window.history.replaceState({ lkDepth: 0 }, '', '#/teams');
    const view = render(<Routed routeKey="#/teams" />);
    expect(scrollTo).not.toHaveBeenCalled();

    window.history.replaceState({ lkDepth: 1 }, '', '#/teams/a');
    view.rerender(<Routed routeKey="#/teams/a" />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0 });

    window.history.replaceState({ lkDepth: 0 }, '', '#/teams');
    view.rerender(<Routed routeKey="#/teams" />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});

describe('useScrollResetWhileMounted', () => {
  it('starts at the top and hands the opener its offset back', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 620 });

    const view = render(<Overlay />);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0 });

    view.unmount();
    await Promise.resolve();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 620, left: 0 });
  });
});
