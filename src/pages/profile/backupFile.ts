import { currentDataVersion, currentRuleSet } from '../../data';
import { TeamImportError, parseTeamImport } from '../../lib/exportImport';
import type { Team, UserPreference } from '../../types';

export type BackupPayload = {
  schemaVersion: 'champions-local-backup-v1';
  exportedAt: string;
  teams: unknown[];
  preferences: UserPreference;
  cache: {
    ruleSetId: string;
    dataVersionId: string;
    lastDataRefreshAt: string;
  };
};

const isBackupPayload = (value: unknown): value is BackupPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackupPayload>;
  return candidate.schemaVersion === 'champions-local-backup-v1' && Array.isArray(candidate.teams) && Boolean(candidate.preferences);
};

export function downloadBackup(teams: Team[], preferences: UserPreference) {
  const payload: BackupPayload = {
    schemaVersion: 'champions-local-backup-v1',
    exportedAt: new Date().toISOString(),
    teams,
    preferences,
    cache: {
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
      lastDataRefreshAt: preferences.lastDataRefreshAt,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `champions-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * What a chosen file turned out to be. `backup` restores teams *and* preferences; `legacy` is a
 * pre-backup team-only JSON export, which leaves preferences untouched (N08-02c).
 */
export type BackupReadResult =
  | { kind: 'backup'; teams: Team[]; preferences: UserPreference }
  | { kind: 'legacy'; teams: Team[] }
  | { kind: 'unreadable' };

export async function readBackupFile(file: File): Promise<BackupReadResult> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    if (isBackupPayload(parsed)) {
      return {
        kind: 'backup',
        teams: parseTeamImport(JSON.stringify({ schemaVersion: 1, teams: parsed.teams })),
        preferences: parsed.preferences,
      };
    }
    return { kind: 'legacy', teams: parseTeamImport(text) };
  } catch (error) {
    // Both a malformed JSON parse and a rejected schema land here; the screen says the same
    // thing either way, and the detail would only be actionable to whoever wrote the file.
    if (error instanceof TeamImportError || error instanceof Error) return { kind: 'unreadable' };
    return { kind: 'unreadable' };
  }
}
