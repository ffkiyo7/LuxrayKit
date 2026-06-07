import { describe, expect, it, vi } from 'vitest';
import singleRankedTeams from './external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from './external/pokedb/s1_double_ranked_teams.json';
import moveStats from './external/pokedb/s1_move_stats.json';
import teamSamples from './external/pokedb/s1_team_samples.json';
import {
  POKEDB_ENVIRONMENT_SNAPSHOT_URL,
  WORKER_ENVIRONMENT_SNAPSHOT_URL,
  createEnvironmentStateFromPokeDbSnapshot,
  loadEnvironmentState,
} from './environment';

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
  it('builds the PokeDB environment state from an external snapshot payload', () => {
    const state = createEnvironmentStateFromPokeDbSnapshot(pokedbSnapshot);

    expect(state.auditIssues).toEqual([]);
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
    const fetcher = vi.fn(async () => new Response(JSON.stringify(pokedbSnapshot), { status: 200 }));

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenCalledWith(WORKER_ENVIRONMENT_SNAPSHOT_URL, expect.objectContaining({ cache: 'no-store' }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.sourceLabel).toContain('PokeDB');
    expect(state.loadStatus).toBe('pokedb');
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

    expect(fetcher).toHaveBeenNthCalledWith(1, WORKER_ENVIRONMENT_SNAPSHOT_URL, expect.objectContaining({ cache: 'no-store' }));
    expect(fetcher).toHaveBeenNthCalledWith(2, POKEDB_ENVIRONMENT_SNAPSHOT_URL, expect.objectContaining({ cache: 'force-cache' }));
    expect(state.sourceLabel).toContain('PokeDB');
    expect(state.loadStatus).toBe('pokedb');
  });

  it('falls back to the development environment seed when the snapshot cannot load', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(1, WORKER_ENVIRONMENT_SNAPSHOT_URL, expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, POKEDB_ENVIRONMENT_SNAPSHOT_URL, expect.any(Object));
    expect(state.loadStatus).toBe('fallback');
    expect(state.sourceLabel).not.toContain('PokeDB');
  });
});
