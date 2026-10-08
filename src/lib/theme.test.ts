// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme, useResolvedTheme } from './theme';

/** A controllable `(prefers-color-scheme: light)` query, since jsdom has no matchMedia. */
function stubSystemAppearance(light: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return light;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return (next: boolean) => {
    light = next;
    listeners.forEach((listener) => listener());
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('keeps an explicit choice whatever the system says', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('maps system to the device appearance', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});

describe('useResolvedTheme', () => {
  it('follows the system appearance live while system is chosen', () => {
    const setSystemLight = stubSystemAppearance(false);
    const { result } = renderHook(() => useResolvedTheme('system'));
    expect(result.current).toBe('dark');

    act(() => setSystemLight(true));
    expect(result.current).toBe('light');
  });

  it('ignores the system once a fixed theme is chosen', () => {
    const setSystemLight = stubSystemAppearance(true);
    const { result } = renderHook(() => useResolvedTheme('dark'));
    act(() => setSystemLight(false));
    expect(result.current).toBe('dark');
  });
});
