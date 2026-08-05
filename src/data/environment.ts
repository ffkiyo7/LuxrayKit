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
  type RegulationId,
} from '../lib/environmentDataset';
import { isImmediatePredecessor, type SeasonRankSnapshot } from '../lib/seasonRankDelta';
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
  RegulationId,
  SeasonRankSnapshot,
};

// The regulation the app is currently configured for. Surfaces as the default lens for
// team-sample browsing so users see teams that match the live rule set first.
export const currentRegulation: RegulationId = currentRuleSet.id === 'reg-mb' ? 'M-B' : 'M-A';

export const WORKER_ENVIRONMENT_SNAPSHOT_URL = '/api/environment/latest';
export const POKEDB_ENVIRONMENT_SNAPSHOT_URL = '/data/pokedb/reg-ma-environment.json';

export type PokeDbEnvironmentSnapshotPayload = {
  retrievedAt: string;
  battles: Partial<Record<EnvironmentBattleType, PokeDbRankedTeamsPayload | PokeDbTrainerListPayload | PokeDbPokemonStatisticsPayload>>;
  moveStats?: Partial<Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>>;
  teamSamples?: Partial<Record<EnvironmentBattleType, EnvironmentTeamSample[]>>;
  /** Written by the Worker at a season rollover; absent on older snapshots and on the static file. */
  previousSeason?: SeasonRankSnapshot;
};

export type EnvironmentState = {
  auditIssues: EnvironmentDatasetAuditIssue[];
  updatedAt: string;
  sourceUpdatedAt: string;
  seasonLabel: string;
  /**
   * The immediately-preceding season's ranks, when the snapshot carries one. Absent means the
   * UI shows no movement chips at all — never a zero or a guessed value.
   */
  previousSeason?: SeasonRankSnapshot;
  sourceKind: 'worker' | 'static' | 'seed';
  freshness: 'fresh' | 'stale';
  // Health of the refresh pipeline itself (distinct from freshness): 'degraded' means the
  // latest refresh attempt failed, so the data may lag the source even if we can't confirm it.
  sourceStatus: 'ok' | 'degraded';
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
  metadata: Pick<EnvironmentState, 'loadStatus' | 'seasonLabel' | 'sourceKind' | 'freshness' | 'sourceStatus' | 'previousSeason'>,
  extraAuditIssues: EnvironmentDatasetAuditIssue[] = [],
): EnvironmentState => {
  const audited = auditDataset(dataset);
  return {
    auditIssues: [...audited.issues, ...extraAuditIssues],
    updatedAt: audited.dataset.source.retrievedAt ?? audited.dataset.updatedAt,
    sourceUpdatedAt: audited.dataset.updatedAt,
    seasonLabel: metadata.seasonLabel,
    ...(metadata.previousSeason ? { previousSeason: metadata.previousSeason } : {}),
    sourceKind: metadata.sourceKind,
    freshness: metadata.freshness,
    sourceStatus: metadata.sourceStatus,
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
  sourceStatus: 'ok',
});

const isTrainerListPayload = (
  payload: PokeDbRankedTeamsPayload | PokeDbTrainerListPayload | PokeDbPokemonStatisticsPayload | undefined,
): payload is PokeDbTrainerListPayload => Boolean(payload && 'seasonNumber' in payload && 'updatedAt' in payload);

const isStatisticsPayload = (
  payload: PokeDbRankedTeamsPayload | PokeDbTrainerListPayload | PokeDbPokemonStatisticsPayload | undefined,
): payload is PokeDbPokemonStatisticsPayload => Boolean(payload && 'pokemonUsage' in payload && 'detailCount' in payload);

export const createPokeDbEnvironmentDatasetFromSnapshot = (
  snapshot: PokeDbEnvironmentSnapshotPayload,
  extraTeamSamples: EnvironmentTeamSample[] = [],
): EnvironmentDataset => {
  const mergedSnapshot = {
    ...snapshot,
    teamSamples: {
      ...snapshot.teamSamples,
      singles: [...(snapshot.teamSamples?.singles ?? []), ...extraTeamSamples.filter((sample) => sample.battleType === 'singles')],
      doubles: [...(snapshot.teamSamples?.doubles ?? []), ...extraTeamSamples.filter((sample) => sample.battleType === 'doubles')],
    },
  };
  const firstPayload = mergedSnapshot.battles.singles ?? mergedSnapshot.battles.doubles;
  if (isStatisticsPayload(firstPayload)) {
    return buildEnvironmentDatasetFromPokeDbStatistics({
      id: `pokedb-reg-ma-${firstPayload.season.toLowerCase()}-pokemon-statistics`,
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
      retrievedAt: mergedSnapshot.retrievedAt,
      battles: mergedSnapshot.battles as Partial<Record<EnvironmentBattleType, PokeDbPokemonStatisticsPayload>>,
      teamSamples: mergedSnapshot.teamSamples,
    });
  }
  if (isTrainerListPayload(firstPayload)) {
    return buildEnvironmentDatasetFromPokeDbTrainerLists({
      id: `pokedb-reg-ma-${firstPayload.season.toLowerCase()}-trainer-list`,
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
      retrievedAt: mergedSnapshot.retrievedAt,
      battles: mergedSnapshot.battles as Partial<Record<EnvironmentBattleType, PokeDbTrainerListPayload>>,
      moveStats: mergedSnapshot.moveStats,
    });
  }

  return buildEnvironmentDatasetFromPokeDbOpenData({
    id: 'pokedb-reg-ma-s1-ranked-teams',
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
    retrievedAt: mergedSnapshot.retrievedAt,
    pokemonKeyToId,
    itemNameToId: pokedbItemNameToId,
    itemIds: items.map((item) => item.id),
    battles: mergedSnapshot.battles as Partial<Record<EnvironmentBattleType, PokeDbRankedTeamsPayload>>,
    moveStats: mergedSnapshot.moveStats,
    teamSamples: mergedSnapshot.teamSamples,
  });
};

export const createEnvironmentStateFromPokeDbSnapshot = (
  snapshot: PokeDbEnvironmentSnapshotPayload,
  metadata: Pick<EnvironmentState, 'sourceKind' | 'freshness'> & { sourceStatus?: EnvironmentState['sourceStatus'] } = {
    sourceKind: 'static',
    freshness: 'stale',
  },
  extraTeamSamples: EnvironmentTeamSample[] = [],
): EnvironmentState => {
  const firstPayload = snapshot.battles.singles ?? snapshot.battles.doubles;
  const pokedbDataset = createPokeDbEnvironmentDatasetFromSnapshot(snapshot, extraTeamSamples);
  // Only diff against the season directly before this one. A snapshot that skipped a season
  // (Worker down through a rollover, hand-restored KV) would make "变动" mean something other
  // than "since last season", so we drop the predecessor rather than mislabel it.
  const currentSeasonNumber = isStatisticsPayload(firstPayload) ? firstPayload.seasonNumber : undefined;
  const previousSeason = isImmediatePredecessor(snapshot.previousSeason, currentSeasonNumber)
    ? snapshot.previousSeason
    : undefined;
  const state = toEnvironmentState(
    pokedbDataset,
    {
      loadStatus: 'pokedb',
      seasonLabel: firstPayload?.season ?? '未知赛季',
      ...(previousSeason ? { previousSeason } : {}),
      ...metadata,
      sourceStatus: metadata.sourceStatus ?? 'ok',
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
  sourceStatus?: string;
  latestSourceUpdatedAt?: string;
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
    sourceStatus: response.headers.get('x-luxray-source-status') ?? undefined,
    latestSourceUpdatedAt: response.headers.get('x-luxray-latest-source-updated-at') ?? undefined,
  };
};

const parseEnvironmentSourceTime = (value: string | undefined) => {
  if (!value) return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}+09:00`
    : value;
  return Date.parse(normalized);
};

let vgcPastesTeamSamplesPromise: Promise<EnvironmentTeamSample[]> | undefined;

// Each regulation's curated VGCPastes set is its own build-time chunk. They load
// independently so a missing/failed file for one regulation never blanks out the other
// (a regression Task 8 hardened against). M-A is tagged implicitly via sampleRegulation.
const loadVgcPastesRegulationFile = async (
  loader: () => Promise<{ default: unknown }>,
  label: string,
): Promise<EnvironmentTeamSample[]> => {
  try {
    const payload = (await loader()).default;
    if (!Array.isArray(payload)) throw new Error(`VGCPastes ${label} payload is not an array.`);
    return payload as EnvironmentTeamSample[];
  } catch (error) {
    console.error(`Failed to load VGCPastes ${label} team samples; continuing without them.`, error);
    return [];
  }
};

const loadVgcPastesTeamSamples = async (): Promise<EnvironmentTeamSample[]> => {
  vgcPastesTeamSamplesPromise ??= Promise.all([
    loadVgcPastesRegulationFile(() => import('./external/vgcpastes/reg_ma_champions_ma_team_samples.json'), 'M-A'),
    loadVgcPastesRegulationFile(() => import('./external/vgcpastes/reg_mb_champions_mb_team_samples.json'), 'M-B'),
  ])
    .then((groups) => groups.flat())
    .catch((error) => {
      vgcPastesTeamSamplesPromise = undefined;
      console.error('Failed to load VGCPastes team samples; continuing with PokeDB-only environment data.', error);
      return [];
    });
  return vgcPastesTeamSamplesPromise;
};

export const loadEnvironmentState = async (
  fetcher: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): Promise<EnvironmentState> => {
  if (!fetcher) return environmentFallbackState;

  // The curated VGCPastes samples are fetched only after a base snapshot loads, so
  // the worker/static snapshot remains the primary (first) request.
  try {
    const workerUrl = `${WORKER_ENVIRONMENT_SNAPSHOT_URL}?refresh=${Date.now()}`;
    const result = await fetchEnvironmentSnapshot(fetcher, workerUrl, 'no-store');
    const workerMetadata = {
      sourceKind: 'worker' as const,
      freshness: result.cacheState === 'fresh' ? 'fresh' as const : 'stale' as const,
      sourceStatus: result.sourceStatus === 'degraded' ? 'degraded' as const : 'ok' as const,
    };

    if (workerMetadata.freshness === 'fresh' && workerMetadata.sourceStatus === 'ok') {
      const vgcPastesTeamSamples = await loadVgcPastesTeamSamples();
      return createEnvironmentStateFromPokeDbSnapshot(result.snapshot, workerMetadata, vgcPastesTeamSamples);
    }

    // A stale or degraded Worker can lag behind the independently maintained static
    // snapshot. Compare their source timestamps instead of accepting the Worker solely
    // because it still returned HTTP 200.
    try {
      const staticResult = await fetchEnvironmentSnapshot(fetcher, POKEDB_ENVIRONMENT_SNAPSHOT_URL, 'force-cache');
      const vgcPastesTeamSamples = await loadVgcPastesTeamSamples();
      const workerState = createEnvironmentStateFromPokeDbSnapshot(result.snapshot, workerMetadata, vgcPastesTeamSamples);
      const staticState = createEnvironmentStateFromPokeDbSnapshot(staticResult.snapshot, {
        sourceKind: 'static',
        freshness: 'stale',
      }, vgcPastesTeamSamples);
      const workerSourceTime = parseEnvironmentSourceTime(workerState.sourceUpdatedAt);
      const staticSourceTime = parseEnvironmentSourceTime(staticState.sourceUpdatedAt);
      const latestSourceTime = parseEnvironmentSourceTime(result.latestSourceUpdatedAt);
      if (Number.isFinite(staticSourceTime) && (!Number.isFinite(workerSourceTime) || staticSourceTime > workerSourceTime)) {
        return {
          ...staticState,
          freshness: Number.isFinite(latestSourceTime) && staticSourceTime >= latestSourceTime ? 'fresh' : 'stale',
        };
      }
      return workerState;
    } catch {
      // Keep serving the usable Worker snapshot when the static fallback is unavailable.
    }

    const vgcPastesTeamSamples = await loadVgcPastesTeamSamples();
    return createEnvironmentStateFromPokeDbSnapshot(result.snapshot, workerMetadata, vgcPastesTeamSamples);
  } catch {
    // Static deployments and offline installs can keep using the bundled maintenance snapshot.
  }

  try {
    const result = await fetchEnvironmentSnapshot(fetcher, POKEDB_ENVIRONMENT_SNAPSHOT_URL, 'force-cache');
    const vgcPastesTeamSamples = await loadVgcPastesTeamSamples();
    return createEnvironmentStateFromPokeDbSnapshot(result.snapshot, {
      sourceKind: 'static',
      freshness: 'stale',
    }, vgcPastesTeamSamples);
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
