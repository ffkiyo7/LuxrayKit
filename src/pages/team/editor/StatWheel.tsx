import { useLayoutEffect, useRef, useState } from 'react';
import { calculateBattleStats } from '../../../lib/calculations';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointTotal } from '../../../lib/statPoints';
import type { BaseStats, StatPoints } from '../../../types';

/**
 * 03-01 「能力分配」. One stat at a time: a wheel picks which, a single rail sets its SP, and
 * the real number underneath recomputes live. The frame draws no ± keys — the rail is the
 * only control — so the native range input carries the whole interaction (and with it the
 * slider role, keyboard stepping and value announcements).
 */

export type StatKey = keyof BaseStats;

const wheelStats: Array<{ key: StatKey; label: string }> = [
  { key: 'defense', label: '防御' },
  { key: 'specialAttack', label: '特攻' },
  { key: 'specialDefense', label: '特防' },
  { key: 'speed', label: '速度' },
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
];

const TICKS = [0, 8, 16, 24, 32];

// 03-01 shades the wheel by how far a stat sits from the centre; past two steps it stops
// shrinking, since the frame never shows a fourth ring.
const wheelInk = (distance: number) => {
  if (distance === 0) return { className: 'text-[17px] font-extrabold tracking-[-0.01em] text-textPrimary px-[14px]', style: {} };
  if (distance === 1) {
    return { className: 'text-[15px] font-semibold px-[11px]', style: { color: 'var(--lk-wheel-d1)' } };
  }
  if (distance === 2) {
    return { className: 'text-[14px] font-semibold px-[11px]', style: { color: 'var(--lk-wheel-d2)', transform: 'scaleY(0.9)' } };
  }
  return {
    className: 'text-[13px] font-semibold px-[11px] opacity-75',
    style: { color: 'var(--lk-wheel-d3)', transform: 'scaleY(0.82)' },
  };
};

export function StatWheel({
  statPoints,
  baseStats,
  nature,
  natureMarker,
  onChange,
}: {
  statPoints: StatPoints;
  baseStats: BaseStats;
  nature: string;
  /** '↑' / '↓' for the stat the nature moves, matching 03-01's amber arrow. */
  natureMarker: (key: StatKey) => 'up' | 'down' | null;
  onChange: (key: StatKey, value: number) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<StatKey>(
    () => wheelStats.find((entry) => Number(statPoints[entry.key] ?? 0) > 0)?.key ?? 'hp',
  );
  const boxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Partial<Record<StatKey, HTMLButtonElement | null>>>({});
  const [trackOffset, setTrackOffset] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const item = itemRefs.current[selectedKey];
    if (!box || !item) return;
    setTrackOffset(box.offsetWidth / 2 - (item.offsetLeft + item.offsetWidth / 2));
  }, [selectedKey]);

  const selected = wheelStats.find((entry) => entry.key === selectedKey)!;
  const selectedIndex = wheelStats.indexOf(selected);
  const value = Math.max(0, Number(statPoints[selectedKey] ?? 0));
  const total = statPointTotal(statPoints);
  const overStat = wheelStats.find((entry) => Number(statPoints[entry.key] ?? 0) > MAX_STAT_POINTS_PER_STAT);
  const overTotal = total > MAX_TOTAL_STAT_POINTS;
  const message = overStat
    ? `${overStat.label} ${statPoints[overStat.key]} 超过单项上限 ${MAX_STAT_POINTS_PER_STAT}`
    : overTotal
      ? `总计超了 ${total - MAX_TOTAL_STAT_POINTS} 点，得从任意一项减 ${total - MAX_TOTAL_STAT_POINTS}`
      : `单项最多 ${MAX_STAT_POINTS_PER_STAT}，剩余 ${MAX_TOTAL_STAT_POINTS - total} 点可分配`;
  const selectedOver = value > MAX_STAT_POINTS_PER_STAT;
  const real = calculateBattleStats(baseStats, statPoints, 50, nature)[selectedKey];

  return (
    <section className="px-6 pt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">能力分配</h2>
        <span className={`text-[13px] font-bold tabular-nums ${overStat || overTotal ? 'text-danger' : 'text-data'}`}>
          {total} / {MAX_TOTAL_STAT_POINTS}
        </span>
      </div>
      <p className={`mt-1.5 text-xs font-semibold ${overStat || overTotal ? 'text-[13px] leading-[19px] font-bold text-danger' : 'text-textSecondary'}`}>
        {message}
      </p>

      <div className="relative mt-[18px] h-14 overflow-hidden">
        <div className="lk-wheel-rail absolute inset-x-[-24px] top-2 h-10" />
        <div ref={boxRef} className="absolute inset-0">
          <div
            className="absolute top-0 flex h-full items-center gap-0.5"
            style={{ transform: `translateX(${trackOffset}px)` }}
          >
            {wheelStats.map((entry, index) => {
              const distance = Math.abs(index - selectedIndex);
              const ink = wheelInk(distance);
              const marker = natureMarker(entry.key);
              return (
                <button
                  key={entry.key}
                  ref={(element) => {
                    itemRefs.current[entry.key] = element;
                  }}
                  aria-label={`调整${entry.label}`}
                  aria-pressed={distance === 0}
                  className={`inline-flex h-10 shrink-0 items-center gap-[3px] ${ink.className}`}
                  style={ink.style}
                  type="button"
                  onClick={() => setSelectedKey(entry.key)}
                >
                  {entry.label}
                  {marker && distance === 0 && (
                    <span className={`text-[13px] font-extrabold ${selectedOver ? 'text-danger' : 'text-data'}`}>
                      {marker === 'up' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="lk-wheel-fade--left pointer-events-none absolute inset-y-0 left-0 w-[72px]" />
        <div className="lk-wheel-fade--right pointer-events-none absolute inset-y-0 right-0 w-[72px]" />
      </div>

      <div className="mt-[22px] flex items-end justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">{selected.label} SP</p>
        <p className="text-right">
          <span
            className={`text-[34px] font-extrabold leading-none tracking-[-0.02em] tabular-nums ${
              selectedOver ? 'text-danger' : 'text-data'
            }`}
          >
            {value}
          </span>
          <span className={`ml-1 text-[13px] font-bold ${selectedOver ? 'text-danger' : 'text-textSecondary'}`}>
            / {MAX_STAT_POINTS_PER_STAT}
          </span>
        </p>
      </div>

      <input
        aria-label={`${selected.label} SP`}
        className={`lk-sp-slider mt-[14px] ${selectedOver ? 'lk-sp-slider--over' : ''}`}
        max={MAX_STAT_POINTS_PER_STAT}
        min={0}
        step={1}
        style={{ '--lk-sp-fill': `${Math.min(100, (value / MAX_STAT_POINTS_PER_STAT) * 100)}%` } as React.CSSProperties}
        type="range"
        value={Math.min(value, MAX_STAT_POINTS_PER_STAT)}
        onChange={(event) => onChange(selectedKey, Number(event.target.value))}
      />
      <div className="mt-2 flex justify-between text-[10px] font-bold tabular-nums text-textSecondary">
        {TICKS.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>

      <div className="mt-4 flex items-baseline gap-2 border-t border-[var(--hairline)] pt-[14px]">
        <span className="text-[13px] font-semibold text-textSecondary">{selected.label}实数</span>
        <span className="flex-1" />
        <span className="text-[20px] font-extrabold tracking-[-0.01em] tabular-nums">{real}</span>
      </div>
    </section>
  );
}
