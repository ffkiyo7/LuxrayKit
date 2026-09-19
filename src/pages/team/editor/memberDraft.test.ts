import { describe, expect, it } from 'vitest';
import { currentDataVersion, currentRuleSet } from '../../../data';
import type { Team, TeamMember } from '../../../types';
import { applyMemberEdit, draftChanges, memberHoldingItem } from './memberDraft';

const member = (patch: Partial<TeamMember> = {}): TeamMember => ({
  id: 'member-garchomp',
  pokemonId: 'garchomp',
  formId: 'garchomp',
  abilityId: 'rough-skin',
  itemId: undefined,
  moveIds: ['earthquake', 'protect'],
  nature: '爽朗',
  statPoints: { attack: 32, speed: 24 },
  level: 50,
  notes: '',
  legalityStatus: 'legal',
  ...patch,
});

const team = (members: TeamMember[]): Team => ({
  id: 'team-alpha',
  name: '甲队',
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  notes: '',
  members,
});

const incineroar = member({ id: 'member-incineroar', pokemonId: 'incineroar', formId: 'incineroar', itemId: 'focus-sash' });

describe('memberHoldingItem', () => {
  it('finds the teammate already carrying an item and ignores the member being edited', () => {
    const roster = team([member({ itemId: 'focus-sash' }), incineroar]);

    expect(memberHoldingItem(roster, 'focus-sash', 'member-garchomp')?.id).toBe('member-incineroar');
    expect(memberHoldingItem(roster, 'focus-sash', 'member-incineroar')?.id).toBe('member-garchomp');
    expect(memberHoldingItem(roster, 'life-orb', 'member-garchomp')).toBeUndefined();
  });
});

describe('applyMemberEdit', () => {
  it('writes the draft back without touching anyone else when nothing is staged', () => {
    const roster = team([member(), incineroar]);
    const next = applyMemberEdit(roster, member({ itemId: 'life-orb' }));

    expect(next.map((entry) => entry.itemId)).toEqual(['life-orb', 'focus-sash']);
  });

  it('takes the item off the donor only when the transfer is saved with the draft', () => {
    const roster = team([member(), incineroar]);
    const draft = member({ itemId: 'focus-sash' });

    // Staging alone changes nothing: 取消 throws the draft away and both members roll back.
    expect(roster.members.find((entry) => entry.id === 'member-incineroar')?.itemId).toBe('focus-sash');

    const next = applyMemberEdit(roster, draft, { itemId: 'focus-sash', fromMemberId: 'member-incineroar' });
    expect(next.find((entry) => entry.id === 'member-garchomp')?.itemId).toBe('focus-sash');
    expect(next.find((entry) => entry.id === 'member-incineroar')?.itemId).toBeUndefined();
    // The donor keeps everything else (03-09: 「其余配置不变」).
    expect(next.find((entry) => entry.id === 'member-incineroar')?.moveIds).toEqual(incineroar.moveIds);
  });

  it('leaves the donor alone when it no longer carries the staged item', () => {
    const roster = team([member(), member({ id: 'member-incineroar', pokemonId: 'incineroar', itemId: 'life-orb' })]);
    const next = applyMemberEdit(roster, member({ itemId: 'focus-sash' }), {
      itemId: 'focus-sash',
      fromMemberId: 'member-incineroar',
    });

    expect(next.find((entry) => entry.id === 'member-incineroar')?.itemId).toBe('life-orb');
  });
});

describe('draftChanges', () => {
  it('reports nothing for an untouched draft', () => {
    expect(draftChanges(member(), member())).toEqual([]);
  });

  it('lists SP, move and item moves the way N03-12 writes them', () => {
    const changes = draftChanges(
      member(),
      member({ statPoints: { attack: 32, speed: 32 }, moveIds: ['earthquake', 'swords-dance'], itemId: 'focus-sash' }),
    );

    expect(changes).toEqual([
      { label: '能力分配', detail: '速度 24 → 32' },
      { label: '招式 2', detail: '守住 → 剑舞' },
      { label: '道具', detail: '未携带 → 气势披带' },
    ]);
  });

  it('collapses a form switch under 形态 but names the species when the Pokemon itself changed', () => {
    expect(draftChanges(member(), member({ formId: 'mega-garchomp' }))[0].label).toBe('形态');
    expect(draftChanges(member(), member({ pokemonId: 'incineroar', formId: 'incineroar' }))[0].label).toBe('宝可梦');
  });
});
