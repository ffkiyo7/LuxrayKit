import { Pill } from '../../components/kit';
import type { MoveCounterSpec } from '../../lib/damageAdapter';

/**
 * The tier row under 当前招式 for 扫墓 / 愤怒之拳. Up to four tiers read at a glance as equal
 * pills (双打/单打's capsule); 愤怒之拳's seven would crowd a 390px row, so it takes the
 * −/+ stepper from 能力阶级 instead.
 */
export function MoveCounterControl({
  spec,
  value,
  max,
  onChange,
}: {
  spec: MoveCounterSpec;
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const hint = `最多 ${max} ${spec.unit}`;

  if (max <= 3) {
    return (
      <div className="pb-1 pt-3.5" data-calc-move-counter>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-textSecondary">{spec.label}</span>
          <span className="text-xs text-textSecondary">{hint}</span>
        </div>
        <div className="mt-2.5 flex gap-2">
          {Array.from({ length: max + 1 }, (_, count) => (
            <Pill
              key={count}
              ariaLabel={`${spec.label} ${count} ${spec.unit}`}
              grow
              height={32}
              selected={count === value}
              onClick={() => onChange(count)}
            >
              {count}
            </Pill>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5" data-calc-move-counter style={{ height: 60 }}>
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-textSecondary">
        {spec.label}
        <span className="ml-2 text-xs font-normal">{hint}</span>
      </span>
      <button
        aria-label={`${spec.label} −1`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-btn1 text-textLabel"
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <span
        aria-label={spec.label}
        className={`w-11 text-center text-[20px] font-extrabold tabular-nums ${value === 0 ? 'text-textLabel' : 'text-textPrimary'}`}
        role="status"
      >
        {value}
      </span>
      <button
        aria-label={`${spec.label} +1`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-btn1 text-textLabel"
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
