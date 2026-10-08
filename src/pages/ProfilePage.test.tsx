// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentDataVersion, currentRuleSet } from '../data';
import { repository } from '../lib/db';
import type { ReactNode } from 'react';
import { AppProvider, useAppStore } from '../state/AppContext';
import { ProfilePage } from './ProfilePage';
import { AboutPage } from './profile/AboutPage';

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('pokemon-champions-assistant');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

/** Mount once the store has read IndexedDB, as the shell does — a tap before that is overwritten. */
function Loaded({ children }: { children: ReactNode }) {
  const { loading } = useAppStore();
  return loading ? null : children;
}

const renderWithStore = (page: ReactNode) =>
  render(
    <AppProvider>
      <Loaded>{page}</Loaded>
    </AppProvider>,
  );

beforeEach(async () => {
  window.location.hash = '#/profile';
  await deleteDb();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('我的', () => {
  it('lets the user turn the anonymous page-view ping off, and persists that choice', async () => {
    const user = userEvent.setup();
    renderWithStore(<ProfilePage />);

    const toggle = await screen.findByRole('switch', { name: '切换匿名使用统计' });
    // Default is opted *in*; the copy has to state exactly what leaves the device.
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/不含 IP、设备标识或队伍内容/)).toBeTruthy();

    await user.click(toggle);
    await waitFor(() => expect(screen.getByRole('switch', { name: '切换匿名使用统计' }).getAttribute('aria-checked')).toBe('false'));
    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.preferences.analyticsOptOut).toBe(true);
    });
  });

  it('offers the in-app message form instead of the old GitHub issue links', async () => {
    const user = userEvent.setup();
    renderWithStore(<ProfilePage />);
    await screen.findByRole('heading', { name: '我的' });

    // The GitHub issue entry points are gone — they all forced a login.
    expect(screen.queryByRole('link', { name: /反馈问题/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /功能建议/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /留言/ }));
    expect(window.location.hash).toBe('#/profile/feedback');
  });
});

describe('关于与数据', () => {
  it('shows a copyable build identity', async () => {
    const user = userEvent.setup();
    renderWithStore(<AboutPage onBack={vi.fn()} onExportBackup={vi.fn()} />);
    await screen.findByRole('heading', { name: '关于与数据' });

    // 关于 must name the regulation and data version from the catalog, never a literal.
    expect(screen.getByText(currentRuleSet.displayName)).toBeTruthy();
    expect(screen.getByText(currentDataVersion.id)).toBeTruthy();

    // userEvent.setup() installs its own clipboard stub, so override it afterwards.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: /复制版本信息/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain(currentRuleSet.displayName);
    expect(copied).toContain(currentDataVersion.id);
    expect(copied).toMatch(/构建：\S+/);
    expect(await screen.findByRole('button', { name: /版本信息已复制/ })).toBeTruthy();
  });
});
