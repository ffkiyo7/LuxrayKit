import { Minus, Plus, X } from 'lucide-react';
import { MAX_STAT_POINTS_PER_STAT } from '../lib/statPoints';

/**
 * The bottom-sheet SP slider behind every SP row of N05-08. The damage calculator is its only
 * caller since 03 gave the team member editor its own wheel (`pages/team/editor/StatWheel.tsx`,
 * which has no ± keys), so the `accent` bounds variant the editor used is gone.
 *
 * The frames never draw this sheet, so it borrows their vocabulary: the sheet face and elevation,
 * N05-08's amber value and 6px amber rail, and the 44px secondary-button floor for the four keys.
 *
 * `min`/`max` default to the SP range; the calculator relies on `clampStatPointValue`, which is
 * the same clamp with those defaults.
 */
export function StatPointPicker({
  label,
  value,
  min = 0,
  max = MAX_STAT_POINTS_PER_STAT,
  onChange,
  onClose,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const nextValue = Math.max(min, Math.min(max, Math.round(value || 0)));
  const fill = max > min ? ((nextValue - min) / (max - min)) * 100 : 0;

  return (
    <div className="lk-sheet fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] rounded-t-2xl p-4">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-textPrimary/20" />
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
        <p className="text-[34px] font-extrabold tabular-nums text-data">{nextValue}</p>
        <p className="text-xs text-textSecondary">范围 {min}-{max}</p>
      </div>
      <input
        aria-label={`${label} SP`}
        className="lk-speed-slider mb-4"
        max={max}
        min={min}
        step={1}
        style={{ '--lk-slider-fill': `${fill}%` } as React.CSSProperties}
        type="range"
        value={nextValue}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="grid grid-cols-4 gap-2">
        <button className="inline-flex min-h-8 items-center justify-center rounded-lg bg-btn3 px-2 text-xs font-bold text-textLabel" type="button" onClick={() => onChange(min)}>
          min
        </button>
        <button
          aria-label={`${label} -1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg bg-btn3 text-textLabel disabled:text-btnDisabledInk"
          disabled={nextValue <= min}
          type="button"
          onClick={() => onChange(nextValue - 1)}
        >
          <Minus size={13} />
        </button>
        <button
          aria-label={`${label} +1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg bg-btn3 text-textLabel disabled:text-btnDisabledInk"
          disabled={nextValue >= max}
          type="button"
          onClick={() => onChange(nextValue + 1)}
        >
          <Plus size={13} />
        </button>
        <button className="lk-btn-primary inline-flex min-h-8 items-center justify-center rounded-lg bg-accent px-2 text-xs font-extrabold text-page" type="button" onClick={() => onChange(max)}>
          max
        </button>
      </div>
    </div>
  );
}
