import type { EnvironmentBattleType } from './environmentDataset';

/**
 * One prior season's usage ranking, carried alongside the live snapshot so the environment list
 * can show "climbed / fell / new" without keeping a multi-season trend store (explicitly out of
 * scope — see docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md). Exactly one predecessor is
 * retained and only the rank is kept: PokeDB publishes no absolute usage percentage, so a delta
 * here always means *rank* movement, never usage movement.
 */
export type SeasonRankSnapshot = {
  /** Display label as PokeDB writes it, e.g. `M-4`. */
  season: string;
  /** PokeDB's numeric season id. Load-bearing: only `current - 1` may be shown as a delta. */
  seasonNumber: number;
  /** PokeDB's own "last updated" for that season, kept for traceability. */
  sourceUpdatedAt?: string;
  /** When we captured it. */
  capturedAt: string;
  /** pokemonId -> 1-based rank, per battle type. */
  ranks: Partial<Record<EnvironmentBattleType, Record<string, number>>>;
};

export type SeasonRankDelta =
  | { kind: 'new' }
  | { kind: 'hold' }
  | { kind: 'up'; places: number }
  | { kind: 'down'; places: number };

/**
 * A predecessor is only usable when it is the *immediately* preceding season. A gap (e.g. the
 * snapshot skipped a season because the Worker was down through a rollover) would make the chip
 * silently mean something other than "since last season", so we drop it instead.
 */
export const isImmediatePredecessor = (
  snapshot: SeasonRankSnapshot | undefined,
  currentSeasonNumber: number | undefined,
): snapshot is SeasonRankSnapshot =>
  Boolean(
    snapshot &&
      Number.isInteger(currentSeasonNumber) &&
      snapshot.seasonNumber === (currentSeasonNumber as number) - 1,
  );

/** The prior-season rank table for one battle type, or undefined when there is nothing to diff. */
export const selectSeasonRanks = (
  snapshot: SeasonRankSnapshot | undefined,
  battleType: EnvironmentBattleType,
): Record<string, number> | undefined => {
  const ranks = snapshot?.ranks?.[battleType];
  return ranks && Object.keys(ranks).length > 0 ? ranks : undefined;
};

/**
 * Rank movement for one Pokemon. Returns undefined when there is no prior season to compare
 * against — callers render nothing in that case rather than a zero or a guess.
 */
export const resolveSeasonRankDelta = (
  currentRank: number,
  previousRanks: Record<string, number> | undefined,
  pokemonId: string,
): SeasonRankDelta | undefined => {
  if (!previousRanks) return undefined;
  const previousRank = previousRanks[pokemonId];
  // Absent from a populated prior table means it genuinely was not ranked then — the case that
  // matters after a regulation rotation adds Pokemon to the legal pool.
  if (!Number.isInteger(previousRank) || previousRank <= 0) return { kind: 'new' };
  const places = previousRank - currentRank;
  if (places === 0) return { kind: 'hold' };
  return places > 0 ? { kind: 'up', places } : { kind: 'down', places: -places };
};

/** Screen-reader / tooltip text. `seasonLabel` is the *previous* season the delta is measured from. */
export const describeSeasonRankDelta = (delta: SeasonRankDelta, seasonLabel: string): string => {
  switch (delta.kind) {
    case 'new':
      return `${seasonLabel} 未上榜`;
    case 'hold':
      return `与 ${seasonLabel} 名次持平`;
    case 'up':
      return `较 ${seasonLabel} 上升 ${delta.places} 名`;
    case 'down':
      return `较 ${seasonLabel} 下降 ${delta.places} 名`;
  }
};
