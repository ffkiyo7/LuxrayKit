import { describe, expect, it } from 'vitest';
import { abilities, currentRuleNatureOptions, items, moves, pokemon } from '../data';
import {
  createPokepasteNameMaps,
  mapPokepasteSetToEnvironmentSlot,
  parsePokepasteText,
  statPointsFromSpread,
} from './pokepasteSource';

describe('pokepasteSource', () => {
  it('parses Showdown text blocks into sets', () => {
    const [set] = parsePokepasteText(`
Chompy (Garchomp) @ Focus Sash
Ability: Rough Skin
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
`);

    expect(set).toEqual({
      speciesName: 'Garchomp',
      itemName: 'Focus Sash',
      abilityName: 'Rough Skin',
      evs: { Atk: 252, SpD: 4, Spe: 252 },
      natureName: 'Jolly',
      moves: ['Earthquake', 'Dragon Claw'],
    });
  });

  it('uses the Champions stat-point spread verbatim (the "EVs:" line is already SP, not 0-252 EVs)', () => {
    expect(statPointsFromSpread({ HP: 32, Atk: 1, Spe: 31 })).toEqual({
      hp: 32,
      attack: 1,
      speed: 31,
    });
  });

  it('maps Showdown names to environment team slots with complete config', () => {
    const maps = createPokepasteNameMaps({ pokemon, items, abilities, moves, natures: currentRuleNatureOptions });
    const [set] = parsePokepasteText(`
Mega Ray (Raichu-Mega-X) @ Raichunite X
Ability: Lightning Rod
EVs: 32 SpA / 2 SpD / 32 Spe
Timid Nature
- Zap Cannon
- Focus Blast
- Grass Knot
- Volt Switch
`);

    const result = mapPokepasteSetToEnvironmentSlot(set, maps);

    expect(result.issues).toEqual([]);
    expect(result.slot).toEqual({
      pokemonId: 'raichu',
      formId: 'mega-raichu-x',
      abilityId: 'lightning-rod',
      itemId: 'raichunite-x',
      nature: '胆小',
      statPoints: { specialAttack: 32, specialDefense: 2, speed: 32 },
      moveIds: ['zap-cannon', 'focus-blast', 'grass-knot', 'volt-switch'],
    });
  });

  it('reports unmapped entries instead of producing a partial slot', () => {
    const maps = createPokepasteNameMaps({ pokemon, items, abilities, moves, natures: currentRuleNatureOptions });
    const result = mapPokepasteSetToEnvironmentSlot(
      {
        speciesName: 'Missingno',
        itemName: 'Focus Sash',
        abilityName: 'Nope',
        natureName: 'Jolly',
        evs: {},
        moves: ['Earthquake'],
      },
      maps,
    );

    expect(result.slot).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toEqual(['unknown-pokemon', 'unknown-ability']);
  });
});
