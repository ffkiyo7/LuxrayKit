import { describe, expect, it } from 'vitest';
import { currentDataVersion, currentRuleSet, items, pokemon, regMaPokemonAllowlist } from '../data';
import {
  buildEnvironmentDatasetFromPokeDbOpenData,
  buildEnvironmentDatasetFromPokeDbTrainerLists,
  createPokeDbPokemonKeyMap,
  parsePokeDbTrainerListPage,
  parsePokeDbTrainerSamples,
  type PokeDbRankedTeamsPayload,
  type PokeDbTrainerListPayload,
} from './pokedbEnvironment';

const pokemonKeyToId = createPokeDbPokemonKeyMap(regMaPokemonAllowlist, pokemon);

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

const trainerListHtml = `
  <title>上位トレーナーランキング シーズンM-2（ダブルバトル）</title>
  <select name="season">
    <option value="2" selected>シーズンM-2</option>
    <option value="1">シーズンM-1</option>
  </select>
  <span class="tag is-light is-link">検索結果</span>
  <span class="tag is-light">299件</span>
  <span class="tag is-light is-warning">更新日</span>
  <span class="tag is-light">2026/6/10 23:58</span>
  <a class="scroll-pagination__link is-active" href="/trainer/list?season=2&amp;rule=1&amp;page=1">1</a>
  <a class="scroll-pagination__link" href="/trainer/list?season=2&amp;rule=1&amp;page=2">2</a>
  <a class="scroll-pagination__link" href="/trainer/list?season=2&amp;rule=1&amp;page=3">3</a>
  <article class="trainer-card">
    <div class="trainer-card-rank is-family-monospace" data-rank="1"><span>1</span></div>
    <div class="trainer-card-rating is-family-monospace"><span class="rating-integer">2724</span><span class="rating-decimal">.878</span></div>
    <div class="trainer-card-name">すいか</div>
    <div class="trainer-card-team">
      <div class="trainer-card-team__pokemon">
        <a target="_blank" href="/pokemon/show/0006-00?rule=1"></a>
        <div class="trainer-card-team__pokemon-item">リザードナイトＹ</div>
      </div>
      <div class="trainer-card-team__pokemon">
        <a target="_blank" href="/pokemon/show/0445-00?rule=1"></a>
        <div class="trainer-card-team__pokemon-item">オボンのみ</div>
      </div>
      <div class="trainer-card-team__article">
        <a href="https://example.com/team/1">team report</a>
      </div>
    </div>
  </article>
`;

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
      moveStats: {
        doubles: {
          charizard: [
            { id: 'protect', usageRate: 92.3, teamCount: 2 },
            { id: 'heat-wave', usageRate: 85, teamCount: 2 },
          ],
        },
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
        moveIds: ['protect', 'heat-wave'],
        moveStats: [
          { id: 'protect', usageRate: 92.3, teamCount: 2 },
          { id: 'heat-wave', usageRate: 85, teamCount: 2 },
        ],
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
      itemNameToId,
      maxSamples: 10,
    });

    expect(samples).toEqual([
      {
        id: 'pokedb-doubles-rank-1',
        dataKind: 'external-snapshot',
        author: 'すいか',
        score: 2724,
        rank: 1,
        title: '最高第 1 名 · 2724 分',
        battleType: 'doubles',
        reportUrl: 'https://x.com/mihono_suica/status/2054478796812943367?s=20',
        slots: [
          { pokemonId: 'charizard', itemId: 'charizardite-y', moveIds: [] },
          { pokemonId: 'garchomp', itemId: 'sitrus-berry', moveIds: [] },
        ],
      },
    ]);
  });

  it('parses trainer-list metadata and all mapped team slots without applying a sample limit', () => {
    const page = parsePokeDbTrainerListPage(trainerListHtml, {
      battleType: 'doubles',
      sourceUrl: 'https://champs.pokedb.tokyo/trainer/list?season=2&rule=1&page=1',
      pokemonKeyToId,
      itemNameToId,
    });

    expect(page).toMatchObject({
      season: 'M-2',
      seasonNumber: 2,
      updatedAt: '2026-06-10 23:58:00',
      resultCount: 299,
      pageCount: 3,
      teams: [
        {
          rank: 1,
          ratingValue: 2724.878,
          author: 'すいか',
          reportUrl: 'https://example.com/team/1',
          slots: [
            { pokemonId: 'charizard', itemId: 'charizardite-y', moveIds: [] },
            { pokemonId: 'garchomp', itemId: 'sitrus-berry', moveIds: [] },
          ],
        },
      ],
    });
  });

  it('aggregates usage from parsed trainer-list team slots', () => {
    const payload: PokeDbTrainerListPayload = {
      season: 'M-2',
      seasonNumber: 2,
      rule: 'doubles',
      updatedAt: '2026-06-10 23:58:00',
      sourceUrl: 'https://champs.pokedb.tokyo/trainer/list?season=2&rule=1',
      resultCount: 2,
      pageCount: 1,
      teams: [
        {
          rank: 1,
          ratingValue: 2500.5,
          author: 'one',
          reportUrl: 'https://example.com/one',
          slots: [
            { pokemonId: 'charizard', itemId: 'charizardite-y', moveIds: [] },
            { pokemonId: 'garchomp', itemId: 'sitrus-berry', moveIds: [] },
          ],
        },
        {
          rank: 2,
          ratingValue: 2450.25,
          author: 'two',
          slots: [
            { pokemonId: 'charizard', moveIds: [] },
            { pokemonId: 'sneasler', itemId: 'focus-sash', moveIds: [] },
          ],
        },
      ],
      audit: { unknownPokemonKeys: [], unknownItemNames: [] },
    };

    const dataset = buildEnvironmentDatasetFromPokeDbTrainerLists({
      id: 'trainer-list-test',
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
      retrievedAt: '2026-06-11T09:00:00.000Z',
      battles: { doubles: payload },
    });

    expect(dataset.updatedAt).toBe('2026-06-10T23:58:00.000+09:00');
    expect(dataset.sourceLabel).toContain('M-2');
    expect(dataset.battles.doubles.sampleCount).toBe(2);
    expect(dataset.battles.doubles.pokemonUsage.slice(0, 3)).toMatchObject([
      {
        pokemonId: 'charizard',
        usageRate: 100,
        teamCount: 2,
        itemStats: [{ id: 'charizardite-y', usageRate: 50, teamCount: 1 }],
        teammateStats: [
          { id: 'garchomp', usageRate: 50, teamCount: 1 },
          { id: 'sneasler', usageRate: 50, teamCount: 1 },
        ],
      },
      {
        pokemonId: 'garchomp',
        usageRate: 50,
        teamCount: 1,
      },
      {
        pokemonId: 'sneasler',
        usageRate: 50,
        teamCount: 1,
      },
    ]);
  });
});
