import { ClipboardCopy, Compass, Database, Download, Info, MessageSquare, Moon, PenLine, ShieldCheck, Sun, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { currentDataVersion, currentRuleSet } from '../data';
import { feedbackLinks, productName } from '../branding';
import { useHashRoute } from '../hooks/useHashRoute';
import { TeamImportError, parseTeamImport } from '../lib/exportImport';
import { useAppStore } from '../state/AppContext';
import type { UserPreference } from '../types';
import { Button, Card } from '../components/ui';
import { FeedbackSheet } from './profile/FeedbackSheet';

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

/**
 * The exact string a bug report needs. Keep it one line per fact and stable in shape — it
 * gets pasted into an issue, so a human has to be able to read it at a glance.
 */
const versionInfoLines = () => [
  `${productName} 版本信息`,
  `规则：${currentRuleSet.displayName}`,
  `数据版本：${currentDataVersion.id}`,
  `构建：${__APP_BUILD__}`,
  `UA：${typeof navigator === 'undefined' ? '未知' : navigator.userAgent}`,
];

const isBackupPayload = (value: unknown): value is BackupPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackupPayload>;
  return candidate.schemaVersion === 'champions-local-backup-v1' && Array.isArray(candidate.teams) && Boolean(candidate.preferences);
};

export function ProfilePage() {
  const { teams, preferences, replaceTeams, replacePreferences, clearLocalData, lastRefreshError, updateTheme } = useAppStore();
  // The message form is a route, not a local overlay: onboarding and any future entry point
  // can deep-link straight into it, and the browser back button closes it for free.
  const { route, navigate, back } = useHashRoute();
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [versionCopied, setVersionCopied] = useState(false);

  const copyVersionInfo = async () => {
    try {
      await navigator.clipboard.writeText(versionInfoLines().join('\n'));
      setVersionCopied(true);
      window.setTimeout(() => setVersionCopied(false), 2000);
    } catch {
      setNotice({ type: 'error', title: '复制失败', message: '请手动选中下面的版本信息复制。' });
    }
  };

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
          <div className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block text-sm">匿名使用统计</span>
              <span className="block text-xs text-textSecondary">
                只记录打开了哪个页面、是否以 PWA 运行、深色还是浅色、以及所在国家/地区。不含 IP、设备标识或任何队伍内容，也不写 cookie。
              </span>
            </span>
            <button
              className="grid grid-cols-2 rounded-lg border border-border bg-secondary p-1 text-textSecondary"
              type="button"
              aria-label="切换匿名使用统计"
              aria-pressed={!preferences.analyticsOptOut}
              onClick={() => replacePreferences({ ...preferences, analyticsOptOut: !preferences.analyticsOptOut })}
            >
              <span className={`grid h-8 w-10 place-items-center rounded-md text-xs font-semibold ${preferences.analyticsOptOut ? 'bg-card text-textPrimary surface-shadow' : ''}`}>
                关闭
              </span>
              <span className={`grid h-8 w-10 place-items-center rounded-md text-xs font-semibold ${preferences.analyticsOptOut ? '' : 'bg-card text-accent'}`}>
                开启
              </span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block text-sm">新手引导</span>
              <span className="text-xs text-textSecondary">重新观看首次启动的功能引导。</span>
            </span>
            <Button
              variant="ghost"
              onClick={() => replacePreferences({ ...preferences, hasCompletedOnboarding: false })}
            >
              <Compass size={14} />
              查看引导
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">本地备份</p>
        <p className="text-sm text-textSecondary">JSON 备份包含队伍、收藏、显示偏好和缓存索引。</p>
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
          当前规则、本地队伍与 PokeDB 环境快照会保留在浏览器内。离线时优先读取已缓存资源。
        </p>
        {lastRefreshError && <p className="mt-3 rounded-lg bg-reviewBg p-2 text-xs text-warning">{lastRefreshError}</p>}
      </Card>

      <Card>
        <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-textMuted">
          <MessageSquare size={13} aria-hidden="true" />
          留言
        </p>
        <p className="text-sm text-textSecondary">有问题、想法或想说的话，直接写给我们，不需要账号。</p>
        <Button className="mt-3 w-full" type="button" onClick={() => navigate({ name: 'profile-feedback' })}>
          <PenLine size={14} />
          写留言
        </Button>
      </Card>

      <Card>
        <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-textMuted">
          <Info size={13} aria-hidden="true" />
          关于
        </p>
        <dl className="divide-y divide-divider text-sm">
          {[
            ['产品', productName],
            ['规则', currentRuleSet.displayName],
            ['数据版本', currentDataVersion.id],
            ['构建', __APP_BUILD__],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="shrink-0 text-textSecondary">{label}</dt>
              <dd className="min-w-0 break-all text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-xs font-medium text-textSecondary transition active:scale-[0.98]"
          onClick={() => void copyVersionInfo()}
        >
          <ClipboardCopy size={14} />
          {versionCopied ? '版本信息已复制' : '复制版本信息'}
        </button>
        <p className="mt-2 text-xs text-textSecondary">留言里附带的构建标识已经自动带上，这个按钮留给需要手动粘贴的场合。</p>
        <a
          className="mt-2 inline-block text-xs text-textMuted underline decoration-dotted underline-offset-2"
          href={feedbackLinks.general}
          rel="noopener noreferrer"
          target="_blank"
        >
          也可以在 GitHub 提 issue
        </a>
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

      {route.name === 'profile-feedback' && <FeedbackSheet onClose={back} />}
    </div>
  );
}
