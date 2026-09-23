import { useEffect, useRef, type RefObject } from 'react';

/** Open dialogs, innermost last: only the top one answers Esc. */
const openDialogs: object[] = [];

/**
 * Keyboard and focus basics for a modal: focus moves into it on open (unless something inside
 * already took focus, e.g. an autofocused field), Esc closes the innermost one, and focus goes
 * back to whatever opened it on close. Without this a keyboard or screen-reader user stayed on
 * the page underneath, tabbing through controls hidden behind the overlay.
 *
 * The container needs `tabIndex={-1}` to take focus. `open` is for a dialog rendered inline
 * behind a condition instead of mounting its own component.
 */
export function useDialogFocus(container: RefObject<HTMLElement | null>, onClose: () => void, open = true) {
  const onCloseRef = useRef(onClose);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      openerRef.current = null;
      return;
    }
    const token = {};
    openDialogs.push(token);
    const node = container.current;
    // Kept across StrictMode's mount → unmount → mount, whose second pass would otherwise record
    // the dialog itself as the opener.
    if (!openerRef.current && document.activeElement instanceof HTMLElement && !node?.contains(document.activeElement)) {
      openerRef.current = document.activeElement;
    }
    const opener = openerRef.current;
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || openDialogs[openDialogs.length - 1] !== token) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [container, open]);
}
