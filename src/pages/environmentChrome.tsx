import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { currentRegulation, type EnvironmentBattleType, type EnvironmentState } from '../data/environment';

export const battleTypeLabels: Record<EnvironmentBattleType, string> = {
  singles: '单打',
  doubles: '双打',
};

/**
 * Per the 数据口径 decision: 招式 / 道具 / 特性 / 性格 percentages exist only for the first 60
 * ranks, so everything that depends on them (the detail statistics, 按热门配置加入队伍) is gated
 * on this rank rather than on whether a particular snapshot happened to carry the arrays.
 */
export const DETAIL_RANK_LIMIT = 60;

export const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

/**
 * 「M-6 赛季 · M-C 规则 · 09-10 07:40 更新」. The season comes from the snapshot and the
 * regulation from the catalog — neither is ever written out by hand. A non-ladder season label
 * (the bundled 开发样例) is printed as-is instead of being suffixed with 赛季.
 */
export const environmentSubtitle = (environment: EnvironmentState) =>
  [
    /^M-\d+$/.test(environment.seasonLabel) ? `${environment.seasonLabel} 赛季` : environment.seasonLabel,
    `${currentRegulation} 规则`,
    `${formatUpdatedAt(environment.sourceUpdatedAt)} 更新`,
  ].join(' · ');

/** The 36px round icon button the frames put in a pushed page's header and on the hero. */
export function RoundIconButton({
  label,
  children,
  onHero = false,
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onHero?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:opacity-40 ${
        onHero ? 'lk-on-hero text-textPrimary' : 'bg-surface text-textLabel'
      }`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Header row of a pushed page (01-03 / N01-10 / 07-01): back chevron left, page actions right. */
export function PushHeader({ onBack, trailing }: { onBack: () => void; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 pt-5">
      <RoundIconButton label="返回" onClick={onBack}>
        <ChevronLeft size={20} />
      </RoundIconButton>
      {trailing}
    </div>
  );
}

/** In-page section heading — 22/30/800 with the frames' right-aligned hint on the same baseline. */
export function SectionHeading({
  children,
  trailing,
  className = '',
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{children}</h2>
      {trailing}
    </div>
  );
}
