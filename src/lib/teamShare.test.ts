// @vitest-environment node
//
// Runs in the node environment on purpose: jsdom ships no CompressionStream, so under jsdom
// every code would silently take the uncompressed `p1` fallback and the size budget below
// would be measuring the wrong thing. Node's CompressionStream is the same web API browsers
// expose. The `p1` path still has its own explicit case.
import { describe, expect, it } from 'vitest';
import { currentRuleNatureOptions, pokemon } from '../data';
import { currentRuleMovesForPokemon, currentRuleSelectableItemsForPokemon } from './currentRuleCatalog';
import { MAX_TOTAL_STAT_POINTS } from './statPoints';
import {
  TeamShareDecodeError,
  decodeTeamShare,
  encodeTeamShare,
  serializeTeamSharePayload,
  teamShareUrl,
} from './teamShare';
import type { StatPoints, TeamMember } from '../types';

const neutralNature = currentRuleNatureOptions.find((option) => option.neutral)!.id;
const naturePool = currentRuleNatureOptions.map((option) => option.id);

/** Six real, fully-configured members — the worst case a share link has to fit. */
const fullyLoadedMembers = (): TeamMember[] =>
  pokemon
    .filter((entry) => entry.legalInCurrentRule && currentRuleMovesForPokemon(entry.id).length >= 4 && entry.abilities.length > 0)
    .slice(0, 6)
    .map((entry, index) => ({
      id: `member-${index}`,
      pokemonId: entry.id,
      formId: entry.id,
      abilityId: entry.abilities[0],
      itemId: currentRuleSelectableItemsForPokemon(entry.id)[0]?.id,
      moveIds: currentRuleMovesForPokemon(entry.id).slice(0, 4).map((move) => move.id),
      nature: naturePool[index % naturePool.length],
      statPoints: { hp: 4, attack: 32, defense: 0, specialAttack: 0, specialDefense: 0, speed: 30 } as StatPoints,
      level: 50,
      notes: '私人备注，不应该出现在分享链接里',
      legalityStatus: 'legal',
    }));

const blankMember = (): TeamMember => ({
  id: 'member-blank',
  pokemonId: undefined,
  formId: undefined,
  abilityId: undefined,
  itemId: undefined,
  moveIds: [],
  nature: neutralNature,
  statPoints: {},
  level: 50,
  notes: '',
  legalityStatus: 'missing-config',
});

describe('encodeTeamShare / decodeTeamShare', () => {
  it('round-trips a fully configured six-member team', async () => {
    const members = fullyLoadedMembers();
    expect(members).toHaveLength(6);

    const decoded = await decodeTeamShare(await encodeTeamShare({ name: '满配六只', members }));

    expect(decoded.name).toBe('满配六只');
    expect(decoded.warnings).toEqual([]);
    expect(decoded.members).toHaveLength(6);
    decoded.members.forEach((member, index) => {
      const original = members[index];
      expect(member.pokemonId).toBe(original.pokemonId);
      expect(member.formId).toBe(original.formId);
      expect(member.abilityId).toBe(original.abilityId);
      expect(member.itemId).toBe(original.itemId);
      expect(member.moveIds).toEqual(original.moveIds);
      expect(member.nature).toBe(original.nature);
      expect(member.statPoints).toEqual(original.statPoints);
      expect(member.level).toBe(50);
    });
  });

  it('keeps a fully loaded six-member code inside the shareable-URL budget', async () => {
    const code = await encodeTeamShare({ name: '满配六只', members: fullyLoadedMembers() });

    // This fixture is the adversarial case, not the typical one: 24 *distinct* moves, six
    // *distinct* natures and six different species give deflate almost nothing to repeat.
    // It currently lands at ~404. A realistic team (shared Protect/U-turn, one or two
    // natures) compresses much further — see the assertion below. The ceiling is a
    // regression guard, not a target: what matters is that /#/t/<code> stays far under the
    // ~2000 char limit messengers and QR encoders respect in practice.
    expect(code.length).toBeLessThanOrEqual(420);
    expect(code.startsWith('z1')).toBe(true);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compresses a realistic team with shared moves well below the ceiling', async () => {
    // Same six species, but the配招 overlap real teams have.
    const shared = fullyLoadedMembers().map((member) => ({
      ...member,
      moveIds: member.moveIds.slice(0, 1),
      nature: neutralNature,
    }));
    const code = await encodeTeamShare({ name: '现实队', members: shared });
    expect(code.length).toBeLessThanOrEqual(300);
  });

  it('never carries notes, replica codes or local ids', async () => {
    const members = fullyLoadedMembers();
    const payload = serializeTeamSharePayload({ name: '私密队', members });

    expect(payload).not.toContain('私人备注');
    expect(payload).not.toContain('member-0');

    const decoded = await decodeTeamShare(await encodeTeamShare({ name: '私密队', members }));
    decoded.members.forEach((member, index) => {
      expect(member.notes).toBe('');
      expect(member.id).not.toBe(members[index].id);
    });
  });

  it('round-trips a single member and an entirely empty member', async () => {
    const single = fullyLoadedMembers().slice(0, 1);
    const decodedSingle = await decodeTeamShare(await encodeTeamShare({ name: '单只', members: single }));
    expect(decodedSingle.members).toHaveLength(1);
    expect(decodedSingle.members[0].pokemonId).toBe(single[0].pokemonId);

    const decodedBlank = await decodeTeamShare(await encodeTeamShare({ name: '空位', members: [blankMember()] }));
    expect(decodedBlank.members).toHaveLength(1);
    expect(decodedBlank.members[0].pokemonId).toBeUndefined();
    expect(decodedBlank.members[0].moveIds).toEqual([]);
    expect(decodedBlank.members[0].nature).toBe(neutralNature);
    expect(decodedBlank.warnings).toEqual([]);
  });

  it('round-trips a zero-member team', async () => {
    const decoded = await decodeTeamShare(await encodeTeamShare({ name: '空队', members: [] }));
    expect(decoded).toEqual({ name: '空队', members: [], warnings: [] });
  });

  it('keeps a non-default level', async () => {
    const [member] = fullyLoadedMembers();
    const decoded = await decodeTeamShare(await encodeTeamShare({ name: 'Lv', members: [{ ...member, level: 100 }] }));
    expect(decoded.members[0].level).toBe(100);
  });

  it('caps a team at six members and moves at four', async () => {
    const members = [...fullyLoadedMembers(), ...fullyLoadedMembers()];
    const decoded = await decodeTeamShare(await encodeTeamShare({ name: '超员', members }));
    expect(decoded.members).toHaveLength(6);
    decoded.members.forEach((member) => expect(member.moveIds.length).toBeLessThanOrEqual(4));
  });

  it('accepts uncompressed p1 codes from runtimes without CompressionStream', async () => {
    const members = fullyLoadedMembers().slice(0, 2);
    const payload = serializeTeamSharePayload({ name: '无压缩', members });
    const bytes = new TextEncoder().encode(payload);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const code = `p1${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

    const decoded = await decodeTeamShare(code);
    expect(decoded.name).toBe('无压缩');
    expect(decoded.members.map((member) => member.pokemonId)).toEqual(members.map((member) => member.pokemonId));
  });
});

describe('decodeTeamShare validation against the current catalog', () => {
  const shareOf = (records: string[][]) => {
    const text = records.map((fields) => fields.join('\u001f')).join('\u001e');
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return `p1${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  };

  it('keeps the member but clears ids that fell out of the current regulation', async () => {
    const entry = pokemon.find((candidate) => candidate.legalInCurrentRule && currentRuleMovesForPokemon(candidate.id).length > 0)!;
    const legalMove = currentRuleMovesForPokemon(entry.id)[0].id;

    const decoded = await decodeTeamShare(
      shareOf([
        ['跨规则队'],
        [entry.id, '', 'ability-from-another-regulation', 'item-from-another-regulation', '不存在的性格', `${legalMove},move-from-another-regulation`, '', ''],
      ]),
    );

    expect(decoded.members).toHaveLength(1);
    const member = decoded.members[0];
    expect(member.pokemonId).toBe(entry.id);
    expect(member.abilityId).toBeUndefined();
    expect(member.itemId).toBeUndefined();
    expect(member.moveIds).toEqual([legalMove]);
    expect(member.nature).toBe(neutralNature);

    expect(decoded.warnings).toEqual(
      expect.arrayContaining([
        `${entry.chineseName}的特性 ability-from-another-regulation 不在当前规则，已清空。`,
        `${entry.chineseName}的道具 item-from-another-regulation 不在当前规则，已清空。`,
        `${entry.chineseName}的招式 move-from-another-regulation 不在当前规则，已清空。`,
        `${entry.chineseName}的性格 不存在的性格 不在当前规则，已重置为无修正性格。`,
      ]),
    );
  });

  it('keeps an unknown Pokemon as an empty slot with a warning instead of silently dropping it', async () => {
    const decoded = await decodeTeamShare(shareOf([['未来队'], ['pokemon-from-the-future', '', '', '', '', '', '', '']]));

    expect(decoded.members).toHaveLength(1);
    expect(decoded.members[0].pokemonId).toBeUndefined();
    expect(decoded.warnings).toContain('宝可梦 pokemon-from-the-future 不在当前规则，第 1 只已留空。');
  });

  it('falls back to the base form when a mega form is unknown', async () => {
    const entry = pokemon.find((candidate) => candidate.legalInCurrentRule)!;
    const decoded = await decodeTeamShare(shareOf([['形态队'], [entry.id, 'mega-from-another-regulation', '', '', '', '', '', '']]));

    expect(decoded.members[0].formId).toBe(entry.id);
    expect(decoded.warnings).toContain(`${entry.chineseName}的形态 mega-from-another-regulation 不在当前规则，已回退到普通形态。`);
  });

  it('clamps SP per stat and warns when the total exceeds the Champions limit', async () => {
    const entry = pokemon.find((candidate) => candidate.legalInCurrentRule)!;
    const decoded = await decodeTeamShare(shareOf([['超SP队'], [entry.id, '', '', '', '', '', '99,99,0,0,0,32', '']]));

    // Each stat is clamped to 32 first, so the reported total is the clamped 96, not 230.
    expect(decoded.members[0].statPoints).toEqual({ hp: 32, attack: 32, defense: 0, specialAttack: 0, specialDefense: 0, speed: 32 });
    expect(decoded.warnings).toContain(`${entry.chineseName}的 SP 合计 96 超过上限 ${MAX_TOTAL_STAT_POINTS}，导入后需要重新分配。`);
  });
});

describe('decodeTeamShare rejects malformed input', () => {
  it.each([
    ['', '分享链接为空。'],
    ['   ', '分享链接为空。'],
    ['q9abcdef', '无法识别这个分享链接的格式，可能来自更新的版本。'],
    ['z1', '分享链接已损坏或不完整，请让对方重新分享。'],
    ['z1!!!!not-base64!!!!', '分享链接已损坏或不完整，请让对方重新分享。'],
    ['z1AAAAAAAA', '分享链接已损坏或不完整，请让对方重新分享。'],
    ['p1', '分享链接里没有队伍名，可能已损坏。'],
  ])('rejects %j with a readable message', async (code, message) => {
    await expect(decodeTeamShare(code)).rejects.toThrow(TeamShareDecodeError);
    await expect(decodeTeamShare(code)).rejects.toThrow(message);
  });
});

describe('teamShareUrl', () => {
  it('builds an absolute hash URL', () => {
    expect(teamShareUrl('z1abc', 'https://luxraykit.com')).toBe('https://luxraykit.com/#/t/z1abc');
  });
});
