import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { currentDataVersion, currentRuleSet, dataSourceManifest } from '../data';
import { useAppStore } from '../state/AppContext';
import { Badge, Button, Card, Chip } from '../components/ui';

export function RulePage({ onBack }: { onBack: () => void }) {
  const { lastRefreshError } = useAppStore();
  const formatUtcDateTime = (value: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));

  return (
    <div className="space-y-3">
      <button className="mb-1 flex items-center gap-2 text-sm text-accent" onClick={onBack}>
        <ArrowLeft size={16} />
        返回
      </button>
      <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{currentRuleSet.name}</h2>
            <p className="text-xs text-textSecondary">{currentRuleSet.displayName}</p>
          </div>
          <Badge status="current">当前赛季</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Chip>双打为主</Chip>
          <Chip>Mega 每场 1 次</Chip>
          <Chip>道具不可重复</Chip>
          <Chip>Lv.50</Chip>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">规则周期</p>
        <div className="space-y-2 text-sm">
          <p>开始：{formatUtcDateTime(currentRuleSet.startAt)} UTC</p>
          <p>结束：{formatUtcDateTime(currentRuleSet.endAt)} UTC</p>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">计时规则</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>Total Time：{currentRuleSet.timers.totalTimeMinutes} 分钟</span>
          <span>Player Time：{currentRuleSet.timers.playerTimeMinutes} 分钟</span>
          <span>Turn Time：{currentRuleSet.timers.turnTimeSeconds} 秒</span>
          <span>Preview：{currentRuleSet.timers.previewTimeSeconds} 秒</span>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-textMuted">数据版本</p>
            <h3 className="font-semibold">{currentDataVersion.versionName}</h3>
          </div>
          <Badge status="version">{currentDataVersion.verificationStatus}</Badge>
        </div>
        <p className="text-sm text-textSecondary">{currentDataVersion.sourceSummary}</p>
        <p className="mt-2 text-[11px] text-textMuted">{currentDataVersion.notes}</p>
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" disabled title="当前版本暂不支持远程刷新">
            <RefreshCw size={14} />
            暂不支持远程刷新
          </Button>
          <a
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-accent/40 px-3 text-xs font-semibold text-accent"
            href={currentRuleSet.officialSourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} />
            官方来源
          </a>
        </div>
        <p className="mt-3 rounded-lg bg-secondary p-2 text-xs text-textSecondary">当前版本使用本地 seed 数据，远程官方数据刷新入口将在接入审核流程后开放。</p>
        {lastRefreshError && <p className="mt-3 rounded-lg bg-reviewBg p-2 text-xs text-warning">{lastRefreshError}</p>}
      </Card>

      <Card className="bg-reviewBg text-warning">
        <p className="text-sm font-semibold">机制待确认</p>
        <p className="mt-1 text-xs text-warning/80">{dataSourceManifest.blockedMechanisms.join('、')} 仍需权威验证。</p>
      </Card>
    </div>
  );
}
