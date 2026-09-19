import { describe, expect, it } from 'vitest';
import { moves, pokemon } from '../data';
import { currentRuleMovesForPokemon } from './currentRuleCatalog';
import { buildTemporaryCalcConfig, computeDamage } from './damageAdapter';
import { DAMAGE_SAMPLE } from './toolSamples';

/**
 * The tools page prints `DAMAGE_SAMPLE` verbatim rather than running the calculator, so this is
 * the only thing keeping the sample honest: it runs the real adapter on exactly the setup the
 * comment claims (singles, no weather, 0 SP, neutral nature, no item) and compares.
 *
 * If this goes red, the data or the formula moved — update the constant, do not loosen the test.
 */
describe('tool page damage sample', () => {
  const entryFor = (id: string) => pokemon.find((candidate) => candidate.id === id);

  it('still names Pokémon and a move that exist in the current rule pool', () => {
    expect(entryFor(DAMAGE_SAMPLE.attackerPokemonId)).toBeTruthy();
    expect(entryFor(DAMAGE_SAMPLE.defenderPokemonId)).toBeTruthy();

    const move = moves.find((candidate) => candidate.id === DAMAGE_SAMPLE.moveId);
    expect(move?.chineseName).toBe(DAMAGE_SAMPLE.moveLabel);
    // The attacker has to actually be able to use it, or the sample is a lie.
    expect(
      currentRuleMovesForPokemon(DAMAGE_SAMPLE.attackerPokemonId).some((candidate) => candidate.id === DAMAGE_SAMPLE.moveId),
    ).toBe(true);
  });

  it('matches what the adapter computes for that matchup', () => {
    const attacker = buildTemporaryCalcConfig({
      pokemonId: DAMAGE_SAMPLE.attackerPokemonId,
      role: 'attacker',
      moveCategory: 'Physical',
    });
    const defender = buildTemporaryCalcConfig({ pokemonId: DAMAGE_SAMPLE.defenderPokemonId, role: 'defender' });

    const result = computeDamage({
      attacker: { ...attacker, moveIds: [DAMAGE_SAMPLE.moveId], selectedMoveId: DAMAGE_SAMPLE.moveId },
      defender,
      battleType: 'singles',
      weather: '无天气',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.minPercent).toBe(DAMAGE_SAMPLE.minPercent);
    expect(result.maxPercent).toBe(DAMAGE_SAMPLE.maxPercent);
  });
});
