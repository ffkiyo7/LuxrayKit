import { describe, expect, it } from 'vitest';
import type { Move } from '../../types';
import { moveMetaLine } from './calcSummary';

const baseMove: Move = {
  id: 'sucker-punch',
  chineseName: '突袭',
  englishName: 'Sucker Punch',
  type: 'Dark',
  category: 'Physical',
  power: 70,
  accuracy: 100,
  pp: 5,
  targetScope: 'selected-pokemon',
  makesContact: true,
  affectedByProtect: true,
  effectSummary: '',
  legalInCurrentRule: true,
  learnableByPokemonIds: [],
  sourceRefs: [],
};

describe('moveMetaLine', () => {
  it('prints a damaging move with the Chinese type label', () => {
    expect(moveMetaLine(baseMove)).toBe('恶 · 物理 · 威力 70');
    expect(moveMetaLine(baseMove, true)).toBe('恶 · 物理 · 威力 70 · 命中 100');
    expect(moveMetaLine(baseMove, false, 105)).toBe('恶 · 物理 · 威力 105');
  });

  it('drops power for a status move', () => {
    const protect: Move = { ...baseMove, id: 'protect', chineseName: '守住', type: 'Normal', category: 'Status', power: undefined, accuracy: undefined };
    expect(moveMetaLine(protect)).toBe('一般 · 变化');
  });
});
