import { abilities, currentRuleNatureOptions, items, pokemon } from '../data';
import type { StatPoints, Team, TeamMember } from '../types';
import { currentRuleMovesForPokemon, isCurrentRuleSelectableItem } from './currentRuleCatalog';
import { createId } from './id';
import { evaluateMemberLegality } from './legality';
import { defaultTeamMemberNature } from './teamMemberDefaults';
import { clampStatPointValue, MAX_TOTAL_STAT_POINTS, statPointKeys, statPointTotal } from './statPoints';

/**
 * Team share links — `<origin>/#/t/<code>`.
 *
 * The code carries only what another trainer needs to rebuild the team: name, and per member
 * pokemon / form / ability / item / nature / moves / SP / level. Deliberately NOT included:
 * `notes` (personal), `replicaCode` (an in-game code that goes stale and is not ours to
 * redistribute) and member/team `id`s (they are local IndexedDB keys; the importer mints fresh
 * ones so re-importing your own link cannot collide with the original).
 *
 * Wire format — a compact separator-delimited text, then deflate-raw, then base64url:
 *
 *   record 0  : team name
 *   record 1..: one member per record, fields in fixed order (US-separated), empty string when unset
 *               pokemonId / formId / abilityId / itemId / nature / moveIds(,) / SP(,) / level
 *
 * `formId` is dropped when it equals `pokemonId`, SP when all six are zero, and level when it
 * is the usual 50 — those three defaults cover the overwhelming majority of members and keep
 * a full six-member link comfortably inside a shareable URL.
 *
 * Two prefixes exist. `z1` is deflate-raw + base64url. `p1` is the same text base64url-encoded
 * with no compression, for runtimes without `CompressionStream` (older Safari). Decode accepts
 * both, so a link made on a modern phone still opens on an old one.
 */

const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';
const MOVE_SEPARATOR = ',';

const COMPRESSED_PREFIX = 'z1';
const PLAIN_PREFIX = 'p1';

const DEFAULT_LEVEL = 50;
export const MAX_SHARED_TEAM_NAME_LENGTH = 60;

export class TeamShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamShareDecodeError';
  }
}

export type DecodedTeamShare = {
  name: string;
  members: TeamMember[];
  warnings: string[];
};

// The separators are C0 control characters that never occur in legitimate names; strip rather
// than escape so the format needs no escaping pass at all.
const sanitizeText = (value: string) => value.replace(/[\u001e\u001f]/g, ' ').trim();

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

// CompressionStream's lib.dom typing declares `writable: WritableStream<BufferSource>`, which
// does not structurally match the `ReadableWritablePair<Uint8Array, Uint8Array>` pipeThrough
// wants. The runtime contract is fine (we only ever write a Uint8Array); the cast is purely to
// bridge those two declarations.
const streamThrough = async (bytes: Uint8Array, transform: CompressionStream | DecompressionStream) => {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const deflate = async (bytes: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    return await streamThrough(bytes, new CompressionStream('deflate-raw'));
  } catch {
    return null;
  }
};

const inflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') {
    throw new TeamShareDecodeError('当前浏览器不支持解压这种分享链接。');
  }
  return streamThrough(bytes, new DecompressionStream('deflate-raw'));
};

const serializeStatPoints = (statPoints: StatPoints) => {
  const values = statPointKeys.map((key) => clampStatPointValue(Number(statPoints[key] ?? 0)));
  // Trailing zeros are the parser's default, so trim them: a HP/Atk-only spread writes
  // "4,32" instead of "4,32,0,0,0,0".
  while (values.length > 0 && values[values.length - 1] === 0) values.pop();
  return values.join(MOVE_SEPARATOR);
};

const serializeMember = (member: TeamMember) => {
  const pokemonId = member.pokemonId ?? '';
  const formId = member.formId && member.formId !== pokemonId ? member.formId : '';
  const fields = [
    pokemonId,
    formId,
    member.abilityId ?? '',
    member.itemId ?? '',
    sanitizeText(member.nature ?? ''),
    (member.moveIds ?? []).filter(Boolean).slice(0, 4).join(MOVE_SEPARATOR),
    serializeStatPoints(member.statPoints ?? {}),
    member.level && member.level !== DEFAULT_LEVEL ? String(member.level) : '',
  ];
  // Trailing empties carry no information — the parser defaults every missing field — so drop
  // their separators. Level and SP are the usual last fields and are usually default.
  while (fields.length > 0 && fields[fields.length - 1] === '') fields.pop();
  return fields.join(FIELD_SEPARATOR);
};

export const serializeTeamSharePayload = (team: Pick<Team, 'name' | 'members'>) =>
  [sanitizeText(team.name), ...team.members.map(serializeMember)].join(RECORD_SEPARATOR);

/** Build the `<code>` half of a share URL. Async because `CompressionStream` is. */
export async function encodeTeamShare(team: Pick<Team, 'name' | 'members'>): Promise<string> {
  const payload = new TextEncoder().encode(serializeTeamSharePayload(team));
  const compressed = await deflate(payload);
  return compressed ? `${COMPRESSED_PREFIX}${toBase64Url(compressed)}` : `${PLAIN_PREFIX}${toBase64Url(payload)}`;
}

const natureIds = (): string[] => currentRuleNatureOptions.map((option) => option.id);

const parseStatPoints = (raw: string, label: string, warnings: string[]): StatPoints => {
  const parts = raw ? raw.split(MOVE_SEPARATOR) : [];
  const statPoints = Object.fromEntries(
    statPointKeys.map((key, index) => {
      const value = Number(parts[index] ?? 0);
      return [key, clampStatPointValue(Number.isFinite(value) ? value : 0)];
    }),
  ) as StatPoints;

  const total = statPointTotal(statPoints);
  if (total > MAX_TOTAL_STAT_POINTS) {
    warnings.push(`${label}的 SP 合计 ${total} 超过上限 ${MAX_TOTAL_STAT_POINTS}，导入后需要重新分配。`);
  }
  return statPoints;
};

const decodeMember = (record: string, index: number, warnings: string[]): TeamMember => {
  const [rawPokemonId = '', rawFormId = '', rawAbilityId = '', rawItemId = '', rawNature = '', rawMoves = '', rawStats = '', rawLevel = ''] =
    record.split(FIELD_SEPARATOR);

  const entry = pokemon.find((candidate) => candidate.id === rawPokemonId);
  const label = entry ? entry.chineseName : `第 ${index + 1} 只`;

  if (rawPokemonId && !entry) {
    warnings.push(`宝可梦 ${rawPokemonId} 不在当前规则，第 ${index + 1} 只已留空。`);
  }

  let formId: string | undefined;
  if (entry) {
    if (!rawFormId || rawFormId === entry.id) {
      formId = entry.id;
    } else if (entry.megaForms.some((form) => form.id === rawFormId)) {
      formId = rawFormId;
    } else {
      formId = entry.id;
      warnings.push(`${label}的形态 ${rawFormId} 不在当前规则，已回退到普通形态。`);
    }
  }

  let abilityId: string | undefined;
  if (rawAbilityId) {
    const ability = abilities.find((candidate) => candidate.id === rawAbilityId && candidate.legalInCurrentRule);
    if (ability) {
      abilityId = rawAbilityId;
    } else {
      warnings.push(`${label}的特性 ${rawAbilityId} 不在当前规则，已清空。`);
    }
  }

  let itemId: string | undefined;
  if (rawItemId) {
    const item = items.find((candidate) => candidate.id === rawItemId);
    if (item && isCurrentRuleSelectableItem(item)) {
      itemId = rawItemId;
    } else {
      warnings.push(`${label}的道具 ${rawItemId} 不在当前规则，已清空。`);
    }
  }

  const legalMoveIds = entry ? new Set(currentRuleMovesForPokemon(entry.id).map((move) => move.id)) : new Set<string>();
  const moveIds: string[] = [];
  (rawMoves ? rawMoves.split(MOVE_SEPARATOR) : []).filter(Boolean).slice(0, 4).forEach((moveId) => {
    if (legalMoveIds.has(moveId)) {
      moveIds.push(moveId);
    } else {
      warnings.push(`${label}的招式 ${moveId} 不在当前规则，已清空。`);
    }
  });

  let nature = rawNature;
  if (!nature || !natureIds().includes(nature)) {
    if (nature) warnings.push(`${label}的性格 ${nature} 不在当前规则，已重置为无修正性格。`);
    nature = defaultTeamMemberNature();
  }

  const parsedLevel = Number(rawLevel);
  const level = Number.isFinite(parsedLevel) && parsedLevel > 0 ? Math.min(100, Math.round(parsedLevel)) : DEFAULT_LEVEL;

  const member: TeamMember = {
    id: createId('member'),
    pokemonId: entry?.id,
    formId,
    abilityId,
    itemId,
    moveIds,
    nature,
    statPoints: parseStatPoints(rawStats, label, warnings),
    level,
    notes: '',
    legalityStatus: 'needs-review',
  };

  return { ...member, legalityStatus: evaluateMemberLegality(member).status };
};

/**
 * Turn a share code back into importable members, checking every id against the *current*
 * catalog. Ids that no longer resolve (a regulation rolled over since the link was made) do
 * not silently disappear: the member survives, the offending field is cleared, and a warning
 * names what was dropped so the importer can fix it deliberately.
 */
export async function decodeTeamShare(code: string): Promise<DecodedTeamShare> {
  const trimmed = (code ?? '').trim();
  if (!trimmed) throw new TeamShareDecodeError('分享链接为空。');

  const prefix = trimmed.slice(0, 2);
  const body = trimmed.slice(2);
  if (prefix !== COMPRESSED_PREFIX && prefix !== PLAIN_PREFIX) {
    throw new TeamShareDecodeError('无法识别这个分享链接的格式，可能来自更新的版本。');
  }

  let text: string;
  try {
    const bytes = fromBase64Url(body);
    const raw = prefix === COMPRESSED_PREFIX ? await inflate(bytes) : bytes;
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch (error) {
    if (error instanceof TeamShareDecodeError) throw error;
    throw new TeamShareDecodeError('分享链接已损坏或不完整，请让对方重新分享。');
  }

  const [rawName = '', ...memberRecords] = text.split(RECORD_SEPARATOR);
  // The name is the one free-text field a stranger's link can write into local storage; cap
  // it so a crafted link cannot dump kilobytes into a team card. Everything else is an id.
  const name = sanitizeText(rawName).slice(0, MAX_SHARED_TEAM_NAME_LENGTH);
  if (!name) throw new TeamShareDecodeError('分享链接里没有队伍名，可能已损坏。');

  const warnings: string[] = [];
  // Every record after the name is a member slot — including an empty one, which is a
  // deliberately blank slot rather than padding (serializeMember trims trailing empty fields,
  // so a fully unconfigured member is the empty string).
  const members = memberRecords.slice(0, 6).map((record, index) => decodeMember(record, index, warnings));

  return { name, members, warnings };
}

/** Absolute share URL for a code, e.g. `https://luxraykit.com/#/t/z1…`. */
export const teamShareUrl = (code: string, origin = window.location.origin) => `${origin}/#/t/${code}`;
