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
