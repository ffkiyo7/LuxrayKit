// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_READY_EVENT, SPLASH_MODE_KEY, SPLASH_THEME_KEY, mirrorSplashPreferences, signalAppReady } from './splashMirror';

// jsdom gives import.meta.url a non-file scheme, so resolve from the repo root vitest runs in.
const splashScript = readFileSync(resolve(process.cwd(), 'public/splash.js'), 'utf8');
const swSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('splash preference mirror', () => {
  afterEach(() => window.localStorage.clear());

  it('uses the same keys and event name as public/splash.js', () => {
    for (const literal of [SPLASH_MODE_KEY, SPLASH_THEME_KEY, APP_READY_EVENT]) {
      expect(splashScript).toContain(`'${literal}'`);
    }
  });

  it('writes the opt-out as on/off and the theme verbatim', () => {
    mirrorSplashPreferences({ splashOptOut: true, theme: 'light' });
    expect(window.localStorage.getItem(SPLASH_MODE_KEY)).toBe('off');
    expect(window.localStorage.getItem(SPLASH_THEME_KEY)).toBe('light');

    mirrorSplashPreferences({ splashOptOut: false, theme: 'dark' });
    expect(window.localStorage.getItem(SPLASH_MODE_KEY)).toBe('on');
    expect(window.localStorage.getItem(SPLASH_THEME_KEY)).toBe('dark');
  });

  it('dispatches the ready event the splash waits for', () => {
    const listener = vi.fn();
    window.addEventListener(APP_READY_EVENT, listener);
    signalAppReady();
    window.removeEventListener(APP_READY_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('precaches the splash script and every asset it loads with the shell', () => {
    const shell = swSource.match(/const APP_SHELL = \[([^\]]*)\]/)?.[1] ?? '';
    expect(shell).toContain("'/splash.js'");
    const artwork = splashScript.match(/var ARTWORK = '([^']+)'/)?.[1];
    expect(artwork).toBeTruthy();
    expect(shell).toContain(`'${artwork}'`);
  });
});
