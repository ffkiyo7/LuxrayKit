import { useCallback, useEffect, useRef, useState } from 'react';

type ScrollContainer = HTMLElement | Window;

type ScrollContainerRef = {
  current: HTMLElement | null;
};

export type UseAutoHideBottomNavOptions = {
  enabled: boolean;
  lock?: boolean;
  threshold?: number;
  idleDelay?: number;
  topOffset?: number;
  scrollContainer?: HTMLElement | ScrollContainerRef | null;
  lockSelector?: string;
};

const DEFAULT_THRESHOLD = 28;
const DEFAULT_IDLE_DELAY = 850;
const DEFAULT_TOP_OFFSET = 8;
const DEFAULT_LOCK_SELECTOR = '[data-bottom-nav-lock="true"]';
const KEYBOARD_HEIGHT_DELTA = 120;

const isWindow = (container: ScrollContainer): container is Window => container === window;

const resolveScrollContainer = (container?: HTMLElement | ScrollContainerRef | null): ScrollContainer => {
  if (!container) return window;
  if ('current' in container) return container.current ?? window;
  return container;
};

const scrollTopOf = (container: ScrollContainer) =>
  Math.max(0, isWindow(container) ? window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0 : container.scrollTop);

const isEditableElement = (element: Element | null) => {
  if (!element) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  return element.closest('[contenteditable="true"]') !== null;
};

export function useAutoHideBottomNav({
  enabled,
  lock = false,
  threshold = DEFAULT_THRESHOLD,
  idleDelay = DEFAULT_IDLE_DELAY,
  topOffset = DEFAULT_TOP_OFFSET,
  scrollContainer,
  lockSelector = DEFAULT_LOCK_SELECTOR,
}: UseAutoHideBottomNavOptions) {
  const [hidden, setHidden] = useState(false);
  const [domLocked, setDomLocked] = useState(false);
  const [inputLocked, setInputLocked] = useState(false);
  const [keyboardLocked, setKeyboardLocked] = useState(false);
  const lastScrollTopRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);

  const show = useCallback(() => {
    setHidden(false);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === null) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const scheduleIdleShow = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(show, idleDelay);
  }, [clearIdleTimer, idleDelay, show]);

  useEffect(() => {
    if (!enabled || lock || domLocked || inputLocked || keyboardLocked) {
      setHidden(false);
      clearIdleTimer();
    }
  }, [clearIdleTimer, domLocked, enabled, inputLocked, keyboardLocked, lock]);

  useEffect(() => {
    if (!enabled) return;

    const updateLockState = () => {
      setDomLocked(Boolean(document.querySelector(lockSelector)));
    };

    updateLockState();
    const observer = new MutationObserver(updateLockState);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-bottom-nav-lock'],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [enabled, lockSelector]);

  useEffect(() => {
    if (!enabled) return;

    const updateInputLock = () => {
      setInputLocked(isEditableElement(document.activeElement));
    };

    document.addEventListener('focusin', updateInputLock);
    document.addEventListener('focusout', updateInputLock);
    updateInputLock();

    return () => {
      document.removeEventListener('focusin', updateInputLock);
      document.removeEventListener('focusout', updateInputLock);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !window.visualViewport) return;

    const updateKeyboardLock = () => {
      setKeyboardLocked(window.innerHeight - window.visualViewport!.height > KEYBOARD_HEIGHT_DELTA);
    };

    window.visualViewport.addEventListener('resize', updateKeyboardLock);
    updateKeyboardLock();

    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardLock);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    const container = resolveScrollContainer(scrollContainer);
    const eventTarget: EventTarget = isWindow(container) ? window : container;
    const isLocked = () => lock || domLocked || inputLocked || keyboardLocked;

    lastScrollTopRef.current = scrollTopOf(container);

    const handleScroll = () => {
      const currentScrollTop = scrollTopOf(container);

      if (currentScrollTop <= topOffset || isLocked()) {
        lastScrollTopRef.current = currentScrollTop;
        setHidden(false);
        clearIdleTimer();
        return;
      }

      const delta = currentScrollTop - lastScrollTopRef.current;
      if (Math.abs(delta) >= threshold) {
        setHidden(delta > 0);
        lastScrollTopRef.current = currentScrollTop;
      }

      scheduleIdleShow();
    };

    const handlePointerDown = () => {
      setHidden(false);
    };

    eventTarget.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('pointerdown', handlePointerDown, { passive: true });

    return () => {
      eventTarget.removeEventListener('scroll', handleScroll);
      document.removeEventListener('pointerdown', handlePointerDown);
      clearIdleTimer();
    };
  }, [
    clearIdleTimer,
    domLocked,
    enabled,
    inputLocked,
    keyboardLocked,
    lock,
    scheduleIdleShow,
    scrollContainer,
    threshold,
    topOffset,
  ]);

  return { hidden, show };
}
