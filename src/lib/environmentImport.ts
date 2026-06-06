import { currentDataVersion, currentRuleNatureOptions, currentRuleSet, pokemon } from '../data';
import type { EnvironmentTeamSample } from '../data/environment';
import type { Team, TeamMember } from '../types';
import { currentRuleMovesForPokemon } from './currentRuleCatalog';
import { createId } from './id';

const neutralImportNature = () => currentRuleNatureOptions.find((option) => option.neutral)?.id ?? '认真';

const createImportedMember = (slot: EnvironmentTeamSample['slots'][number]): TeamMember | null => {
  const entry = pokemon.find((candidate) => candidate.id === slot.pokemonId);
  if (!entry) return null;

  const inferredAbilityIds = entry.abilities.length === 1 ? entry.abilities : [];
  const legalMoves = currentRuleMovesForPokemon(entry.id).map((move) => move.id);
  const moveIds = slot.moveIds.filter((moveId) => legalMoves.includes(moveId)).slice(0, 4);

  return {
    id: createId('member'),
    pokemonId: entry.id,
    formId: entry.id,
    abilityId: inferredAbilityIds.length === 1 ? inferredAbilityIds[0] : undefined,
    itemId: slot.itemId,
    moveIds,
    nature: neutralImportNature(),
    statPoints: {},
    level: 50,
    notes: '从环境上位构筑导入；PokeDB 快照仅包含宝可梦与道具，性格 / SP / 配招需手动确认。',
    legalityStatus: 'needs-review',
  };
};

export const createImportedTeamFromEnvironmentSample = (sample: EnvironmentTeamSample, dataStatusLabel: string): Team => {
  const members = sample.slots.map(createImportedMember).filter((member): member is TeamMember => Boolean(member));
  const timestamp = new Date().toISOString();

  return {
    id: createId('team'),
    name: sample.title,
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
    members,
    createdAt: timestamp,
    updatedAt: timestamp,
    notes: '',
    source: {
      kind: 'environment-sample-import',
      sampleId: sample.id,
      title: sample.title,
      label: dataStatusLabel,
      battleType: sample.battleType,
      reportUrl: sample.reportUrl,
      importedAt: timestamp,
    },
  };
};
