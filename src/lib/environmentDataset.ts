export type EnvironmentBattleType = 'singles' | 'doubles';

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

export type EnvironmentPokemonUsage = {
  pokemonId: string;
  usageRate: number;
  teamCount: number;
  moveIds: string[];
  itemIds: string[];
  teammateIds: string[];
  moveStats?: EnvironmentReferenceUsage[];
  itemStats?: EnvironmentReferenceUsage[];
  teammateStats?: EnvironmentReferenceUsage[];
};

export type EnvironmentTeamSlot = {
  pokemonId: string;
  itemId?: string;
  moveIds: string[];
};

export type EnvironmentTeamSample = {
  id: string;
  dataKind: 'development-sample' | 'external-snapshot';
  author: string;
  season?: string;
  score: number;
  rank?: number;
  title: string;
  battleType: EnvironmentBattleType;
  reportUrl: string;
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
};

export type EnvironmentDatasetAuditIssue = {
  code:
    | 'rule-set-mismatch'
    | 'data-version-mismatch'
    | 'missing-battle-data'
    | 'missing-pokemon-ref'
    | 'missing-move-ref'
    | 'missing-item-ref'
    | 'invalid-usage-rate'
    | 'invalid-team-count'
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
  code: Extract<EnvironmentDatasetAuditIssue['code'], 'missing-pokemon-ref' | 'missing-move-ref' | 'missing-item-ref'>,
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
  code: Extract<EnvironmentDatasetAuditIssue['code'], 'missing-pokemon-ref' | 'missing-move-ref' | 'missing-item-ref'>,
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

const normalizeUsage = (
  usage: EnvironmentPokemonUsage,
  battleType: EnvironmentBattleType,
  index: number,
  ids: { pokemon: Set<string>; moves: Set<string>; items: Set<string> },
  issues: EnvironmentDatasetAuditIssue[],
): EnvironmentPokemonUsage | undefined => {
  const path = `battles.${battleType}.pokemonUsage[${index}]`;

  if (!ids.pokemon.has(usage.pokemonId)) {
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

  return {
    pokemonId: usage.pokemonId,
    usageRate: usage.usageRate,
    teamCount: usage.teamCount,
    moveIds: filterKnownIds(usage.moveIds, ids.moves, 'missing-move-ref', `${path}.moveIds`, issues),
    itemIds: filterKnownIds(usage.itemIds, ids.items, 'missing-item-ref', `${path}.itemIds`, issues),
    teammateIds: filterKnownIds(usage.teammateIds, ids.pokemon, 'missing-pokemon-ref', `${path}.teammateIds`, issues),
    moveStats: normalizeReferenceStats(usage.moveStats, ids.moves, 'missing-move-ref', `${path}.moveStats`, issues),
    itemStats: normalizeReferenceStats(usage.itemStats, ids.items, 'missing-item-ref', `${path}.itemStats`, issues),
    teammateStats: normalizeReferenceStats(usage.teammateStats, ids.pokemon, 'missing-pokemon-ref', `${path}.teammateStats`, issues),
  };
};

const normalizeSlot = (
  slot: EnvironmentTeamSlot,
  battleType: EnvironmentBattleType,
  sampleIndex: number,
  slotIndex: number,
  ids: { pokemon: Set<string>; moves: Set<string>; items: Set<string> },
  issues: EnvironmentDatasetAuditIssue[],
): EnvironmentTeamSlot | undefined => {
  const path = `battles.${battleType}.teamSamples[${sampleIndex}].slots[${slotIndex}]`;

  if (!ids.pokemon.has(slot.pokemonId)) {
    issues.push(issue('missing-pokemon-ref', `${path}.pokemonId`, `${path} references unknown Pokemon ${slot.pokemonId}.`));
    return undefined;
  }

  const moveIds = filterKnownIds(slot.moveIds, ids.moves, 'missing-move-ref', `${path}.moveIds`, issues);

  if (slot.itemId && !ids.items.has(slot.itemId)) {
    issues.push(issue('missing-item-ref', `${path}.itemId`, `${path} references unknown item ${slot.itemId}.`));
    return {
      pokemonId: slot.pokemonId,
      moveIds,
    };
  }

  return {
    pokemonId: slot.pokemonId,
    ...(slot.itemId ? { itemId: slot.itemId } : {}),
    moveIds,
  };
};

const normalizeSample = (
  sample: EnvironmentTeamSample,
  battleType: EnvironmentBattleType,
  index: number,
  ids: { pokemon: Set<string>; moves: Set<string>; items: Set<string> },
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
