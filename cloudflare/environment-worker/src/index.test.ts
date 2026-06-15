import { describe, expect, it, vi } from 'vitest';
import { regMaPokemonAllowlist } from '../../../src/data/seed/regMA/allowlist';
import {
  detectLatestPokeDbSeason,
  fetchPokemonStatisticsBattle,
  fetchTrainerBattlePages,
  runRefreshJobStep,
  startRefreshJob,
} from './index';
import worker from './index';

const rankingKeys = regMaPokemonAllowlist.slice(0, 60).map((entry) => {
  const [dexNo, formNo = '000'] = entry.championsFormId.split('-');
  return `${dexNo}-${String(Number(formNo)).padStart(2, '0')}`;
});

const pokemonListHtml = (
  battleType: 'singles' | 'doubles',
  count = 60,
  options: { season?: number; updatedAt?: string } = {},
) => {
  const season = options.season ?? 2;
  const updatedAt = options.updatedAt ?? '2026/6/10 23:58';
  return `
  <title>ポケモン使用率ランキング シーズンM-${season}</title>
  <select><option value="${season}" selected>シーズンM-${season}</option></select>
  <span>更新日</span><span class="tag is-light">${updatedAt}</span>
  ${rankingKeys.slice(0, count).map((key, index) => `
    <a href="/pokemon/show/${key}?season=${season}&amp;rule=${battleType === 'singles' ? 0 : 1}" class="list-pokemon button">
      <div class="pokemon-rank">${index + 1}</div><div class="pokemon-name">pokemon-${index + 1}</div>
    </a>
  `).join('')}
`;
};

const pokemonDetailHtml = `
  <span data-move-detail="{&quot;move_key&quot;:89,&quot;rate&quot;:99.2}">じしん</span>
  <div x-data="window.usagePieChart([{&quot;item_key&quot;:275,&quot;name&quot;:&quot;きあいのタスキ&quot;,&quot;rate&quot;:37.7}])"></div>
`;

const createKvEnv = (initial: Record<string, string> = {}, overrides: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  const env = {
    POKEDB_BASE_URL: 'https://example.com',
    POKEDB_DETAIL_LIMIT: '60',
    POKEDB_DETAIL_CHUNK_SIZE: '40',
    WORKER_SELF_URL: 'https://worker.example.com',
    ADMIN_REFRESH_TOKEN: 'secret',
    ...overrides,
    ENVIRONMENT_CACHE: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        values.delete(key);
      }),
    },
  };
  return { env: env as never, values };
};

const createRefreshFetcher = (
  options: {
    failDetailKey?: string;
    season?: number;
    updatedAt?: string;
    updatedAtByBattle?: Partial<Record<'singles' | 'doubles', string>>;
  } = {},
) =>
  vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const season = options.season ?? 2;
    if (url.pathname === '/pokemon/list' && !url.searchParams.has('season')) {
      return new Response(pokemonListHtml('singles', 60, {
        season,
        updatedAt: options.updatedAt,
      }), { status: 200 });
    }
    if (url.pathname === '/pokemon/list') {
      const battleType = url.searchParams.get('rule') === '1' ? 'doubles' : 'singles';
      return new Response(
        pokemonListHtml(
          battleType,
          60,
          { season, updatedAt: options.updatedAtByBattle?.[battleType] ?? options.updatedAt },
        ),
        { status: 200 },
      );
    }
    if (url.pathname.startsWith('/pokemon/show/')) {
      return url.pathname.endsWith(`/${options.failDetailKey}`)
        ? new Response('upstream error', { status: 503 })
        : new Response(pokemonDetailHtml, { status: 200 });
    }
    if (url.pathname === '/trainer/list') {
      return new Response(pageHtml({ season: 1, page: 1, pageCount: 1 }), { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

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
    expect(waits).toEqual([450]);
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

  it('starts a top-60 cursor job from the season and both ranking lists without replacing the live snapshot', async () => {
    const { env, values } = createKvEnv({
      'environment:latest': '{"snapshot":"old"}',
      'environment:team-index': '{"index":"old"}',
    });
    const fetcher = createRefreshFetcher();
    const scheduled: string[] = [];

    const result = await startRefreshJob(
      env,
      (jobId) => scheduled.push(jobId),
      {
        fetcher,
        now: () => new Date('2026-06-12T00:00:00.000Z'),
        createJobId: () => 'job-top-60',
      },
    );

    const job = JSON.parse(values.get('environment:refresh-job') ?? '{}');
    expect(result).toEqual({
      ok: true,
      state: 'started',
      jobId: 'job-top-60',
      season: 2,
      pendingCount: 120,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(job).toMatchObject({
      jobId: 'job-top-60',
      season: 2,
      detailLimit: 60,
      phase: 'collecting',
      stepCount: 0,
      details: { singles: {}, doubles: {} },
    });
    expect(job.lists.singles.rankings).toHaveLength(60);
    expect(job.lists.doubles.rankings).toHaveLength(60);
    expect(job.pending).toHaveLength(120);
    expect(scheduled).toEqual(['job-top-60']);
    expect(values.get('environment:latest')).toBe('{"snapshot":"old"}');
    expect(values.get('environment:team-index')).toBe('{"index":"old"}');
  });

  it('skips detail refresh when a successful snapshot has the same season and source update time', async () => {
    const { env, values } = createKvEnv({
      'environment:latest': JSON.stringify({
        snapshot: 'current',
        retrievedAt: '2026-06-11T00:00:00.000Z',
      }),
      'environment:status': JSON.stringify({
        ok: true,
        refreshedAt: '2026-06-11T00:00:00.000Z',
        selectedSeason: 2,
        selectedSeasonLabel: 'M-2',
        sourceUpdatedAt: '2026-06-10 23:58:00',
        teamCounts: { singles: 60, doubles: 60 },
      }),
    });
    const fetcher = createRefreshFetcher();
    const scheduled: string[] = [];

    const result = await startRefreshJob(env, (jobId) => scheduled.push(jobId), {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'should-not-be-used',
    });

    expect(result).toEqual({
      ok: true,
      state: 'skipped',
      jobId: '',
      season: 2,
      pendingCount: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(scheduled).toEqual([]);
    expect(values.has('environment:refresh-job')).toBe(false);
    expect(JSON.parse(values.get('environment:latest') ?? '{}')).toEqual({
      snapshot: 'current',
      retrievedAt: '2026-06-12T00:00:00.000Z',
    });
    expect(JSON.parse(values.get('environment:status') ?? '{}')).toEqual({
      ok: true,
      refreshedAt: '2026-06-12T00:00:00.000Z',
      selectedSeason: 2,
      selectedSeasonLabel: 'M-2',
      sourceUpdatedAt: '2026-06-10 23:58:00',
      teamCounts: { singles: 60, doubles: 60 },
    });
    expect(fetcher.mock.calls.every(([, init]) => {
      const headers = new Headers(init?.headers);
      return init?.cache === 'no-store'
        && headers.get('cache-control') === 'no-cache'
        && headers.get('pragma') === 'no-cache';
    })).toBe(true);
  });

  it.each([
    {
      label: 'the source update time changes',
      previousSeason: 2,
      previousSourceUpdatedAt: '2026-06-09 23:58:00',
      currentSeason: 2,
    },
    {
      label: 'the selected season changes',
      previousSeason: 1,
      previousSourceUpdatedAt: '2026-06-10 23:58:00',
      currentSeason: 2,
    },
  ])('starts a refresh when $label', async ({
    previousSeason,
    previousSourceUpdatedAt,
    currentSeason,
  }) => {
    const { env, values } = createKvEnv({
      'environment:latest': '{"snapshot":"current"}',
      'environment:status': JSON.stringify({
        ok: true,
        refreshedAt: '2026-06-11T00:00:00.000Z',
        selectedSeason: previousSeason,
        selectedSeasonLabel: `M-${previousSeason}`,
        sourceUpdatedAt: previousSourceUpdatedAt,
      }),
    });
    const fetcher = createRefreshFetcher({ season: currentSeason });
    const scheduled: string[] = [];

    const result = await startRefreshJob(env, (jobId) => scheduled.push(jobId), {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'job-refresh-required',
    });

    expect(result).toMatchObject({
      state: 'started',
      jobId: 'job-refresh-required',
      season: currentSeason,
      pendingCount: 120,
    });
    expect(values.has('environment:refresh-job')).toBe(true);
    expect(scheduled).toEqual(['job-refresh-required']);
  });

  it('processes at most 20 details per step, throttles them, and schedules exactly one chained request', async () => {
    const { env, values } = createKvEnv({ 'environment:latest': '{"snapshot":"old"}' });
    const fetcher = createRefreshFetcher();
    await startRefreshJob(env, () => undefined, {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'job-budget',
    });
    fetcher.mockClear();
    const waits: number[] = [];
    const chainedFetches: string[] = [];

    const result = await runRefreshJobStep(
      env,
      'job-budget',
      (jobId) => chainedFetches.push(jobId),
      {
        fetcher,
        wait: async (milliseconds) => {
          waits.push(milliseconds);
        },
        now: () => new Date('2026-06-12T00:01:00.000Z'),
      },
    );

    const job = JSON.parse(values.get('environment:refresh-job') ?? '{}');
    expect(result).toMatchObject({ state: 'collecting', pendingCount: 100 });
    expect(fetcher).toHaveBeenCalledTimes(20);
    expect(fetcher.mock.calls.length + chainedFetches.length).toBeLessThanOrEqual(21);
    expect(waits).toEqual(Array.from({ length: 19 }, () => 450));
    expect(job.pending).toHaveLength(100);
    expect(Object.keys(job.details.singles)).toHaveLength(20);
    expect(job.stepCount).toBe(1);
    expect(chainedFetches).toEqual(['job-budget']);
    expect(values.get('environment:latest')).toBe('{"snapshot":"old"}');
  });

  it('continues a partially completed cursor and only publishes during FINALIZE', async () => {
    const { env, values } = createKvEnv(
      {
        'environment:latest': '{"snapshot":"old"}',
        'environment:team-index': '{"index":"old"}',
      },
      { POKEDB_DETAIL_LIMIT: '3', POKEDB_DETAIL_CHUNK_SIZE: '2' },
    );
    const fetcher = createRefreshFetcher({
      updatedAtByBattle: {
        singles: '2026/6/09 23:58',
        doubles: '2026/6/10 23:58',
      },
    });
    await startRefreshJob(env, () => undefined, {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'job-resume',
    });

    await runRefreshJobStep(env, 'job-resume', () => undefined, {
      fetcher,
      wait: async () => undefined,
      now: () => new Date('2026-06-12T00:01:00.000Z'),
    });
    expect(JSON.parse(values.get('environment:refresh-job') ?? '{}').pending).toHaveLength(4);
    expect(values.get('environment:latest')).toBe('{"snapshot":"old"}');

    await runRefreshJobStep(env, 'job-resume', () => undefined, {
      fetcher,
      wait: async () => undefined,
      now: () => new Date('2026-06-12T00:02:00.000Z'),
    });
    await runRefreshJobStep(env, 'job-resume', () => undefined, {
      fetcher,
      wait: async () => undefined,
      now: () => new Date('2026-06-12T00:03:00.000Z'),
    });

    const finalizingJob = JSON.parse(values.get('environment:refresh-job') ?? '{}');
    expect(finalizingJob.phase).toBe('finalizing');
    expect(finalizingJob.pending).toEqual([]);
    expect(values.get('environment:latest')).toBe('{"snapshot":"old"}');
    expect(values.get('environment:team-index')).toBe('{"index":"old"}');

    const status = await runRefreshJobStep(env, 'job-resume', () => undefined, {
      fetcher,
      now: () => new Date('2026-06-12T00:04:00.000Z'),
    });
    const snapshot = JSON.parse(values.get('environment:latest') ?? '{}');

    expect(status).toMatchObject({
      ok: true,
      selectedSeason: 2,
      selectedSeasonLabel: 'M-2',
      sourceUpdatedAt: '2026-06-10 23:58:00',
      teamCounts: { singles: 60, doubles: 60 },
    });
    expect(snapshot.dataFreshness.detailLimit).toBe(3);
    expect(snapshot.battles.singles.detailCount).toBe(3);
    expect(snapshot.battles.doubles.detailCount).toBe(3);
    expect(values.has('environment:refresh-job')).toBe(false);
    expect(values.get('environment:team-index')).not.toBe('{"index":"old"}');
  });

  it('still publishes the snapshot when previous-season sample fetch fails during FINALIZE', async () => {
    const { env, values } = createKvEnv(
      { 'environment:latest': '{"snapshot":"old"}' },
      { POKEDB_DETAIL_LIMIT: '3', POKEDB_DETAIL_CHUNK_SIZE: '2' },
    );
    // Samples (/trainer/list) fail, but rankings/details succeed.
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/trainer/list') return new Response('upstream error', { status: 503 });
      if (url.pathname === '/pokemon/list') {
        return new Response(
          pokemonListHtml(url.searchParams.get('rule') === '1' ? 'doubles' : 'singles'),
          { status: 200 },
        );
      }
      if (url.pathname.startsWith('/pokemon/show/')) return new Response(pokemonDetailHtml, { status: 200 });
      throw new Error(`Unexpected URL ${url}`);
    });
    await startRefreshJob(env, () => undefined, {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'job-sample-fail',
    });

    let status: unknown;
    for (let step = 0; step < 4; step += 1) {
      status = await runRefreshJobStep(env, 'job-sample-fail', () => undefined, {
        fetcher,
        wait: async () => undefined,
        now: () => new Date(`2026-06-12T00:0${step + 1}:00.000Z`),
      });
    }

    const snapshot = JSON.parse(values.get('environment:latest') ?? '{}');
    expect(status).toMatchObject({ ok: true, selectedSeason: 2, selectedSeasonLabel: 'M-2' });
    expect(snapshot.snapshot).toBeUndefined(); // old placeholder was replaced
    expect(snapshot.battles.singles.detailCount).toBe(3);
    expect(snapshot.teamSamples).toEqual({ singles: [], doubles: [] });
    expect(values.has('environment:refresh-job')).toBe(false);
  });

  it('does not create an overlapping job while the current cursor is active and resumes it when stale', async () => {
    const { env } = createKvEnv();
    const fetcher = createRefreshFetcher();
    const scheduled: string[] = [];
    await startRefreshJob(env, (jobId) => scheduled.push(jobId), {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'job-guard',
    });
    fetcher.mockClear();

    const activeResult = await startRefreshJob(env, (jobId) => scheduled.push(jobId), {
      fetcher,
      now: () => new Date('2026-06-12T00:05:00.000Z'),
      createJobId: () => 'should-not-be-used',
    });
    const staleResult = await startRefreshJob(env, (jobId) => scheduled.push(jobId), {
      fetcher,
      now: () => new Date('2026-06-12T00:11:00.001Z'),
      createJobId: () => 'should-not-be-used',
    });

    expect(activeResult).toMatchObject({ state: 'in-progress', jobId: 'job-guard' });
    expect(staleResult).toMatchObject({ state: 'resumed', jobId: 'job-guard' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(scheduled).toEqual(['job-guard', 'job-guard']);
  });

  it('abandons a cursor older than one hour and starts from current source lists', async () => {
    const oldJob = {
      jobId: 'job-too-old',
      season: 2,
      detailLimit: 1,
      startedAt: '2026-06-11T22:00:00.000Z',
      updatedAt: '2026-06-11T22:30:00.000Z',
      stepCount: 1,
      phase: 'collecting',
      lists: {},
      pending: [{ battleType: 'singles', pokeDbKey: '0445-00', pokemonId: 'garchomp', rank: 1 }],
      details: { singles: {}, doubles: {} },
    };
    const { env, values } = createKvEnv({
      'environment:refresh-job': JSON.stringify(oldJob),
    });
    const scheduled: string[] = [];

    const result = await startRefreshJob(env, (jobId) => scheduled.push(jobId), {
      fetcher: createRefreshFetcher({ updatedAt: '2026/6/14 00:20' }),
      now: () => new Date('2026-06-12T00:00:00.001Z'),
      createJobId: () => 'job-current',
    });

    expect(result).toMatchObject({ state: 'started', jobId: 'job-current', pendingCount: 120 });
    expect(JSON.parse(values.get('environment:refresh-job') ?? '{}')).toMatchObject({
      jobId: 'job-current',
      lists: {
        singles: { updatedAt: '2026-06-14 00:20:00' },
        doubles: { updatedAt: '2026-06-14 00:20:00' },
      },
    });
    expect(scheduled).toEqual(['job-current']);
  });

  it('dispatches chained steps through the SELF service binding with refresh authorization', async () => {
    const { env, values } = createKvEnv();
    const fetcher = createRefreshFetcher();
    const startedAt = new Date(Date.now() - 11 * 60 * 1000);
    await startRefreshJob(env, () => undefined, {
      fetcher,
      now: () => startedAt,
      createJobId: () => 'job-self-binding',
    });
    values.set('environment:status', JSON.stringify({
      ok: false,
      failedAt: new Date(startedAt.getTime() + 60 * 1000).toISOString(),
      error: 'previous chain stopped',
    }));
    const selfFetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    Object.assign(env as object, { SELF: { fetch: selfFetch } });
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    };

    const response = await worker.fetch(
      new Request('https://luxraykit.com/api/environment/refresh', {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
      }),
      env,
      ctx as never,
    );
    await Promise.all(pending);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ state: 'resumed', jobId: 'job-self-binding' });
    expect(selfFetch).toHaveBeenCalledOnce();
    const chainedRequest = selfFetch.mock.calls[0][0] as Request;
    expect(chainedRequest.url).toBe(
      'https://worker.example.com/api/environment/refresh?step=1&jobId=job-self-binding',
    );
    expect(chainedRequest.headers.get('authorization')).toBe('Bearer secret');
  });

  it('finishes an internal STEP before responding and schedules the next invocation through waitUntil', async () => {
    const { env, values } = createKvEnv({}, {
      POKEDB_DETAIL_LIMIT: '1',
      POKEDB_DETAIL_CHUNK_SIZE: '1',
    });
    const fetcher = createRefreshFetcher();
    await startRefreshJob(env, () => undefined, {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'job-background-step',
    });
    const selfFetch = vi.fn(async () => new Response('{"ok":true}', { status: 202 }));
    Object.assign(env as object, { SELF: { fetch: selfFetch } });
    vi.stubGlobal('fetch', fetcher);
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    };

    try {
      const response = await worker.fetch(
        new Request(
          'https://worker.example.com/api/environment/refresh?step=1&jobId=job-background-step',
          {
            method: 'POST',
            headers: { authorization: 'Bearer secret' },
          },
        ),
        env,
        ctx as never,
      );

      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({
        state: 'collecting',
        jobId: 'job-background-step',
        pendingCount: 1,
      });
      expect(pending).toHaveLength(1);
      await Promise.all(pending);
      expect(JSON.parse(values.get('environment:refresh-job') ?? '{}')).toMatchObject({
        jobId: 'job-background-step',
        pending: [expect.objectContaining({ battleType: 'doubles' })],
        stepCount: 1,
      });
      expect(selfFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('registers the first chained step before the scheduled handler returns', async () => {
    const startedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const staleJob = {
      jobId: 'job-scheduled-resume',
      season: 2,
      detailLimit: 1,
      startedAt,
      updatedAt: startedAt,
      stepCount: 0,
      phase: 'collecting',
      lists: {},
      pending: [{ battleType: 'singles', pokeDbKey: '0445-00', pokemonId: 'garchomp', rank: 1 }],
      details: { singles: {}, doubles: {} },
    };
    const { env } = createKvEnv({
      'environment:refresh-job': JSON.stringify(staleJob),
    });
    const selfFetch = vi.fn(async () => new Response('{"ok":true}', { status: 202 }));
    Object.assign(env as object, { SELF: { fetch: selfFetch } });
    const pending: Promise<unknown>[] = [];
    let handlerActive = true;
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => {
        if (!handlerActive) throw new Error('waitUntil called after scheduled handler returned');
        pending.push(promise);
      },
    };

    await worker.scheduled(
      { cron: '17 18 * * *', scheduledTime: Date.parse('2026-06-14T18:17:00.000Z') } as never,
      env,
      ctx as never,
    );
    handlerActive = false;
    await Promise.all(pending);

    expect(pending).toHaveLength(1);
    expect(selfFetch).toHaveBeenCalledOnce();
  });

  it('keeps the live snapshot and cursor when a detail chunk fails', async () => {
    const failingKey = rankingKeys[1];
    const { env, values } = createKvEnv({
      'environment:latest': '{"snapshot":"old"}',
      'environment:team-index': '{"index":"old"}',
      'environment:status': JSON.stringify({
        ok: true,
        refreshedAt: '2026-06-10T00:00:00.000Z',
        selectedSeason: 1,
        selectedSeasonLabel: 'M-1',
      }),
    }, { POKEDB_DETAIL_CHUNK_SIZE: '3' });
    const fetcher = createRefreshFetcher({ failDetailKey: failingKey });
    await startRefreshJob(env, () => undefined, {
      fetcher,
      now: () => new Date('2026-06-12T00:00:00.000Z'),
      createJobId: () => 'job-failure',
    });
    const cursorBefore = values.get('environment:refresh-job');

    await expect(runRefreshJobStep(env, 'job-failure', () => undefined, {
      fetcher,
      wait: async () => undefined,
      now: () => new Date('2026-06-12T00:01:00.000Z'),
    })).rejects.toThrow(failingKey);

    expect(values.get('environment:latest')).toBe('{"snapshot":"old"}');
    expect(values.get('environment:team-index')).toBe('{"index":"old"}');
    expect(values.get('environment:refresh-job')).toBe(cursorBefore);
    expect(JSON.parse(values.get('environment:status') ?? '{}')).toMatchObject({
      ok: false,
      refreshedAt: '2026-06-10T00:00:00.000Z',
      selectedSeason: 1,
      selectedSeasonLabel: 'M-1',
      failedAt: '2026-06-12T00:01:00.000Z',
    });
  });

});
