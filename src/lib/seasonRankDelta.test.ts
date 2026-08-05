import { describe, expect, it } from 'vitest';
import {
  describeSeasonRankDelta,
  isImmediatePredecessor,
  resolveSeasonRankDelta,
  selectSeasonRanks,
  type SeasonRankSnapshot,
} from './seasonRankDelta';

const snapshot = (overrides: Partial<SeasonRankSnapshot> = {}): SeasonRankSnapshot => ({
  season: 'M-4',
  seasonNumber: 4,
  capturedAt: '2026-08-05T15:40:00.000Z',
  ranks: {
    singles: { 'pokemon-garchomp': 1, 'pokemon-kingambit': 5 },
    doubles: { 'pokemon-incineroar': 2 },
  },
  ...overrides,
});

describe('isImmediatePredecessor', () => {
  it('accepts only the season directly before the live one', () => {
    expect(isImmediatePredecessor(snapshot(), 5)).toBe(true);
    expect(isImmediatePredecessor(snapshot(), 4)).toBe(false);
    // A gap means the Worker missed a rollover; showing it would silently mean "since M-4"
    // while the header says M-6.
    expect(isImmediatePredecessor(snapshot(), 6)).toBe(false);
  });

  it('rejects a missing snapshot or an unknown current season', () => {
    expect(isImmediatePredecessor(undefined, 5)).toBe(false);
    expect(isImmediatePredecessor(snapshot(), undefined)).toBe(false);
    expect(isImmediatePredecessor(snapshot(), Number.NaN)).toBe(false);
  });
});

describe('selectSeasonRanks', () => {
  it('returns the rank table for the requested battle type', () => {
    expect(selectSeasonRanks(snapshot(), 'singles')).toEqual({
      'pokemon-garchomp': 1,
      'pokemon-kingambit': 5,
    });
  });

  it('treats a missing or empty table as nothing to diff', () => {
    expect(selectSeasonRanks(undefined, 'singles')).toBeUndefined();
    expect(selectSeasonRanks(snapshot({ ranks: {} }), 'singles')).toBeUndefined();
    expect(selectSeasonRanks(snapshot({ ranks: { singles: {} } }), 'singles')).toBeUndefined();
  });
});

describe('resolveSeasonRankDelta', () => {
  const previous = { 'pokemon-garchomp': 1, 'pokemon-kingambit': 5 };

  it('reports movement relative to the previous rank', () => {
    expect(resolveSeasonRankDelta(3, previous, 'pokemon-garchomp')).toEqual({ kind: 'down', places: 2 });
    expect(resolveSeasonRankDelta(2, previous, 'pokemon-kingambit')).toEqual({ kind: 'up', places: 3 });
    expect(resolveSeasonRankDelta(1, previous, 'pokemon-garchomp')).toEqual({ kind: 'hold' });
  });

  it('marks Pokemon absent from a populated prior table as new', () => {
    expect(resolveSeasonRankDelta(7, previous, 'pokemon-miraidon')).toEqual({ kind: 'new' });
  });

  it('returns nothing when there is no prior season, so callers render no chip', () => {
    expect(resolveSeasonRankDelta(1, undefined, 'pokemon-garchomp')).toBeUndefined();
  });
});

describe('describeSeasonRankDelta', () => {
  it('names the season the delta is measured from', () => {
    expect(describeSeasonRankDelta({ kind: 'up', places: 3 }, 'M-4')).toBe('较 M-4 上升 3 名');
    expect(describeSeasonRankDelta({ kind: 'down', places: 2 }, 'M-4')).toBe('较 M-4 下降 2 名');
    expect(describeSeasonRankDelta({ kind: 'hold' }, 'M-4')).toBe('与 M-4 名次持平');
    expect(describeSeasonRankDelta({ kind: 'new' }, 'M-4')).toBe('M-4 未上榜');
  });
});
