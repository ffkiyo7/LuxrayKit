// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repository } from '../lib/db';
import { AppProvider, useAppStore } from './AppContext';

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

const renderStore = async () => {
  const hook = renderHook(() => useAppStore(), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AppProvider team writes', () => {
  it('adds a team and saves into it from the same handler without listing it twice', async () => {
    const { result } = await renderStore();
    const before = result.current.teams.length;

    await act(async () => {
      // The 新建队伍并加入 flow: both calls come from one closure, before any re-render.
      const { addTeam, saveTeam } = result.current;
      const team = await addTeam('Fresh');
      await saveTeam({ ...team, notes: 'filled' });
    });

    const fresh = result.current.teams.filter((team) => team.name === 'Fresh');
    expect(fresh).toHaveLength(1);
    expect(fresh[0].notes).toBe('filled');
    expect(result.current.teams).toHaveLength(before + 1);
  });

  it('puts the previous version back when a save cannot be written', async () => {
    const { result } = await renderStore();
    const original = result.current.teams[0];
    vi.spyOn(repository, 'saveTeam').mockRejectedValueOnce(new Error('QuotaExceededError'));

    await act(async () => {
      await expect(result.current.saveTeam({ ...original, name: 'Renamed' })).rejects.toThrow('QuotaExceededError');
    });

    expect(result.current.teams[0].name).toBe(original.name);
    expect(result.current.lastRefreshError).toContain('没有保存');
  });

  it('leaves the list untouched when a restore cannot be written', async () => {
    const { result } = await renderStore();
    const before = result.current.teams.map((team) => team.id);
    vi.spyOn(repository, 'replaceTeams').mockRejectedValueOnce(new Error('aborted'));

    await act(async () => {
      await expect(result.current.replaceTeams([{ ...result.current.teams[0], id: 'restored' }])).rejects.toThrow('aborted');
    });

    expect(result.current.teams.map((team) => team.id)).toEqual(before);
  });

  it('keeps working in memory when IndexedDB cannot be opened', async () => {
    vi.spyOn(repository, 'loadState').mockRejectedValueOnce(new Error('blocked'));
    const saveSpy = vi.spyOn(repository, 'saveTeam');
    const { result } = await renderStore();

    await act(async () => {
      await result.current.addTeam('Memory only');
    });

    expect(result.current.teams.map((team) => team.name)).toEqual(['Memory only']);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
