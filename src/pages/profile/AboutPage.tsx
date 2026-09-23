import { CloudOff, Copy, Database, SlidersHorizontal, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { currentDataVersion, currentRuleSet, dataSourceManifest } from '../../data';
import { productName } from '../../branding';
import { currentSeasonLabel, seasonSchedule } from '../../data/schedule';
import { useAppStore } from '../../state/AppContext';
import { SectionLabel } from '../../components/kit/SectionLabel';
import { SubPageHeader } from './SubPageHeader';

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

const monthDay = (iso: string) =>
  new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', month: 'numeric', day: 'numeric' }).format(new Date(iso));

/** 「M-6 · 9/9 – 10/7」, or the bare label while a season is missing from the schedule table. */
const seasonWindow = () => {
  const label = currentSeasonLabel();
  const entry = seasonSchedule.find((season) => season.label === label);
  return entry ? `${label} · ${monthDay(entry.startAt)} – ${monthDay(entry.endAt)}` : label;
};

function FactRow({ label, value, height = 64, divider = true }: { label: string; value: string; height?: number; divider?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      style={{ minHeight: height }}
    >
      <span className="min-w-0 shrink-0 text-sm font-semibold text-textSecondary">{label}</span>
      <span className="min-w-0 flex-1 break-all text-right text-[15px] font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ClearDataSheet({ teamCount, onCancel, onConfirm, onExport }: { teamCount: number; onCancel: () => void; onConfirm: () => void; onExport: () => void }) {
  const items = [
    { icon: <Users size={15} />, text: `${teamCount} 支队伍` },
    { icon: <SlidersHorizontal size={15} />, text: '显示偏好与主题' },
    { icon: <CloudOff size={15} />, text: '离线缓存索引' },
  ];
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onCancel);

  return (
    <div
      ref={dialogRef}
      aria-label="清除本地数据"
      aria-modal="true"
      className="fixed inset-0 z-50 mx-auto max-w-[430px] outline-none"
      data-bottom-nav-lock="true"
      role="dialog"
      tabIndex={-1}
    >
      <button aria-label="取消清除本地数据" className="lk-sheet-overlay absolute inset-0 h-full w-full" type="button" onClick={onCancel} />
      <section className="lk-sheet absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[20px] px-6 pb-7 pt-6">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">清除本地数据</h2>
        <p className="mt-2 text-sm font-semibold leading-[21px] text-textLabel">删除后无法恢复。</p>
        <div className="mt-4 rounded-[14px] bg-sunken p-3.5">
          {items.map((item) => (
            <div key={item.text} className="flex h-8 items-center gap-2.5">
              <span className="shrink-0 text-chevron">{item.icon}</span>
              <span className="text-[13px] font-bold text-textLabel">{item.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-3.5 flex items-center gap-2">
          <span className="text-xs font-semibold text-textSecondary">建议先导出备份</span>
          <button className="inline-flex items-center gap-1.5 text-xs font-bold text-textPrimary" type="button" onClick={onExport}>
            <Database size={13} />
            导出 JSON
          </button>
        </div>
        <div className="mt-[18px] flex gap-2.5">
          <button className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-btn1 px-5 text-base font-bold text-textLabel" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="inline-flex h-[50px] min-w-0 flex-1 items-center justify-center rounded-2xl text-base font-extrabold tracking-[-0.01em] text-danger"
            style={{ background: 'rgb(var(--color-danger) / 0.18)', boxShadow: 'inset 0 0 0 1.5px rgb(var(--color-danger))' }}
            type="button"
            onClick={onConfirm}
          >
            清除本地数据
          </button>
        </div>
      </section>
    </div>
  );
}

/** 关于与数据 (08-02) plus the 清除本地数据 confirmation (08-04). */
export function AboutPage({ onBack, onExportBackup }: { onBack: () => void; onExportBackup: () => void }) {
  const { teams, clearLocalData } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const copyVersionInfo = async () => {
    try {
      await navigator.clipboard.writeText(versionInfoLines().join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denial is silent here: the same four facts are on screen to select by hand.
    }
  };

  return (
    <div className="pb-7">
      <SubPageHeader title="关于与数据" onBack={onBack} />

      <section className="px-6 pt-[22px]">
        <SectionLabel>当前规则</SectionLabel>
        <div className="mt-1.5">
          <FactRow label="规则" value={currentRuleSet.displayName} />
          <FactRow label="赛季周期" value={seasonWindow()} />
          <FactRow label="数据版本" value={currentDataVersion.id} />
          <FactRow divider={false} height={60} label="构建" value={__APP_BUILD__} />
        </div>
        <button
          className="mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-btn3 text-sm font-bold text-textLabel"
          type="button"
          onClick={() => void copyVersionInfo()}
        >
          <Copy size={16} />
          {copied ? '版本信息已复制' : '复制版本信息'}
        </button>
      </section>

      <section className="px-6 pt-6">
        <SectionLabel>数据来源</SectionLabel>
        <p className="mt-2 text-[13px] font-semibold leading-[18px] text-textLabel">
          环境数据为 PokeDB 上位构筑样本，给出的是名次，不是官方使用率。榜单每天自动刷新，离线时显示本机缓存的最近一份。
        </p>
        <div className="mt-3 rounded-[14px] p-3.5" style={{ background: 'rgb(var(--color-data) / 0.12)' }}>
          <p className="text-sm font-extrabold text-data">机制待确认</p>
          <p className="mt-1 text-xs font-semibold leading-[18px] text-textLabel">
            {dataSourceManifest.blockedMechanisms.join('、')} 仍需权威验证，相关结果仅供参考。
          </p>
        </div>
      </section>

      <section className="px-6 pt-6">
        <SectionLabel>危险操作</SectionLabel>
        <button
          className="mt-2.5 flex h-12 w-full items-center justify-center rounded-[14px] text-[15px] font-extrabold text-danger"
          style={{ background: 'rgb(var(--color-danger) / 0.12)' }}
          type="button"
          onClick={() => setConfirming(true)}
        >
          清除本地数据
        </button>
        <p className="mt-2.5 text-xs font-semibold text-textSecondary">
          会删除全部本地队伍、收藏与缓存索引，且不可恢复。建议先导出备份。
        </p>
      </section>

      {confirming && (
        <ClearDataSheet
          teamCount={teams.length}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void clearLocalData();
          }}
          onExport={onExportBackup}
        />
      )}
    </div>
  );
}
