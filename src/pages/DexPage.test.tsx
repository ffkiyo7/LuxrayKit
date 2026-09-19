// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDexFormEntries } from '../lib/pokemonForms';
import { AppProvider } from '../state/AppContext';
import { DexPage } from './DexPage';

const first = getDexFormEntries()[0];

beforeEach(() => {
  window.location.hash = '#/tools/dex';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DexPage scroll position', () => {
  it('opens a detail at the top and returns to the row it was opened from', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(
      <AppProvider>
        <DexPage onOpenCalculator={vi.fn()} />
      </AppProvider>,
    );

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1840 });
    await user.click(screen.getAllByRole('button', { name: new RegExp(first.chineseName) })[0]);

    await screen.findByRole('button', { name: '返回图鉴列表' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0 });

    await user.click(screen.getByRole('button', { name: '返回图鉴列表' }));
    await screen.findByRole('button', { name: new RegExp(first.chineseName) });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1840, left: 0 });
  });
});
