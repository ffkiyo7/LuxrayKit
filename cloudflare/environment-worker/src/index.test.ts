import { describe, expect, it, vi } from 'vitest';
import { detectLatestPokeDbSeason, fetchPokemonStatisticsBattle, fetchTrainerBattlePages, refreshSnapshot } from './index';

const pageHtml = (options: {
  season?: number;
  page: number;
  pageCount?: number;
  rank?: number;
  includeTeam?: boolean;
}) => {
  const season = options.season ?? 2;
  const pageCount = options.pageCount ?? 3;
  const rank = options.rank ?? options.page;
  const pagination = Array.from(
    { length: pageCount },
    (_, index) =>
      `<a class="scroll-pagination__link" href="/trainer/list?season=${season}&amp;rule=1&amp;page=${index + 1}">${index + 1}</a>`,
  ).join('');
  const team = options.includeTeam === false
    ? ''
    : `
      <div class="trainer-card-team">
        <div class="trainer-card-team__pokemon">
          <a href="/pokemon/show/0006-00?rule=1"></a>
          <div class="trainer-card-team__pokemon-item">リザードナイトＹ</div>
        </div>
        <div class="trainer-card-team__article"><a href="https://example.com/${rank}">report</a></div>
      </div>
    `;

  return `
    <title>シーズンM-${season}</title>
    <select name="season">
      <option value="2" selected>シーズンM-2</option>
      <option value="1">シーズンM-1</option>
    </select>
    <span class="tag is-light is-link">検索結果</span><span class="tag is-light">3件</span>
    <span class="tag is-light is-warning">更新日</span><span class="tag is-light">2026/6/10 23:58</span>
    ${pagination}
    <article class="trainer-card">
      <div data-rank="${rank}"></div>
      <span class="rating-integer">2400</span><span class="rating-decimal">.5</span>
      <div class="trainer-card-name">trainer-${rank}</div>
      ${team}
    </article>
  `;
};

describe('environment Worker PokeDB ingestion', () => {
  it('detects the latest season from the Pokemon-list season selector', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request) => new Response(pageHtml({ page: 1 }), { status: 200 }));

    await expect(detectLatestPokeDbSeason('https://example.com', fetcher)).resolves.toBe(2);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toBe('https://example.com/pokemon/list?rule=0');
  });

  it('fetches only top-N detail pages and throttles each request after the first', async () => {
    const listHtml = `
      <title>ポケモン使用率ランキング シーズンM-2（シングルバトル）</title>
      <select><option value="2" selected>シーズンM-2</option></select>
      <span>更新日</span><span class="tag is-light">2026/6/10 23:58</span>
      <a href="/pokemon/show/0445-00?season=2&amp;rule=0" class="list-pokemon button">
        <div class="pokemon-rank">1</div><div class="pokemon-name">ガブリアス</div>
      </a>
      <a href="/pokemon/show/0006-00?season=2&amp;rule=0" class="list-pokemon button">
        <div class="pokemon-rank">2</div><div class="pokemon-name">リザードン</div>
      </a>
      <a href="/pokemon/show/0730-00?season=2&amp;rule=0" class="list-pokemon button">
        <div class="pokemon-rank">3</div><div class="pokemon-name">アシレーヌ</div>
      </a>
    `;
    const detailHtml = `
      <span data-move-detail="{&quot;move_key&quot;:89,&quot;rate&quot;:99.2}">じしん</span>
      <div x-data="window.usagePieChart([{&quot;item_key&quot;:275,&quot;name&quot;:&quot;きあいのタスキ&quot;,&quot;rate&quot;:37.7}])"></div>
    `;
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      new Response(new URL(String(input)).pathname === '/pokemon/list' ? listHtml : detailHtml, { status: 200 }),
    );
    const waits: number[] = [];

    const payload = await fetchPokemonStatisticsBattle({
      baseUrl: 'https://example.com',
      season: 2,
      battleType: 'singles',
      detailLimit: 2,
      fetcher,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([250]);
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      'https://example.com/pokemon/list?season=2&rule=0',
      'https://example.com/pokemon/show/0445-00?season=2&rule=0',
      'https://example.com/pokemon/show/0006-00?season=2&rule=0',
    ]);
    expect(payload.detailCount).toBe(2);
    expect(payload.pokemonUsage[0]).toMatchObject({
      pokemonId: 'garchomp',
      usageRate: 100,
      moveStats: [{ id: 'earthquake', usageRate: 99.2 }],
      itemStats: [{ id: 'focus-sash', usageRate: 37.7 }],
    });
    expect(payload.pokemonUsage[2]).toMatchObject({
      pokemonId: 'primarina',
      moveStats: [],
      itemStats: [],
    });
  });

  it('rejects the statistics payload when a top-N detail request fails', async () => {
    const listHtml = `
      <title>シーズンM-2</title>
      <option value="2" selected>M-2</option>
      <a href="/pokemon/show/0445-00?season=2&amp;rule=0" class="list-pokemon">
        <div class="pokemon-rank">1</div><div class="pokemon-name">ガブリアス</div>
      </a>
      <a href="/pokemon/show/0006-00?season=2&amp;rule=0" class="list-pokemon">
        <div class="pokemon-rank">2</div><div class="pokemon-name">リザードン</div>
      </a>
    `;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === '/pokemon/list') return new Response(listHtml, { status: 200 });
      return path.endsWith('/0006-00')
        ? new Response('upstream error', { status: 503 })
        : new Response('<span data-move-detail="{&quot;move_key&quot;:89,&quot;rate&quot;:99.2}"></span>', { status: 200 });
    });

    await expect(fetchPokemonStatisticsBattle({
      baseUrl: 'https://example.com',
      season: 2,
      battleType: 'singles',
      detailLimit: 2,
      fetcher,
      wait: async () => undefined,
    })).rejects.toThrow('0006-00');
  });

  it('fetches every trainer-list page and merges parsed teams', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get('page') ?? 1);
      return new Response(pageHtml({ page, rank: page }), { status: 200 });
    });

    const payload = await fetchTrainerBattlePages({
      baseUrl: 'https://example.com',
      season: 2,
      battleType: 'doubles',
      fetcher,
      wait: async () => undefined,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(payload.pageCount).toBe(3);
    expect(payload.teams.map((team) => team.rank)).toEqual([1, 2, 3]);
  });

  it('rejects the whole battle payload when a later page fails', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get('page') ?? 1);
      return page === 2
        ? new Response('upstream error', { status: 503 })
        : new Response(pageHtml({ page }), { status: 200 });
    });

    await expect(
      fetchTrainerBattlePages({
        baseUrl: 'https://example.com',
        season: 2,
        battleType: 'doubles',
        fetcher,
        wait: async () => undefined,
      }),
    ).rejects.toThrow('page 2 returned 503');
  });

  it('keeps the last successful snapshot when a refresh partially fails', async () => {
    const values = new Map<string, string>([
      ['environment:latest', '{"snapshot":"old"}'],
      ['environment:team-index', '{"index":"old"}'],
      [
        'environment:status',
        JSON.stringify({
          ok: true,
          refreshedAt: '2026-06-10T00:00:00.000Z',
          selectedSeason: 1,
          selectedSeasonLabel: 'M-1',
          teamCounts: { singles: 197, doubles: 44 },
        }),
      ],
    ]);
    const env = {
      ENVIRONMENT_CACHE: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
          values.set(key, value);
        }),
      },
    };

    await expect(
      refreshSnapshot(
        env as never,
        async () => {
          throw new Error('doubles season 2 page 2 returned 503');
        },
        () => new Date('2026-06-11T09:00:00.000Z'),
      ),
    ).rejects.toThrow('page 2 returned 503');

    expect(values.get('environment:latest')).toBe('{"snapshot":"old"}');
    expect(values.get('environment:team-index')).toBe('{"index":"old"}');
    expect(JSON.parse(values.get('environment:status') ?? '{}')).toMatchObject({
      ok: false,
      refreshedAt: '2026-06-10T00:00:00.000Z',
      failedAt: '2026-06-11T09:00:00.000Z',
      selectedSeason: 1,
      selectedSeasonLabel: 'M-1',
      error: 'doubles season 2 page 2 returned 503',
    });
  });
});
