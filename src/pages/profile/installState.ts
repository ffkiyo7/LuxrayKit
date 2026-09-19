/**
 * Whether the app is already running from the home screen. 08-01 hides 「添加到主屏幕」 in that
 * case, and the check has to cover both spellings: `display-mode: standalone` everywhere, plus
 * the legacy `navigator.standalone` that iOS Safari still uses for home-screen launches.
 */
export const isStandaloneDisplay = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
};
