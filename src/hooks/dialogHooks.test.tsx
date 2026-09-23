// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentDepth } from './useHashRoute';
import { useDialogFocus } from './useDialogFocus';
import { useHistoryLayer } from './useHistoryLayer';

afterEach(cleanup);

function Dialog({ name, onClose, children }: { name: string; onClose: () => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div ref={ref} aria-label={name} role="dialog" tabIndex={-1}>
      {children}
    </div>
  );
}

function Host({ onOuterClose = () => undefined, onInnerClose = () => undefined }) {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuter(true)}>打开</button>
      {outer && (
        <Dialog name="外层" onClose={() => { onOuterClose(); setOuter(false); }}>
          <button type="button" onClick={() => setInner(true)}>再打开</button>
          {inner && <Dialog name="内层" onClose={() => { onInnerClose(); setInner(false); }} />}
        </Dialog>
      )}
    </>
  );
}

describe('useDialogFocus', () => {
  it('moves focus in on open and hands it back to the opener on close', () => {
    render(<Host />);
    const opener = screen.getByRole('button', { name: '打开' });
    opener.focus();
    fireEvent.click(opener);

    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: '外层' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes only the innermost dialog on Esc', () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(<Host onInnerClose={onInnerClose} onOuterClose={onOuterClose} />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    fireEvent.click(screen.getByRole('button', { name: '再打开' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onInnerClose).toHaveBeenCalledOnce();
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '外层' })).toBeTruthy();
  });

  it('leaves focus on a field that focused itself inside the dialog', () => {
    function WithField() {
      const ref = useRef<HTMLDivElement>(null);
      useDialogFocus(ref, () => undefined);
      return (
        <div ref={ref} role="dialog" tabIndex={-1}>
          <input aria-label="名称" autoFocus />
        </div>
      );
    }
    render(<WithField />);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '名称' }));
  });
});

function Picker() {
  const [open, setOpenState] = useState(false);
  const layer = useHistoryLayer(() => setOpenState(false));
  const setOpen = (next: boolean) => {
    if (next) layer.open();
    else layer.close();
    setOpenState(next);
  };
  return open ? (
    <button type="button" onClick={() => setOpen(false)}>选好了</button>
  ) : (
    <button type="button" onClick={() => setOpen(true)}>选择</button>
  );
}

describe('useHistoryLayer', () => {
  it('lets the hardware back button close the view instead of leaving the screen', async () => {
    window.history.replaceState({ lkDepth: 1 }, '', '#/teams/t1/members/m1');
    render(<Picker />);
    fireEvent.click(screen.getByRole('button', { name: '选择' }));
    expect(currentDepth()).toBe(2);
    expect(window.location.hash).toBe('#/teams/t1/members/m1');

    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '选择' })).toBeTruthy());
    expect(currentDepth()).toBe(1);
  });

  it('takes its entry back off when the view closes itself', async () => {
    window.history.replaceState({ lkDepth: 1 }, '', '#/teams/t1/members/m1');
    render(<Picker />);
    fireEvent.click(screen.getByRole('button', { name: '选择' }));
    fireEvent.click(screen.getByRole('button', { name: '选好了' }));

    await waitFor(() => expect(currentDepth()).toBe(1));
    expect(screen.getByRole('button', { name: '选择' })).toBeTruthy();
  });
});
