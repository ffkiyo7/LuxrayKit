import type { UserPreference } from '../types';

/**
 * public/splash.js runs before the bundle and cannot wait for IndexedDB, so the two preferences
 * it needs are mirrored into localStorage on every change. The keys and event name are repeated
 * as literals in splash.js (a classic script, no imports); splashMirror.test.ts keeps them equal.
 */
export const SPLASH_MODE_KEY = 'luxraykit-splash';
export const SPLASH_THEME_KEY = 'luxraykit-theme';
/** Fired once local data has loaded; the splash waits for it before fading out. */
export const APP_READY_EVENT = 'luxraykit:app-ready';

export function mirrorSplashPreferences(preferences: Pick<UserPreference, 'splashOptOut' | 'theme'>) {
  try {
    window.localStorage.setItem(SPLASH_MODE_KEY, preferences.splashOptOut ? 'off' : 'on');
    window.localStorage.setItem(SPLASH_THEME_KEY, preferences.theme);
  } catch {
    // Private mode or storage full: the splash falls back to playing, in the dark theme.
  }
}

export function signalAppReady() {
  window.dispatchEvent(new Event(APP_READY_EVENT));
}
