// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abilities } from '../../data';
import { getDexFormEntries, type DexFormEntry } from '../../lib/pokemonForms';
import { AbilityRow, PokemonRow } from './DexLists';

const entries = getDexFormEntries();
const ability = abilities[0];
const ownersOf = (count: number): DexFormEntry[] => entries.slice(0, count);

const renderAbilityRow = (owners: DexFormEntry[]) =>
  render(
    <AbilityRow
      ability={ability}
      divider={false}
      expanded={false}
      owners={owners}
      onOpenOwner={vi.fn()}
      onToggle={vi.fn()}
    />,
  );

afterEach(cleanup);

describe('AbilityRow owner stack', () => {
  it('stacks every owner when there are no more than three', () => {
    const owners = ownersOf(3);
    renderAbilityRow(owners);

    const row = screen.getByRole('button', { name: `展开${ability.chineseName}说明` });
    expect(within(row).getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(
      owners.map((owner) => owner.chineseName),
    );
    expect(within(row).queryByText(/^\+\d+$/)).toBeNull();
  });

  it('caps the stack at three and counts the rest into a +N disc', () => {
    const owners = ownersOf(7);
    renderAbilityRow(owners);

    const row = screen.getByRole('button', { name: `展开${ability.chineseName}说明` });
    expect(within(row).getAllByRole('img')).toHaveLength(3);
    expect(within(row).getByText('+4')).toBeTruthy();
  });
});

describe('PokemonRow', () => {
  it('leaves a Mega form unbadged — it is already its own dex entry', () => {
    const mega = entries.find((entry) => entry.isMega)!;
    render(<PokemonRow divider={false} entry={mega} onOpen={vi.fn()} />);

    expect(screen.getByText(mega.chineseName)).toBeTruthy();
    expect(screen.queryByText('MEGA')).toBeNull();
  });
});
