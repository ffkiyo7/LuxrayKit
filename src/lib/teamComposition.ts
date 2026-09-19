import { items, pokemon } from '../data';
import type { Team, TeamMember } from '../types';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointKeys, statPointTotal } from './statPoints';

/**
 * Rules about a team *as a whole*, as opposed to `legality.ts`'s per-member field checks.
 *
 * Champions builds a roster out of six different species, each holding a different item, and
 * `statPoints.ts`'s SP caps apply per member. `legality.ts` already reports the item and SP
 * halves as member issues; this module is the shape the *write* layer and the team screens
 * need — «may this member be written into this team, and if not, which teammate is in the
 * way» — so the two never drift apart.
 *
 * Species is keyed on `pokemonId`, never `formId`: a Mega and its base form are the same
 * Pokémon and may not both be on the roster.
 */

export const MAX_TEAM_MEMBERS = 6;

export type TeamCompositionCode = 'duplicate-species' | 'duplicate-held-item' | 'stat-points-over-limit' | 'team-full';

export type TeamCompositionIssue = {
  code: TeamCompositionCode;
  /** The member the issue is reported against — the later of a duplicated pair. */
  memberId: string;
  message: string;
};

const speciesName = (pokemonId?: string) =>
  (pokemonId ? pokemon.find((entry) => entry.id === pokemonId)?.chineseName : undefined) ?? '这只宝可梦';

const itemName = (itemId?: string) => (itemId ? items.find((item) => item.id === itemId)?.chineseName ?? itemId : '道具');

/** The teammate already on the roster as the same species, if any. */
export const teammateWithSameSpecies = (team: Pick<Team, 'members'>, member: TeamMember) =>
  member.pokemonId
    ? team.members.find((candidate) => candidate.id !== member.id && candidate.pokemonId === member.pokemonId)
    : undefined;

/** The teammate already holding `member`'s item, if any. */
export const teammateHoldingSameItem = (team: Pick<Team, 'members'>, member: TeamMember) =>
  member.itemId ? team.members.find((candidate) => candidate.id !== member.id && candidate.itemId === member.itemId) : undefined;

export const statPointsOverLimit = (member: TeamMember) =>
  statPointKeys.some((key) => Number(member.statPoints?.[key] ?? 0) > MAX_STAT_POINTS_PER_STAT) ||
  statPointTotal(member.statPoints ?? {}) > MAX_TOTAL_STAT_POINTS;

export type MemberWriteRejection = { ok: false; code: TeamCompositionCode; message: string };
export type MemberWriteResult = { ok: true } | MemberWriteRejection;

const OK: MemberWriteResult = { ok: true };

/**
 * Whether `member` may be written into `team` — the guard `updateMember` runs before it touches
 * IndexedDB. It reports rather than throws: a caller that cannot show the reason (the
 * environment page's 「按热门配置加入队伍」) still gets a falsy `ok` to act on.
 */
export function checkMemberWrite(team: Pick<Team, 'members'>, member: TeamMember): MemberWriteResult {
  const isNew = !team.members.some((candidate) => candidate.id === member.id);
  if (isNew && team.members.length >= MAX_TEAM_MEMBERS) {
    return { ok: false, code: 'team-full', message: `队伍已满 ${MAX_TEAM_MEMBERS} 只。` };
  }

  const sameSpecies = teammateWithSameSpecies(team, member);
  if (sameSpecies) {
    return { ok: false, code: 'duplicate-species', message: `${speciesName(member.pokemonId)}已经在队伍中。` };
  }

  const sameItem = teammateHoldingSameItem(team, member);
  if (sameItem) {
    return {
      ok: false,
      code: 'duplicate-held-item',
      message: `${itemName(member.itemId)}已由${speciesName(sameItem.pokemonId)}携带。`,
    };
  }

  if (statPointsOverLimit(member)) {
    return {
      ok: false,
      code: 'stat-points-over-limit',
      message: `SP 单项最多 ${MAX_STAT_POINTS_PER_STAT}，总计最多 ${MAX_TOTAL_STAT_POINTS}。`,
    };
  }

  return OK;
}

/**
 * Every composition rule an *existing* team breaks. Old local data and imported teams are never
 * rewritten to fit the rules — they are reported, so the user decides what to drop.
 */
export function teamCompositionIssues(team: Pick<Team, 'members'>): TeamCompositionIssue[] {
  const issues: TeamCompositionIssue[] = [];
  const seenSpecies = new Map<string, TeamMember>();
  const seenItems = new Map<string, TeamMember>();

  team.members.forEach((member) => {
    if (member.pokemonId) {
      const first = seenSpecies.get(member.pokemonId);
      if (first) {
        issues.push({
          code: 'duplicate-species',
          memberId: member.id,
          message: `${speciesName(member.pokemonId)}在队伍里出现了不止一次。`,
        });
      } else {
        seenSpecies.set(member.pokemonId, member);
      }
    }

    if (member.itemId) {
      const first = seenItems.get(member.itemId);
      if (first) {
        issues.push({
          code: 'duplicate-held-item',
          memberId: member.id,
          message: `${itemName(member.itemId)}被${speciesName(first.pokemonId)}和${speciesName(member.pokemonId)}同时携带。`,
        });
      } else {
        seenItems.set(member.itemId, member);
      }
    }

    if (statPointsOverLimit(member)) {
      issues.push({
        code: 'stat-points-over-limit',
        memberId: member.id,
        message: `${speciesName(member.pokemonId)}的 SP 超过了上限（单项 ${MAX_STAT_POINTS_PER_STAT}，总计 ${MAX_TOTAL_STAT_POINTS}）。`,
      });
    }
  });

  return issues;
}

/** Species already on the roster — what the Pokémon picker greys out. */
export const rosterSpeciesIds = (team: Pick<Team, 'members'>, exceptMemberId?: string) =>
  new Set(
    team.members
      .filter((member) => member.id !== exceptMemberId && member.pokemonId)
      .map((member) => member.pokemonId as string),
  );
