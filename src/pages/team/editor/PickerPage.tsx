import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { SearchField } from '../../../components/kit';
import { useScrollResetWhileMounted } from '../../../hooks/useScrollReset';

/**
 * The shell every 03 picker sub-page shares (03-02 / 03-06 / 03-10 / 03-11): a round back
 * button, an optional text action on the right, the big title, and — where the page searches —
 * a 44px field that moves up next to the back button as soon as there is a query (03-03 /
 * 03-05 / 03-07).
 */

export function RoundIconButton({
  label,
  children,
  tone = 'label',
  onClick,
}: {
  label: string;
  children: ReactNode;
  tone?: 'label' | 'muted';
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface ${
        tone === 'muted' ? 'text-textSecondary' : 'text-textLabel'
      }`}
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export type PickerSearch = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
};

export function PickerPage({
  title,
  subtitle,
  backLabel,
  onBack,
  action,
  search,
  filters,
  children,
}: {
  title: string;
  subtitle?: string;
  backLabel: string;
  onBack: () => void;
  /** The frames' top-right text action — 「清空」 on the move and item pages. */
  action?: { label: string; onClick: () => void };
  search?: PickerSearch;
  /** The 属性/分类/类别 chip row under the search field, and the panel it opens. */
  filters?: ReactNode;
  children: ReactNode;
}) {
  const searching = Boolean(search && search.value.length > 0);
  // Pickers are swapped in by editor state, not by a route, so the router's reset misses them.
  useScrollResetWhileMounted();

  return (
    <div className="pb-8">
      {searching && search ? (
        <div className="flex items-center gap-3 px-6 pt-5">
          <RoundIconButton label={backLabel} onClick={onBack}>
            <ChevronLeft size={20} />
          </RoundIconButton>
          <SearchField
            autoFocus
            className="min-w-0 flex-1"
            label={search.label}
            placeholder={search.placeholder}
            value={search.value}
            onChange={search.onChange}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-6 pt-5">
            <RoundIconButton label={backLabel} onClick={onBack}>
              <ChevronLeft size={20} />
            </RoundIconButton>
            {action && (
              <button className="text-sm font-bold text-textPrimary" type="button" onClick={action.onClick}>
                {action.label}
              </button>
            )}
          </div>
          <div className="px-6 pt-[14px]">
            <h1 className="text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[13px] leading-[18px] text-textSecondary">{subtitle}</p>}
            {search && (
              <SearchField
                className="mt-4"
                label={search.label}
                placeholder={search.placeholder}
                value={search.value}
                onChange={search.onChange}
              />
            )}
            {filters}
          </div>
        </>
      )}
      {children}
    </div>
  );
}

/** 03-02's 「属性 ⌄」 chip: opens the filter panel and reports how many facets are on. */
export function FilterToggle({
  label,
  count,
  open,
  onClick,
}: {
  label: string;
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={open}
      className={`inline-flex h-[34px] items-center gap-1.5 rounded-full px-[13px] text-[13px] ${
        count > 0 ? 'lk-pill-on font-bold text-textPrimary' : 'bg-surface font-semibold text-textLabel'
      }`}
      type="button"
      onClick={onClick}
    >
      {label}
      {count > 0 && <span className="tabular-nums">{count}</span>}
      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );
}

/** A facet chip with its result count (03-04 / 03-08). */
export function FacetChip({
  label,
  count,
  selected,
  leading,
  onClick,
}: {
  label: string;
  count: number;
  selected?: boolean;
  leading?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`inline-flex h-8 items-center gap-[7px] rounded-full px-[13px] text-[13px] ${
        selected ? 'lk-pill-on font-bold text-textPrimary' : 'bg-surface font-semibold text-textLabel'
      }`}
      type="button"
      onClick={onClick}
    >
      {leading}
      {label}
      <span className={`tabular-nums ${selected ? 'text-textPrimary' : 'text-textSecondary'}`}>{count}</span>
    </button>
  );
}

/** The bordered band 03-04 / 03-08 drop between the search field and the results. */
export function FilterPanel({ children, onCollapse }: { children: ReactNode; onCollapse: () => void }) {
  return (
    <div className="mt-4 border-y border-[var(--hairline)] py-[18px]">
      {children}
      <button
        className="mx-6 mt-[18px] flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-[13px] font-bold text-textLabel"
        style={{ width: 'calc(100% - 48px)' }}
        type="button"
        onClick={onCollapse}
      >
        收起筛选
        <ChevronUp size={15} />
      </button>
    </div>
  );
}

/** The 「属性 · 已选 1」 / 「类别 · 未选」 heading with its 重置 action (03-04 / 03-08). */
export function FacetHeader({
  label,
  selectedCount,
  onReset,
}: {
  label: string;
  selectedCount: number;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-6">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">
        {label} · {selectedCount > 0 ? `已选 ${selectedCount}` : '未选'}
      </p>
      {onReset && (
        <button className="shrink-0 text-[13px] font-bold text-textPrimary" type="button" onClick={onReset}>
          重置
        </button>
      )}
    </div>
  );
}
