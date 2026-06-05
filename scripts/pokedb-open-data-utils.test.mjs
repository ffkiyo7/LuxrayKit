import { describe, expect, it } from 'vitest';
import {
  createPokeDbOpenDataUpdateReport,
  formatPokeDbOpenDataUpdateReport,
  validatePokeDbRankedTeamsPayload,
} from './pokedb-open-data-utils.mjs';

const makePayload = () => ({
  season: 'M-1',
  season_number: 1,
  rule: 'シングル',
  updated_at: '2026-06-04 22:50:11',
  teams: [
    {
      rank: 1,
      rating_value: 2815.035,
      team: [
        { id: '0006-00', pokemon: 'リザードン', form: '', type1: 'ほのお', type2: 'ひこう', category: '一般', terastal: '', item: 'リザードナイトＹ' },
        { id: '0445-00', pokemon: 'ガブリアス', form: '', type1: 'ドラゴン', type2: 'じめん', category: '一般', terastal: '', item: 'オボンのみ' },
        { id: '9999-00', pokemon: '不明', form: '', type1: '', type2: '', category: '', terastal: '', item: '未知アイテム' },
      ],
    },
    {
      rank: 2,
      rating_value: 2700.125,
      team: [
        { id: '0006-00', pokemon: 'リザードン', form: '', type1: 'ほのお', type2: 'ひこう', category: '一般', terastal: '', item: 'リザードナイトＹ' },
        { id: '0445-00', pokemon: 'ガブリアス', form: '', type1: 'ドラゴン', type2: 'じめん', category: '一般', terastal: '', item: '持ち物なし' },
        { id: '', pokemon: '', form: '', type1: '', type2: '', category: '', terastal: '', item: '' },
      ],
    },
  ],
});

describe('PokeDB open data maintenance utils', () => {
  it('validates ranked-team payload shape before writing snapshots', () => {
    expect(validatePokeDbRankedTeamsPayload(makePayload(), 'singles')).toEqual([]);
    expect(validatePokeDbRankedTeamsPayload({ ...makePayload(), teams: [{ ...makePayload().teams[0], rating_value: null }] }, 'singles')).toEqual([]);
    expect(
      validatePokeDbRankedTeamsPayload(
        {
          ...makePayload(),
          teams: [
            {
              ...makePayload().teams[0],
              team: [{ id: '', pokemon: '', form: '', type1: '', type2: '', category: '', terastal: '', item: '' }],
            },
          ],
        },
        'singles',
      ),
    ).toEqual([]);
    expect(validatePokeDbRankedTeamsPayload({ ...makePayload(), teams: [] }, 'singles')).toEqual([
      'singles.teams must be a non-empty array.',
    ]);
  });

  it('reports unknown pokemon keys and item mapping gaps', () => {
    const report = createPokeDbOpenDataUpdateReport({
      battles: { singles: makePayload() },
      pokemonKeyToId: {
        '0006-00': 'charizard',
        '0445-00': 'garchomp',
      },
      itemNameToId: {
        'リザードナイトＹ': 'charizardite-y',
        'オボンのみ': 'sitrus-berry',
      },
      itemIds: ['charizardite-y'],
    });

    expect(report.battles).toEqual([
      {
        battleType: 'singles',
        rule: 'シングル',
        season: 'M-1',
        teamCount: 2,
        updatedAt: '2026-06-04 22:50:11',
      },
    ]);
    expect(report.unknownPokemonKeys).toEqual([
      {
        key: '9999-00',
        names: ['不明'],
        count: 1,
      },
    ]);
    expect(report.unmappedItemNames).toEqual([
      {
        name: '未知アイテム',
        count: 1,
      },
    ]);
    expect(report.itemIdsMissingFromCatalog).toEqual([
      {
        id: 'sitrus-berry',
        names: ['オボンのみ'],
        count: 1,
      },
    ]);
  });

  it('formats a compact human-readable report for the data script', () => {
    const text = formatPokeDbOpenDataUpdateReport({
      battles: [{ battleType: 'singles', season: 'M-1', rule: 'シングル', updatedAt: '2026-06-04 22:50:11', teamCount: 2 }],
      unknownPokemonKeys: [{ key: '9999-00', names: ['不明'], count: 1 }],
      unmappedItemNames: [{ name: '未知アイテム', count: 1 }],
      itemIdsMissingFromCatalog: [],
    });

    expect(text).toContain('singles: M-1 / シングル / 2 teams / updated 2026-06-04 22:50:11');
    expect(text).toContain('unknown Pokemon keys');
    expect(text).toContain('9999-00');
    expect(text).toContain('unmapped item names');
    expect(text).toContain('未知アイテム');
  });
});
