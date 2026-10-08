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

  it('starts a picked Pokémon on the environment build and lays its surge terrain', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <CalculatorPage
          environment={{
            pokemonUsage: {
              singles: [],
              doubles: [{
                pokemonId: 'rillaboom',
                usageRate: 20,
                teamCount: 20,
                moveIds: ['grassy-glide', 'fake-out'],
                itemIds: ['miracle-seed'],
                abilityIds: ['grassy-surge'],
                natureIds: ['固执'],
                teammateIds: [],
              }],
            },
          } as never}
          onPickMember={vi.fn()}
        />
      </AppProvider>,
    );
    await screen.findByRole('heading', { name: '伤害计算' });

    await user.click(screen.getByRole('button', { name: '选择进攻方' }));
    await user.click(screen.getAllByRole('button', { name: '轰擂金刚猩' })[0]);

    expect(sideCard('attacker').textContent).toContain('固执');
    expect(sideCard('attacker').textContent).toContain('青草制造者');
    expect(screen.getByRole('button', { name: '招式 青草滑梯' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '场地 青草场地' })).toBeTruthy();
    expect(screen.getByText('0 SP')).toBeTruthy();
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

  it('opens on a blank state, and a fresh mount starts blank again', async () => {
    const user = userEvent.setup();
    await renderCalculator();

    expect(screen.getAllByText('未选').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('请先选择进攻方、防守方和招式。')).toBeTruthy();
    expect(screen.queryByText(/伤害 \/ 对方 HP/)).toBeNull();

    await selectPokemon(user, '进攻方', 'Garchomp', '烈咬陆鲨');
    await selectPokemon(user, '防守方', 'Torkoal', '煤炭龟');
    expect(await screen.findByText(/伤害 \/ 对方 HP/)).toBeTruthy();
    expect(screen.getByText(/公式 Gen9/)).toBeTruthy();
    expect(screen.getByText(/临时修改不写回队伍/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: '会心一击' })).toBeTruthy();

    // Leaving the tool unmounts the page; nothing of the last pair comes back with it.
    cleanup();
    await renderCalculator();
    expect(screen.getAllByText('未选').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/伤害 \/ 对方 HP/)).toBeNull();
  });

  it('edits a temporary config through the side editor: SP caps, nature, item and a defender with no move', async () => {
    const user = userEvent.setup();
    await renderCalculator();
    await selectPokemon(user, '进攻方', 'Garchomp', '烈咬陆鲨');
    await selectPokemon(user, '防守方', 'Torkoal', '煤炭龟');

    await user.click(screen.getByRole('button', { name: '编辑进攻方配置' }));
    // A temporary Pokémon starts at 0 SP; the shared wheel is the only way to change it.
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await setStatPoints(user, 'HP', 8);
    expect(screen.getByRole('slider', { name: 'HP SP' }).getAttribute('max')).toBe('32');
    expect(screen.getByText('8 / 66')).toBeTruthy();

    await setStatPoints(user, '攻击', 32);
    await setStatPoints(user, '速度', 32);
    expect(screen.getByText('72 / 66')).toBeTruthy();
    // Over the total: the editor blocks 完成 and says so in place (N05-08).
    expect(screen.getByText(/总计超了 6 点/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '完成' }).hasAttribute('disabled')).toBe(true);

    // Back under the cap, then change nature and item through the shared picker pages.
    await setStatPoints(user, '速度', 26);
    await user.click(screen.getByRole('button', { name: /^性格/ }));
    await user.click((await screen.findAllByRole('button', { name: /固执/ }))[0]);
    await user.click(screen.getByRole('button', { name: /^道具/ }));
    await user.type(screen.getByRole('textbox', { name: '搜索道具名' }), '气势披带');
    await user.click(await screen.findByRole('button', { name: '气势披带' }));
    expect(screen.getByRole('button', { name: '道具 气势披带' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '完成' }));

    expect(sideCard('attacker').textContent).toContain('固执');
    await user.click(screen.getByRole('button', { name: '编辑进攻方配置' }));
    expect(screen.getByText('66 / 66')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '完成' }));

    // The defender gets the same editor, minus the move entry.
    await user.click(screen.getByRole('button', { name: '编辑防守方配置' }));
    expect(screen.queryByRole('button', { name: /^招式/ })).toBeNull();
    await setStatPoints(user, '防御', 20);
    expect(screen.getByText('20 / 66')).toBeTruthy();
  });

  it('applies defender HP SP to the displayed damage target HP', async () => {
    const user = userEvent.setup();
    await renderCalculator();
    await selectPokemon(user, '进攻方', 'Garchomp', '烈咬陆鲨');
    await selectPokemon(user, '防守方', 'Torkoal', '煤炭龟');

    const initialHp = Number(screen.getByText(/对方 HP/).textContent?.match(/对方 HP (\d+)/)?.[1]);
    expect(Number.isFinite(initialHp)).toBe(true);

    await user.click(screen.getByRole('button', { name: '编辑防守方配置' }));
    await setStatPoints(user, 'HP', 32);
    await user.click(screen.getByRole('button', { name: '完成' }));

    await waitFor(() => expect(screen.getByText(new RegExp(`对方 HP ${initialHp + 32}`))).toBeTruthy());
    // SP 分配 quotes the entered spread in shorthand, not the derived stat.
    expect(screen.getByText('32HP')).toBeTruthy();
  });

  it('opens the attacker move picker from 当前招式 and shows the picked move', async () => {
    const user = userEvent.setup();
    await renderCalculator();
    await selectPokemon(user, '进攻方', 'Incineroar', '炽焰咆哮虎');

    await user.click(screen.getByRole('button', { name: /^招式 / }));
    await user.type(screen.getByRole('textbox', { name: '搜索招式名' }), '金勾臂');
    await user.click(await screen.findByRole('button', { name: /ＤＤ金勾臂/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));

    expect(screen.getByRole('button', { name: /^招式 ＤＤ金勾臂/ })).toBeTruthy();
    expect(screen.getByText(/威力 85/)).toBeTruthy();
  });

  it('shows the ability reason chip when Flash Fire prevents damage', async () => {
    const user = userEvent.setup();
    await renderCalculator();

    await selectPokemon(user, '进攻方', 'Houndoom', '黑鲁加');
    await user.click(screen.getByRole('button', { name: '编辑进攻方配置' }));
    await user.click(screen.getByRole('button', { name: /^招式/ }));
    await user.type(screen.getByRole('textbox', { name: '搜索招式名' }), '闪焰冲锋');
    await user.click(await screen.findByRole('button', { name: /闪焰冲锋/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));

    // 风速狗 has a Hisuian form under the same name, so take the first row.
    await user.click(screen.getByRole('button', { name: /^选择防守方/ }));
    await user.type(screen.getByRole('textbox', { name: '搜索名称' }), 'Arcanine');
    await user.click((await screen.findAllByRole('button', { name: '风速狗' }))[0]);
    await user.click(screen.getByRole('button', { name: '编辑防守方配置' }));
    await user.click(screen.getByRole('button', { name: /^特性/ }));
    await user.click(await screen.findByRole('button', { name: /引火/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));

    expect(await screen.findByText(/无法造成伤害/)).toBeTruthy();
    expect(screen.getByText(/防守特性：引火.*火属性招式无效/)).toBeTruthy();
  });

  it('takes a side straight from a saved team member in the picker', async () => {
    // A fresh database seeds the preset team, whose 伦琴猫 is the one saved build.
    const user = userEvent.setup();
    await renderCalculator();
    await selectPokemon(user, '进攻方', 'Garchomp', '烈咬陆鲨');

    await user.click(screen.getByRole('button', { name: '选择防守方' }));
    expect(await screen.findByRole('heading', { name: '选择防守方' })).toBeTruthy();
    // 从队伍选择 is the picker's last section, so the saved build is the last match (05-04).
    await user.click((await screen.findAllByRole('button', { name: '伦琴猫' })).at(-1)!);
    expect(sideCard('defender').textContent).toContain('伦琴猫');
    expect(await screen.findByText(/伤害 \/ 对方 HP/)).toBeTruthy();
  });
});
