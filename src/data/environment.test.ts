import { afterEach, describe, expect, it, vi } from 'vitest';
import singleRankedTeams from './external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from './external/pokedb/s1_double_ranked_teams.json';
import moveStats from './external/pokedb/s1_move_stats.json';
import teamSamples from './external/pokedb/s1_team_samples.json';
import vgcPastesTeamSamples from './external/vgcpastes/reg_ma_champions_ma_team_samples.json';
import {
  POKEDB_ENVIRONMENT_SNAPSHOT_URL,
  WORKER_ENVIRONMENT_SNAPSHOT_URL,
  createEnvironmentStateFromPokeDbSnapshot,
  loadEnvironmentState,
} from './environment';
import type { EnvironmentTeamSample } from './environment';
import { sampleRegulation } from '../pages/environmentTeamSamples';

const pokedbSnapshot = {
  retrievedAt: '2026-06-05T06:34:02.661Z',
  battles: {
    singles: singleRankedTeams,
    doubles: doubleRankedTeams,
  },
  moveStats,
  teamSamples,
};

describe('environment runtime loading', () => {
  afterEach(() => {
    vi.doUnmock('./external/vgcpastes/reg_ma_champions_ma_team_samples.json');
    vi.restoreAllMocks();
  });

  it('builds the PokeDB environment state from an external snapshot payload', () => {
    const state = createEnvironmentStateFromPokeDbSnapshot(pokedbSnapshot);

    expect(state.auditIssues).toEqual([]);
    expect(state.overallUsageBasis).toBe('absolute');
    expect(state.sourceLabel).toContain('PokeDB');
    expect(state.pokemonUsage.singles.length).toBeGreaterThanOrEqual(20);
    expect(state.pokemonUsage.doubles[0]).toMatchObject({ pokemonId: 'basculegion-male' });
    expect(state.sampleTeamCounts).toEqual({ singles: 528, doubles: 71 });
    expect(state.teamSamples.filter((sample) => sample.battleType === 'singles').length).toBeGreaterThanOrEqual(16);
    expect(state.teamSamples.filter((sample) => sample.battleType === 'doubles').length).toBeGreaterThanOrEqual(16);
    expect(state.teamSamples.find((sample) => sample.id === 'pokedb-singles-rank-1')).toMatchObject({
      season: 'M-1',
      rank: 1,
      score: 2815,
      title: 'M-1 · 最高第 1 名 · 2815 分',
    });
  });

  it('loads the PokeDB environment from the Worker API when available', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(pokedbSnapshot), {
        status: 200,
        headers: { 'x-luxray-cache-state': 'fresh' },
      }),
    );

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${WORKER_ENVIRONMENT_SNAPSHOT_URL.replace('/', '\\/')}\\?refresh=\\d+$`)),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.sourceLabel).toContain('PokeDB');
    expect(state.loadStatus).toBe('pokedb');
    expect(state.sourceKind).toBe('worker');
    expect(state.freshness).toBe('fresh');
    expect(state.seasonLabel).toBe('M-1');
    expect(state.updatedAt).toBe(pokedbSnapshot.retrievedAt);
    expect(state.sourceUpdatedAt).toBe('2026-06-04T23:08:02.000+09:00');
    const vgcPastesSamples = state.teamSamples.filter((sample) => sample.sourceId === 'vgcpastes-champions-ma');
    expect(vgcPastesSamples).toHaveLength(vgcPastesTeamSamples.length);
    expect(vgcPastesSamples).toHaveLength(99);
    expect(vgcPastesSamples[0].title).toBe((vgcPastesTeamSamples as typeof vgcPastesSamples)[0].title);
    expect(vgcPastesSamples[0].title).not.toContain('分');
    expect(vgcPastesSamples.find((sample) => sample.replicaCode)).toMatchObject({
      hasMoves: true,
      hasSpread: true,
      replicaCode: expect.any(String),
    });
  });

  it('keeps PokeDB environment data when the VGCPastes enrichment chunk cannot load', async () => {
    vi.resetModules();
    vi.doMock('./external/vgcpastes/reg_ma_champions_ma_team_samples.json', () => {
      throw new Error('chunk missing');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { loadEnvironmentState: loadIsolatedEnvironmentState } = await import('./environment');
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(pokedbSnapshot), {
        status: 200,
        headers: { 'x-luxray-cache-state': 'fresh' },
      }),
    );

    const state = await loadIsolatedEnvironmentState(fetcher);

    expect(state.loadStatus).toBe('pokedb');
    expect(state.sourceKind).toBe('worker');
    expect(state.teamSamples.filter((sample) => sample.sourceId === 'vgcpastes-champions-ma')).toHaveLength(0);
    expect(state.teamSamples.filter((sample) => sample.battleType === 'singles').length).toBeGreaterThan(0);
    // Each regulation's chunk loads independently, so a failed M-A chunk must not take the
    // M-B teams (or PokeDB data) down with it.
    expect(state.teamSamples.filter((sample) => sample.sourceId === 'vgcpastes-champions-mb').length).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to load VGCPastes M-A team samples; continuing without them.',
      expect.any(Error),
    );
  });


  it('marks a stale Worker response as stale', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(pokedbSnapshot), {
        status: 200,
        headers: { 'x-luxray-cache-state': 'stale' },
      }),
    );

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.sourceKind).toBe('worker');
    expect(state.freshness).toBe('stale');
  });

  it('prefers a newer static snapshot when the Worker is stale and degraded', async () => {
    const newerStaticSnapshot = {
      ...pokedbSnapshot,
      retrievedAt: '2026-06-06T06:34:02.661Z',
      battles: {
        singles: { ...singleRankedTeams, updated_at: '2026-06-05 23:08:02' },
        doubles: { ...doubleRankedTeams, updated_at: '2026-06-05 23:08:02' },
      },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(pokedbSnapshot), {
        status: 200,
        headers: {
          'x-luxray-cache-state': 'stale',
          'x-luxray-source-status': 'degraded',
          'x-luxray-latest-source-updated-at': '2026-06-05 23:08:02',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(newerStaticSnapshot), { status: 200 }));

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      POKEDB_ENVIRONMENT_SNAPSHOT_URL,
      expect.objectContaining({ cache: 'force-cache' }),
    );
    expect(state.sourceKind).toBe('static');
    expect(state.sourceStatus).toBe('ok');
    expect(state.freshness).toBe('fresh');
    expect(state.updatedAt).toBe(newerStaticSnapshot.retrievedAt);
    expect(state.sourceUpdatedAt).toBe('2026-06-05T23:08:02.000+09:00');
  });

  it('loads the current-season Pokemon statistics snapshot format with move details', () => {
    const battle = {
      season: 'M-2',
      seasonNumber: 2,
      rule: 'singles' as const,
      updatedAt: '2026-06-10 23:58:00',
      sourceUrl: 'https://champs.pokedb.tokyo/pokemon/list?season=2&rule=0',
      resultCount: 213,
      detailCount: 1,
      pokemonUsage: [{
        pokemonId: 'garchomp',
        usageRate: 100,
        teamCount: 213,
        moveIds: ['earthquake'],
        itemIds: ['focus-sash'],
        teammateIds: ['archaludon'],
        abilityIds: ['rough-skin'],
        natureIds: ['爽朗'],
        moveStats: [{ id: 'earthquake', usageRate: 99.2, teamCount: 211 }],
        itemStats: [{ id: 'focus-sash', usageRate: 37.7, teamCount: 80 }],
        teammateStats: [{ id: 'archaludon', usageRate: 100, teamCount: 213 }],
        abilityStats: [{ id: 'rough-skin', usageRate: 99.4, teamCount: 212 }],
        natureStats: [{ id: '爽朗', usageRate: 51.4, teamCount: 109 }],
      }],
      audit: {
        unknownPokemonKeys: [],
        unknownItemNames: [],
        unknownMoveKeys: [],
        unknownAbilityKeys: [],
        unknownNatureNames: [],
        failedDetailKeys: [],
      },
    };

    const state = createEnvironmentStateFromPokeDbSnapshot({
      retrievedAt: '2026-06-11T09:00:00.000Z',
      battles: {
        singles: battle,
        doubles: { ...battle, rule: 'doubles', sourceUrl: 'https://champs.pokedb.tokyo/pokemon/list?season=2&rule=1' },
      },
      teamSamples: { singles: [], doubles: [] },
    });

    expect(state.loadStatus).toBe('pokedb');
    expect(state.overallUsageBasis).toBe('rank-relative');
    expect(state.sourceLabel).toContain('M-2');
    expect(state.seasonLabel).toBe('M-2');
    expect(state.sourceUpdatedAt).toBe('2026-06-10T23:58:00.000+09:00');
    expect(state.updatedAt).toBe('2026-06-11T09:00:00.000Z');
    expect(state.dataStatusLabel).toBe('当季聚合统计');
    expect(state.sampleTeamCounts).toEqual({ singles: 213, doubles: 213 });
    expect(state.pokemonUsage.singles[0]).toMatchObject({
      pokemonId: 'garchomp',
      moveStats: [{ id: 'earthquake', usageRate: 99.2 }],
      abilityStats: [{ id: 'rough-skin', usageRate: 99.4 }],
      natureStats: [{ id: '爽朗', usageRate: 51.4 }],
    });
  });

  it('keeps a previous-season snapshot only when it is the season directly before the live one', () => {
    const battle = (seasonNumber: number) => ({
      season: `M-${seasonNumber}`,
      seasonNumber,
      rule: 'singles' as const,
      updatedAt: '2026-08-05 23:58:00',
      sourceUrl: `https://champs.pokedb.tokyo/pokemon/list?season=${seasonNumber}&rule=0`,
      resultCount: 1,
      detailCount: 0,
      pokemonUsage: [
        { pokemonId: 'garchomp', usageRate: 100, teamCount: 1, moveIds: [], itemIds: [], teammateIds: [] },
      ],
      audit: {
        unknownPokemonKeys: [],
        unknownItemNames: [],
        unknownMoveKeys: [],
        unknownAbilityKeys: [],
        unknownNatureNames: [],
        failedDetailKeys: [],
      },
    });
    const snapshotFor = (liveSeason: number, previousSeasonNumber: number) => ({
      retrievedAt: '2026-08-06T09:00:00.000Z',
      battles: {
        singles: battle(liveSeason),
        doubles: { ...battle(liveSeason), rule: 'doubles' as const },
      },
      previousSeason: {
        season: `M-${previousSeasonNumber}`,
        seasonNumber: previousSeasonNumber,
        capturedAt: '2026-08-05T16:00:00.000Z',
        ranks: { singles: { garchomp: 3 }, doubles: { garchomp: 4 } },
      },
    });

    expect(createEnvironmentStateFromPokeDbSnapshot(snapshotFor(5, 4)).previousSeason).toMatchObject({
      season: 'M-4',
      ranks: { singles: { garchomp: 3 } },
    });
    // A gap (Worker was down across a rollover) would silently relabel the delta, so it is dropped.
    expect(createEnvironmentStateFromPokeDbSnapshot(snapshotFor(6, 4)).previousSeason).toBeUndefined();
    expect(createEnvironmentStateFromPokeDbSnapshot(snapshotFor(4, 4)).previousSeason).toBeUndefined();
  });

  it('tags a PokeDB high-score sample by its ladder season so M-3 teams read as M-B', () => {
    const battle = {
      season: 'M-3',
      seasonNumber: 3,
      rule: 'singles' as const,
      updatedAt: '2026-07-08 23:58:00',
      sourceUrl: 'https://champs.pokedb.tokyo/pokemon/list?season=3&rule=0',
      resultCount: 1,
      detailCount: 0,
      pokemonUsage: [
        { pokemonId: 'garchomp', usageRate: 100, teamCount: 1, moveIds: [], itemIds: [], teammateIds: [] },
      ],
      audit: {
        unknownPokemonKeys: [],
        unknownItemNames: [],
        unknownMoveKeys: [],
        unknownAbilityKeys: [],
        unknownNatureNames: [],
        failedDetailKeys: [],
      },
    };
    const m3Sample: EnvironmentTeamSample = {
      id: 'pokedb-singles-rank-1',
      dataKind: 'external-snapshot',
      author: 'ウィル',
      season: 'M-3',
      score: 2815,
      rank: 1,
      title: 'M-3 · 最高第 1 名 · 2815 分',
      battleType: 'singles',
      reportUrl: 'https://champs.pokedb.tokyo/trainer/show/example',
      slots: [{ pokemonId: 'garchomp', itemId: 'focus-sash', moveIds: [] }],
    };

    const state = createEnvironmentStateFromPokeDbSnapshot({
      retrievedAt: '2026-07-09T09:00:00.000Z',
      battles: {
        singles: battle,
        doubles: { ...battle, rule: 'doubles', sourceUrl: 'https://champs.pokedb.tokyo/pokemon/list?season=3&rule=1' },
      },
      teamSamples: { singles: [m3Sample], doubles: [] },
    });

    const sample = state.teamSamples.find((entry) => entry.id === 'pokedb-singles-rank-1');
    expect(sample?.season).toBe('M-3');
    // End-to-end: an M-3 high-score sample carries no explicit regulation but resolves to M-B,
    // so it surfaces under the M-B team-library filter.
    expect(sampleRegulation(sample!)).toBe('M-B');
  });

  it('creates visible team samples when the Worker snapshot only has ranked teams', () => {
    const state = createEnvironmentStateFromPokeDbSnapshot({
      retrievedAt: '2026-06-07T16:35:28.420Z',
      battles: {
        singles: singleRankedTeams,
        doubles: doubleRankedTeams,
      },
    });

    const singlesSamples = state.teamSamples.filter((sample) => sample.battleType === 'singles');
    const doublesSamples = state.teamSamples.filter((sample) => sample.battleType === 'doubles');

    expect(state.loadStatus).toBe('pokedb');
    expect(singlesSamples.length).toBeGreaterThan(0);
    expect(doublesSamples.length).toBeGreaterThan(0);
    expect(singlesSamples[0]).toMatchObject({
      id: 'pokedb-singles-rank-1',
      author: 'PokeDB Open Data',
      rank: 1,
      score: 2815,
      reportUrl: 'https://champs.pokedb.tokyo/guide/opendata',
    });
  });

  it('falls back to the standalone cached JSON resource when the Worker API is unavailable', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('not ready', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pokedbSnapshot), { status: 200 }));

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(new RegExp(`^${WORKER_ENVIRONMENT_SNAPSHOT_URL.replace('/', '\\/')}\\?refresh=\\d+$`)),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(2, POKEDB_ENVIRONMENT_SNAPSHOT_URL, expect.objectContaining({ cache: 'force-cache' }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.sourceLabel).toContain('PokeDB');
    expect(state.loadStatus).toBe('pokedb');
    expect(state.sourceKind).toBe('static');
    expect(state.freshness).toBe('stale');
    expect(state.seasonLabel).toBe('M-1');
    expect(state.teamSamples.filter((sample) => sample.sourceId === 'vgcpastes-champions-ma')).toHaveLength(99);
  });

  it('falls back to the development environment seed when the snapshot cannot load', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(new RegExp(`^${WORKER_ENVIRONMENT_SNAPSHOT_URL.replace('/', '\\/')}\\?refresh=\\d+$`)),
      expect.any(Object),
    );
    expect(fetcher).toHaveBeenNthCalledWith(2, POKEDB_ENVIRONMENT_SNAPSHOT_URL, expect.any(Object));
    expect(state.loadStatus).toBe('fallback');
    expect(state.sourceKind).toBe('seed');
    expect(state.freshness).toBe('stale');
    expect(state.seasonLabel).toBe('开发样例');
    expect(state.overallUsageBasis).toBe('absolute');
    expect(state.sourceLabel).not.toContain('PokeDB');
  });
});
