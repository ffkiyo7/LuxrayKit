import { abilities, currentDataVersion, currentRuleNatureOptions, currentRuleSet, items, moves, pokemon, regMaPokemonAllowlist } from './seed/regMA';
import { currentEnvironmentDataset } from './environmentDatasetSeed';
import { pokedbItemNameToId } from './external/pokedbItemNameMap';
import {
  auditEnvironmentDataset,
  type EnvironmentBattleType,
  type EnvironmentDataset,
  type EnvironmentDatasetAuditIssue,
  type EnvironmentPokemonUsage,
  type EnvironmentReferenceUsage,
  type EnvironmentTeamSample,
  type EnvironmentTeamSlot,
  type EnvironmentUsageBasis,
} from '../lib/environmentDataset';
import {
  buildEnvironmentDatasetFromPokeDbOpenData,
  buildEnvironmentDatasetFromPokeDbStatistics,
  buildEnvironmentDatasetFromPokeDbTrainerLists,
  createPokeDbPokemonKeyMap,
  type PokeDbRankedTeamsPayload,
  type PokeDbPokemonStatisticsPayload,
  type PokeDbTrainerListPayload,
} from '../lib/pokedbEnvironment';

export type {
  EnvironmentBattleType,
  EnvironmentDatasetAuditIssue,
  EnvironmentPokemonUsage,
  EnvironmentTeamSample,
  EnvironmentTeamSlot,
  EnvironmentUsageBasis,
};

export const WORKER_ENVIRONMENT_SNAPSHOT_URL = '/api/environment/latest';
export const POKEDB_ENVIRONMENT_SNAPSHOT_URL = '/data/pokedb/reg-ma-s1-environment.json';

export type PokeDbEnvironmentSnapshotPayload = {
  retrievedAt: string;
  battles: Partial<Record<EnvironmentBattleType, PokeDbRankedTeamsPayload | PokeDbTrainerListPayload | PokeDbPokemonStatisticsPayload>>;
  moveStats?: Partial<Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>>;
  teamSamples?: Partial<Record<EnvironmentBattleType, EnvironmentTeamSample[]>>;
};

export type EnvironmentState = {
  auditIssues: EnvironmentDatasetAuditIssue[];
  updatedAt: string;
  sourceUpdatedAt: string;
  seasonLabel: string;
  sourceKind: 'worker' | 'static' | 'seed';
  freshness: 'fresh' | 'stale';
  dataStatusLabel: string;
  overallUsageBasis: EnvironmentUsageBasis;
  pokemonUsage: Record<EnvironmentBattleType, EnvironmentPokemonUsage[]>;
  sampleTeamCounts: Record<EnvironmentBattleType, number>;
  teamSamples: EnvironmentTeamSample[];
  sourceLabel: string;
  loadStatus: 'pokedb' | 'fallback';
};

const environmentCatalog = {
  pokemonIds: pokemon.map((entry) => entry.id),
  moveIds: moves.map((entry) => entry.id),
  itemIds: items.map((entry) => entry.id),
  abilityIds: abilities.map((entry) => entry.id),
  natureIds: currentRuleNatureOptions.map((entry) => entry.id),
};

const expectedEnvironmentMetadata = {
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
};

const pokemonKeyToId = createPokeDbPokemonKeyMap(regMaPokemonAllowlist, pokemon);

const auditDataset = (dataset: EnvironmentDataset) => auditEnvironmentDataset(dataset, environmentCatalog, expectedEnvironmentMetadata);

const currentEnvironmentSeedAudit = auditDataset(currentEnvironmentDataset);

const estimateSampleTeamCount = (usage: EnvironmentPokemonUsage[]) => {
  const estimates = usage
    .map((entry) => (entry.usageRate > 0 ? Math.round(entry.teamCount / (entry.usageRate / 100)) : 0))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (estimates.length === 0) return usage.reduce((max, entry) => Math.max(max, entry.teamCount), 0);

  const counts = new Map<number, number>();
  estimates.forEach((estimate) => counts.set(estimate, (counts.get(estimate) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
};

const toEnvironmentState = (
  dataset: EnvironmentDataset,
  metadata: Pick<EnvironmentState, 'loadStatus' | 'seasonLabel' | 'sourceKind' | 'freshness'>,
  extraAuditIssues: EnvironmentDatasetAuditIssue[] = [],
): EnvironmentState => {
  const audited = auditDataset(dataset);
  return {
    auditIssues: [...audited.issues, ...extraAuditIssues],
    updatedAt: audited.dataset.source.retrievedAt ?? audited.dataset.updatedAt,
    sourceUpdatedAt: audited.dataset.updatedAt,
    seasonLabel: metadata.seasonLabel,
    sourceKind: metadata.sourceKind,
    freshness: metadata.freshness,
    dataStatusLabel: audited.dataset.statusLabel,
    overallUsageBasis: audited.dataset.overallUsageBasis ?? 'absolute',
    pokemonUsage: {
      singles: audited.dataset.battles.singles.pokemonUsage,
      doubles: audited.dataset.battles.doubles.pokemonUsage,
    },
    sampleTeamCounts: {
      singles: audited.dataset.battles.singles.sampleCount ?? estimateSampleTeamCount(audited.dataset.battles.singles.pokemonUsage),
      doubles: audited.dataset.battles.doubles.sampleCount ?? estimateSampleTeamCount(audited.dataset.battles.doubles.pokemonUsage),
    },
    teamSamples: [...audited.dataset.battles.singles.teamSamples, ...audited.dataset.battles.doubles.teamSamples],
    sourceLabel: audited.dataset.sourceLabel,
    loadStatus: metadata.loadStatus,
  };
};

export const environmentFallbackState = toEnvironmentState(currentEnvironmentDataset, {
  loadStatus: 'fallback',
  seasonLabel: '开发样例',
  sourceKind: 'seed',
  freshness: 'stale',
});

const isTrainerListPayload = (
  payload: PokeDbRankedTeamsPayload | PokeDbTrainerListPayload | PokeDbPokemonStatisticsPayload | undefined,
): payload is PokeDbTrainerListPayload => Boolean(payload && 'seasonNumber' in payload && 'updatedAt' in payload);

const isStatisticsPayload = (
  payload: PokeDbRankedTeamsPayload | PokeDbTrainerListPayload | PokeDbPokemonStatisticsPayload | undefined,
): payload is PokeDbPokemonStatisticsPayload => Boolean(payload && 'pokemonUsage' in payload && 'detailCount' in payload);

export const createPokeDbEnvironmentDatasetFromSnapshot = (snapshot: PokeDbEnvironmentSnapshotPayload): EnvironmentDataset => {
  const firstPayload = snapshot.battles.singles ?? snapshot.battles.doubles;
  if (isStatisticsPayload(firstPayload)) {
    return buildEnvironmentDatasetFromPokeDbStatistics({
      id: `pokedb-reg-ma-${firstPayload.season.toLowerCase()}-pokemon-statistics`,
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
      retrievedAt: snapshot.retrievedAt,
      battles: snapshot.battles as Partial<Record<EnvironmentBattleType, PokeDbPokemonStatisticsPayload>>,
      teamSamples: snapshot.teamSamples,
    });
  }
  if (isTrainerListPayload(firstPayload)) {
    return buildEnvironmentDatasetFromPokeDbTrainerLists({
      id: `pokedb-reg-ma-${firstPayload.season.toLowerCase()}-trainer-list`,
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
      retrievedAt: snapshot.retrievedAt,
      battles: snapshot.battles as Partial<Record<EnvironmentBattleType, PokeDbTrainerListPayload>>,
      moveStats: snapshot.moveStats,
    });
  }

  return buildEnvironmentDatasetFromPokeDbOpenData({
    id: 'pokedb-reg-ma-s1-ranked-teams',
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
    retrievedAt: snapshot.retrievedAt,
    pokemonKeyToId,
    itemNameToId: pokedbItemNameToId,
    itemIds: items.map((item) => item.id),
    battles: snapshot.battles as Partial<Record<EnvironmentBattleType, PokeDbRankedTeamsPayload>>,
    moveStats: snapshot.moveStats,
    teamSamples: snapshot.teamSamples,
  });
};

export const createEnvironmentStateFromPokeDbSnapshot = (
  snapshot: PokeDbEnvironmentSnapshotPayload,
  metadata: Pick<EnvironmentState, 'sourceKind' | 'freshness'> = {
    sourceKind: 'static',
    freshness: 'stale',
  },
): EnvironmentState => {
  const firstPayload = snapshot.battles.singles ?? snapshot.battles.doubles;
  const pokedbDataset = createPokeDbEnvironmentDatasetFromSnapshot(snapshot);
  const state = toEnvironmentState(
    pokedbDataset,
    {
      loadStatus: 'pokedb',
      seasonLabel: firstPayload?.season ?? '未知赛季',
      ...metadata,
    },
    currentEnvironmentSeedAudit.issues,
  );
  const hasUsablePokeDbUsage = state.pokemonUsage.singles.length > 0 && state.pokemonUsage.doubles.length > 0;
  return hasUsablePokeDbUsage ? state : environmentFallbackState;
};

type FetchedEnvironmentSnapshot = {
  snapshot: PokeDbEnvironmentSnapshotPayload;
  url: string;
  cacheState?: string;
};

const fetchEnvironmentSnapshot = async (
  fetcher: typeof fetch,
  url: string,
  cache: RequestCache,
): Promise<FetchedEnvironmentSnapshot> => {
  const response = await fetcher(url, {
    cache,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to load environment snapshot: ${response.status}`);
  return {
    snapshot: (await response.json()) as PokeDbEnvironmentSnapshotPayload,
    url,
    cacheState: response.headers.get('x-luxray-cache-state') ?? undefined,
  };
};

export const loadEnvironmentState = async (
  fetcher: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): Promise<EnvironmentState> => {
  if (!fetcher) return environmentFallbackState;

  try {
    const workerUrl = `${WORKER_ENVIRONMENT_SNAPSHOT_URL}?refresh=${Date.now()}`;
    const result = await fetchEnvironmentSnapshot(fetcher, workerUrl, 'no-store');
    return createEnvironmentStateFromPokeDbSnapshot(result.snapshot, {
      sourceKind: 'worker',
      freshness: result.cacheState === 'fresh' ? 'fresh' : 'stale',
    });
  } catch {
    // Static deployments and offline installs can keep using the bundled maintenance snapshot.
  }

  try {
    const result = await fetchEnvironmentSnapshot(fetcher, POKEDB_ENVIRONMENT_SNAPSHOT_URL, 'force-cache');
    return createEnvironmentStateFromPokeDbSnapshot(result.snapshot, {
      sourceKind: 'static',
      freshness: 'stale',
    });
  } catch {
    return environmentFallbackState;
  }
};

export const environmentDatasetAuditIssues: EnvironmentDatasetAuditIssue[] = environmentFallbackState.auditIssues;
export const environmentDataStatusLabel = environmentFallbackState.dataStatusLabel;

export const environmentPokemonUsage: Record<EnvironmentBattleType, EnvironmentPokemonUsage[]> = environmentFallbackState.pokemonUsage;

export const environmentTeamSamples: EnvironmentTeamSample[] = environmentFallbackState.teamSamples;

export const getEnvironmentPokemon = (pokemonId: string) => pokemon.find((entry) => entry.id === pokemonId);
export const getEnvironmentMove = (moveId: string) => moves.find((entry) => entry.id === moveId);
export const getEnvironmentItem = (itemId: string) => items.find((entry) => entry.id === itemId);

export const environmentSourceLabel = environmentFallbackState.sourceLabel;
