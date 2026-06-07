import { describe, expect, it } from 'vitest';
import { defaultTeams } from '../data';
import { attackingTypes, buildTeamAnalysisDetails, defensiveMatchupMultiplier } from './calculations';

describe('team analysis details', () => {
  it('returns summary chips and explainable analysis sections', () => {
    const analysis = buildTeamAnalysisDetails(defaultTeams[0]);

    expect(analysis.chips.length).toBeGreaterThan(0);
    expect(analysis.sections.map((section) => section.title)).toEqual([
      '属性弱点',
      '抗性 / 免疫',
      '攻防倾向',
      '速度覆盖',
      '功能位 / 重复定位',
    ]);
  });

  it('covers all 18 attacking types for matchup analysis', () => {
    expect(attackingTypes).toHaveLength(18);
    expect(attackingTypes).toEqual([
      'Normal',
      'Fire',
      'Water',
      'Electric',
      'Grass',
      'Ice',
      'Fighting',
      'Poison',
      'Ground',
      'Flying',
      'Psychic',
      'Bug',
      'Rock',
      'Ghost',
      'Dragon',
      'Dark',
      'Steel',
      'Fairy',
    ]);
  });

  it('handles matchups that were missing from the first attacking type list', () => {
    expect(defensiveMatchupMultiplier('Ghost', ['Normal'])).toBe(0);
    expect(defensiveMatchupMultiplier('Fighting', ['Ghost'])).toBe(0);
    expect(defensiveMatchupMultiplier('Fairy', ['Dragon', 'Dark'])).toBe(4);
    expect(defensiveMatchupMultiplier('Poison', ['Fairy'])).toBe(2);
    expect(defensiveMatchupMultiplier('Bug', ['Psychic', 'Dark'])).toBe(4);
    expect(defensiveMatchupMultiplier('Steel', ['Rock', 'Fairy'])).toBe(4);
  });

  it('surfaces speed coverage using configured team member speeds', () => {
    const analysis = buildTeamAnalysisDetails(defaultTeams[0]);
    const speedSection = analysis.sections.find((section) => section.title === '速度覆盖');

    expect(speedSection?.items.some((item) => item.includes('最终速度'))).toBe(true);
  });

  it('keeps function-slot analysis explicit about duplicate items', () => {
    const analysis = buildTeamAnalysisDetails({
      ...defaultTeams[0],
      members: [
        { ...defaultTeams[0].members[0], itemId: 'clear-amulet' },
        { ...defaultTeams[0].members[0], id: 'member-luxray-duplicate', itemId: 'clear-amulet' },
      ],
    });
    const functionSection = analysis.sections.find((section) => section.title === '功能位 / 重复定位');

    expect(functionSection?.status).toBe('warning');
    expect(functionSection?.items.some((item) => item.includes('重复道具'))).toBe(true);
  });
});
