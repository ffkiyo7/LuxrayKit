import { describe, expect, it } from 'vitest';
import { calculateBattleStats, calculateSpeed, calculateSpeedWithMechanismGate } from './calculations';

describe('speed calculation', () => {
  it('uses the confirmed Champions Lv.50 SP formula for speed', () => {
    expect(calculateSpeed(102, 32, 50, '爽朗')).toBe(169);
    expect(calculateSpeed(20, 32, 50, '怕慢(+速)')).toBe(79);
  });

  it('applies scarf, speed ability, and tailwind in chained order', () => {
    expect(calculateSpeed(77, 0, 50, '无修正', { scarf: true })).toBe(145);
    expect(calculateSpeed(77, 0, 50, '无修正', { speedAbility: true })).toBe(194);
    expect(calculateSpeed(77, 0, 50, '无修正', { tailwind: true })).toBe(194);
    expect(calculateSpeed(77, 0, 50, '无修正', { scarf: true, speedAbility: true, tailwind: true })).toBe(580);
  });

  it('floors after each modifier while keeping the legacy tailwind flag compatible', () => {
    expect(calculateSpeed(81, 0, 50, '减速(-速)', { scarf: true, speedAbility: true })).toBe(270);
    expect(calculateSpeed(81, 0, 50, '减速(-速)', true)).toBe(180);
  });

  it('blocks formal speed conclusions while Champions speed mechanisms are pending', () => {
    const result = calculateSpeedWithMechanismGate({
      baseSpeed: 102,
      statPoints: 32,
      level: 50,
      nature: '爽朗',
      mechanismStatus: 'pending',
    });

    expect(result.status).toBe('blocked');
    expect(result.explanation).toContain('not confirmed');
  });

  it('returns a formal result only when the mechanism is explicitly confirmed', () => {
    const result = calculateSpeedWithMechanismGate({
      baseSpeed: 102,
      statPoints: 32,
      level: 50,
      nature: '爽朗',
      mechanismStatus: 'confirmed',
    });

    expect(result.status).toBe('confirmed');
    if (result.status === 'confirmed') {
      expect(result.finalSpeed).toBe(169);
    }
  });

  it('derives displayed battle stats from base stats, stat points, level, and nature', () => {
    const stats = calculateBattleStats(
      { hp: 108, attack: 130, defense: 95, specialAttack: 80, specialDefense: 85, speed: 102 },
      { hp: 32, attack: 32, speed: 32 },
      50,
      '爽朗',
    );

    expect(stats.hp).toBe(215);
    expect(stats.attack).toBe(182);
    expect(stats.specialAttack).toBe(90);
    expect(stats.speed).toBe(169);
  });
});
