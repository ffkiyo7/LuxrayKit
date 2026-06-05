import singleRankedTeams from './external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from './external/pokedb/s1_double_ranked_teams.json';
import { pokedbItemNameToId } from './external/pokedbItemNameMap';
import { currentDataVersion, currentRuleSet, items, pokemon, regMaPokemonAllowlist } from './seed/regMA';
import { buildEnvironmentDatasetFromPokeDbOpenData, createPokeDbPokemonKeyMap, type PokeDbRankedTeamsPayload } from '../lib/pokedbEnvironment';
import type { EnvironmentTeamSample } from '../lib/environmentDataset';

const pokemonKeyToId = createPokeDbPokemonKeyMap(regMaPokemonAllowlist, pokemon);

const pokedbTeamSamples: EnvironmentTeamSample[] = [
  {
    id: 'pokedb-singles-rank-1',
    dataKind: 'external-snapshot',
    author: 'フリあげ♭',
    score: 2815,
    title: 'フリあげ♭ · 2815 · 路卡利欧 / 花叶蒂',
    battleType: 'singles',
    reportUrl: 'https://pokesol.app/u/sakku_poke/articles/3acb7549b77f18d7',
    slots: [
      { pokemonId: 'lucario', itemId: 'lucarionite', moveIds: [] },
      { pokemonId: 'floette', itemId: 'floettite', moveIds: [] },
      { pokemonId: 'rotom-wash', itemId: 'leftovers', moveIds: [] },
      { pokemonId: 'volcarona', itemId: 'lum-berry', moveIds: [] },
      { pokemonId: 'meowscarada', itemId: 'choice-scarf', moveIds: [] },
      { pokemonId: 'garchomp', itemId: 'sitrus-berry', moveIds: [] },
    ],
  },
  {
    id: 'pokedb-doubles-rank-1',
    dataKind: 'external-snapshot',
    author: 'すいか',
    score: 2724,
    title: 'すいか · 2724 · 喷火龙 / 风妖精',
    battleType: 'doubles',
    reportUrl: 'https://x.com/mihono_suica/status/2054478796812943367?s=20',
    slots: [
      { pokemonId: 'charizard', itemId: 'charizardite-y', moveIds: [] },
      { pokemonId: 'whimsicott', itemId: 'fairy-feather', moveIds: [] },
      { pokemonId: 'kingambit', itemId: 'chople-berry', moveIds: [] },
      { pokemonId: 'basculegion-male', itemId: 'mystic-water', moveIds: [] },
      { pokemonId: 'garchomp', itemId: 'sitrus-berry', moveIds: [] },
      { pokemonId: 'glimmora', itemId: 'focus-sash', moveIds: [] },
    ],
  },
];

export const pokedbRegMAEnvironmentDataset = buildEnvironmentDatasetFromPokeDbOpenData({
  id: 'pokedb-reg-ma-s1-ranked-teams',
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  retrievedAt: '2026-06-05T03:44:11.814Z',
  pokemonKeyToId,
  itemNameToId: pokedbItemNameToId,
  itemIds: items.map((item) => item.id),
  battles: {
    singles: singleRankedTeams as PokeDbRankedTeamsPayload,
    doubles: doubleRankedTeams as PokeDbRankedTeamsPayload,
  },
  teamSamples: {
    singles: pokedbTeamSamples.filter((sample) => sample.battleType === 'singles'),
    doubles: pokedbTeamSamples.filter((sample) => sample.battleType === 'doubles'),
  },
});
