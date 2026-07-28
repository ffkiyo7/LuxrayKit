import pokemonFactSnapshot from './external/pokeapi/pokemon_facts.json';
import { currentRuleSet, pokemon } from './seed/regMA';
import type { Pokemon } from '../types';

export type PokemonFact = {
  id: string;
  pokemonId: string;
  nationalDexNo: number;
  chineseName: string;
  iconRef: string;
  text: string;
  sourceLabel: string;
  sourceUrl: string;
};

type PokemonFactSnapshot = {
  ruleSetId: string;
  source: string;
  facts: Array<{
    nationalDexNo: number;
    text: string;
    sourceLabel: string;
    sourceUrl: string;
    sourceVersion: string;
    interestScore: number;
  }>;
};

function createPokedexFacts(legalPokemon: Pokemon[]) {
  const entryByDexNo = new Map<number, Pokemon>();
  legalPokemon.forEach((entry) => {
    const current = entryByDexNo.get(entry.nationalDexNo);
    const usesBaseSpeciesArtwork = entry.iconRef.endsWith(`/thumbs/${entry.nationalDexNo}.png`);
    if (!current || usesBaseSpeciesArtwork) entryByDexNo.set(entry.nationalDexNo, entry);
  });
  const snapshot = pokemonFactSnapshot as PokemonFactSnapshot;
  if (snapshot.ruleSetId !== currentRuleSet.id) return [];

  return snapshot.facts.flatMap((fact) => {
    const entry = entryByDexNo.get(fact.nationalDexNo);
    if (!entry) return [];
    return [{
      id: `pokedex-${fact.nationalDexNo}-${fact.sourceVersion}`,
      pokemonId: entry.id,
      nationalDexNo: entry.nationalDexNo,
      chineseName: entry.chineseName,
      iconRef: entry.iconRef,
      text: fact.text,
      sourceLabel: fact.sourceLabel,
      sourceUrl: fact.sourceUrl,
    }];
  });
}

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: number) => {
  let state = seed || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export function createDailyFactSequence(facts: PokemonFact[], dateKey: string) {
  const shuffled = [...facts];
  const random = seededRandom(hashString(`${currentRuleSet.id}:${dateKey}`));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

const legalPokemon = pokemon.filter((entry) => entry.legalInCurrentRule);

export const pokemonFacts: PokemonFact[] = [
  ...createPokedexFacts(legalPokemon),
];
