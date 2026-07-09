import { describe, expect, it } from 'vitest';
import {
  currentRegulation,
  currentRegulationLabel,
  currentSeasonLabel,
  isRegulationRolloverDue,
  productContextLabel,
  seasonToRegulation,
} from './schedule';

const inMB = new Date('2026-07-09T00:00:00.000Z'); // M-B regulation, M-4 season
const inMA = new Date('2026-05-01T00:00:00.000Z'); // M-A regulation, M-2 season
const afterMB = new Date('2026-10-01T00:00:00.000Z'); // past M-B end, no next regulation yet

describe('schedule', () => {
  it('maps PokeDB ladder seasons to their regulation', () => {
    expect(seasonToRegulation('M-1')).toBe('M-A');
    expect(seasonToRegulation('M-2')).toBe('M-A');
    expect(seasonToRegulation('M-3')).toBe('M-B');
    expect(seasonToRegulation('M-4')).toBe('M-B');
    expect(seasonToRegulation('M-9')).toBeUndefined();
  });

  it('resolves the current regulation by date and clamps past the last window', () => {
    expect(currentRegulation(inMB).id).toBe('M-B');
    expect(currentRegulation(inMA).id).toBe('M-A');
    expect(currentRegulation(afterMB).id).toBe('M-B'); // clamps to latest until M-C is announced
    expect(currentRegulationLabel(inMB)).toBe('Regulation M-B');
  });

  it('derives the current season label from the schedule as an offline fallback', () => {
    expect(currentSeasonLabel(inMB)).toBe('M-4');
    expect(currentSeasonLabel(new Date('2026-06-20T00:00:00.000Z'))).toBe('M-3');
    // Seasons transition at 02:00 UTC (announced 10:00 in UTC+8). Guard the M-3 -> M-4 boundary.
    expect(currentSeasonLabel(new Date('2026-07-08T01:30:00.000Z'))).toBe('M-3');
    expect(currentSeasonLabel(new Date('2026-07-08T02:30:00.000Z'))).toBe('M-4');
  });

  it('builds the header context label, preferring the live season', () => {
    expect(productContextLabel('M-4', inMB)).toBe('Season M-4 · Regulation M-B');
    expect(productContextLabel(undefined, inMB)).toBe('Season M-4 · Regulation M-B');
    // Non-"M-n" live labels (seed/dev fallbacks) are shown verbatim, without a "Season" prefix.
    expect(productContextLabel('开发样例', inMB)).toBe('开发样例 · Regulation M-B');
  });

  it('flags a regulation rollover only once past the last defined window', () => {
    expect(isRegulationRolloverDue(inMB)).toBe(false);
    expect(isRegulationRolloverDue(afterMB)).toBe(true);
  });
});
