import type { BattleType, Team, TeamMember, TeamSource } from '../types';
import { migrateLegacyEvStatPoints } from './statPoints';

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

const migrateMember = (member: RawTeamMember, index: number, migrateLegacyStats = false): TeamMember => ({
  id: member.id || `imported-member-${index + 1}`,
  pokemonId: member.pokemonId,
  formId: member.formId,
  abilityId: member.abilityId,
  itemId: member.itemId,
  moveIds: Array.isArray(member.moveIds) ? member.moveIds.filter(Boolean) : [],
  nature: member.nature || '爽朗',
  statPoints: migrateLegacyStats ? migrateLegacyEvStatPoints(member.statPoints ?? {}) : member.statPoints ?? {},
  level: Number.isFinite(member.level) && member.level ? Number(member.level) : 50,
  notes: member.notes || '',
  legalityStatus: member.legalityStatus || 'needs-review',
});

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
  if (!team.ruleSetId || !team.dataVersionId) {
    throw new Error(`第 ${index + 1} 支队伍缺少 ruleSetId 或 dataVersionId。`);
  }
  if (!team.id || !team.name || !Array.isArray(team.members)) {
    throw new Error(`第 ${index + 1} 支队伍缺少 id、name 或 members。`);
  }

  const normalizedSource = normalizeTeamSource(team.source);
  return {
    id: team.id,
    name: team.name,
    ruleSetId: team.ruleSetId,
    dataVersionId: team.dataVersionId,
    members: team.members.map((member, memberIndex) => migrateMember(member, memberIndex, migrateLegacyStats)),
    createdAt: team.createdAt || now(),
    updatedAt: team.updatedAt || now(),
    notes: team.notes || '',
    ...(normalizedSource ? { source: normalizedSource } : {}),
  };
};

const migrateV0Team = (team: RawTeam, index: number): Team => {
  const migrated: RawTeam = {
    ...team,
    id: team.id || `imported-team-${index + 1}`,
    name: team.name || `导入队伍 ${index + 1}`,
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
