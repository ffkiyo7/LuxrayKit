import { describe, expect, it } from 'vitest';
import type { PokemonType } from '../types';
import { attackingTypes, defensiveMatchupMultiplier } from './calculations';
import { defenseBuckets, defensiveProfile, offensiveProfile, representativeSpecies } from './typeChart';

describe('type chart profiles', () => {
  it('keeps every defensive profile as the transpose of the production attack table', () => {
    for (const defender of attackingTypes) {
      const profile = defensiveProfile(defender);
      for (const attacker of attackingTypes) {
        const multiplier = defensiveMatchupMultiplier(attacker, [defender]);
        expect(profile.weakTo.includes(attacker)).toBe(multiplier === 2);
        expect(profile.resistedBy.includes(attacker)).toBe(multiplier === 0.5);
        expect(profile.immuneTo.includes(attacker)).toBe(multiplier === 0);
      }
    }
  });

  it('returns the expected fire, normal and psychic relationships', () => {
    expect(offensiveProfile('Fire').superEffective).toEqual(['Grass', 'Ice', 'Bug', 'Steel']);
    expect(defensiveProfile('Fire').weakTo).toEqual(['Water', 'Ground', 'Rock']);

    expect(offensiveProfile('Normal').superEffective).toEqual([]);
    expect(defensiveProfile('Normal').resistedBy).toEqual([]);
    expect(offensiveProfile('Normal').noEffect).toEqual(['Ghost']);
    expect(defensiveProfile('Normal').immuneTo).toEqual(['Ghost']);

    expect(offensiveProfile('Psychic').noEffect).toEqual(['Dark']);
  });
});

describe('defenseBuckets', () => {
  it('folds a dual type into multiplier groups, strongest hit first, dropping ×1', () => {
    expect(defenseBuckets(['Dragon', 'Flying'])).toEqual([
      { multiplier: 4, types: ['Ice'] },
      { multiplier: 2, types: ['Rock', 'Dragon', 'Fairy'] },
      { multiplier: 0.5, types: ['Fire', 'Water', 'Fighting', 'Bug'] },
      { multiplier: 0.25, types: ['Grass'] },
      { multiplier: 0, types: ['Ground'] },
    ]);
  });

  it('matches the single-type profile when only one type is given', () => {
    const buckets = defenseBuckets(['Normal']);
    expect(buckets).toEqual([
      { multiplier: 2, types: ['Fighting'] },
      { multiplier: 0, types: ['Ghost'] },
    ]);
  });
});

describe('representativeSpecies', () => {
  const species = (id: string, nationalDexNo: number, types: PokemonType[]) => ({ id, nationalDexNo, types });
  const candidates = [
    species('salamence', 373, ['Dragon', 'Flying']),
    species('dragonite', 149, ['Dragon', 'Flying']),
    species('pikachu', 25, ['Electric']),
  ];

  it('prefers the best environment rank over the dex number', () => {
    const ranks: Record<string, number> = { salamence: 3 };
    expect(representativeSpecies(candidates, ['Flying', 'Dragon'], (entry) => ranks[entry.id] ?? null)?.id).toBe('salamence');
  });

  it('falls back to the lowest dex number when nothing in the combination is ranked', () => {
    expect(representativeSpecies(candidates, ['Dragon', 'Flying'], () => null)?.id).toBe('dragonite');
  });

  it('returns null when no species carries the combination', () => {
    expect(representativeSpecies(candidates, ['Dragon', 'Ice'], () => null)).toBeNull();
  });
});
