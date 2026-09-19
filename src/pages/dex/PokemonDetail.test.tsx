// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abilities } from '../../data';
import { hiddenAbilityIdsByPokemonId } from '../../data/seed/regMA/hiddenAbilities';
import { getDexFormEntries, type DexFormEntry } from '../../lib/pokemonForms';
import { AppProvider } from '../../state/AppContext';
import { PokemonDetail } from './PokemonDetail';

const entries = getDexFormEntries();
const abilityById = (id: string) => abilities.find((ability) => ability.id === id)!;

const renderDetail = (entry: DexFormEntry) =>
  render(
    <AppProvider>
      <PokemonDetail entry={entry} onBack={vi.fn()} onOpenCalculator={vi.fn()} />
    </AppProvider>,
  );

afterEach(cleanup);

describe('PokemonDetail abilities', () => {
  it('prints every ability effect at once, with no disclosure control', () => {
    const entry = entries.find((candidate) => candidate.abilities.length > 1)!;
    renderDetail(entry);

    entry.abilities.forEach((id) => {
      const ability = abilityById(id);
      expect(screen.getAllByText(ability.chineseName).length).toBeGreaterThan(0);
      expect(screen.getAllByText(ability.effectSummary).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: `展开${ability.chineseName}说明` })).toBeNull();
      expect(screen.queryByRole('button', { name: `收起${ability.chineseName}说明` })).toBeNull();
    });
  });

  it('tints the name of a hidden ability and leaves the regular ones alone', () => {
    const entry = entries.find((candidate) => {
      const hidden = hiddenAbilityIdsByPokemonId[candidate.basePokemon.id] ?? [];
      return candidate.abilities.some((id) => hidden.includes(id)) && candidate.abilities.some((id) => !hidden.includes(id));
    })!;
    const hidden = hiddenAbilityIdsByPokemonId[entry.basePokemon.id];
    renderDetail(entry);

    const nameClasses = (abilityId: string) =>
      screen.getAllByText(abilityById(abilityId).chineseName)[0].className;
    expect(nameClasses(entry.abilities.find((id) => hidden.includes(id))!)).toContain('text-data');
    expect(nameClasses(entry.abilities.find((id) => !hidden.includes(id))!)).not.toContain('text-data');
  });
});

describe('PokemonDetail 属性关系', () => {
  const garchomp = () => entries.find((candidate) => candidate.chineseName === '烈咬陆鲨')!;
  const singleType = () => entries.find((candidate) => candidate.types.length === 1)!;

  /** Each shelf is a heading followed by its row of chips; a chip's text is its whole capsule. */
  const chipTexts = (shelfTitle: string) =>
    [...screen.getByText(shelfTitle).nextElementSibling!.children].map((chip) => chip.textContent ?? '');

  it('opens on 受击时 and only names the attacking shelves once 攻击时 is picked', async () => {
    const user = userEvent.setup();
    renderDetail(garchomp());

    expect(screen.getByRole('button', { name: '受击时' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '攻击时' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('弱点')).toBeTruthy();
    expect(screen.queryByText('效果绝佳')).toBeNull();

    await user.click(screen.getByRole('button', { name: '攻击时' }));

    expect(screen.getByText('效果绝佳')).toBeTruthy();
    expect(screen.getByText('效果不好')).toBeTruthy();
    expect(screen.getByText('无效')).toBeTruthy();
    expect(screen.queryByText('弱点')).toBeNull();
    // 钢 sits on two shelves at once — ×2 for its 地面 moves, ×½ for its 龙 moves.
    expect(chipTexts('效果绝佳')).toContain('钢×2地面');
    expect(chipTexts('效果不好')).toContain('钢×½龙');
  });

  it('drops the source label for a single-type Pokémon', async () => {
    const user = userEvent.setup();
    const entry = singleType();
    renderDetail(entry);

    await user.click(screen.getByRole('button', { name: '攻击时' }));

    const chips = ['效果绝佳', '效果不好', '无效']
      .filter((title) => screen.queryByText(title))
      .flatMap((title) => chipTexts(title));
    expect(chips.length).toBeGreaterThan(0);
    // 「属性名 + 倍率」 and nothing else: the one possible source carries no information.
    chips.forEach((text) => expect(text).toMatch(/^[^×]+×(2|½|0)$/));
  });

  it('goes back to 受击时 when another Pokémon takes the page over', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDetail(garchomp());

    await user.click(screen.getByRole('button', { name: '攻击时' }));
    expect(screen.getByText('效果绝佳')).toBeTruthy();

    rerender(
      <AppProvider>
        <PokemonDetail entry={singleType()} onBack={vi.fn()} onOpenCalculator={vi.fn()} />
      </AppProvider>,
    );

    expect(screen.getByRole('button', { name: '受击时' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('效果绝佳')).toBeNull();
  });
});

describe('PokemonDetail 加入队伍', () => {
  it('asks which team, then confirms where the Pokémon went', async () => {
    const user = userEvent.setup();
    renderDetail(entries[0]);

    await user.click(screen.getByRole('button', { name: '加入队伍' }));
    const sheet = await screen.findByRole('dialog', { name: `把${entries[0].chineseName}加入哪支队伍` });
    await user.click(within(sheet).getByRole('button', { name: /新建队伍并加入/ }));

    expect(await screen.findByText(/^已加入/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
