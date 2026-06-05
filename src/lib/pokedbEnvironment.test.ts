import { describe, expect, it } from 'vitest';
import { currentDataVersion, currentRuleSet, items, pokemon, regMaPokemonAllowlist } from '../data';
import {
  buildEnvironmentDatasetFromPokeDbOpenData,
  createPokeDbPokemonKeyMap,
  parsePokeDbTrainerSamples,
  type PokeDbRankedTeamsPayload,
} from './pokedbEnvironment';

const pokemonKeyToId = createPokeDbPokemonKeyMap(regMaPokemonAllowlist, pokemon);
const pokemonNameById = Object.fromEntries(pokemon.map((entry) => [entry.id, entry.chineseName]));

const itemNameToId = {
  'リザードナイトＹ': 'charizardite-y',
  'オボンのみ': 'sitrus-berry',
  'きあいのタスキ': 'focus-sash',
  'しんぴのしずく': 'mystic-water',
} satisfies Record<string, string>;

const makePayload = (): PokeDbRankedTeamsPayload => ({
  season: 'M-1',
  season_number: 1,
  rule: 'ダブル',
  updated_at: '2026-06-04 23:08:02',
  teams: [
    {
      rank: 1,
      rating_value: 2724.878,
      team: [
        { id: '0006-00', pokemon: 'リザードン', form: '', type1: 'ほのお', type2: 'ひこう', category: '一般', terastal: '', item: 'リザードナイトＹ' },
        { id: '0445-00', pokemon: 'ガブリアス', form: '', type1: 'ドラゴン', type2: 'じめん', category: '一般', terastal: '', item: 'オボンのみ' },
        { id: '0903-00', pokemon: 'オオニューラ', form: '', type1: 'かくとう', type2: 'どく', category: '一般', terastal: '', item: 'きあいのタスキ' },
      ],
    },
    {
      rank: 2,
      rating_value: 2681.407,
      team: [
        { id: '0006-00', pokemon: 'リザードン', form: '', type1: 'ほのお', type2: 'ひこう', category: '一般', terastal: '', item: '' },
        { id: '0445-00', pokemon: 'ガブリアス', form: '', type1: 'ドラゴン', type2: 'じめん', category: '一般', terastal: '', item: 'しんぴのしずく' },
        { id: '9999-00', pokemon: '不明', form: '', type1: '', type2: '', category: '', terastal: '', item: 'オボンのみ' },
      ],
    },
  ],
});

describe('PokeDB environment ingestion', () => {
  it('maps PokeDB pokemon keys through the current Reg M-A allowlist', () => {
    expect(pokemonKeyToId['0006-00']).toBe('charizard');
    expect(pokemonKeyToId['0445-00']).toBe('garchomp');
    expect(pokemonKeyToId['0902-01']).toBe('basculegion-female');
    expect(pokemonKeyToId['0903-00']).toBe('sneasler');
  });

  it('builds audited environment usage from PokeDB public ranked-team JSON', () => {
    const dataset = buildEnvironmentDatasetFromPokeDbOpenData({
      id: 'pokedb-test',
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
      retrievedAt: '2026-06-05T10:30:00.000+08:00',
      pokemonKeyToId,
      itemNameToId,
      itemIds: items.map((item) => item.id),
      battles: {
        doubles: makePayload(),
      },
    });

    expect(dataset.source.kind).toBe('community-snapshot');
    expect(dataset.updatedAt).toBe('2026-06-04T23:08:02.000+09:00');
    expect(dataset.sourceLabel).toContain('PokeDB');
    expect(dataset.battles.singles.pokemonUsage).toEqual([]);
    expect(dataset.battles.doubles.pokemonUsage.slice(0, 3)).toMatchObject([
      {
        pokemonId: 'charizard',
        usageRate: 100,
        teamCount: 2,
        moveIds: [],
        itemIds: ['charizardite-y'],
        itemStats: [{ id: 'charizardite-y', usageRate: 50, teamCount: 1 }],
        teammateIds: ['garchomp', 'sneasler'],
        teammateStats: [
          { id: 'garchomp', usageRate: 100, teamCount: 2 },
          { id: 'sneasler', usageRate: 50, teamCount: 1 },
        ],
      },
      {
        pokemonId: 'garchomp',
        usageRate: 100,
        teamCount: 2,
        moveIds: [],
        itemIds: ['sitrus-berry', 'mystic-water'],
        itemStats: [
          { id: 'sitrus-berry', usageRate: 50, teamCount: 1 },
          { id: 'mystic-water', usageRate: 50, teamCount: 1 },
        ],
        teammateIds: ['charizard', 'sneasler'],
        teammateStats: [
          { id: 'charizard', usageRate: 100, teamCount: 2 },
          { id: 'sneasler', usageRate: 50, teamCount: 1 },
        ],
      },
      {
        pokemonId: 'sneasler',
        usageRate: 50,
        teamCount: 1,
        moveIds: [],
        itemIds: ['focus-sash'],
        itemStats: [{ id: 'focus-sash', usageRate: 100, teamCount: 1 }],
        teammateIds: ['charizard', 'garchomp'],
        teammateStats: [
          { id: 'charizard', usageRate: 100, teamCount: 1 },
          { id: 'garchomp', usageRate: 100, teamCount: 1 },
        ],
      },
    ]);
  });

  it('extracts only trainer samples with external report links from PokeDB trainer HTML', () => {
    const html = `
      <article class="trainer-card">
        <div class="trainer-card-rank is-family-monospace" data-rank="1"><span>1</span></div>
        <div class="trainer-card-rating is-family-monospace"><span class="rating-integer">2724</span><span class="rating-decimal">.878</span></div>
        <div class="trainer-card-name">すいか</div>
        <div class="trainer-card-team">
          <div class="trainer-card-team__pokemon">
            <a target="_blank" href="/pokemon/show/0006-00?rule=1"><i class="poke-icon-96 poke-icon-48 dex-0006-02-96"></i></a>
            <div class="trainer-card-team__pokemon-name">メガリザードンＹ</div>
            <div class="trainer-card-team__pokemon-item">リザードナイトＹ</div>
          </div>
          <div class="trainer-card-team__pokemon">
            <a target="_blank" href="/pokemon/show/0445-00?rule=1"><i class="poke-icon-96 poke-icon-48 dex-0445-00-96"></i></a>
            <div class="trainer-card-team__pokemon-name">ガブリアス</div>
            <div class="trainer-card-team__pokemon-item">オボンのみ</div>
          </div>
          <div class="trainer-card-team__article">
            <a href="https://x.com/mihono_suica/status/2054478796812943367?s=20" target="_blank" rel="noopener noreferrer">@mihono_suica</a>
          </div>
        </div>
      </article>
      <article class="trainer-card">
        <div class="trainer-card-rank is-family-monospace" data-rank="2"></div>
        <div class="trainer-card-rating is-family-monospace"><span class="rating-integer">2681</span><span class="rating-decimal">.407</span></div>
        <div class="trainer-card-name">no-report</div>
      </article>
    `;

    const samples = parsePokeDbTrainerSamples(html, {
      battleType: 'doubles',
      sourceUrl: 'https://champs.pokedb.tokyo/trainer/list?season=1&rule=1',
      pokemonKeyToId,
      pokemonNameById,
      itemNameToId,
      maxSamples: 10,
    });

    expect(samples).toEqual([
      {
        id: 'pokedb-doubles-rank-1',
        dataKind: 'external-snapshot',
        author: 'すいか',
        score: 2724,
        title: 'すいか · 2724 · 喷火龙 / 烈咬陆鲨',
        battleType: 'doubles',
        reportUrl: 'https://x.com/mihono_suica/status/2054478796812943367?s=20',
        slots: [
          { pokemonId: 'charizard', itemId: 'charizardite-y', moveIds: [] },
          { pokemonId: 'garchomp', itemId: 'sitrus-berry', moveIds: [] },
        ],
      },
    ]);
  });
});
