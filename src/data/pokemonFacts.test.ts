import { describe, expect, it } from 'vitest';
import { currentRuleSet, pokemon } from './seed/regMA';
import { createDailyFactSequence, pokemonFacts } from './pokemonFacts';

describe('pokemonFacts', () => {
  it('only exposes sourced facts for current-rule Pokemon', () => {
    const legalPokemonIds = new Set(pokemon.filter((entry) => entry.legalInCurrentRule).map((entry) => entry.id));
    expect(pokemonFacts.length).toBeGreaterThanOrEqual(80);
    expect(new Set(pokemonFacts.map((fact) => fact.id)).size).toBe(pokemonFacts.length);

    pokemonFacts.forEach((fact) => {
      expect(legalPokemonIds.has(fact.pokemonId), `${fact.id} should be legal in ${currentRuleSet.id}`).toBe(true);
      expect(fact.text.length).toBeGreaterThanOrEqual(18);
      expect(fact.text.length).toBeLessThanOrEqual(48);
      expect(fact.text).not.toMatch(/\s/u);
      expect(fact.sourceLabel).toBeTruthy();
      expect(fact.sourceUrl).toMatch(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon-species\/\d+\/$/);
      expect(fact.iconRef).toBeTruthy();
    });
  });

  it('creates a stable daily sequence without duplicates', () => {
    const first = createDailyFactSequence(pokemonFacts, '2026-07-28');
    const second = createDailyFactSequence(pokemonFacts, '2026-07-28');
    expect(first.map((fact) => fact.id)).toEqual(second.map((fact) => fact.id));
    expect(new Set(first.map((fact) => fact.id)).size).toBe(first.length);
  });
});
