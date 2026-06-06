import { describe, expect, it } from 'vitest';
import {
  createPokeDbOpenDataUpdateReport,
  formatPokeDbOpenDataUpdateReport,
  getPokeDbRuleParam,
  parsePokeDbTrainerSamplesFromHtml,
  parsePokeDbMoveStatsFromHtml,
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
  it('keeps the website rule params aligned with PokeDB page labels', () => {
    expect(getPokeDbRuleParam('doubles')).toBe(1);
    expect(getPokeDbRuleParam('singles')).toBe(2);
    expect(() => getPokeDbRuleParam('rotation')).toThrow('Unsupported PokeDB battle type');
  });

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

  it('extracts PokeDB move usage stats from pokemon detail HTML', () => {
    const html = `
      <span
        class="pokemon-trend__move-name"
        data-move-detail="{&quot;rank&quot;:1,&quot;move_key&quot;:89,&quot;name&quot;:&quot;じしん&quot;,&quot;rate&quot;:90.3,&quot;type&quot;:{&quot;id&quot;:4,&quot;name&quot;:&quot;じめん&quot;},&quot;category&quot;:1,&quot;category_label&quot;:&quot;物理&quot;,&quot;power&quot;:&quot;100&quot;,&quot;accuracy&quot;:&quot;100&quot;}"
      >じしん</span>
      <span
        class="pokemon-trend__move-name"
        data-move-detail="{&quot;rank&quot;:2,&quot;move_key&quot;:182,&quot;name&quot;:&quot;まもる&quot;,&quot;rate&quot;:69.6,&quot;type&quot;:{&quot;id&quot;:1,&quot;name&quot;:&quot;ノーマル&quot;},&quot;category&quot;:0,&quot;category_label&quot;:&quot;変化&quot;,&quot;power&quot;:&quot;−&quot;,&quot;accuracy&quot;:&quot;−&quot;}"
      >まもる</span>
      <span
        class="pokemon-trend__move-name"
        data-move-detail="{&quot;rank&quot;:3,&quot;move_key&quot;:99999,&quot;name&quot;:&quot;未知技&quot;,&quot;rate&quot;:12.5}"
      >未知技</span>
    `;

    expect(parsePokeDbMoveStatsFromHtml(html, { moveKeyToId: { 89: 'earthquake', 182: 'protect' }, teamCount: 125, maxMoves: 10 })).toEqual({
      stats: [
        { id: 'earthquake', usageRate: 90.3, teamCount: 113 },
        { id: 'protect', usageRate: 69.6, teamCount: 87 },
      ],
      unknownMoveKeys: [{ key: 99999, name: '未知技', count: 1 }],
    });
  });

  it('keeps positive move usage visible for tiny samples', () => {
    const html = `
      <span
        data-move-detail="{&quot;rank&quot;:1,&quot;move_key&quot;:89,&quot;name&quot;:&quot;move&quot;,&quot;rate&quot;:3.1}"
      >move</span>
    `;

    expect(parsePokeDbMoveStatsFromHtml(html, { moveKeyToId: { 89: 'earthquake' }, teamCount: 2 })).toEqual({
      stats: [{ id: 'earthquake', usageRate: 3.1, teamCount: 1 }],
      unknownMoveKeys: [],
    });
  });

  it('extracts complete external-report team samples from trainer list HTML', () => {
    const html = `
      <article class="trainer-card">
        <div class="trainer-card-rank is-family-monospace" data-rank="1"><span>1</span></div>
        <div class="trainer-card-rating is-family-monospace"><span class="rating-integer">2724</span><span class="rating-decimal">.878</span></div>
        <div class="trainer-card-name">suika</div>
        <div class="trainer-card-team">
          <div class="trainer-card-team__pokemon">
            <a target="_blank" href="/pokemon/show/0006-00?rule=1"></a>
            <div class="trainer-card-team__pokemon-name">Charizard</div>
            <div class="trainer-card-team__pokemon-item">Charizardite Y</div>
          </div>
          <div class="trainer-card-team__pokemon">
            <a target="_blank" href="/pokemon/show/0445-00?rule=1"></a>
            <div class="trainer-card-team__pokemon-name">Garchomp</div>
            <div class="trainer-card-team__pokemon-item">Sitrus Berry</div>
          </div>
          <div class="trainer-card-team__article">
            <a href="https://x.com/example/status/1" target="_blank" rel="noopener noreferrer">report</a>
          </div>
        </div>
      </article>
      <article class="trainer-card">
        <div class="trainer-card-rank is-family-monospace" data-rank="2"><span>2</span></div>
        <div class="trainer-card-rating is-family-monospace"><span class="rating-integer">2681</span><span class="rating-decimal">.407</span></div>
        <div class="trainer-card-name">no-report</div>
      </article>
      <article class="trainer-card">
        <div class="trainer-card-rank is-family-monospace" data-rank="3"><span>3</span></div>
        <div class="trainer-card-rating is-family-monospace"><span class="rating-integer">2600</span><span class="rating-decimal">.000</span></div>
        <div class="trainer-card-name">partial</div>
        <div class="trainer-card-team">
          <div class="trainer-card-team__pokemon">
            <a target="_blank" href="/pokemon/show/9999-00?rule=1"></a>
            <div class="trainer-card-team__pokemon-name">Unknown</div>
            <div class="trainer-card-team__pokemon-item">Sitrus Berry</div>
          </div>
          <div class="trainer-card-team__article">
            <a href="https://x.com/example/status/3">report</a>
          </div>
        </div>
      </article>
    `;

    expect(
      parsePokeDbTrainerSamplesFromHtml(html, {
        battleType: 'doubles',
        sourceUrl: 'https://champs.pokedb.tokyo/trainer/list?season=1&rule=1',
        pokemonKeyToId: { '0006-00': 'charizard', '0445-00': 'garchomp' },
        pokemonNameById: { charizard: '喷火龙', garchomp: '烈咬陆鲨' },
        itemNameToId: { 'Charizardite Y': 'charizardite-y', 'Sitrus Berry': 'sitrus-berry' },
        minSlots: 2,
      }),
    ).toEqual([
      {
        id: 'pokedb-doubles-rank-1',
        dataKind: 'external-snapshot',
        author: 'suika',
        score: 2724,
        rank: 1,
        title: 'suika · 最高第 1 名 · 2724 分 · 喷火龙',
        battleType: 'doubles',
        reportUrl: 'https://x.com/example/status/1',
        slots: [
          { pokemonId: 'charizard', itemId: 'charizardite-y', moveIds: [] },
          { pokemonId: 'garchomp', itemId: 'sitrus-berry', moveIds: [] },
        ],
      },
    ]);
  });
});
