import type { PokemonType } from '../types';
import { attackingTypes, typeMatchups } from './calculations';

export type OffensiveProfile = {
  superEffective: PokemonType[];
  notVery: PokemonType[];
  noEffect: PokemonType[];
};

export type DefensiveProfile = {
  weakTo: PokemonType[];
  resistedBy: PokemonType[];
  immuneTo: PokemonType[];
};

const inTypeOrder = (types: PokemonType[]) => attackingTypes.filter((type) => types.includes(type));

export const offensiveProfile = (type: PokemonType): OffensiveProfile => {
  const matchup = typeMatchups[type];
  return {
    superEffective: inTypeOrder(matchup.strong ?? []),
    notVery: inTypeOrder(matchup.resisted ?? []),
    noEffect: inTypeOrder(matchup.immune ?? []),
  };
};

export const defensiveProfile = (type: PokemonType): DefensiveProfile => ({
  weakTo: attackingTypes.filter((attacker) => typeMatchups[attacker].strong?.includes(type)),
  resistedBy: attackingTypes.filter((attacker) => typeMatchups[attacker].resisted?.includes(type)),
  immuneTo: attackingTypes.filter((attacker) => typeMatchups[attacker].immune?.includes(type)),
});
