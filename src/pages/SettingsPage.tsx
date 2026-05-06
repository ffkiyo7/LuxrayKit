import { Database, Download, Moon, RefreshCw, Sun, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { currentDataVersion, currentRuleSet } from '../data';
import { TeamImportError, buildExportPayload, parseTeamImport } from '../lib/exportImport';
import { useAppStore } from '../state/AppContext';
import { Badge, Button, Card } from '../components/ui';

type ImportStatus =
  | {
      type: 'success';
      title: string;
      message: string;
    }
  | {
      type: 'error';
      title: string;
      message: string;
      suggestion: string;
    };

export function SettingsPage({ onOpenRule }: { onOpenRule: () => void }) {
  const { teams, preferences, replaceTeams, clearLocalData, lastRefreshError, updateTheme } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const cacheSummary = useMemo(
    () => [
      `本地队伍 ${teams.length} 支`,
      `收藏 benchmark ${preferences.favoriteBenchmarkIds.length} 个`,
      `缓存规则 ${preferences.cachedRuleSetId}`,
    ],
    [preferences.cachedRuleSetId, preferences.favoriteBenchmarkIds.length, teams.length],
  );

  const exportTeams = () => {
    const payload = buildExportPayload(teams);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `champions-teams-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importTeams = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsedTeams = parseTeamImport(text);
      await replaceTeams(parsedTeams);
      setImportStatus({
        type: 'success',
        title: '导入成功',
        message: `已导入 ${parsedTeams.length} 支队伍。`,
      });
    } catch (error) {
      if (error instanceof TeamImportError) {
        setImportStatus({
          type: 'error',
          title: error.title,
          message: error.message,
          suggestion: error.suggestion,
        });
      } else {
        setImportStatus({
          type: 'error',
          title: '导入失败',
          message: error instanceof Error ? error.message : '未知错误。',
          suggestion: '请确认文件格式后重试。',
        });
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">设置</h2>
        <p className="text-xs text-textSecondary">数据版本、本地缓存、导入导出与显示偏好</p>
      </div>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">数据管理</p>
        <div className="divide-y divide-divider">
          <button className="flex w-full items-center justify-between py-3 text-left" onClick={onOpenRule}>
            <span>
              <span className="block text-sm">当前规则</span>
              <span className="text-xs text-textSecondary">{currentRuleSet.name}</span>
            </span>
            <Badge status="current">当前赛季</Badge>
          </button>
          <div className="flex items-center justify-between py-3">
            <span>
              <span className="block text-sm">数据版本</span>
              <span className="text-xs text-textSecondary">{currentDataVersion.updatedAt.slice(0, 10)}</span>
            </span>
            <span className="text-sm text-textSecondary">{currentDataVersion.versionName}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span>
              <span className="block text-sm">上次同步</span>
              <span className="text-xs text-textSecondary">离线缓存可用 · {preferences.lastDataRefreshAt.slice(0, 10)}</span>
            </span>
            <Button variant="ghost" disabled title="当前版本暂不支持远程刷新">
              <RefreshCw size={14} />
              暂不支持
            </Button>
          </div>
          <div className="flex items-center justify-between py-3">
            <span>
              <span className="block text-sm">清除本地缓存</span>
              <span className="text-xs text-textSecondary">队伍和偏好会被清空</span>
            </span>
            <Button variant="danger" onClick={clearLocalData}>清除</Button>
          </div>
        </div>
        {lastRefreshError && <p className="mt-3 rounded-lg bg-reviewBg p-2 text-xs text-warning">{lastRefreshError}</p>}
        <div className="mt-3 grid gap-2">
          {cacheSummary.map((item) => (
            <p key={item} className="rounded-lg bg-secondary px-3 py-2 text-xs text-textSecondary">
              {item}
            </p>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">队伍数据</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={exportTeams}>
            <Download size={14} />
            导出队伍
          </Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
            导入队伍
          </Button>
        </div>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="application/json"
          onChange={(event) => importTeams(event.target.files?.[0])}
        />
        <p className="mt-3 text-[11px] text-textMuted">导入 / 导出 JSON 包含 ruleSetId、dataVersionId 和成员配置版本字段。</p>
        {importStatus && (
          <div className={`mt-3 rounded-lg p-3 text-xs ${importStatus.type === 'success' ? 'bg-legalBg text-success' : 'bg-missingBg text-danger'}`}>
            <p className="font-semibold">{importStatus.title}</p>
            <p className="mt-1 opacity-90">{importStatus.message}</p>
            {importStatus.type === 'error' && <p className="mt-2 text-danger/80">{importStatus.suggestion}</p>}
          </div>
        )}
      </Card>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">显示设置</p>
        <div className="divide-y divide-divider">
          <div className="flex items-center justify-between py-3">
            <span>
              <span className="block text-sm">语言</span>
              <span className="text-xs text-textSecondary">中文优先，保留英文名</span>
            </span>
            <span className="text-sm text-textSecondary">中文</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block text-sm">主题</span>
              <span className="text-xs text-textSecondary">{preferences.theme === 'dark' ? '深色竞技场' : '浅色图鉴'}</span>
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

      <Card className="text-textMuted">
        <div className="flex items-center gap-2">
          <Database size={16} />
          <span className="text-sm">多规则切换 [敬请期待]</span>
        </div>
      </Card>
    </div>
  );
}
