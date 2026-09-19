import { ExternalLink } from 'lucide-react';
import { currentDataVersion, currentRuleSet, dataSourceManifest } from '../data';
import { useAppStore } from '../state/AppContext';
import { SectionLabel } from '../components/kit/SectionLabel';
import { SubPageHeader } from './profile/SubPageHeader';

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

function FactRow({ label, value, divider = true }: { label: string; value: string; divider?: boolean }) {
  return (
    <div className={`flex min-h-[60px] items-center gap-3 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}>
      <span className="shrink-0 text-sm font-semibold text-textSecondary">{label}</span>
      <span className="min-w-0 flex-1 break-all text-right text-[15px] font-bold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * 当前规则 — reachable again from 我的 (see the redesign plan's 已拍板的决策). The copy is
 * still under owner review, so this rewrite changed presentation only: every string below is
 * the one the page already shipped.
 */
export function RulePage({ onBack }: { onBack: () => void }) {
  const { lastRefreshError } = useAppStore();
  const chips = ['双打为主', 'Mega 每场 1 次', '道具不可重复', 'Lv.50'];

  return (
    <div className="pb-7">
      <SubPageHeader subtitle={currentRuleSet.displayName} title={currentRuleSet.name} onBack={onBack} />

      <section className="px-6 pt-[22px]">
        <div className="flex flex-wrap gap-2">
          <span className="lk-chip inline-flex h-[26px] items-center rounded-full px-3 text-xs font-bold text-textPrimary">当前赛季</span>
          {chips.map((chip) => (
            <span key={chip} className="lk-chip inline-flex h-[26px] items-center rounded-full px-3 text-xs font-semibold text-textLabel">
              {chip}
            </span>
          ))}
        </div>
      </section>

      <section className="px-6 pt-6">
        <SectionLabel>规则周期</SectionLabel>
        <div className="mt-1.5">
          <FactRow label="开始" value={`${formatUtcDateTime(currentRuleSet.startAt)} UTC`} />
          <FactRow divider={false} label="结束" value={`${formatUtcDateTime(currentRuleSet.endAt)} UTC`} />
        </div>
      </section>

      <section className="px-6 pt-6">
        <SectionLabel>计时规则</SectionLabel>
        <div className="mt-1.5">
          <FactRow label="Total Time" value={`${currentRuleSet.timers.totalTimeMinutes} 分钟`} />
          <FactRow label="Player Time" value={`${currentRuleSet.timers.playerTimeMinutes} 分钟`} />
          <FactRow label="Turn Time" value={`${currentRuleSet.timers.turnTimeSeconds} 秒`} />
          <FactRow divider={false} label="Preview" value={`${currentRuleSet.timers.previewTimeSeconds} 秒`} />
        </div>
      </section>

      <section className="px-6 pt-6">
        <SectionLabel trailing={currentDataVersion.verificationStatus}>数据版本</SectionLabel>
        <p className="mt-2 text-base font-bold tracking-[-0.01em]">{currentDataVersion.versionName}</p>
        <p className="mt-2 text-[13px] font-semibold leading-5 text-textLabel">{currentDataVersion.sourceSummary}</p>
        <p className="mt-2 text-xs font-semibold leading-[18px] text-textSecondary">{currentDataVersion.notes}</p>
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          <button className="inline-flex h-11 items-center justify-center rounded-[14px] bg-btn3 px-4 text-sm font-bold text-btnDisabledInk" disabled type="button">
            暂不支持远程刷新
          </button>
          <a
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[14px] bg-btn1 px-4 text-sm font-bold text-textLabel"
            href={currentRuleSet.officialSourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={14} />
            官方来源
          </a>
        </div>
        <p className="mt-3.5 text-xs font-semibold leading-[18px] text-textSecondary">
          当前版本使用本地 seed 数据，远程官方数据刷新入口将在接入审核流程后开放。
        </p>
        {lastRefreshError && (
          <p className="mt-3 rounded-[14px] p-3.5 text-xs font-semibold leading-[18px] text-warning" style={{ background: 'rgb(var(--color-warning) / 0.12)' }}>
            {lastRefreshError}
          </p>
        )}
      </section>

      <section className="px-6 pt-6">
        <div className="rounded-[14px] p-3.5" style={{ background: 'rgb(var(--color-data) / 0.12)' }}>
          <p className="text-sm font-extrabold text-data">机制待确认</p>
          <p className="mt-1 text-xs font-semibold leading-[18px] text-textLabel">{dataSourceManifest.blockedMechanisms.join('、')} 仍需权威验证。</p>
        </div>
      </section>
    </div>
  );
}
