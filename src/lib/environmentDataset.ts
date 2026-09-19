import type { BaseStats, StatPoints } from '../types';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointKeys } from './statPoints';

export type EnvironmentBattleType = 'singles' | 'doubles';
export type EnvironmentUsageBasis = 'absolute' | 'rank-relative';

export type EnvironmentDatasetSource = {
  kind: 'development-seed' | 'community-snapshot' | 'official-ingestion';
  name: string;
  url?: string;
  retrievedAt?: string;
  notes?: string;
};

export type EnvironmentReferenceUsage = {
  id: string;
  usageRate: number;
  teamCount: number;
};

export type EnvironmentStatPointKey = keyof BaseStats;

/**
 * One SP spread from PokeDB's 「能力ポイント」 panel (its default 合算 tab).
 *
 * These are Champions stat points — 0–32 per stat, 66 in total — never main-series EVs.
 * `label` is PokeDB's shorthand, kept verbatim for provenance: uppercase letters are the stats
 * the spread commits to, lowercase letters after `+` are the ones that only absorb leftovers
 * (H=HP, A=攻击, B=防御, C=特攻, D=特防, S=速度). The Chinese wording is a rendering concern —
 * this layer stores stat keys and numbers.
 *
 * `points` holds the numbers PokeDB printed on the row. When PokeDB merged several spreads into
 * one row it prints the leftover as 「余り」 instead of a number: `hasRemainder` marks that, and
 * `points` then only covers `primaryStatKeys`.
 */
export type EnvironmentStatPointUsage = {
  label: string;
  primaryStatKeys: EnvironmentStatPointKey[];
  extraStatKeys?: EnvironmentStatPointKey[];
  points: StatPoints;
  hasRemainder?: boolean;
  usageRate: number;
  teamCount: number;
};

const statPointKeySet = new Set<string>(statPointKeys);

/**
 * Champions SP rules from `statPoints.ts`: every stat 0–32, 66 points in total. A row that
 * breaks them is upstream markup we no longer understand, so it is dropped rather than guessed at.
 */
export const isValidStatPointUsage = (stat: EnvironmentStatPointUsage): boolean => {
  const keys = [...stat.primaryStatKeys, ...(stat.extraStatKeys ?? [])];
  if (keys.length === 0 || keys.some((key) => !statPointKeySet.has(key))) return false;
  if (new Set(keys).size !== keys.length) return false;
  const entries = Object.entries(stat.points);
  if (entries.some(([key]) => !keys.includes(key as EnvironmentStatPointKey))) return false;
  if (stat.primaryStatKeys.some((key) => stat.points[key] === undefined)) return false;
  if (entries.some(([, value]) => !Number.isInteger(value) || value < 0 || value > MAX_STAT_POINTS_PER_STAT)) {
    return false;
  }
  if (entries.reduce((total, [, value]) => total + (value ?? 0), 0) > MAX_TOTAL_STAT_POINTS) return false;
  if (!Number.isFinite(stat.usageRate) || stat.usageRate < 0 || stat.usageRate > 100) return false;
  return Number.isInteger(stat.teamCount) && stat.teamCount >= 0;
};

/**
 * Sentinel id for a PokeDB Pokemon the local catalog does not know yet — a regulation opened new
 * Pokemon before the catalog was authored. Dropping such a row would silently shift every lower
 * rank up by one (the UI derives 名次 from array position), so the row survives the whole pipeline
 * as `pokedb:<pokeDbKey>` and renders as a placeholder. The key is still recorded in the parser's
 * `audit.unknownPokemonKeys`, so the Worker's zero-tolerance audit keeps degrading until a
 * maintainer adds the mapping.
 */
export const UNRESOLVED_POKEMON_ID_PREFIX = 'pokedb:';
export const unresolvedPokemonId = (pokeDbKey: string) => `${UNRESOLVED_POKEMON_ID_PREFIX}${pokeDbKey}`;
export const isUnresolvedPokemonId = (pokemonId: string) => pokemonId.startsWith(UNRESOLVED_POKEMON_ID_PREFIX);

export type EnvironmentPokemonUsage = {
  pokemonId: string;
  usageRate: number;
  teamCount: number;
  /** Source-page name, carried only for `unresolved` rows so the placeholder has a label. */
  displayName?: string;
  /** True when `pokemonId` is an unresolved sentinel: render a placeholder, never a detail link. */
  unresolved?: boolean;
  moveIds: string[];
  itemIds: string[];
  teammateIds: string[];
  abilityIds?: string[];
  natureIds?: string[];
  moveStats?: EnvironmentReferenceUsage[];
  itemStats?: EnvironmentReferenceUsage[];
  teammateStats?: EnvironmentReferenceUsage[];
  abilityStats?: EnvironmentReferenceUsage[];
  natureStats?: EnvironmentReferenceUsage[];
  /** Top SP spreads from PokeDB's 能力ポイント panel. Absent whenever upstream did not expose them. */
  statPointStats?: EnvironmentStatPointUsage[];
};

export type EnvironmentTeamSlot = {
  pokemonId: string;
  formId?: string;
  abilityId?: string;
  itemId?: string;
  nature?: string;
  statPoints?: {
    hp?: number;
    attack?: number;
    defense?: number;
    specialAttack?: number;
    specialDefense?: number;
    speed?: number;
  };
  moveIds: string[];
};

export type RegulationId = 'M-A' | 'M-B' | 'M-C';

export type EnvironmentTeamSample = {
  id: string;
  dataKind: 'development-sample' | 'external-snapshot';
  // Regulation a sample belongs to. Optional on PokeDB high-score samples, where it is derived
  // from the ladder `season` via the schedule (see sampleRegulation); VGCPastes champion
  // samples are stamped explicitly at load time. Absent + unmappable season stays *unknown*
  // (sampleRegulation returns undefined) — it is never guessed as M-A.
  regulation?: RegulationId;
  sourceId?: string;
  sourceLabel?: string;
  author: string;
  season?: string;
  score: number;
  rank?: number;
  title: string;
  battleType: EnvironmentBattleType;
  reportUrl: string;
  tournament?: string;
  eventRank?: string;
  dateShared?: string;
  replicaCode?: string;
  hasMoves?: boolean;
  hasSpread?: boolean;
  slots: EnvironmentTeamSlot[];
};

export type EnvironmentBattleDataset = {
  pokemonUsage: EnvironmentPokemonUsage[];
  sampleCount?: number;
  teamSamples: EnvironmentTeamSample[];
};

export type EnvironmentDataset = {
  id: string;
  ruleSetId: string;
  dataVersionId: string;
  overallUsageBasis?: EnvironmentUsageBasis;
  sourceLabel: string;
  statusLabel: string;
  updatedAt: string;
  source: EnvironmentDatasetSource;
  battles: Record<EnvironmentBattleType, EnvironmentBattleDataset>;
};

export type EnvironmentDatasetCatalog = {
  pokemonIds: Iterable<string>;
  moveIds: Iterable<string>;
  itemIds: Iterable<string>;
  abilityIds?: Iterable<string>;
  natureIds?: Iterable<string>;
};

export type EnvironmentDatasetAuditIssue = {
  code:
    | 'rule-set-mismatch'
    | 'data-version-mismatch'
    | 'missing-battle-data'
    | 'missing-pokemon-ref'
    // Distinct from missing-pokemon-ref: the row is *known to be unknown* (a `pokedb:` sentinel
    // from the parser) and is deliberately kept as a placeholder instead of dropped.
    | 'unresolved-pokemon-ref'
    | 'missing-move-ref'
    | 'missing-item-ref'
    | 'missing-ability-ref'
    | 'missing-nature-ref'
    | 'invalid-usage-rate'
    | 'invalid-team-count'
    // An SP spread that breaks the Champions 0–32 / 66 rules, references an unknown stat, or
    // carries an unusable rate — upstream markup we no longer understand, dropped not guessed.
    | 'invalid-stat-point-spread'
    | 'sample-battle-type-mismatch'
    | 'sample-empty-slots';
  path: string;
  message: string;
};

export type EnvironmentDatasetAuditResult = {
  dataset: EnvironmentDataset;
  issues: EnvironmentDatasetAuditIssue[];
};

const battleTypes = ['singles', 'doubles'] as const satisfies EnvironmentBattleType[];

const issue = (code: EnvironmentDatasetAuditIssue['code'], path: string, message: string): EnvironmentDatasetAuditIssue => ({
  code,
  path,
  message,
});

const toSet = (values: Iterable<string>) => new Set(Array.from(values).filter(Boolean));

const isFiniteNumber = (value: number) => Number.isFinite(value);

const filterKnownIds = (
  ids: string[],
  knownIds: Set<string>,
  code: Extract<
    EnvironmentDatasetAuditIssue['code'],
    'missing-pokemon-ref' | 'missing-move-ref' | 'missing-item-ref' | 'missing-ability-ref' | 'missing-nature-ref'
  >,
  path: string,
  issues: EnvironmentDatasetAuditIssue[],
) =>
  ids.filter((id, index) => {
    if (knownIds.has(id)) return true;
    issues.push(issue(code, `${path}[${index}]`, `${path}[${index}] references unknown id ${id}.`));
    return false;
  });

const normalizeReferenceStats = (
  stats: EnvironmentReferenceUsage[] | undefined,
  knownIds: Set<string>,
  code: Extract<
    EnvironmentDatasetAuditIssue['code'],
    'missing-pokemon-ref' | 'missing-move-ref' | 'missing-item-ref' | 'missing-ability-ref' | 'missing-nature-ref'
  >,
  path: string,
  issues: EnvironmentDatasetAuditIssue[],
) =>
  (stats ?? []).filter((stat, index) => {
    const statPath = `${path}[${index}]`;
    if (!knownIds.has(stat.id)) {
      issues.push(issue(code, `${statPath}.id`, `${statPath} references unknown id ${stat.id}.`));
      return false;
    }
    const hasInvalidUsageRate = !isFiniteNumber(stat.usageRate) || stat.usageRate < 0 || stat.usageRate > 100;
    const hasInvalidTeamCount = !Number.isInteger(stat.teamCount) || stat.teamCount < 0;
    if (hasInvalidUsageRate) {
      issues.push(issue('invalid-usage-rate', `${statPath}.usageRate`, `${statPath} has invalid usageRate ${stat.usageRate}.`));
    }
    if (hasInvalidTeamCount) {
      issues.push(issue('invalid-team-count', `${statPath}.teamCount`, `${statPath} has invalid teamCount ${stat.teamCount}.`));
    }
    return !hasInvalidUsageRate && !hasInvalidTeamCount;
  });

const normalizeStatPointStats = (
  stats: EnvironmentStatPointUsage[] | undefined,
  path: string,
  issues: EnvironmentDatasetAuditIssue[],
) =>
  (stats ?? []).filter((stat, index) => {
    if (isValidStatPointUsage(stat)) return true;
    issues.push(
      issue(
        'invalid-stat-point-spread',
        `${path}[${index}]`,
        `${path}[${index}] has an unusable SP spread (${stat.label}); dropped.`,
      ),
    );
    return false;
  });

const normalizeUsage = (
  usage: EnvironmentPokemonUsage,
  battleType: EnvironmentBattleType,
  index: number,
  ids: { pokemon: Set<string>; moves: Set<string>; items: Set<string>; abilities: Set<string>; natures: Set<string> },
  issues: EnvironmentDatasetAuditIssue[],
): EnvironmentPokemonUsage | undefined => {
  const path = `battles.${battleType}.pokemonUsage[${index}]`;
  const unresolved = isUnresolvedPokemonId(usage.pokemonId);

  if (unresolved) {
    // Kept, not dropped: removing it renumbers every lower rank. The issue is still recorded so
    // the audit stays loud (Worker zero-tolerance threshold, maintainer signal).
    issues.push(
      issue(
        'unresolved-pokemon-ref',
        `${path}.pokemonId`,
        `${path} references PokeDB Pokemon ${usage.pokemonId} that is not in the local catalog yet; kept as a placeholder.`,
      ),
    );
  } else if (!ids.pokemon.has(usage.pokemonId)) {
    issues.push(issue('missing-pokemon-ref', `${path}.pokemonId`, `${path} references unknown Pokemon ${usage.pokemonId}.`));
    return undefined;
  }

  const hasInvalidUsageRate = !isFiniteNumber(usage.usageRate) || usage.usageRate < 0 || usage.usageRate > 100;
  const hasInvalidTeamCount = !Number.isInteger(usage.teamCount) || usage.teamCount < 0;

  if (hasInvalidUsageRate) {
    issues.push(issue('invalid-usage-rate', `${path}.usageRate`, `${path} has invalid usageRate ${usage.usageRate}.`));
  }

  if (hasInvalidTeamCount) {
    issues.push(issue('invalid-team-count', `${path}.teamCount`, `${path} has invalid teamCount ${usage.teamCount}.`));
  }

  if (hasInvalidUsageRate || hasInvalidTeamCount) {
    return undefined;
  }

  // Snapshots written before this field existed, and any Pokemon whose detail page has no
  // 能力ポイント panel, simply carry no spreads — the key stays absent rather than empty.
  const statPointStats = normalizeStatPointStats(usage.statPointStats, `${path}.statPointStats`, issues);

  return {
    pokemonId: usage.pokemonId,
    usageRate: usage.usageRate,
    teamCount: usage.teamCount,
    ...(unresolved ? { unresolved: true } : {}),
    ...(usage.displayName ? { displayName: usage.displayName } : {}),
    moveIds: filterKnownIds(usage.moveIds, ids.moves, 'missing-move-ref', `${path}.moveIds`, issues),
    itemIds: filterKnownIds(usage.itemIds, ids.items, 'missing-item-ref', `${path}.itemIds`, issues),
    teammateIds: filterKnownIds(usage.teammateIds, ids.pokemon, 'missing-pokemon-ref', `${path}.teammateIds`, issues),
    abilityIds: filterKnownIds(usage.abilityIds ?? [], ids.abilities, 'missing-ability-ref', `${path}.abilityIds`, issues),
    natureIds: filterKnownIds(usage.natureIds ?? [], ids.natures, 'missing-nature-ref', `${path}.natureIds`, issues),
    moveStats: normalizeReferenceStats(usage.moveStats, ids.moves, 'missing-move-ref', `${path}.moveStats`, issues),
    itemStats: normalizeReferenceStats(usage.itemStats, ids.items, 'missing-item-ref', `${path}.itemStats`, issues),
    teammateStats: normalizeReferenceStats(usage.teammateStats, ids.pokemon, 'missing-pokemon-ref', `${path}.teammateStats`, issues),
    abilityStats: normalizeReferenceStats(usage.abilityStats, ids.abilities, 'missing-ability-ref', `${path}.abilityStats`, issues),
    natureStats: normalizeReferenceStats(usage.natureStats, ids.natures, 'missing-nature-ref', `${path}.natureStats`, issues),
    ...(statPointStats.length > 0 ? { statPointStats } : {}),
  };
};

const normalizeSlot = (
  slot: EnvironmentTeamSlot,
  battleType: EnvironmentBattleType,
  sampleIndex: number,
  slotIndex: number,
  ids: { pokemon: Set<string>; moves: Set<string>; items: Set<string>; abilities: Set<string>; natures: Set<string> },
  issues: EnvironmentDatasetAuditIssue[],
): EnvironmentTeamSlot | undefined => {
  const path = `battles.${battleType}.teamSamples[${sampleIndex}].slots[${slotIndex}]`;

  if (!ids.pokemon.has(slot.pokemonId)) {
    issues.push(issue('missing-pokemon-ref', `${path}.pokemonId`, `${path} references unknown Pokemon ${slot.pokemonId}.`));
    return undefined;
  }

  const moveIds = filterKnownIds(slot.moveIds, ids.moves, 'missing-move-ref', `${path}.moveIds`, issues);
  const formId = slot.formId?.trim() || undefined;
  const abilityId = slot.abilityId && ids.abilities.has(slot.abilityId) ? slot.abilityId : undefined;
  if (slot.abilityId && !abilityId) {
    issues.push(issue('missing-ability-ref', `${path}.abilityId`, `${path} references unknown ability ${slot.abilityId}.`));
  }
  const nature = slot.nature && ids.natures.has(slot.nature) ? slot.nature : undefined;
  if (slot.nature && !nature) {
    issues.push(issue('missing-nature-ref', `${path}.nature`, `${path} references unknown nature ${slot.nature}.`));
  }

  if (slot.itemId && !ids.items.has(slot.itemId)) {
    issues.push(issue('missing-item-ref', `${path}.itemId`, `${path} references unknown item ${slot.itemId}.`));
    return {
      pokemonId: slot.pokemonId,
      ...(formId ? { formId } : {}),
      ...(abilityId ? { abilityId } : {}),
      ...(nature ? { nature } : {}),
      ...(slot.statPoints ? { statPoints: slot.statPoints } : {}),
      moveIds,
    };
  }

  return {
    pokemonId: slot.pokemonId,
    ...(formId ? { formId } : {}),
    ...(abilityId ? { abilityId } : {}),
    ...(slot.itemId ? { itemId: slot.itemId } : {}),
    ...(nature ? { nature } : {}),
    ...(slot.statPoints ? { statPoints: slot.statPoints } : {}),
    moveIds,
  };
};

const normalizeSample = (
  sample: EnvironmentTeamSample,
  battleType: EnvironmentBattleType,
  index: number,
  ids: { pokemon: Set<string>; moves: Set<string>; items: Set<string>; abilities: Set<string>; natures: Set<string> },
  issues: EnvironmentDatasetAuditIssue[],
): EnvironmentTeamSample | undefined => {
  const path = `battles.${battleType}.teamSamples[${index}]`;

  if (sample.battleType !== battleType) {
    issues.push(
      issue(
        'sample-battle-type-mismatch',
        `${path}.battleType`,
        `${path} is stored under ${battleType} but declares ${sample.battleType}.`,
      ),
    );
  }

  const slots = sample.slots
    .map((slot, slotIndex) => normalizeSlot(slot, battleType, index, slotIndex, ids, issues))
    .filter((slot): slot is EnvironmentTeamSlot => Boolean(slot));

  if (slots.length === 0) {
    issues.push(issue('sample-empty-slots', `${path}.slots`, `${path} has no valid slots.`));
    return undefined;
  }

  return {
    ...sample,
    battleType,
    slots,
  };
};

export function auditEnvironmentDataset(
  dataset: EnvironmentDataset,
  catalog: EnvironmentDatasetCatalog,
  expected?: { ruleSetId: string; dataVersionId: string },
): EnvironmentDatasetAuditResult {
  const issues: EnvironmentDatasetAuditIssue[] = [];
  const ids = {
    pokemon: toSet(catalog.pokemonIds),
    moves: toSet(catalog.moveIds),
    items: toSet(catalog.itemIds),
    abilities: toSet(catalog.abilityIds ?? []),
    natures: toSet(catalog.natureIds ?? []),
  };

  if (expected && dataset.ruleSetId !== expected.ruleSetId) {
    issues.push(
      issue('rule-set-mismatch', 'ruleSetId', `Environment dataset uses ${dataset.ruleSetId}, expected ${expected.ruleSetId}.`),
    );
  }

  if (expected && dataset.dataVersionId !== expected.dataVersionId) {
    issues.push(
      issue(
        'data-version-mismatch',
        'dataVersionId',
        `Environment dataset uses ${dataset.dataVersionId}, expected ${expected.dataVersionId}.`,
      ),
    );
  }

  const battles = battleTypes.reduce((acc, battleType) => {
    const battle = dataset.battles[battleType];
    if (!battle) {
      issues.push(issue('missing-battle-data', `battles.${battleType}`, `Environment dataset is missing ${battleType} data.`));
      acc[battleType] = { pokemonUsage: [], teamSamples: [] };
      return acc;
    }

    acc[battleType] = {
      pokemonUsage: battle.pokemonUsage
        .map((usage, index) => normalizeUsage(usage, battleType, index, ids, issues))
        .filter((usage): usage is EnvironmentPokemonUsage => Boolean(usage)),
      ...(battle.sampleCount ? { sampleCount: battle.sampleCount } : {}),
      teamSamples: battle.teamSamples
        .map((sample, index) => normalizeSample(sample, battleType, index, ids, issues))
        .filter((sample): sample is EnvironmentTeamSample => Boolean(sample)),
    };
    return acc;
  }, {} as Record<EnvironmentBattleType, EnvironmentBattleDataset>);

  return {
    dataset: {
      ...dataset,
      battles,
    },
    issues,
  };
}
