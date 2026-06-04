import { currentDataVersion, currentRuleSet, items, moves, pokemon } from './seed/regMA';

export type EnvironmentBattleType = 'singles' | 'doubles';

export type EnvironmentPokemonUsage = {
  pokemonId: string;
  usageRate: number;
  teamCount: number;
  moveIds: string[];
  itemIds: string[];
  teammateIds: string[];
};

export type EnvironmentTeamSlot = {
  pokemonId: string;
  itemId?: string;
  moveIds: string[];
};

export type EnvironmentTeamSample = {
  id: string;
  dataKind: 'development-sample';
  author: string;
  score: number;
  title: string;
  battleType: EnvironmentBattleType;
  reportUrl: string;
  slots: EnvironmentTeamSlot[];
};

export const environmentUpdatedAt = '2026-05-27T10:00:00.000+08:00';
export const environmentDataStatusLabel = '开发样例数据';

export const environmentPokemonUsage: Record<EnvironmentBattleType, EnvironmentPokemonUsage[]> = {
  singles: [
    {
      pokemonId: 'charizard',
      usageRate: 34.8,
      teamCount: 184,
      moveIds: ['flare-blitz', 'dragon-claw', 'earthquake', 'protect', 'heat-wave', 'air-slash'],
      itemIds: ['charizardite-x', 'charizardite-y'],
      teammateIds: ['garchomp', 'gardevoir', 'feraligatr', 'incineroar', 'ceruledge', 'armarouge', 'sableye'],
    },
    {
      pokemonId: 'garchomp',
      usageRate: 29.1,
      teamCount: 154,
      moveIds: ['earthquake', 'dragon-claw', 'protect', 'rock-slide', 'swords-dance'],
      itemIds: ['garchompite', 'life-orb', 'choice-scarf'],
      teammateIds: ['charizard', 'incineroar', 'gardevoir', 'rotom-wash', 'milotic', 'sableye', 'ceruledge'],
    },
    {
      pokemonId: 'gardevoir',
      usageRate: 24.6,
      teamCount: 130,
      moveIds: ['protect', 'psychic', 'moonblast', 'trick-room'],
      itemIds: ['gardevoirite', 'sitrus-berry'],
      teammateIds: ['charizard', 'garchomp', 'incineroar', 'milotic', 'armarouge', 'sableye', 'feraligatr'],
    },
    {
      pokemonId: 'incineroar',
      usageRate: 21.4,
      teamCount: 113,
      moveIds: ['flare-blitz', 'protect', 'darkest-lariat', 'fake-out'],
      itemIds: ['sitrus-berry', 'choice-band'],
      teammateIds: ['garchomp', 'charizard', 'gardevoir', 'milotic', 'rotom-wash', 'armarouge', 'ceruledge'],
    },
  ],
  doubles: [
    {
      pokemonId: 'incineroar',
      usageRate: 41.2,
      teamCount: 218,
      moveIds: ['fake-out', 'flare-blitz', 'darkest-lariat', 'protect', 'parting-shot'],
      itemIds: ['sitrus-berry', 'assault-vest'],
      teammateIds: ['gardevoir', 'garchomp', 'charizard', 'milotic', 'rotom-wash', 'armarouge', 'ceruledge'],
    },
    {
      pokemonId: 'garchomp',
      usageRate: 32.7,
      teamCount: 173,
      moveIds: ['earthquake', 'protect', 'dragon-claw', 'rock-slide'],
      itemIds: ['garchompite', 'life-orb', 'choice-scarf'],
      teammateIds: ['incineroar', 'gardevoir', 'charizard', 'milotic', 'rotom-wash', 'sableye', 'armarouge'],
    },
    {
      pokemonId: 'gardevoir',
      usageRate: 28.4,
      teamCount: 151,
      moveIds: ['protect', 'moonblast', 'psychic', 'trick-room'],
      itemIds: ['gardevoirite', 'sitrus-berry'],
      teammateIds: ['incineroar', 'garchomp', 'charizard', 'armarouge', 'sableye', 'milotic', 'feraligatr'],
    },
    {
      pokemonId: 'charizard',
      usageRate: 25.9,
      teamCount: 137,
      moveIds: ['heat-wave', 'protect', 'air-slash', 'dragon-claw', 'flare-blitz'],
      itemIds: ['charizardite-y', 'charizardite-x'],
      teammateIds: ['incineroar', 'garchomp', 'gardevoir', 'milotic', 'sableye', 'armarouge', 'rotom-wash'],
    },
  ],
};

export const environmentTeamSamples: EnvironmentTeamSample[] = [
  {
    id: 'sample-sun-charizard',
    dataKind: 'development-sample',
    author: '作者名',
    score: 2724,
    title: '喷火龙核心',
    battleType: 'singles',
    reportUrl: 'https://champs.pokedb.tokyo/',
    slots: [
      { pokemonId: 'charizard', itemId: 'charizardite-x', moveIds: ['flare-blitz', 'dragon-claw', 'earthquake', 'protect'] },
      { pokemonId: 'gardevoir', itemId: 'gardevoirite', moveIds: ['moonblast', 'psychic', 'protect', 'trick-room'] },
      { pokemonId: 'garchomp', itemId: 'garchompite', moveIds: ['earthquake', 'dragon-claw', 'protect', 'rock-slide'] },
      { pokemonId: 'incineroar', itemId: 'sitrus-berry', moveIds: ['fake-out', 'flare-blitz', 'darkest-lariat', 'protect'] },
      { pokemonId: 'milotic', itemId: 'sitrus-berry', moveIds: ['hydro-pump', 'icy-wind', 'protect'] },
      { pokemonId: 'ceruledge', itemId: 'life-orb', moveIds: ['flare-blitz', 'dragon-claw', 'protect'] },
    ],
  },
  {
    id: 'sample-balance-garchomp',
    dataKind: 'development-sample',
    author: '高分玩家',
    score: 2651,
    title: '烈咬陆鲨平衡',
    battleType: 'doubles',
    reportUrl: 'https://champs.pokedb.tokyo/',
    slots: [
      { pokemonId: 'garchomp', itemId: 'garchompite', moveIds: ['earthquake', 'dragon-claw', 'protect', 'rock-slide'] },
      { pokemonId: 'incineroar', itemId: 'sitrus-berry', moveIds: ['fake-out', 'flare-blitz', 'darkest-lariat', 'protect'] },
      { pokemonId: 'gardevoir', itemId: 'gardevoirite', moveIds: ['moonblast', 'psychic', 'protect', 'trick-room'] },
      { pokemonId: 'rotom-wash', itemId: 'sitrus-berry', moveIds: ['hydro-pump', 'protect'] },
      { pokemonId: 'sableye', itemId: 'sitrus-berry', moveIds: ['protect', 'icy-wind'] },
      { pokemonId: 'armarouge', itemId: 'life-orb', moveIds: ['psychic', 'protect'] },
    ],
  },
];

export const getEnvironmentPokemon = (pokemonId: string) => pokemon.find((entry) => entry.id === pokemonId);
export const getEnvironmentMove = (moveId: string) => moves.find((entry) => entry.id === moveId);
export const getEnvironmentItem = (itemId: string) => items.find((entry) => entry.id === itemId);

export const environmentSourceLabel = `${currentRuleSet.name} · ${currentDataVersion.versionName} · 开发预览`;
