import { currentRuleNatureOptions, pokemon } from '../data';
import type { StatPoints, TeamMember } from '../types';
import { currentRuleMovesForPokemon } from './currentRuleCatalog';
import { createId } from './id';
import { findBattleForm } from './pokemonForms';

export const emptyStatPoints = (): StatPoints => ({
  hp: 0,
  attack: 0,
  defense: 0,
  specialAttack: 0,
  specialDefense: 0,
  speed: 0,
});

export const defaultTeamMemberNature = () => currentRuleNatureOptions.find((option) => option.neutral)?.id ?? '认真';

export function createDefaultTeamMember({
  pokemonId,
  formId,
  abilityId,
  itemId,
  prefillMoves = false,
  notes = '',
}: {
  pokemonId?: string;
  formId?: string;
  abilityId?: string;
  itemId?: string;
  prefillMoves?: boolean;
  notes?: string;
} = {}): TeamMember {
  const entry = pokemon.find((candidate) => candidate.id === pokemonId);
  const defaultFormId = entry ? entry.id : undefined;
  const selectedForm = entry ? findBattleForm(entry.id, formId ?? defaultFormId) : undefined;
  const moveIds = entry && prefillMoves
    ? currentRuleMovesForPokemon(entry.id).slice(0, 4).map((move) => move.id)
    : [];

  return {
    id: createId('member'),
    pokemonId: entry?.id ?? pokemonId,
    formId: formId ?? defaultFormId,
    abilityId: abilityId ?? selectedForm?.abilities[0] ?? entry?.abilities[0],
    itemId,
    moveIds,
    nature: defaultTeamMemberNature(),
    statPoints: emptyStatPoints(),
    level: 50,
    notes,
    legalityStatus: 'missing-config',
  };
}
