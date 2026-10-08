import { useEffect, useState } from 'react';
import type { UserPreference } from '../types';

export type ThemeChoice = UserPreference['theme'];
export type ResolvedTheme = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/**
 * Browser chrome tint per theme (Safari's tab bar, Android's status bar), matched to each theme's
 * page colour (`--color-page` in styles.css) so the top edge shows no seam.
 */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#0b0b0c',
  light: '#fbfbfd',
};

/** Without matchMedia (tests, very old browsers) "system" reads as dark, the app's original look. */
const systemPrefersLight = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches;

export const resolveTheme = (choice: ThemeChoice, prefersLight = systemPrefersLight()): ResolvedTheme =>
  choice === 'system' ? (prefersLight ? 'light' : 'dark') : choice;

/** The theme to paint, re-resolved live when the system appearance flips while "system" is chosen. */
export function useResolvedTheme(choice: ThemeChoice): ResolvedTheme {
  const [prefersLight, setPrefersLight] = useState(systemPrefersLight);

  useEffect(() => {
    if (choice !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(LIGHT_QUERY);
    const onChange = () => setPrefersLight(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  return resolveTheme(choice, prefersLight);
}

/**
 * Only theme-color can follow at runtime. The home-screen app's status bar style
 * (`apple-mobile-web-app-status-bar-style` in index.html) is read once at launch, so it stays.
 */
export function applyThemeColor(theme: ResolvedTheme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}
