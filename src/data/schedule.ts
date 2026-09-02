import type { RegulationId } from '../lib/environmentDataset';
import { currentRuleSet } from './seed/regMA/metadata';

/**
 * Single source of truth for the two independent, separately-rotating time axes the app
 * surfaces. Keeping them here stops "M-3" / "M-B" from being hard-coded in scattered strings
 * that silently go stale after a rollover.
 *
 *  - Regulation (M-A / M-B / M-C ...): the ban-list period that defines the legal catalog.
 *    Rotates ~quarterly on a fixed, officially-announced schedule (date windows below). The
 *    current regulation is resolved by date; a new catalog still has to be authored by hand
 *    when a regulation rolls over (see `isRegulationRolloverDue`).
 *  - Season (M-1 / M-2 / M-3 / M-4 ...): PokeDB's monthly ranked-ladder label. The *live*
 *    value comes from the daily PokeDB snapshot (`EnvironmentState.seasonLabel`) and updates
 *    automatically; the windows here are the officially-announced dates, used as an offline
 *    fallback and for the rollover reminder. Update `seasonSchedule` from the official
 *    announcement each season (e.g. M-4: https://news.pokemon-home.com/tc/page/795.html).
 *
 * All timestamps are ISO-8601 UTC. Official announcements list local times — the Traditional
 * Chinese (tc) page is UTC+8, so its "10:00"/"9:59" map to 02:00 / 01:59 UTC. Seasons and
 * regulations both transition on the convention: start 02:00 UTC, end 01:59 UTC.
 */

export type RegulationScheduleEntry = {
  id: RegulationId;
  label: string;
  startAt: string;
  endAt: string;
  /** Official announcement URL, kept for traceability when refreshing the schedule. */
  sourceUrl?: string;
};

export type SeasonScheduleEntry = {
  label: string;
  regulation: RegulationId;
  startAt: string;
  endAt: string;
  /** Official announcement URL, kept for traceability when refreshing the schedule. */
  sourceUrl?: string;
};

/**
 * Regulation windows are literal dates on purpose: this is the *historical* time axis, and it
 * must not move when `currentRuleSet` is pointed at the next regulation. Append a new entry at
 * rollover instead of editing the previous one.
 */
export const regulationSchedule: RegulationScheduleEntry[] = [
  {
    id: 'M-A',
    // M-A predates this app's tracked window; only its end (= M-B start) is load-bearing here.
    label: 'Regulation M-A',
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-06-17T02:00:00.000Z',
  },
  {
    id: 'M-B',
    label: 'Regulation M-B',
    startAt: '2026-06-17T02:00:00.000Z',
    // Officially extended to 2026-09-09 01:59 UTC (announcement below).
    endAt: '2026-09-09T01:59:00.000Z',
    sourceUrl: 'https://champions-news.pokemon-home.com/en/page/776.html', // M-B extension notice
  },
];

export const seasonSchedule: SeasonScheduleEntry[] = [
  // M-1/M-2 start times are approximate (M-A era, historical); their regulation is exact and
  // M-2 ends at the M-A->M-B boundary. M-3 (first M-B season) starts with the M-B regulation;
  // M-4 dates are authoritative (official Ranked Battles Season M-4 announcement, UTC+8).
  // MAINTENANCE: append each new season here at rollover (isRegulationRolloverDue signals the
  // regulation boundary). An "M-n" season missing from this table classifies its high-score
  // teams as M-A by default (sampleRegulation) — extend the table before a refresh samples it.
  { label: 'M-1', regulation: 'M-A', startAt: '2026-04-08T02:00:00.000Z', endAt: '2026-05-13T01:59:00.000Z' },
  { label: 'M-2', regulation: 'M-A', startAt: '2026-05-13T02:00:00.000Z', endAt: '2026-06-17T01:59:00.000Z' },
  { label: 'M-3', regulation: 'M-B', startAt: '2026-06-17T02:00:00.000Z', endAt: '2026-07-08T01:59:00.000Z' },
  {
    label: 'M-4',
    regulation: 'M-B',
    startAt: '2026-07-08T02:00:00.000Z',
    endAt: '2026-08-05T01:59:00.000Z',
    sourceUrl: 'https://news.pokemon-home.com/tc/page/795.html', // Ranked Battles Season M-4 (UTC+8)
  },
  {
    label: 'M-5',
    regulation: 'M-B',
    startAt: '2026-08-05T02:00:00.000Z',
    // Literal value from the official Ranked Battles Season M-5 announcement. It happens to
    // coincide with the M-B regulation boundary — that is a coincidence of the calendar, NOT a
    // derivation: do not re-link this to currentRuleSet.endAt.
    endAt: '2026-09-09T01:59:00.000Z',
    sourceUrl: 'https://champions-news.pokemon-home.com/en/page/803.html', // Ranked Battles Season M-5
  },
];

const toTime = (iso: string) => new Date(iso).getTime();

/** Which regulation a PokeDB ladder season belongs to (drives high-score team tagging). */
export const seasonToRegulation = (seasonLabel: string): RegulationId | undefined =>
  seasonSchedule.find((entry) => entry.label === seasonLabel)?.regulation;

const latest = <T extends { startAt: string }>(entries: T[]): T | undefined =>
  entries.reduce<T | undefined>(
    (best, entry) => (!best || toTime(entry.startAt) > toTime(best.startAt) ? entry : best),
    undefined,
  );

/** The regulation whose window contains `now`, else the most recent one that has started. */
export const currentRegulation = (now: Date = new Date()): RegulationScheduleEntry => {
  const t = now.getTime();
  const active = regulationSchedule.find((entry) => t >= toTime(entry.startAt) && t < toTime(entry.endAt));
  const started = regulationSchedule.filter((entry) => t >= toTime(entry.startAt));
  return active ?? latest(started.length ? started : regulationSchedule)!;
};

export const currentRegulationLabel = (now: Date = new Date()): string => currentRegulation(now).label;

/** Schedule-derived current season label (fallback for when the live snapshot is unavailable). */
export const currentSeasonLabel = (now: Date = new Date()): string => {
  const t = now.getTime();
  const active = seasonSchedule.find((entry) => t >= toTime(entry.startAt) && t < toTime(entry.endAt));
  const started = seasonSchedule.filter((entry) => t >= toTime(entry.startAt));
  return (active ?? latest(started.length ? started : seasonSchedule))?.label ?? '';
};

/**
 * Header context label. Prefers the live PokeDB season when provided; the regulation is always
 * resolved from the date-based schedule. Falls back to the schedule's season when no live value.
 */
export const productContextLabel = (liveSeasonLabel?: string, now: Date = new Date()): string => {
  const season = (liveSeasonLabel && liveSeasonLabel.trim()) || currentSeasonLabel(now);
  const seasonText = /^M-\d+$/.test(season) ? `Season ${season}` : season;
  return `${seasonText} · ${currentRegulationLabel(now)}`;
};

/**
 * True once `now` has passed the current regulation's end without a later regulation defined —
 * i.e. the schedule + catalog need a manual M-(next) update. Surface this from the daily
 * refresh/CI job so a rollover isn't silently missed.
 */
export const isRegulationRolloverDue = (now: Date = new Date()): boolean => {
  const t = now.getTime();
  const hasFuture = regulationSchedule.some((entry) => toTime(entry.startAt) > t);
  return t >= toTime(currentRuleSet.endAt) && !hasFuture;
};
