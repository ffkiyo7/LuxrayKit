import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { currentDataVersion, currentRuleSet, defaultPreferences } from '../data/seed/regMA/metadata';
import { repository } from '../lib/db';
import { createId } from '../lib/id';
import { checkMemberWrite, type MemberWriteResult } from '../lib/teamComposition';
import type { AppState, Team, TeamMember, UserPreference } from '../types';

type Store = AppState & {
  loading: boolean;
  saveTeam: (team: Team) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  addTeam: (name?: string) => Promise<Team>;
  updateMember: (teamId: string, member: TeamMember) => Promise<MemberWriteResult>;
  updateTheme: (theme: UserPreference['theme']) => Promise<void>;
  replacePreferences: (preferences: UserPreference) => Promise<void>;
  replaceTeams: (teams: Team[]) => Promise<void>;
  clearLocalData: () => Promise<void>;
};

const AppContext = createContext<Store | undefined>(undefined);

const now = () => new Date().toISOString();

const teamSortOrder = (team: Team, fallbackIndex: number) =>
  typeof team.sortOrder === 'number' && Number.isFinite(team.sortOrder) ? team.sortOrder : fallbackIndex;

const nextTopSortOrder = (teams: Team[]) => {
  if (teams.length === 0) return 0;
  return Math.min(...teams.map((team, index) => teamSortOrder(team, index))) - 1;
};

const withSequentialSortOrder = (teams: Team[]) => teams.map((team, index) => ({ ...team, sortOrder: index }));

const createEmptyTeam = (name?: string): Team => ({
  id: createId('team'),
  name: name || `新队伍 ${new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}`,
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  members: [],
  createdAt: now(),
  updatedAt: now(),
  notes: '',
});

const normalizePreferences = (preferences?: Partial<UserPreference>): UserPreference => {
  // Dropped rather than spread: the legacy key is read once here and never written back, so a
  // record saved from this session carries only `hasOpenedPresetTeam`.
  // A restored backup is untrusted JSON, so anything that is not an object reads as "no stored
  // preferences" and an unknown theme falls back instead of reaching `data-theme`.
  const { hasSeenLuxrayEasterEgg, ...stored } = preferences && typeof preferences === 'object' ? preferences : {};

  return {
    ...defaultPreferences,
    ...stored,
    theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : defaultPreferences.theme,
    // Coerce rather than spread: an older stored record has no such field, and anything other
    // than an explicit `true` must read as "analytics on" so the default is not silently flipped
    // by a corrupted value.
    analyticsOptOut: stored.analyticsOptOut === true,
    splashOptOut: stored.splashOptOut === true,
    // Records written before the 2026-09 rename only carry the old key; without this fall-back
    // every existing user would be shown the preset team's special card a second time.
    hasOpenedPresetTeam: stored.hasOpenedPresetTeam ?? hasSeenLuxrayEasterEgg ?? false,
  };
};

const WRITE_FAILED_MESSAGE = '本机存储写入失败（可能是空间不足），刚才的改动没有保存。';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [teams, setTeamsState] = useState<Team[]>([]);
  const [preferences, setPreferences] = useState<UserPreference>(defaultPreferences);
  const [lastRefreshError, setLastRefreshError] = useState<string | undefined>();
  // The latest team list, readable synchronously. Callbacks close over the `teams` of the render
  // they were created in, so "add a team, then save a member into it" in one handler used to read
  // a list without the new team, treat it as new again and insert it twice.
  const teamsRef = useRef<Team[]>([]);
  // Set when IndexedDB could not be opened: the app then runs on memory alone, as the notice
  // says, instead of rejecting every write.
  const memoryOnlyRef = useRef(false);

  const setTeams = useCallback((next: Team[] | ((current: Team[]) => Team[])) => {
    teamsRef.current = typeof next === 'function' ? next(teamsRef.current) : next;
    setTeamsState(teamsRef.current);
  }, []);

  const persist = useCallback(async (write: () => Promise<unknown>) => {
    if (memoryOnlyRef.current) return;
    try {
      await write();
    } catch (error) {
      setLastRefreshError(WRITE_FAILED_MESSAGE);
      throw error;
    }
  }, []);

  useEffect(() => {
    repository
      .loadState()
      .then((state) => {
        setTeams(state.teams);
        setPreferences(normalizePreferences(state.preferences));
      })
      .catch(() => {
        memoryOnlyRef.current = true;
        setTeams([]);
        setPreferences(normalizePreferences());
        setLastRefreshError('IndexedDB 不可用，当前仅能使用内存数据。');
      })
      .finally(() => setLoading(false));
  }, [setTeams]);

  // Optimistic: the list updates at once and the write follows. A failed write puts back only
  // this team's previous version, so edits made to other teams meanwhile are kept.
  const saveTeam = useCallback(async (team: Team) => {
    const previous = teamsRef.current.find((item) => item.id === team.id);
    const nextTeam = {
      ...team,
      sortOrder: team.sortOrder ?? (previous ? team.sortOrder : nextTopSortOrder(teamsRef.current)),
      updatedAt: now(),
    };
    setTeams((current) =>
      current.some((item) => item.id === team.id)
        ? current.map((item) => (item.id === team.id ? nextTeam : item))
        : [nextTeam, ...current],
    );
    try {
      await persist(() => repository.saveTeam(nextTeam));
    } catch (error) {
      setTeams((current) =>
        previous
          ? current.map((item) => (item.id === team.id ? previous : item))
          : current.filter((item) => item.id !== team.id),
      );
      throw error;
    }
  }, [persist, setTeams]);

  const deleteTeam = useCallback(async (teamId: string) => {
    const index = teamsRef.current.findIndex((item) => item.id === teamId);
    const previous = teamsRef.current[index];
    setTeams((current) => current.filter((item) => item.id !== teamId));
    try {
      await persist(() => repository.deleteTeam(teamId));
    } catch (error) {
      if (previous) {
        setTeams((current) => [...current.slice(0, index), previous, ...current.slice(index)]);
      }
      throw error;
    }
  }, [persist, setTeams]);

  const addTeam = useCallback(async (name?: string) => {
    const team = { ...createEmptyTeam(name), sortOrder: nextTopSortOrder(teamsRef.current) };
    setTeams((current) => [team, ...current]);
    try {
      await persist(() => repository.saveTeam(team));
    } catch (error) {
      setTeams((current) => current.filter((item) => item.id !== team.id));
      throw error;
    }
    return team;
  }, [persist, setTeams]);

  const updateMember = useCallback(
    async (teamId: string, member: TeamMember): Promise<MemberWriteResult> => {
      const team = teamsRef.current.find((item) => item.id === teamId);
      if (!team) return { ok: false, code: 'team-full', message: '队伍不存在。' };
      // Composition rules are enforced here rather than in `saveTeam`, which also carries
      // imports and whole-team rewrites — those must be able to land data that already breaks
      // the rules (it is reported, never silently edited).
      const check = checkMemberWrite(team, member);
      if (!check.ok) return check;
      const exists = team.members.some((item) => item.id === member.id);
      const nextMembers = exists ? team.members.map((item) => (item.id === member.id ? member : item)) : [...team.members, member];
      await saveTeam({ ...team, members: nextMembers });
      return { ok: true };
    },
    [saveTeam],
  );

  const savePreferences = useCallback(async (next: UserPreference) => {
    setPreferences(next);
    await persist(() => repository.savePreferences(next));
  }, [persist]);

  const updateTheme = useCallback(
    async (theme: UserPreference['theme']) => {
      await savePreferences({ ...preferences, theme });
    },
    [preferences, savePreferences],
  );

  const replacePreferences = useCallback(
    async (nextPreferences: UserPreference) => {
      await savePreferences(normalizePreferences(nextPreferences));
    },
    [savePreferences],
  );

  // Written first, shown second: a restore or reorder that fails leaves both the store and the
  // screen on the old list, rather than showing an import that a reload would take away.
  const replaceTeams = useCallback(async (nextTeams: Team[]) => {
    const orderedTeams = withSequentialSortOrder(nextTeams);
    await persist(() => repository.replaceTeams(orderedTeams));
    setTeams(orderedTeams);
  }, [persist, setTeams]);

  const clearLocalData = useCallback(async () => {
    await persist(() => repository.clearAll());
    setTeams([]);
    setPreferences(normalizePreferences());
  }, [persist, setTeams]);

  const value = useMemo<Store>(
    () => ({
      loading,
      teams,
      preferences,
      lastRefreshError,
      saveTeam,
      deleteTeam,
      addTeam,
      updateMember,
      updateTheme,
      replacePreferences,
      replaceTeams,
      clearLocalData,
    }),
    [
      addTeam,
      clearLocalData,
      deleteTeam,
      lastRefreshError,
      loading,
      preferences,
      replacePreferences,
      replaceTeams,
      saveTeam,
      teams,
      updateTheme,
      updateMember,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppStore must be used within AppProvider');
  return context;
};
