import singleRankedTeams from './external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from './external/pokedb/s1_double_ranked_teams.json';
import moveStats from './external/pokedb/s1_move_stats.json';
import teamSamples from './external/pokedb/s1_team_samples.json';
import { pokedbItemNameToId } from './external/pokedbItemNameMap';
import { currentDataVersion, currentRuleSet, items, pokemon, regMaPokemonAllowlist } from './seed/regMA';
import { buildEnvironmentDatasetFromPokeDbOpenData, createPokeDbPokemonKeyMap, type PokeDbRankedTeamsPayload } from '../lib/pokedbEnvironment';
import type { EnvironmentBattleType, EnvironmentReferenceUsage, EnvironmentTeamSample } from '../lib/environmentDataset';

const pokemonKeyToId = createPokeDbPokemonKeyMap(regMaPokemonAllowlist, pokemon);

export const pokedbRegMAEnvironmentDataset = buildEnvironmentDatasetFromPokeDbOpenData({
  id: 'pokedb-reg-ma-s1-ranked-teams',
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  retrievedAt: '2026-06-05T06:34:02.661Z',
  pokemonKeyToId,
  itemNameToId: pokedbItemNameToId,
  itemIds: items.map((item) => item.id),
  battles: {
    singles: singleRankedTeams as PokeDbRankedTeamsPayload,
    doubles: doubleRankedTeams as PokeDbRankedTeamsPayload,
  },
  moveStats: moveStats as Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>,
  teamSamples: teamSamples as Record<EnvironmentBattleType, EnvironmentTeamSample[]>,
});
