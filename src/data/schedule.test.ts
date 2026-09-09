import { describe, expect, it } from 'vitest';
import {
  regulationSchedule,
  seasonSchedule,
  currentRegulation,
  currentRegulationLabel,
  currentSeasonLabel,
  isRegulationRolloverDue,
  productContextLabel,
  seasonToRegulation,
} from './schedule';
import { currentRuleSet } from './seed/regMA/metadata';

const inMB = new Date('2026-07-09T00:00:00.000Z'); // M-B regulation, M-4 season
const inMA = new Date('2026-05-01T00:00:00.000Z'); // M-A regulation, M-2 season
const inMC = new Date('2026-09-10T00:00:00.000Z'); // M-C regulation, M-6 season
const afterMC = new Date('2026-12-20T00:00:00.000Z'); // past M-C end, no next regulation yet

describe('schedule', () => {
  // The historical time axis must not move when `currentRuleSet` is repointed at the next
  // regulation, so every past boundary is asserted as a literal here.
  it('pins regulation and season boundaries to literal dates', () => {
    const byId = Object.fromEntries(regulationSchedule.map((entry) => [entry.id, entry]));
    expect(byId['M-A'].endAt).toBe('2026-06-17T02:00:00.000Z');
    expect(byId['M-B'].startAt).toBe('2026-06-17T02:00:00.000Z');
    expect(byId['M-B'].endAt).toBe('2026-09-09T01:59:00.000Z');
    expect(byId['M-B'].sourceUrl).toBe('https://champions-news.pokemon-home.com/en/page/776.html');
    // M-C is the current regulation (currentRuleSet points at it); the window stays literal here
    // so it will not move when M-D is appended.
    expect(byId['M-C'].startAt).toBe('2026-09-09T02:00:00.000Z');
    expect(byId['M-C'].endAt).toBe('2026-12-02T01:59:00.000Z');
    expect(byId['M-C'].sourceUrl).toBe('https://news.pokemon-home.com/en/page/816.html');

    const bySeason = Object.fromEntries(seasonSchedule.map((entry) => [entry.label, entry]));
    expect(bySeason['M-3'].startAt).toBe('2026-06-17T02:00:00.000Z');
    // Official Season M-5 value; coincides with the regulation boundary but is not derived from it.
    expect(bySeason['M-5'].endAt).toBe('2026-09-09T01:59:00.000Z');
    expect(bySeason['M-5'].sourceUrl).toBe('https://champions-news.pokemon-home.com/en/page/803.html');
    // Season M-6 (first M-C season), from the official Ranked Battles Season M-6 announcement.
    expect(bySeason['M-6'].startAt).toBe('2026-09-09T02:00:00.000Z');
    expect(bySeason['M-6'].endAt).toBe('2026-10-07T01:59:00.000Z');
    expect(bySeason['M-6'].sourceUrl).toBe('https://news.pokemon-home.com/en/page/822.html');
  });

  // The catalog (`currentRuleSet`) and the schedule must agree on the live regulation: a rollover
  // that updates only one of the two is exactly the failure mode this file guards.
  it('keeps currentRuleSet aligned with the schedule-resolved current regulation', () => {
    expect(currentRuleSet.id).toBe('reg-mc');
    expect(currentRegulation(new Date(currentRuleSet.startAt)).id).toBe('M-C');
    expect(currentRuleSet.startAt).toBe(regulationSchedule.find((entry) => entry.id === 'M-C')!.startAt);
    expect(currentRuleSet.endAt).toBe(regulationSchedule.find((entry) => entry.id === 'M-C')!.endAt);
  });

  it('maps PokeDB ladder seasons to their regulation', () => {
    expect(seasonToRegulation('M-1')).toBe('M-A');
    expect(seasonToRegulation('M-2')).toBe('M-A');
    expect(seasonToRegulation('M-3')).toBe('M-B');
    expect(seasonToRegulation('M-4')).toBe('M-B');
    // M-5 stays on M-B after the rollover: the season axis is historical, not "current".
    expect(seasonToRegulation('M-5')).toBe('M-B');
    expect(seasonToRegulation('M-6')).toBe('M-C');
    expect(seasonToRegulation('M-9')).toBeUndefined();
  });

  it('resolves the current regulation by date and clamps past the last window', () => {
    expect(currentRegulation(inMB).id).toBe('M-B');
    expect(currentRegulation(new Date('2026-07-20T12:00:00.000Z')).id).toBe('M-B'); // visual-test clock
    expect(currentRegulation(inMA).id).toBe('M-A');
    expect(currentRegulation(new Date('2026-07-20T12:00:00.000Z')).id).toBe('M-B'); // still M-B pre-rollover
    // M-C opens 2026-09-09 02:00 UTC; 01:30 is still inside the extended M-B window.
    expect(currentRegulation(new Date('2026-09-09T01:30:00.000Z')).id).toBe('M-B');
    expect(currentRegulation(inMC).id).toBe('M-C');
    expect(currentRegulation(afterMC).id).toBe('M-C'); // clamps to latest until M-D is announced
    expect(currentRegulationLabel(inMB)).toBe('Regulation M-B');
    expect(currentRegulationLabel(inMC)).toBe('Regulation M-C');
  });

  it('derives the current season label from the schedule as an offline fallback', () => {
    expect(currentSeasonLabel(inMB)).toBe('M-4');
    expect(currentSeasonLabel(new Date('2026-06-20T00:00:00.000Z'))).toBe('M-3');
    // Seasons transition at 02:00 UTC (announced 10:00 in UTC+8). Guard the M-3 -> M-4 boundary.
    expect(currentSeasonLabel(new Date('2026-07-08T01:30:00.000Z'))).toBe('M-3');
    expect(currentSeasonLabel(new Date('2026-07-08T02:30:00.000Z'))).toBe('M-4');
    // M-4 -> M-5 boundary. M-5 is the last M-B season and ends on the regulation boundary.
    expect(currentSeasonLabel(new Date('2026-08-05T01:30:00.000Z'))).toBe('M-4');
    expect(currentSeasonLabel(new Date('2026-08-05T02:30:00.000Z'))).toBe('M-5');
    expect(currentSeasonLabel(new Date('2026-09-01T00:00:00.000Z'))).toBe('M-5');
    // M-5 -> M-6 boundary, which coincides with the M-B -> M-C regulation boundary.
    expect(currentSeasonLabel(new Date('2026-09-09T01:30:00.000Z'))).toBe('M-5');
    expect(currentSeasonLabel(new Date('2026-09-09T02:30:00.000Z'))).toBe('M-6');
    expect(currentSeasonLabel(inMC)).toBe('M-6');
  });

  it('builds the header context label, preferring the live season', () => {
    expect(productContextLabel('M-4', inMB)).toBe('Season M-4 · Regulation M-B');
    expect(productContextLabel(undefined, inMB)).toBe('Season M-4 · Regulation M-B');
    // Non-"M-n" live labels (seed/dev fallbacks) are shown verbatim, without a "Season" prefix.
    expect(productContextLabel('开发样例', inMB)).toBe('开发样例 · Regulation M-B');
    expect(productContextLabel(undefined, inMC)).toBe('Season M-6 · Regulation M-C');
  });

  it('flags a regulation rollover only once past the last defined window', () => {
    expect(isRegulationRolloverDue(inMB)).toBe(false);
    // M-B was officially extended to 2026-09-09 01:59 UTC.
    expect(isRegulationRolloverDue(new Date('2026-09-08T00:00:00.000Z'))).toBe(false);
    // The catalog is now on M-C, so the M-B -> M-C boundary no longer reads as "overdue".
    expect(isRegulationRolloverDue(new Date('2026-09-09T02:00:00.000Z'))).toBe(false);
    expect(isRegulationRolloverDue(inMC)).toBe(false);
    // Past the M-C window with no M-D announced, the reminder fires again.
    expect(isRegulationRolloverDue(afterMC)).toBe(true);
  });
});
