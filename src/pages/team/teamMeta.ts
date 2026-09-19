import type { Team } from '../../types';

/** The preset team the app ships with. 02-02 gives it a card of its own until it is opened. */
export const PRESET_TEAM_ID = 'team-starter';

export const TEAM_NAME_MAX_LENGTH = 24;

const battleTypeLabels = { singles: '单打', doubles: '双打' } as const;

const monthDay = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** 「09-08 导入」/「09-12 编辑」/「09-08 建立」 — the frames' third subtitle segment. */
const provenance = (team: Team) => {
  if (team.source) {
    const importedAt = monthDay(team.source.importedAt);
    return importedAt ? `${importedAt} 导入` : '';
  }
  const stamp = monthDay(team.updatedAt || team.createdAt);
  if (!stamp) return '';
  return team.updatedAt && team.updatedAt !== team.createdAt ? `${stamp} 编辑` : `${stamp} 建立`;
};

const battleType = (team: Team) =>
  team.source && 'battleType' in team.source ? battleTypeLabels[team.source.battleType] : undefined;

const score = (team: Team) => (team.source?.kind === 'high-score-import' ? `${team.source.score} 分` : undefined);

/** List-card subtitle: 「6/6 成员 · 双打 · 09-08 导入」(02-02). */
export const teamListSubtitle = (team: Team) =>
  [`${team.members.length}/6 成员`, battleType(team), provenance(team)].filter(Boolean).join(' · ');

/** Detail subtitle adds the ladder score when the team came from a high-score sample (02-05). */
export const teamDetailSubtitle = (team: Team) =>
  [`${team.members.length}/6 成员`, battleType(team), score(team), provenance(team)].filter(Boolean).join(' · ');
