import type { BattleType, LegalityStatus, StatPoints, Team, TeamMember, TeamSource } from '../types';
import { clampStatPointValue, migrateLegacyEvStatPoints, statPointKeys } from './statPoints';
import { defaultTeamMemberNature } from './teamMemberDefaults';

export const CURRENT_TEAM_EXPORT_SCHEMA_VERSION = 2;

export type TeamExportSchemaVersion = 0 | 1 | typeof CURRENT_TEAM_EXPORT_SCHEMA_VERSION;

type RawTeamMember = Partial<TeamMember>;

type RawTeam = Omit<Partial<Team>, 'members'> & {
  members?: RawTeamMember[];
};

export type RawTeamExportPayload = {
  schemaVersion?: number;
  exportedAt?: string;
  teams?: RawTeam[];
};

const now = () => new Date().toISOString();

// An import file is untrusted JSON: every field is type-checked here, because whatever passes is
// written to IndexedDB and read back on every launch. A number where a string belongs used to
// crash the team page on each load (`nature.includes`, `localeCompare`), and an object id made
// the IndexedDB `put` throw halfway through a restore.
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

const legalityStatuses: ReadonlySet<LegalityStatus> = new Set(['legal', 'illegal', 'needs-review', 'missing-config']);

// Only the stats the file actually carries are kept, so a stored team round-trips unchanged.
const readStatPoints = (value: unknown): StatPoints => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    statPointKeys
      .filter((key) => key in source)
      .map((key) => {
        const numeric = Number(source[key]);
        return [key, Number.isFinite(numeric) ? numeric : 0];
      }),
  ) as StatPoints;
};

// Per-stat range only (0–32, which also stops negative values offsetting the 66 total). A total
// over 66 is left as-is: imports may land rule-breaking teams, and legality reports them.
const clampStatPoints = (statPoints: StatPoints): StatPoints =>
  Object.fromEntries(Object.entries(statPoints).map(([key, value]) => [key, clampStatPointValue(value)])) as StatPoints;
const migrateMember = (member: RawTeamMember, index: number, migrateLegacyStats = false): TeamMember => {
  const statPoints = readStatPoints(member.statPoints);
  const level = Number(member.level);
  return {
    id: text(member.id) ?? `imported-member-${index + 1}`,
    pokemonId: text(member.pokemonId),
    formId: text(member.formId),
    abilityId: text(member.abilityId),
    itemId: text(member.itemId),
    moveIds: Array.isArray(member.moveIds) ? member.moveIds.filter((moveId): moveId is string => Boolean(text(moveId))) : [],
    nature: text(member.nature) ?? defaultTeamMemberNature(),
    statPoints: migrateLegacyStats ? migrateLegacyEvStatPoints(statPoints) : clampStatPoints(statPoints),
    level: Number.isInteger(level) && level >= 1 && level <= 100 ? level : 50,
    notes: text(member.notes) ?? '',
    legalityStatus: legalityStatuses.has(member.legalityStatus as LegalityStatus) ? (member.legalityStatus as LegalityStatus) : 'needs-review',
  };
};

const isBattleType = (value: unknown): value is BattleType => value === 'singles' || value === 'doubles';

const normalizeTeamSource = (source: unknown): TeamSource | undefined => {
  if (!source || typeof source !== 'object') return undefined;
  const candidate = source as Partial<TeamSource>;
  if (candidate.kind === 'high-score-import') {
    return {
      kind: 'high-score-import',
      sampleId: String(candidate.sampleId ?? ''),
      title: String(candidate.title ?? ''),
      author: String(candidate.author ?? ''),
      score: Number(candidate.score ?? 0),
      battleType: isBattleType(candidate.battleType) ? candidate.battleType : 'singles',
      reportUrl: String(candidate.reportUrl ?? ''),
      importedAt: String(candidate.importedAt ?? now()),
    };
  }
  if (candidate.kind === 'environment-sample-import') {
    return {
      kind: 'environment-sample-import',
      sampleId: String(candidate.sampleId ?? ''),
      title: String(candidate.title ?? ''),
      label: String(candidate.label ?? '开发样例数据'),
      battleType: isBattleType(candidate.battleType) ? candidate.battleType : 'singles',
      reportUrl: String(candidate.reportUrl ?? ''),
      importedAt: String(candidate.importedAt ?? now()),
    };
  }
  if (candidate.kind === 'share-link-import') {
    return {
      kind: 'share-link-import',
      sharedAt: String(candidate.sharedAt ?? now()),
      importedAt: String(candidate.importedAt ?? now()),
    };
  }
  if (candidate.kind === 'external-report-import') {
    return {
      kind: 'external-report-import',
      title: String(candidate.title ?? ''),
      reportUrl: String(candidate.reportUrl ?? ''),
      importedAt: String(candidate.importedAt ?? now()),
    };
  }
  return undefined;
};

const normalizeTeam = (team: RawTeam, index: number, migrateLegacyStats = false): Team => {
  if (!team || typeof team !== 'object') {
    throw new Error(`第 ${index + 1} 支队伍不是有效的队伍数据。`);
  }
  const ruleSetId = text(team.ruleSetId);
  const dataVersionId = text(team.dataVersionId);
  if (!ruleSetId || !dataVersionId) {
    throw new Error(`第 ${index + 1} 支队伍缺少 ruleSetId 或 dataVersionId。`);
  }
  const id = text(team.id);
  const name = text(team.name);
  if (!id || !name || !Array.isArray(team.members)) {
    throw new Error(`第 ${index + 1} 支队伍缺少 id、name 或 members。`);
  }

  const normalizedSource = normalizeTeamSource(team.source);
  return {
    id,
    name,
    ruleSetId,
    dataVersionId,
    members: team.members
      .filter((member): member is RawTeamMember => Boolean(member) && typeof member === 'object')
      .map((member, memberIndex) => migrateMember(member, memberIndex, migrateLegacyStats)),
    createdAt: text(team.createdAt) ?? now(),
    updatedAt: text(team.updatedAt) ?? now(),
    ...(typeof team.sortOrder === 'number' && Number.isFinite(team.sortOrder) ? { sortOrder: team.sortOrder } : {}),
    ...(team.replicaCode ? { replicaCode: String(team.replicaCode) } : {}),
    notes: text(team.notes) ?? '',
    ...(normalizedSource ? { source: normalizedSource } : {}),
  };
};

const migrateV0Team = (team: RawTeam, index: number): Team => {
  const migrated: RawTeam = {
    ...team,
    id: text(team?.id) ?? `imported-team-${index + 1}`,
    name: text(team?.name) ?? `导入队伍 ${index + 1}`,
    members: Array.isArray(team.members) ? team.members : [],
  };

  return normalizeTeam(migrated, index, true);
};

export const migrateTeamExportPayload = (payload: RawTeamExportPayload): Team[] => {
  if (!Array.isArray(payload.teams)) {
    throw new Error('未找到 teams 数组。');
  }
  if (payload.teams.length === 0) {
    throw new Error('teams 数组为空。');
  }

  switch (payload.schemaVersion) {
    case 0:
      return payload.teams.map(migrateV0Team);
    case 1:
      return payload.teams.map((team, index) => normalizeTeam(team, index, true));
    case CURRENT_TEAM_EXPORT_SCHEMA_VERSION:
      return payload.teams.map((team, index) => normalizeTeam(team, index));
    default:
      throw new Error(`不支持的 schemaVersion: ${String(payload.schemaVersion)}。`);
  }
};
