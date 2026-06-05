import { describe, expect, it, vi } from 'vitest';
import singleRankedTeams from './external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from './external/pokedb/s1_double_ranked_teams.json';
import moveStats from './external/pokedb/s1_move_stats.json';
import teamSamples from './external/pokedb/s1_team_samples.json';
import {
  POKEDB_ENVIRONMENT_SNAPSHOT_URL,
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
    expect(state.teamSamples.filter((sample) => sample.battleType === 'singles')).toHaveLength(8);
    expect(state.teamSamples.filter((sample) => sample.battleType === 'doubles')).toHaveLength(8);
  });

  it('loads the PokeDB environment from the standalone cached JSON resource', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(pokedbSnapshot), { status: 200 }));

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenCalledWith(POKEDB_ENVIRONMENT_SNAPSHOT_URL, expect.objectContaining({ cache: 'force-cache' }));
    expect(state.sourceLabel).toContain('PokeDB');
    expect(state.loadStatus).toBe('pokedb');
  });

  it('falls back to the development environment seed when the snapshot cannot load', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });

    const state = await loadEnvironmentState(fetcher);

    expect(fetcher).toHaveBeenCalledWith(POKEDB_ENVIRONMENT_SNAPSHOT_URL, expect.any(Object));
    expect(state.loadStatus).toBe('fallback');
    expect(state.sourceLabel).not.toContain('PokeDB');
  });
});
