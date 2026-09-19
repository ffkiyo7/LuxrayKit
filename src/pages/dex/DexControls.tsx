import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DexTab } from './dexShared';

const tabOptions: Array<{ id: DexTab; label: string }> = [
  { id: 'pokemon', label: '宝可梦' },
  { id: 'moves', label: '招式' },
  { id: 'items', label: '道具' },
  { id: 'abilities', label: '特性' },
];

/**
 * 04-04's four-up segmented control. It sits in a `surface` well rather than the `sunken` one
 * the kit's two-up `SegmentedTabs` uses, so it is drawn here from the frame instead.
 */
export function DexTabs({ value, onChange, className = '' }: { value: DexTab; onChange: (tab: DexTab) => void; className?: string }) {
  return (
    <div className={`grid grid-cols-4 gap-1 rounded-xl bg-surface p-1 ${className}`}>
      {tabOptions.map((option) => (
        <button
          key={option.id}
          aria-pressed={value === option.id}
          className={`grid h-[34px] place-items-center rounded-[9px] text-sm ${
            value === option.id ? 'lk-segment-on font-bold text-textPrimary' : 'font-semibold text-textSecondary'
          }`}
          type="button"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** 04-04 / 04-07 filter opener: a flat capsule whose chevron flips while the panel is open. */
export function DisclosureChip({
  label,
  open,
  icon,
  onClick,
}: {
  label: string;
  open: boolean;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={open}
      className={`inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full px-[13px] text-[13px] ${
        open ? 'lk-pill-on font-bold text-textPrimary' : 'bg-surface font-semibold text-textLabel'
      }`}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );
}

/** 04-05 / N04-06 active-filter chip: selected pill plus a 16px × badge pulled 3px into the edge. */
export function RemovableChip({ children, ariaLabel, onRemove }: { children: ReactNode; ariaLabel: string; onRemove: () => void }) {
  return (
    <button
      aria-label={ariaLabel}
      className="lk-pill-on inline-flex h-[34px] shrink-0 items-center gap-[7px] rounded-full px-[13px] text-[13px] font-bold text-textPrimary"
      type="button"
      onClick={onRemove}
    >
      {children}
      <span className="lk-p4a-chip-x -mr-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full text-textPrimary">
        <X size={10} />
      </span>
    </button>
  );
}

/** Idle capsule with no disclosure — 04-04's 「仅 Mega」. */
export function ToggleChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-[34px] shrink-0 items-center rounded-full bg-surface px-[13px] text-[13px] font-semibold text-textLabel"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * The inline filter drawer (04-06 / N04-05): a full-bleed plane between two hairlines. It is not
 * a sheet — the list stays visible underneath and the counts update as you pick.
 */
export function FilterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="lk-p4a-filter-panel -mx-6 mt-[18px] border-y border-[var(--hairline)] py-[18px]">{children}</div>
  );
}

/** 04-06 panel chip: label, optional type dot, and the number of rows it would leave. */
export function CountChip({
  children,
  count,
  selected,
  ariaLabel,
  onClick,
}: {
  children: ReactNode;
  count: number;
  selected: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={`inline-flex h-8 items-center gap-[7px] rounded-full px-3 text-[13px] ${
        selected ? 'lk-pill-on font-bold text-textPrimary' : 'bg-surface font-semibold text-textLabel'
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
      <span className={`tabular-nums ${selected ? 'text-textLabel' : 'text-textSecondary'}`}>{count}</span>
    </button>
  );
}

/** 04-06 panel footer: the live result count on the left, 「收起筛选」 on the right. */
export function PanelFooter({ resultLabel, onCollapse }: { resultLabel: string; onCollapse: () => void }) {
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 px-6">
      <span className="text-[13px] font-bold tabular-nums text-textLabel">{resultLabel}</span>
      <button
        className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-btn2 px-3.5 text-[13px] font-bold text-textPrimary"
        type="button"
        onClick={onCollapse}
      >
        收起筛选
        <ChevronUp size={14} />
      </button>
    </div>
  );
}

/** N04-01…N04-04 empty state: a heading, one sentence, and the ways back. */
export function DexEmptyState({ title, description, actions }: { title: string; description: string; actions: ReactNode }) {
  return (
    <div className="px-6 pt-[34px]">
      <h2 className="text-[20px] font-extrabold leading-7 tracking-[-0.01em]">{title}</h2>
      <p className="mt-2 text-[13px] font-semibold leading-5 text-textSecondary">{description}</p>
      <div className="mt-[18px] flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function EmptyStateAction({ children, strong, onClick }: { children: ReactNode; strong?: boolean; onClick: () => void }) {
  return (
    <button
      className={`inline-flex h-[34px] items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-bold ${
        strong ? 'text-textPrimary' : 'text-textLabel'
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
