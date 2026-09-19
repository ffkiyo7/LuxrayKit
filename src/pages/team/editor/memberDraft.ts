import { abilities, items, moves, pokemon } from '../../../data';
import { findBattleForm } from '../../../lib/pokemonForms';
import { statPointKeys } from '../../../lib/statPoints';
import type { Team, TeamMember } from '../../../types';

/**
 * The editor edits a copy. Everything below turns that copy back into a team — including the
 * one edit that reaches past the member being edited: a held item another member already
 * carries is *transferred* (拍板决策), and the transfer is staged here until 保存配置, so
 * 取消 rolls both members back by simply throwing the draft away.
 */

export type StagedItemTransfer = {
  itemId: string;
  /** The teammate the item will be taken from when the draft is saved. */
  fromMemberId: string;
};

export type DraftChange = {
  /** Row label in N03-12's 放弃改动 list, e.g. 「招式 2」. */
  label: string;
  /** 「拍落 → 棉花孢子」. */
  detail: string;
};

export const NO_ITEM_LABEL = '未携带';

/** The teammate already carrying `itemId`, if any — 03-09's conflict. */
export const memberHoldingItem = (team: Team, itemId: string, exceptMemberId: string) =>
  team.members.find((member) => member.id !== exceptMemberId && member.itemId === itemId);

/**
 * The team's member list with the draft written back and any staged transfer applied. The
 * donor keeps everything but the item, which is what 03-09 promises.
 */
export const applyMemberEdit = (team: Team, draft: TeamMember, transfer?: StagedItemTransfer | null): TeamMember[] =>
  team.members.map((member) => {
    if (member.id === draft.id) return draft;
    if (transfer && member.id === transfer.fromMemberId && member.itemId === transfer.itemId) {
      return { ...member, itemId: undefined };
    }
    return member;
  });

const itemName = (itemId?: string) => (itemId ? items.find((item) => item.id === itemId)?.chineseName ?? itemId : NO_ITEM_LABEL);
const moveName = (moveId?: string) => (moveId ? moves.find((move) => move.id === moveId)?.chineseName ?? moveId : '空');
const abilityName = (abilityId?: string) =>
  abilityId ? abilities.find((ability) => ability.id === abilityId)?.chineseName ?? abilityId : '未选';
const pokemonName = (pokemonId?: string) =>
  pokemonId ? pokemon.find((entry) => entry.id === pokemonId)?.chineseName ?? pokemonId : '未选';
const formName = (member: TeamMember) => {
  if (!member.pokemonId) return '未选';
  const form = findBattleForm(member.pokemonId, member.formId);
  return form?.chineseName ?? pokemonName(member.pokemonId);
};

const statLabels: Record<string, string> = {
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  specialAttack: '特攻',
  specialDefense: '特防',
  speed: '速度',
};

/** Every field the draft moved, in the order N03-12 lists them. */
export function draftChanges(original: TeamMember, draft: TeamMember): DraftChange[] {
  const changes: DraftChange[] = [];

  if (original.pokemonId !== draft.pokemonId) {
    changes.push({ label: '宝可梦', detail: `${pokemonName(original.pokemonId)} → ${pokemonName(draft.pokemonId)}` });
  } else if (original.formId !== draft.formId) {
    changes.push({ label: '形态', detail: `${formName(original)} → ${formName(draft)}` });
  }

  statPointKeys.forEach((key) => {
    const before = Number(original.statPoints[key] ?? 0);
    const after = Number(draft.statPoints[key] ?? 0);
    if (before !== after) changes.push({ label: '能力分配', detail: `${statLabels[key]} ${before} → ${after}` });
  });

  for (let slot = 0; slot < 4; slot += 1) {
    const before = original.moveIds[slot];
    const after = draft.moveIds[slot];
    if (before !== after) changes.push({ label: `招式 ${slot + 1}`, detail: `${moveName(before)} → ${moveName(after)}` });
  }

  if (original.itemId !== draft.itemId) {
    changes.push({ label: '道具', detail: `${itemName(original.itemId)} → ${itemName(draft.itemId)}` });
  }
  if (original.abilityId !== draft.abilityId) {
    changes.push({ label: '特性', detail: `${abilityName(original.abilityId)} → ${abilityName(draft.abilityId)}` });
  }
  if (original.nature !== draft.nature) {
    changes.push({ label: '性格', detail: `${original.nature} → ${draft.nature}` });
  }

  return changes;
}
