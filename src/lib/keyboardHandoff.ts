/**
 * Opening the soft keyboard for a field on a page that is not mounted yet.
 *
 * iOS only raises the keyboard for a `focus()` made synchronously inside a user gesture. A tap
 * that navigates to a lazily loaded page has lost that gesture by the time the real field exists,
 * so its `autoFocus` focuses silently with no keyboard. The way through is to focus *something*
 * during the tap: a throwaway input takes the keyboard, and once the destination mounts, moving
 * focus from one input to another keeps the keyboard up.
 *
 * `primeKeyboard()` in the tap handler → the destination reads `isKeyboardPrimed()` on mount to
 * decide whether to focus its field → `releaseKeyboardPrime()` after that focus has happened.
 */

/** A destination that never mounts must not leave the proxy (and the keyboard) behind. */
const PRIME_TIMEOUT_MS = 4000;

let proxy: HTMLInputElement | null = null;
let pending = false;
let timer = 0;

export function primeKeyboard() {
  releaseKeyboardPrime();
  pending = true;
  proxy = document.createElement('input');
  proxy.type = 'text';
  proxy.inputMode = 'search';
  proxy.tabIndex = -1;
  proxy.setAttribute('aria-hidden', 'true');
  // Fixed at the top so focusing it cannot scroll the page; 16px so iOS does not zoom.
  proxy.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;pointer-events:none;';
  document.body.appendChild(proxy);
  proxy.focus({ preventScroll: true });
  timer = window.setTimeout(releaseKeyboardPrime, PRIME_TIMEOUT_MS);
}

/**
 * True from a `primeKeyboard()` until its release: the destination should focus its field. A
 * read does not clear it — a render may run twice (StrictMode) before the effect that releases.
 */
export function isKeyboardPrimed() {
  return pending;
}

export function releaseKeyboardPrime() {
  window.clearTimeout(timer);
  pending = false;
  proxy?.remove();
  proxy = null;
}
