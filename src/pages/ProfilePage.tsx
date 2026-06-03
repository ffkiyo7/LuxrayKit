import { Database, Download, Moon, ShieldCheck, Sun, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { currentDataVersion, currentRuleSet } from '../data';
import { TeamImportError, parseTeamImport } from '../lib/exportImport';
import { useAppStore } from '../state/AppContext';
import type { UserPreference } from '../types';
import { Badge, Button, Card } from '../components/ui';

type BackupPayload = {
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

type Notice = {
  type: 'success' | 'error';
  title: string;
  message: string;
};

const isBackupPayload = (value: unknown): value is BackupPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackupPayload>;
  return candidate.schemaVersion === 'champions-local-backup-v1' && Array.isArray(candidate.teams) && Boolean(candidate.preferences);
};

export function ProfilePage({ onOpenRule }: { onOpenRule: () => void }) {
  const { teams, preferences, replaceTeams, replacePreferences, clearLocalData, lastRefreshError, updateTheme } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const exportBackup = () => {
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
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (isBackupPayload(parsed)) {
        const teamsFromBackup = parseTeamImport(JSON.stringify({ schemaVersion: 1, teams: parsed.teams }));
        await replaceTeams(teamsFromBackup);
        await replacePreferences(parsed.preferences);
        setNotice({ type: 'success', title: '备份已导入', message: '队伍、收藏偏好和显示设置已恢复。' });
      } else {
        const teamsOnly = parseTeamImport(text);
        await replaceTeams(teamsOnly);
        setNotice({ type: 'success', title: '队伍已导入', message: '这是旧版队伍 JSON，只恢复队伍配置。' });
      }
    } catch (error) {
      const message = error instanceof TeamImportError || error instanceof Error ? error.message : '无法识别这个 JSON 文件。';
      setNotice({ type: 'error', title: '导入失败', message });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">我的</h2>
        <p className="text-xs text-textSecondary">本地数据、显示偏好与离线缓存状态。</p>
      </div>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">设置与数据</p>
        <div className="divide-y divide-divider">
          <button className="flex w-full items-center justify-between py-3 text-left" onClick={onOpenRule}>
            <span>
              <span className="block text-sm">当前规则</span>
              <span className="text-xs text-textSecondary">{currentRuleSet.name}</span>
            </span>
            <Badge status="current">当前赛季</Badge>
          </button>
          <div className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block text-sm">主题</span>
              <span className="text-xs text-textSecondary">{preferences.theme === 'dark' ? '深色工具界面' : '浅色工具界面'}</span>
            </span>
            <button
              className="grid grid-cols-2 rounded-lg border border-border bg-secondary p-1 text-textSecondary"
              type="button"
              aria-label="切换深色和浅色主题"
              aria-pressed={preferences.theme === 'light'}
              onClick={() => updateTheme(preferences.theme === 'dark' ? 'light' : 'dark')}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-md ${preferences.theme === 'light' ? 'bg-card text-warning surface-shadow' : ''}`}>
                <Sun size={16} />
              </span>
              <span className={`grid h-8 w-8 place-items-center rounded-md ${preferences.theme === 'dark' ? 'bg-card text-accent' : ''}`}>
                <Moon size={16} />
              </span>
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">本地备份</p>
        <p className="text-sm text-textSecondary">JSON 备份包含队伍、收藏、显示偏好和缓存索引。队伍详情页生成的是分享图片，和这里的备份文件分开处理。</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={exportBackup}>
            <Download size={14} />
            导出备份
          </Button>
          <Button variant="ghost" onClick={() => inputRef.current?.click()}>
            <Upload size={14} />
            导入备份
          </Button>
        </div>
        <input ref={inputRef} className="hidden" type="file" accept="application/json" onChange={(event) => importBackup(event.target.files?.[0])} />
        {notice && (
          <div className={`mt-3 rounded-lg p-3 text-xs ${notice.type === 'success' ? 'bg-legalBg text-success' : 'bg-missingBg text-danger'}`}>
            <p className="font-semibold">{notice.title}</p>
            <p className="mt-1">{notice.message}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} className="text-accent" />
          离线缓存
        </div>
        <p className="mt-2 text-xs text-textSecondary">
          当前规则与本地队伍会保留在浏览器内。环境数据后续接入真实来源后，会在这里显示缓存状态。
        </p>
        {lastRefreshError && <p className="mt-3 rounded-lg bg-reviewBg p-2 text-xs text-warning">{lastRefreshError}</p>}
      </Card>

      <Card>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Database size={16} className="text-textSecondary" />
          本地数据
        </p>
        <Button variant="danger" className="w-full" onClick={clearLocalData}>
          <Trash2 size={14} />
          清除本地数据
        </Button>
      </Card>
    </div>
  );
}
