import { useCallback, useEffect, useState } from 'react';
import { productName } from '../branding';
import type { EnvironmentTeamSample } from '../data/environment';
import type { useHashRoute } from '../hooks/useHashRoute';
import type { Team } from '../types';

const IMPORT_FEEDBACK_DURATION_MS = 2500;

export type AppToast = {
  title: string;
  description?: string;
  tone?: 'success' | 'warning';
};

type Navigate = ReturnType<typeof useHashRoute>['navigate'];

/**
 * Everything that brings a team in or sends one out from the shell: the upper-build import and
 * its confirmation step, share links both ways, and the replica-code copy — plus the one toast
 * and the list highlight they all report through.
 */
export function useTeamImport({
  dataStatusLabel,
  navigate,
  saveTeam,
  setActiveTeamId,
}: {
  dataStatusLabel?: string;
  navigate: Navigate;
  saveTeam: (team: Team) => Promise<void>;
  setActiveTeamId: (teamId: string) => void;
}) {
  const [importToast, setImportToast] = useState<AppToast | null>(null);
  const [highlightedImportTeamId, setHighlightedImportTeamId] = useState<string | undefined>();
  const [pendingImportSample, setPendingImportSample] = useState<EnvironmentTeamSample | null>(null);

  useEffect(() => {
    if (!importToast && !highlightedImportTeamId) return;
    const timeoutId = window.setTimeout(() => {
      setImportToast(null);
      setHighlightedImportTeamId(undefined);
    }, IMPORT_FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedImportTeamId, importToast]);

  const performImportSampleTeam = useCallback(
    async (sample: EnvironmentTeamSample) => {
      const { createImportedTeamFromEnvironmentSample } = await import('../lib/environmentImport');
      const importedTeam: Team = createImportedTeamFromEnvironmentSample(sample, dataStatusLabel ?? '环境数据');
      await saveTeam(importedTeam);
      setActiveTeamId(importedTeam.id);
      setHighlightedImportTeamId(importedTeam.id);
      setImportToast({ title: `已导入「${sample.title}」` });
      navigate({ name: 'teams' });
    },
    [dataStatusLabel, navigate, saveTeam, setActiveTeamId],
  );

  // Importing replaces nothing and creates a team, so it always asks first — a tap on a sample
  // card is an interest in the sample, not yet a decision to take it.
  const importSampleTeam = useCallback((sample: EnvironmentTeamSample) => {
    setPendingImportSample(sample);
  }, []);

  const cancelPendingImport = useCallback(() => setPendingImportSample(null), []);

  const continuePendingImport = useCallback(async () => {
    if (!pendingImportSample) return;
    const sample = pendingImportSample;
    setPendingImportSample(null);
    await performImportSampleTeam(sample);
  }, [pendingImportSample, performImportSampleTeam]);

  // Share flow: navigator.share where the platform has it (Android/iOS sheet), clipboard
  // otherwise. The code is generated on demand rather than stored — it must always reflect
  // the team as it is now.
  const shareTeam = useCallback(async (team: Team) => {
    try {
      const { canShareTeam, encodeTeamShare, teamShareUrl } = await import('../lib/teamShare');
      if (!canShareTeam(team)) return;
      const url = teamShareUrl(await encodeTeamShare(team));
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `${team.name} · ${productName}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setImportToast({ title: '链接已复制', description: '把它发给队友即可导入' });
    } catch (error) {
      // A user dismissing the native share sheet rejects with AbortError — that is a
      // cancellation, not a failure, and must not raise a warning toast.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setImportToast({ title: '分享失败', description: '请稍后再试或手动复制地址栏链接', tone: 'warning' });
    }
  }, []);

  const importSharedTeam = useCallback(
    async (team: Team) => {
      await saveTeam(team);
      setActiveTeamId(team.id);
      setHighlightedImportTeamId(team.id);
      setImportToast({ title: '已导入分享队伍' });
      navigate({ name: 'team-detail', teamId: team.id }, { replace: true });
    },
    [navigate, saveTeam, setActiveTeamId],
  );

  const copyReplicaCode = useCallback(async (replicaCode: string) => {
    try {
      await navigator.clipboard.writeText(replicaCode);
      setImportToast({ title: '队伍码已复制', description: '分享可能已过期' });
    } catch {
      setImportToast({ title: '队伍码复制失败', description: '请手动选择队伍码复制', tone: 'warning' });
    }
  }, []);

  return {
    importToast,
    highlightedImportTeamId,
    pendingImportSample,
    importSampleTeam,
    cancelPendingImport,
    continuePendingImport,
    shareTeam,
    importSharedTeam,
    copyReplicaCode,
  };
}
