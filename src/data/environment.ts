import { currentDataVersion, currentRuleSet, items, moves, pokemon, regMaPokemonAllowlist } from './seed/regMA';
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
} from '../lib/environmentDataset';
import { buildEnvironmentDatasetFromPokeDbOpenData, createPokeDbPokemonKeyMap, type PokeDbRankedTeamsPayload } from '../lib/pokedbEnvironment';

export type {
  EnvironmentBattleType,
  EnvironmentDatasetAuditIssue,
  EnvironmentPokemonUsage,
  EnvironmentTeamSample,
  EnvironmentTeamSlot,
};

export const WORKER_ENVIRONMENT_SNAPSHOT_URL = '/api/environment/latest';
export const POKEDB_ENVIRONMENT_SNAPSHOT_URL = '/data/pokedb/reg-ma-s1-environment.json';

export type PokeDbEnvironmentSnapshotPayload = {
  retrievedAt: string;
  battles: Partial<Record<EnvironmentBattleType, PokeDbRankedTeamsPayload>>;
  moveStats?: Partial<Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>>;
  teamSamples?: Partial<Record<EnvironmentBattleType, EnvironmentTeamSample[]>>;
};

export type EnvironmentState = {
  auditIssues: EnvironmentDatasetAuditIssue[];
  updatedAt: string;
  dataStatusLabel: string;
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
  loadStatus: EnvironmentState['loadStatus'],
  extraAuditIssues: EnvironmentDatasetAuditIssue[] = [],
): EnvironmentState => {
  const audited = auditDataset(dataset);
  return {
    auditIssues: [...audited.issues, ...extraAuditIssues],
    updatedAt: audited.dataset.updatedAt,
    dataStatusLabel: audited.dataset.statusLabel,
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
    loadStatus,
  };
};

export const environmentFallbackState = toEnvironmentState(currentEnvironmentDataset, 'fallback');

export const createPokeDbEnvironmentDatasetFromSnapshot = (snapshot: PokeDbEnvironmentSnapshotPayload): EnvironmentDataset =>
  buildEnvironmentDatasetFromPokeDbOpenData({
    id: 'pokedb-reg-ma-s1-ranked-teams',
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
    retrievedAt: snapshot.retrievedAt,
    pokemonKeyToId,
    itemNameToId: pokedbItemNameToId,
    itemIds: items.map((item) => item.id),
    battles: snapshot.battles,
    moveStats: snapshot.moveStats,
    teamSamples: snapshot.teamSamples,
  });

export const createEnvironmentStateFromPokeDbSnapshot = (snapshot: PokeDbEnvironmentSnapshotPayload): EnvironmentState => {
  const pokedbDataset = createPokeDbEnvironmentDatasetFromSnapshot(snapshot);
  const state = toEnvironmentState(pokedbDataset, 'pokedb', currentEnvironmentSeedAudit.issues);
  const hasUsablePokeDbUsage = state.pokemonUsage.singles.length > 0 && state.pokemonUsage.doubles.length > 0;
  return hasUsablePokeDbUsage ? state : environmentFallbackState;
};

const fetchEnvironmentSnapshot = async (fetcher: typeof fetch, url: string, cache: RequestCache): Promise<PokeDbEnvironmentSnapshotPayload> => {
  const response = await fetcher(url, {
    cache,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to load environment snapshot: ${response.status}`);
  return (await response.json()) as PokeDbEnvironmentSnapshotPayload;
};

export const loadEnvironmentState = async (
  fetcher: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): Promise<EnvironmentState> => {
  if (!fetcher) return environmentFallbackState;

  try {
    const snapshot = await fetchEnvironmentSnapshot(fetcher, WORKER_ENVIRONMENT_SNAPSHOT_URL, 'no-store');
    return createEnvironmentStateFromPokeDbSnapshot(snapshot);
  } catch {
    // Static deployments and offline installs can keep using the bundled maintenance snapshot.
  }

  try {
    const snapshot = await fetchEnvironmentSnapshot(fetcher, POKEDB_ENVIRONMENT_SNAPSHOT_URL, 'force-cache');
    return createEnvironmentStateFromPokeDbSnapshot(snapshot);
  } catch {
    return environmentFallbackState;
  }
};

export const environmentDatasetAuditIssues: EnvironmentDatasetAuditIssue[] = environmentFallbackState.auditIssues;
export const environmentUpdatedAt = environmentFallbackState.updatedAt;
export const environmentDataStatusLabel = environmentFallbackState.dataStatusLabel;

export const environmentPokemonUsage: Record<EnvironmentBattleType, EnvironmentPokemonUsage[]> = environmentFallbackState.pokemonUsage;

export const environmentTeamSamples: EnvironmentTeamSample[] = environmentFallbackState.teamSamples;

export const getEnvironmentPokemon = (pokemonId: string) => pokemon.find((entry) => entry.id === pokemonId);
export const getEnvironmentMove = (moveId: string) => moves.find((entry) => entry.id === moveId);
export const getEnvironmentItem = (itemId: string) => items.find((entry) => entry.id === itemId);

export const environmentSourceLabel = environmentFallbackState.sourceLabel;
