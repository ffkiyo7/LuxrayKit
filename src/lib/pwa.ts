import { useSyncExternalStore } from 'react';

/**
 * The `beforeinstallprompt` event is not yet in the DOM lib typings. Chromium
 * fires it when the PWA install criteria are met; we stash it so the install
 * guide can trigger the native prompt on demand instead of at page load.
 */
export type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other';

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let captureInitialized = false;

const emit = () => {
  for (const listener of listeners) listener();
};

/**
 * Capture the install prompt as early as possible. `beforeinstallprompt` can
 * fire before React mounts, so this is called from main.tsx at module load.
 * Safe to call more than once — listeners are idempotent enough for our use.
 */
export function initInstallPromptCapture(): void {
  if (typeof window === 'undefined' || captureInitialized) return;
  captureInitialized = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isInstallPromptAvailable(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<InstallPromptOutcome> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();

  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

/** True when the app is already running as an installed PWA (no install hint needed). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

export function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  // iPadOS 13+ reports a desktop UA, so fall back to the touch-capable Mac heuristic.
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(ua) || isIpadOs) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/mobi|tablet/.test(ua)) return 'other';
  return 'desktop';
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAlternativeIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  return isIos && /Safari/i.test(ua) && !isAlternativeIosBrowser;
}

/** Reactive view of whether the native install prompt can be triggered. */
export function useInstallPromptAvailable(): boolean {
  return useSyncExternalStore(subscribeInstallState, isInstallPromptAvailable, () => false);
}
