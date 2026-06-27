// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const sideSection = (side: '进攻方' | '防守方') => {
  const section = screen.getByText(side).closest('section');
  if (!section) throw new Error(`Unable to find ${side} card.`);
  return section as HTMLElement;
};

const selectPokemon = async (user: ReturnType<typeof userEvent.setup>, side: '进攻方' | '防守方', query: string, label: string) => {
  await user.click(screen.getByRole('button', { name: new RegExp(`选择${side}`) }));
  const search = screen.getByPlaceholderText('搜索名称');
  await user.clear(search);
  await user.type(search, query);
  const option = (await screen.findAllByText(label)).map((element) => element.closest('button')).find(Boolean);
  if (!option) throw new Error(`Unable to find ${label}.`);
  await user.click(option);
};

const comboWithOption = (container: HTMLElement, value: string) => {
  const select = within(container).getAllByRole('combobox').find((candidate) =>
    Array.from((candidate as HTMLSelectElement).options).some((option) => option.value === value),
  ) as HTMLSelectElement | undefined;
  if (!select) throw new Error(`Unable to find combobox option ${value}.`);
  return select;
};

describe('CalculatorPage', () => {
  beforeEach(async () => {
    await deleteDb();
  });

  afterEach(() => {
    cleanup();
  });

  it('swaps attacker and defender configs without changing battle conditions', async () => {
    const user = userEvent.setup();
    await renderCalculator();

    await selectPokemon(user, '进攻方', 'Garchomp', '烈咬陆鲨');
    await selectPokemon(user, '防守方', 'Torkoal', '煤炭龟');

    await user.click(screen.getByRole('button', { name: /选择进攻方/ }));
    await user.click(screen.getByTitle('编辑 SP/能力配置'));
    const attacker = sideSection('进攻方');

    await user.selectOptions(within(attacker).getByRole('combobox', { name: '性格' }), '固执');
    await user.selectOptions(comboWithOption(attacker, 'rough-skin'), 'rough-skin');
    await user.selectOptions(comboWithOption(attacker, 'magnet'), 'magnet');
    await user.selectOptions(within(attacker).getByRole('combobox', { name: '攻击 能力阶级' }), '2');
    await user.click(within(attacker).getByRole('button', { name: /HP\s*0/ }));
    fireEvent.change(screen.getByRole('slider', { name: 'HP SP' }), { target: { value: '8' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    const weatherSelect = screen.getAllByRole('combobox').find((candidate) =>
      Array.from((candidate as HTMLSelectElement).options).some((option) => option.value === '晴天'),
    ) as HTMLSelectElement;
    await user.selectOptions(weatherSelect, '晴天');
    await user.click(screen.getByRole('checkbox', { name: '会心一击' }));

    expect(sideSection('进攻方').textContent).toContain('烈咬陆鲨');
    expect(sideSection('进攻方').textContent).toMatch(/SP：HP 8/);
    expect(sideSection('进攻方').textContent).toContain('固执 · 粗糙皮肤 · 磁铁');
    expect(sideSection('进攻方').dataset.configDirty).toBe('true');
    expect(sideSection('防守方').dataset.configDirty).toBe('false');

    await user.click(screen.getByRole('button', { name: '交换攻守双方' }));

    expect(sideSection('进攻方').textContent).toContain('煤炭龟');
    expect(sideSection('防守方').textContent).toContain('烈咬陆鲨');
    expect(sideSection('防守方').textContent).toMatch(/SP：HP 8/);
    expect(sideSection('防守方').textContent).toContain('固执 · 粗糙皮肤 · 磁铁');
    expect(sideSection('进攻方').dataset.configDirty).toBe('false');
    expect(sideSection('防守方').dataset.configDirty).toBe('true');
    expect(within(sideSection('进攻方')).getByText('编辑中')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /选择防守方/ }));
    await user.click(within(sideSection('防守方')).getByTitle('编辑 SP/能力配置'));
    expect((within(sideSection('防守方')).getByRole('combobox', { name: '攻击 能力阶级' }) as HTMLSelectElement).value).toBe('2');

    expect((screen.getByRole('checkbox', { name: '会心一击' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getAllByRole('combobox').find((candidate) =>
      Array.from((candidate as HTMLSelectElement).options).some((option) => option.value === '晴天'),
    ) as HTMLSelectElement).value).toBe('晴天');
    expect(screen.getByRole('button', { name: '单打' }).className).toContain('bg-accent');
  });
});
