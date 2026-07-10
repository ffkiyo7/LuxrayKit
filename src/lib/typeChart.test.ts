import { describe, expect, it } from 'vitest';
import { attackingTypes, defensiveMatchupMultiplier } from './calculations';
import { defensiveProfile, offensiveProfile } from './typeChart';

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
