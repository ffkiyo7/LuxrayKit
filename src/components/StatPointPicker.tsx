import { Minus, Plus, X } from 'lucide-react';
import { MAX_STAT_POINTS_PER_STAT } from '../lib/statPoints';
import { Button } from './ui';

/**
 * The bottom-sheet SP slider, shared by the team member editor and the damage calculator.
 *
 * The two pages carried near-identical copies. They do differ in how the min/max buttons are
 * rendered, and both spellings are pinned by visual baselines (06/07 member editor, 09
 * calculator), so the variant stays an explicit prop rather than being unified away:
 *
 * - `accent` — the shared `ui` <Button> pair (ghost + primary). Team member editor.
 * - `plain`  — bordered / solid raw buttons. Damage calculator.
 *
 * `min`/`max` default to the SP range; the calculator relied on `clampStatPointValue`, which is
 * the same clamp with those defaults.
 */
export type StatPointBoundsVariant = 'accent' | 'plain';

export function StatPointPicker({
  label,
  value,
  min = 0,
  max = MAX_STAT_POINTS_PER_STAT,
  boundsVariant = 'accent',
  onChange,
  onClose,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  boundsVariant?: StatPointBoundsVariant;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const nextValue = Math.max(min, Math.min(max, Math.round(value || 0)));

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label} SP</p>
          <p className="text-xs text-textSecondary">拖动滑条，或直接设为最小 / 最大</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭 SP 调整" type="button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mb-4 text-center">
        <p className="text-[34px] font-bold text-accent">{nextValue}</p>
        <p className="text-xs text-textMuted">范围 {min}-{max}</p>
      </div>
      <input
        aria-label={`${label} SP`}
        className="mb-4 h-9 w-full accent-accent"
        max={max}
        min={min}
        type="range"
        value={nextValue}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="grid grid-cols-4 gap-2">
        {boundsVariant === 'accent' ? (
          <Button variant="ghost" onClick={() => onChange(min)}>
            min
          </Button>
        ) : (
          <button className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border px-2 text-xs font-semibold text-textSecondary" type="button" onClick={() => onChange(min)}>
            min
          </button>
        )}
        <button
          aria-label={`${label} -1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
          disabled={nextValue <= min}
          type="button"
          onClick={() => onChange(nextValue - 1)}
        >
          <Minus size={13} />
        </button>
        <button
          aria-label={`${label} +1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
          disabled={nextValue >= max}
          type="button"
          onClick={() => onChange(nextValue + 1)}
        >
          <Plus size={13} />
        </button>
        {boundsVariant === 'accent' ? (
          <Button onClick={() => onChange(max)}>
            max
          </Button>
        ) : (
          <button className="inline-flex min-h-8 items-center justify-center rounded-lg bg-accent px-2 text-xs font-semibold text-page" type="button" onClick={() => onChange(max)}>
            max
          </button>
        )}
      </div>
    </div>
  );
}
