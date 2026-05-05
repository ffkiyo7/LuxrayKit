import { describe, expect, it } from 'vitest';
import {
  currentDataVersion,
  currentRuleSet,
  pokemon,
} from '../data';
import { currentRuleMovesForPokemon } from './currentRuleCatalog';
import {
  buildCalcConfigFromTeamMember,
  buildTemporaryCalcConfig,
  computeDamage,
  totalStatPoints,
  validateStatPoints,
  type CalcSideConfig,
  type DamageAdapterInput,
} from './damageAdapter';

function makeConfig(overrides: Partial<CalcSideConfig> = {}): CalcSideConfig {
  return {
    source: 'temporary',
    pokemonId: 'garchomp',
    nature: '爽朗',
    statPoints: { attack: 32, speed: 32, hp: 2 },
    moveIds: ['dragon-claw'],
    selectedMoveId: 'dragon-claw',
    level: 50,
    ...overrides,
  };
}

const defaults: DamageAdapterInput = {
  attacker: makeConfig({ selectedMoveId: 'dragon-claw' }),
  defender: makeConfig({ pokemonId: 'torkoal', statPoints: { hp: 32, defense: 17, specialDefense: 17 }, nature: '慎重' }),
  battleType: 'doubles',
  weather: '无天气',
  terrain: '无场地',
  attackStage: 0,
};

describe('damageAdapter', () => {
  it('returns Gen9-based damage for valid input with Champions move params and SP stats', () => {
    const result = computeDamage(defaults);
    expect(result.status).toBe('experimental-success');
    expect(result.accuracyLevel).toBe('experimental-mainline-approximation');
    expect(result.damageRolls!.length).toBeGreaterThan(0);
    expect(result.minDamage).toBeGreaterThan(0);
    expect(result.defenderHp).toBeGreaterThan((pokemon.find((p) => p.id === 'torkoal')?.baseStats.hp ?? 0));
    expect(result.dataVersionId).toBe(currentDataVersion.id);
    expect(result.ruleSetId).toBe(currentRuleSet.id);
    expect(result.attackerConfig).toBeTruthy();
    expect(result.defenderConfig).toBeTruthy();
  });

  it('matches the Gen9 roll range for Houndoom Flare Blitz into max HP/Defense Garganacl', () => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: 'houndoom',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['flare-blitz'],
        selectedMoveId: 'flare-blitz',
      }),
      defender: makeConfig({
        pokemonId: 'garganacl',
        nature: '慎重',
        statPoints: { hp: 32, defense: 32 },
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.damageRolls).toEqual([29, 30, 30, 30, 30, 31, 31, 32, 32, 33, 33, 33, 33, 34, 34, 35]);
    expect(result.offensiveStatValue).toBe(156);
    expect(result.defensiveStatValue).toBe(182);
    expect(result.typeEffectiveness).toBe(0.5);
    expect(result.stabMultiplier).toBe(1.5);
    expect(result.oneHitKoChance).toBe(0);
    expect(result.twoHitKoChance).toBe(0);
    expect(result.possibleHkoText).toBe('通常需要三次以上攻击');
  });

  it('reports probabilistic one-hit and two-hit KO conclusions from damage rolls', () => {
    const oneHit = computeDamage({
      attacker: makeConfig({
        pokemonId: 'garchomp',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['earthquake'],
        selectedMoveId: 'earthquake',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    expect(oneHit.status).toBe('experimental-success');
    expect(oneHit.oneHitKoChance).toBeGreaterThanOrEqual(0);
    expect(oneHit.oneHitKoChance).toBeLessThanOrEqual(100);
    expect(oneHit.possibleHkoText).toMatch(/一击击杀概率|确定一击击杀|两击击杀概率|确定两击击杀|三次以上/);
  });

  it('applies attacker abilities such as Huge Power and reports an ability chip', () => {
    const withHugePower = computeDamage({
      attacker: makeConfig({
        pokemonId: 'azumarill',
        abilityId: 'huge-power',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['waterfall'],
        selectedMoveId: 'waterfall',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const withoutHugePower = computeDamage({
      attacker: makeConfig({
        pokemonId: 'azumarill',
        abilityId: 'thick-fat',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['waterfall'],
        selectedMoveId: 'waterfall',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(withHugePower.status).toBe('experimental-success');
    expect(withoutHugePower.status).toBe('experimental-success');
    expect(withHugePower.maxDamage).toBeGreaterThan(withoutHugePower.maxDamage ?? 0);
    expect(withHugePower.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'huge-power', direction: 'boost', label: '进攻特性：大力士' }),
    ]);
  });

  it('applies defensive immunities such as Flash Fire and reports an ability chip', () => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: 'houndoom',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['flare-blitz'],
        selectedMoveId: 'flare-blitz',
      }),
      defender: makeConfig({
        pokemonId: 'arcanine',
        abilityId: 'flash-fire',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.damageRolls).toEqual([0]);
    expect(result.possibleHkoText).toBe('无法造成伤害');
    expect(result.abilityEffects).toEqual([
      expect.objectContaining({
        side: 'defender',
        abilityId: 'flash-fire',
        direction: 'immunity',
        label: '防守特性：引火',
        text: '火属性招式无效',
      }),
    ]);
  });

  it.each([
    ['water-absorb', '储水', 'Water', '水属性招式无效', 'blastoise', 'hydro-pump', 'politoed'],
    ['volt-absorb', '蓄电', 'Electric', '电属性招式无效', 'pikachu', 'thunderbolt', 'jolteon'],
    ['lightning-rod', '避雷针', 'Electric', '电属性招式无效', 'pikachu', 'thunderbolt', 'raichu'],
    ['sap-sipper', '食草', 'Grass', '草属性招式无效', 'venusaur', 'energy-ball', 'azumarill'],
    ['earth-eater', '食土', 'Ground', '地面属性招式无效', 'garchomp', 'earthquake', 'orthworm'],
    ['levitate', '飘浮', 'Ground', '地面属性招式无效', 'garchomp', 'earthquake', 'rotom'],
  ])('reports type-immunity ability chips for %s', (abilityId, abilityName, _type, text, attackerId, moveId, defenderId) => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: attackerId,
        moveIds: [moveId],
        selectedMoveId: moveId,
      }),
      defender: makeConfig({
        pokemonId: defenderId,
        abilityId,
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.damageRolls).toEqual([0]);
    expect(result.possibleHkoText).toBe('无法造成伤害');
    expect(result.abilityEffects).toEqual([
      expect.objectContaining({
        side: 'defender',
        abilityId,
        direction: 'immunity',
        label: `防守特性：${abilityName}`,
        text,
      }),
    ]);
  });

  it('does not create false ability chips when the defender has no damage modifier', () => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: 'blastoise',
        moveIds: ['hydro-pump'],
        selectedMoveId: 'hydro-pump',
      }),
      defender: makeConfig({
        pokemonId: 'politoed',
        abilityId: 'damp',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.maxDamage).toBeGreaterThan(0);
    expect(result.abilityEffects).toEqual([]);
  });

  it('reports direct boost and reduction ability chips with specific reasons', () => {
    const thickFat = computeDamage({
      attacker: makeConfig({
        pokemonId: 'houndoom',
        moveIds: ['flare-blitz'],
        selectedMoveId: 'flare-blitz',
      }),
      defender: makeConfig({
        pokemonId: 'venusaur',
        abilityId: 'thick-fat',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const technician = computeDamage({
      attacker: makeConfig({
        pokemonId: 'scizor',
        abilityId: 'technician',
        moveIds: ['bullet-punch'],
        selectedMoveId: 'bullet-punch',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(thickFat.abilityEffects).toEqual([
      expect.objectContaining({ side: 'defender', abilityId: 'thick-fat', direction: 'reduction', text: '火属性伤害减半' }),
    ]);
    expect(technician.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'technician', direction: 'boost', text: '低威力招式增强' }),
    ]);
  });

  it('returns blocked for Status moves', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: 'protect' }),
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReasons.some((r) => r.includes('变化'))).toBe(true);
  });

  it('returns invalid-input when selectedMoveId is missing', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: undefined }),
    });
    expect(result.status).toBe('invalid-input');
  });

  it('returns blocked when move is not in attacker learnset', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: 'hydro-pump', pokemonId: 'garchomp' }),
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReasons.some((r) => r.includes('可学会') || r.includes('learn'))).toBe(true);
  });

  it('derives spread damage in doubles from Champions targetScope', () => {
    // Earthquake is 对手全体 in doubles
    const garchompMoves = currentRuleMovesForPokemon('garchomp');
    const eq = garchompMoves.find((m) => m.id === 'earthquake');
    if (eq) {
      const result = computeDamage({
        ...defaults,
        attacker: makeConfig({ selectedMoveId: 'earthquake' }),
        battleType: 'doubles',
      });
      expect(result.status).toBe('experimental-success');
      expect(result.derivedSpreadDamage).toBe(true);
    }
  });

  it('does not derive spread damage in singles', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: 'earthquake' }),
      battleType: 'singles',
    });
    expect(result.status).toBe('experimental-success');
    expect(result.derivedSpreadDamage).toBe(false);
  });

  it('resolves known Mega form damage', () => {
    const gEntry = pokemon.find((p) => p.id === 'garchomp');
    if (gEntry?.megaForms.length) {
      const result = computeDamage({
        ...defaults,
        attacker: makeConfig({ formId: 'mega-garchomp', selectedMoveId: 'dragon-claw' }),
      });
      expect(result.status).toBe('experimental-success');
      expect(result.attackerBattleForm?.isMega).toBe(true);
    }
  });

  // ── Config builder tests ──

  it('buildCalcConfigFromTeamMember preserves member stats', () => {
    const member = {
      id: 'test-member-id',
      pokemonId: 'garchomp',
      abilityId: 'sand-veil',
      itemId: 'garchompite',
      moveIds: ['dragon-claw', 'earthquake'],
      nature: '固执',
      statPoints: { attack: 32, speed: 16, hp: 18 },
      level: 50 as const,
      notes: '',
      legalityStatus: 'needs-review' as const,
    };
    const cfg = buildCalcConfigFromTeamMember(member);
    expect(cfg.source).toBe('team-member');
    expect(cfg.sourceMemberId).toBe('test-member-id');
    expect(cfg.pokemonId).toBe('garchomp');
    expect(cfg.abilityId).toBe('sand-veil');
    expect(cfg.itemId).toBe('garchompite');
    expect(cfg.moveIds).toEqual(['dragon-claw', 'earthquake']);
    expect(cfg.nature).toBe('固执');
    expect(cfg.statPoints).toEqual({ attack: 32, speed: 16, hp: 18 });
    expect(cfg.level).toBe(50);
  });

  it('buildTemporaryCalcConfig starts temporary Pokemon at 0 SP', () => {
    const cfg = buildTemporaryCalcConfig({ pokemonId: 'garchomp', role: 'attacker', moveCategory: 'Physical' });
    expect(totalStatPoints(cfg.statPoints)).toBe(0);
    expect(cfg.statPoints).toEqual({});
    expect(cfg.statStages).toEqual({});
  });

  // ── SP validation ──

  it('rejects hp=32 + defense=32 + specialDefense=32 (total 96) as illegal', () => {
    const issues = validateStatPoints({ hp: 32, defense: 32, specialDefense: 32 });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.includes('96'))).toBe(true);
  });

  it('blocks when SP total exceeds 66', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ statPoints: { hp: 32, attack: 32, speed: 32 } }),
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReasons.some((r) => r.includes('99') || r.includes('总量'))).toBe(true);
  });

  it('blocks when single SP exceeds 32', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ statPoints: { attack: 33, speed: 32, hp: 1 } }),
    });
    expect(result.status).toBe('blocked');
  });

  // ── Warnings ──

  it('documents the Gen9 formula and Champions parameter assumptions', () => {
    const result = computeDamage(defaults);
    expect(result.status).toBe('experimental-success');
    expect(result.warnings.some((w) => /Gen9/.test(w))).toBe(true);
    expect(result.assumptions.some((a) => /Champions move catalog|Champions 招式/.test(a))).toBe(true);
  });

  // ── Team member config is not overwritten by temporary preset ──

  it('team-member config keeps original SP/nature (not overwritten by preset)', () => {
    const member = {
      id: 'test-member-2',
      pokemonId: 'garchomp',
      abilityId: 'sand-veil',
      itemId: undefined,
      moveIds: ['dragon-claw'],
      nature: '固执',
      statPoints: { attack: 20, speed: 10, hp: 0 },
      level: 50 as const,
      notes: '',
      legalityStatus: 'needs-review' as const,
    };
    const cfg = buildCalcConfigFromTeamMember(member);
    expect(cfg.nature).toBe('固执');
    expect(cfg.statPoints.attack).toBe(20);
    expect(cfg.statPoints.speed).toBe(10);
  });

  // ── Result includes configs ──

  it('result includes attacker and defender configs', () => {
    const result = computeDamage(defaults);
    expect(result.attackerConfig?.pokemonId).toBe('garchomp');
    expect(result.defenderConfig?.pokemonId).toBe('torkoal');
    expect(result.attackerConfig?.nature).toBe('爽朗');
  });

  // ── Block Champions-new Mega ──

  it('blocks Champions-new Mega forms', () => {
    const skarmory = pokemon.find((p) => p.id === 'skarmory');
    if (skarmory) {
      const result = computeDamage({
        ...defaults,
        attacker: makeConfig({ pokemonId: 'skarmory', formId: 'mega-skarmory', selectedMoveId: 'brave-bird' }),
      });
      expect(result.status).toBe('blocked');
      expect(result.blockedReasons.some((r) => r.includes('Champions'))).toBe(true);
    }
  });
});
