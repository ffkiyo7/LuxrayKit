import { currentDataVersion, currentRuleSet, items, moves, pokemon } from './seed/regMA';
import { currentEnvironmentDataset } from './environmentDatasetSeed';
import {
  auditEnvironmentDataset,
  type EnvironmentBattleType,
  type EnvironmentDatasetAuditIssue,
  type EnvironmentPokemonUsage,
  type EnvironmentTeamSample,
  type EnvironmentTeamSlot,
} from '../lib/environmentDataset';

export type {
  EnvironmentBattleType,
  EnvironmentDatasetAuditIssue,
  EnvironmentPokemonUsage,
  EnvironmentTeamSample,
  EnvironmentTeamSlot,
};

const auditedEnvironmentDataset = auditEnvironmentDataset(
  currentEnvironmentDataset,
  {
    pokemonIds: pokemon.map((entry) => entry.id),
    moveIds: moves.map((entry) => entry.id),
    itemIds: items.map((entry) => entry.id),
  },
  {
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
  },
);

const environmentDataset = auditedEnvironmentDataset.dataset;

export const environmentDatasetAuditIssues: EnvironmentDatasetAuditIssue[] = auditedEnvironmentDataset.issues;
export const environmentUpdatedAt = environmentDataset.updatedAt;
export const environmentDataStatusLabel = environmentDataset.statusLabel;

export const environmentPokemonUsage: Record<EnvironmentBattleType, EnvironmentPokemonUsage[]> = {
  singles: environmentDataset.battles.singles.pokemonUsage,
  doubles: environmentDataset.battles.doubles.pokemonUsage,
};

export const environmentTeamSamples: EnvironmentTeamSample[] = [
  ...environmentDataset.battles.singles.teamSamples,
  ...environmentDataset.battles.doubles.teamSamples,
];

export const getEnvironmentPokemon = (pokemonId: string) => pokemon.find((entry) => entry.id === pokemonId);
export const getEnvironmentMove = (moveId: string) => moves.find((entry) => entry.id === moveId);
export const getEnvironmentItem = (itemId: string) => items.find((entry) => entry.id === itemId);

export const environmentSourceLabel = environmentDataset.sourceLabel;
