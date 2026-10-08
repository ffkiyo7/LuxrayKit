import type { PokemonType } from '../types';
import { attackingTypes, defensiveMatchupMultiplier, typeMatchups } from './calculations';

export type OffensiveProfile = {
  superEffective: PokemonType[];
  notVery: PokemonType[];
  noEffect: PokemonType[];
};

export type DefensiveProfile = {
  weakTo: PokemonType[];
  resistedBy: PokemonType[];
  immuneTo: PokemonType[];
};

const inTypeOrder = (types: PokemonType[]) => attackingTypes.filter((type) => types.includes(type));

export const offensiveProfile = (type: PokemonType): OffensiveProfile => {
  const matchup = typeMatchups[type];
  return {
    superEffective: inTypeOrder(matchup.strong ?? []),
    notVery: inTypeOrder(matchup.resisted ?? []),
    noEffect: inTypeOrder(matchup.immune ?? []),
  };
};

export const defensiveProfile = (type: PokemonType): DefensiveProfile => ({
  weakTo: attackingTypes.filter((attacker) => typeMatchups[attacker].strong?.includes(type)),
  resistedBy: attackingTypes.filter((attacker) => typeMatchups[attacker].resisted?.includes(type)),
  immuneTo: attackingTypes.filter((attacker) => typeMatchups[attacker].immune?.includes(type)),
});

export type OffensiveRow = {
  type: PokemonType;
  multiplier: number;
  /** Which of the attacker's own types produce this line — only set for a dual type. */
  sources?: PokemonType[];
};

export type OffensiveRows = Record<keyof OffensiveProfile, OffensiveRow[]>;

/**
 * 进攻时 for a (possibly dual) type asks the chart once per own type and keeps both answers:
 * 烈咬陆鲨 resists nothing as a whole, but 钢 is ×2 for its 地面 moves and ×½ for its 龙 moves, so the
 * same defender belongs on two shelves. Only when both own types land on the same shelf do they
 * share a row (火焰鸡: 冰 ×2 from 火 and 格斗 alike), so one shelf never lists the same type twice.
 */
export const offensiveRows = (types: PokemonType[]): OffensiveRows => {
  const shelves = {
    superEffective: { multiplier: 2, rows: new Map<PokemonType, OffensiveRow>() },
    notVery: { multiplier: 0.5, rows: new Map<PokemonType, OffensiveRow>() },
    noEffect: { multiplier: 0, rows: new Map<PokemonType, OffensiveRow>() },
  } as const;
  const dual = types.length > 1;

  for (const own of types) {
    const profile = offensiveProfile(own);
    for (const key of ['superEffective', 'notVery', 'noEffect'] as const) {
      for (const defender of profile[key]) {
        const shelf = shelves[key];
        const existing = shelf.rows.get(defender);
        if (existing) existing.sources!.push(own);
        else shelf.rows.set(defender, { type: defender, multiplier: shelf.multiplier, sources: [own] });
      }
    }
  }

  const sorted = (rows: Map<PokemonType, OffensiveRow>) =>
    [...rows.values()]
      .sort((a, b) => attackingTypes.indexOf(a.type) - attackingTypes.indexOf(b.type))
      // A single type has one possible source, so naming it is noise.
      .map((row) => (dual ? row : { type: row.type, multiplier: row.multiplier }));

  return {
    superEffective: sorted(shelves.superEffective.rows),
    notVery: sorted(shelves.notVery.rows),
    noEffect: sorted(shelves.noEffect.rows),
  };
};

export type DefenseBucket = { multiplier: number; types: PokemonType[] };

/**
 * The dual-type answer (06-03) is grouped by the resulting multiplier — ×4 / ×2 / ×½ / ×¼ / ×0 —
 * instead of the three fixed shelves a single type needs. ×1 carries no information and is dropped.
 */
export const defenseBuckets = (types: PokemonType[]): DefenseBucket[] => {
  const grouped = new Map<number, PokemonType[]>();
  for (const attacker of attackingTypes) {
    const multiplier = defensiveMatchupMultiplier(attacker, types);
    if (multiplier === 1) continue;
    const bucket = grouped.get(multiplier);
    if (bucket) bucket.push(attacker);
    else grouped.set(multiplier, [attacker]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b - a)
    .map(([multiplier, bucket]) => ({ multiplier, types: bucket }));
};

type SpeciesLike = { id: string; nationalDexNo: number; types: PokemonType[] };

const sameTypes = (a: PokemonType[], b: PokemonType[]) => a.length === b.length && a.every((type) => b.includes(type));

/**
 * The face of a type combination (06-03): whoever ranks highest in the environment, falling back
 * to the lowest dex number when nothing in the combination is on the ranking (or it has not
 * loaded yet). `rankOf` returns null for an unranked species; smaller rank = better.
 */
export const representativeSpecies = <T extends SpeciesLike>(
  candidates: readonly T[],
  types: PokemonType[],
  rankOf: (entry: T) => number | null,
): T | null => {
  const matches = candidates.filter((entry) => sameTypes(entry.types, types));
  if (matches.length === 0) return null;
  const ranked = matches
    .map((entry) => ({ entry, rank: rankOf(entry) }))
    .filter((row): row is { entry: T; rank: number } => row.rank !== null);
  if (ranked.length > 0) {
    return ranked.reduce((best, row) => (row.rank < best.rank ? row : best)).entry;
  }
  return matches.reduce((best, entry) => (entry.nationalDexNo < best.nationalDexNo ? entry : best));
};
