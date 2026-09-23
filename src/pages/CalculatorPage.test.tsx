// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readToolResults } from '../lib/toolActivity';
import { AppProvider } from '../state/AppContext';
import { CalculatorPage } from './CalculatorPage';

const DB_NAME = 'pokemon-champions-assistant';

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

const renderCalculator = async () => {
  render(
    <AppProvider>
      <CalculatorPage onPickMember={vi.fn()} />
    </AppProvider>,
  );
  await screen.findByRole('heading', { name: '伤害计算' });
};

const sideCard = (side: 'attacker' | 'defender') => {
  const card = document.querySelector(`[data-calc-side="${side}"]`);
  if (!card) throw new Error(`Unable to find the ${side} card.`);
  return card as HTMLElement;
};

const selectPokemon = async (
  user: ReturnType<typeof userEvent.setup>,
  side: '进攻方' | '防守方',
  query: string,
  label: string,
) => {
  await user.click(screen.getByRole('button', { name: new RegExp(`^选择${side}`) }));
  const search = screen.getByRole('textbox', { name: '搜索名称' });
  await user.clear(search);
  await user.type(search, query);
  await user.click(await screen.findByRole('button', { name: label }));
};

/** 03-01's wheel is the only SP control now: pick the stat, then move its rail. */
const setStatPoints = async (user: ReturnType<typeof userEvent.setup>, label: string, value: number) => {
  await user.click(screen.getByRole('button', { name: `调整${label}` }));
  fireEvent.change(screen.getByRole('slider', { name: `${label} SP` }), { target: { value: String(value) } });
};

describe('CalculatorPage', () => {
  beforeEach(async () => {
    await deleteDb();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('swaps attacker and defender configs without changing battle conditions', async () => {
    const user = userEvent.setup();
    await renderCalculator();

    await selectPokemon(user, '进攻方', 'Garchomp', '烈咬陆鲨');
    await selectPokemon(user, '防守方', 'Torkoal', '煤炭龟');

    // Edit the attacker in its own editor page (N05-07), then come back.
    await user.click(screen.getByRole('button', { name: '编辑进攻方配置' }));
    await user.click(screen.getByRole('button', { name: /^性格/ }));
    await user.click(screen.getByRole('button', { name: '固执' }));
    await setStatPoints(user, 'HP', 32);
    await user.click(screen.getByRole('button', { name: '完成' }));

    // Battle conditions live on the page, not on either side.
    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: /^天气/ }));
    await user.click(within(screen.getByRole('dialog', { name: '天气' })).getByRole('button', { name: '晴天' }));
    await user.click(screen.getByRole('switch', { name: '会心一击' }));

    expect(sideCard('attacker').textContent).toContain('烈咬陆鲨');
    expect(sideCard('attacker').textContent).toContain('固执');
    expect(sideCard('defender').textContent).toContain('煤炭龟');

    await user.click(screen.getByRole('button', { name: '交换攻守双方' }));

    expect(sideCard('attacker').textContent).toContain('煤炭龟');
    expect(sideCard('defender').textContent).toContain('烈咬陆鲨');
    expect(sideCard('defender').textContent).toContain('固执');

    // The 32 SP went with it.
    await user.click(screen.getByRole('button', { name: '编辑防守方配置' }));
    expect(screen.getByText('32 / 66')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '完成' }));

    expect(screen.getByRole('switch', { name: '会心一击' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: '天气 晴天' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '单打' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('records a settled damage range for the tools landing, and nothing before one exists', async () => {
    const user = userEvent.setup();
    await renderCalculator();

    await selectPokemon(user, '进攻方', 'Garchomp', '烈咬陆鲨');
    expect(readToolResults()).toEqual([]);

    await selectPokemon(user, '防守方', 'Torkoal', '煤炭龟');
    await waitFor(
      () => {
        const [result] = readToolResults();
        expect(result).toMatchObject({ tool: 'calculator', label: '烈咬陆鲨' });
        expect(result.tool === 'calculator' && result.maxDamage).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('lists the top environment picks above the dex and leaves the config blank', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <CalculatorPage
          environment={{
            pokemonUsage: {
              singles: [{ pokemonId: 'garchomp', usageRate: 20, teamCount: 20, moveIds: [], itemIds: [], teammateIds: [] }],
              doubles: [{ pokemonId: 'garchomp', usageRate: 20, teamCount: 20, moveIds: [], itemIds: [], teammateIds: [] }],
            },
          } as never}
          onPickMember={vi.fn()}
        />
      </AppProvider>,
    );
    await screen.findByRole('heading', { name: '伤害计算' });

    await user.click(screen.getByRole('button', { name: '选择进攻方' }));
    // 环境常用 sits above 规则内图鉴 (owner call), so the ranked pick is the first match.
    expect(screen.getByText('环境 No.1')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: '烈咬陆鲨' })[0]);

    expect(sideCard('attacker').textContent).toContain('烈咬陆鲨');
    await user.click(screen.getByRole('button', { name: '编辑进攻方配置' }));
    expect(screen.getByText('0 / 66')).toBeTruthy();
  });

  it('keeps the same search input when the first letter switches the picker into search mode', async () => {
    // An IME's first pinyin letter arrives as a change; a remounted input would abort the
    // composition and commit that letter, so Chinese names could never be typed.
    const user = userEvent.setup();
    await renderCalculator();
    await user.click(screen.getByRole('button', { name: '选择进攻方' }));

    const search = screen.getByRole('textbox', { name: '搜索名称' });
    await user.type(search, 'z');

    expect(screen.queryByRole('heading', { name: '选择进攻方' })).toBeNull();
    expect(screen.getByRole('textbox', { name: '搜索名称' })).toBe(search);
    expect(document.activeElement).toBe(search);
  });
});
