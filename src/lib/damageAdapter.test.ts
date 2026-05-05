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

  it('buildTemporaryCalcConfig physical attacker has SP=66, atk=32, speed=32', () => {
    const cfg = buildTemporaryCalcConfig({ pokemonId: 'garchomp', role: 'attacker', moveCategory: 'Physical' });
    expect(totalStatPoints(cfg.statPoints)).toBe(66);
    expect(cfg.statPoints.attack).toBe(32);
    expect(cfg.statPoints.speed).toBe(32);
    expect(cfg.nature).toBe('爽朗');
  });

  it('buildTemporaryCalcConfig special attacker has SP=66, spa=32, speed=32, non-spa-reducing nature', () => {
    const cfg = buildTemporaryCalcConfig({ pokemonId: 'garchomp', role: 'attacker', moveCategory: 'Special' });
    expect(totalStatPoints(cfg.statPoints)).toBe(66);
    expect(cfg.statPoints.specialAttack).toBe(32);
    expect(cfg.statPoints.speed).toBe(32);
    // 胆小 is +Spe -Atk, does NOT reduce SpA
    expect(cfg.nature).toBe('胆小');
  });

  it('buildTemporaryCalcConfig defender has SP=66, hp=32', () => {
    const cfg = buildTemporaryCalcConfig({ pokemonId: 'torkoal', role: 'defender' });
    expect(totalStatPoints(cfg.statPoints)).toBe(66);
    expect(cfg.statPoints.hp).toBe(32);
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
