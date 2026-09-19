import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { calculateBattleStats } from '../../../lib/calculations';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointTotal } from '../../../lib/statPoints';
import type { BaseStats, StatPoints } from '../../../types';

/**
 * 03-01 「能力分配」. One stat at a time: a wheel picks which, a single rail sets its SP, and
 * the real number underneath recomputes live. The frame draws no ± keys — the rail is the
 * only control — so the native range input carries the whole interaction (and with it the
 * slider role, keyboard stepping and value announcements).
 *
 * The wheel is a real scroller: native `overflow-x` + `scroll-snap` gives touch dragging, its
 * inertia and the snap for free, and the stat that settles under the centre becomes the
 * selected one. Tapping an item and the arrow keys stay, and a mouse wheel's vertical delta is
 * mapped onto the track (a wheel mouse has no horizontal axis).
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
  // A scroll we started ourselves must not be read back as a user choice, and the settle timer
  // is what tells snapping apart from a gesture still in flight.
  const programmaticRef = useRef(false);
  const settleRef = useRef(0);
  const centredRef = useRef(false);

  const centreOn = (key: StatKey, behavior: ScrollBehavior) => {
    const box = boxRef.current;
    const item = itemRefs.current[key];
    if (!box || !item) return;
    const left = item.offsetLeft + item.offsetWidth / 2 - box.clientWidth / 2;
    if (Math.abs(box.scrollLeft - left) < 1) return;
    programmaticRef.current = true;
    box.scrollTo({ left, behavior });
  };

  useLayoutEffect(() => {
    // The very first pass places the stored stat without animating past its neighbours.
    centreOn(selectedKey, centredRef.current ? 'smooth' : 'auto');
    centredRef.current = true;
  }, [selectedKey]);

  // React's own wheel listener is passive, so the vertical-to-horizontal mapping needs a
  // native one to be able to cancel the page scroll it would otherwise cause.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      box.scrollLeft += event.deltaY;
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  const keyNearestCentre = () => {
    const box = boxRef.current;
    if (!box) return null;
    const centre = box.scrollLeft + box.clientWidth / 2;
    let nearest: { key: StatKey; distance: number } | null = null;
    wheelStats.forEach((entry) => {
      const item = itemRefs.current[entry.key];
      if (!item) return;
      const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - centre);
      if (!nearest || distance < nearest.distance) nearest = { key: entry.key, distance };
    });
    return nearest ? (nearest as { key: StatKey }).key : null;
  };

  const handleScroll = () => {
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      if (programmaticRef.current) {
        programmaticRef.current = false;
        return;
      }
      const settled = keyNearestCentre();
      if (settled) setSelectedKey(settled);
    }, 90);
  };

  const step = (delta: number) => {
    const index = wheelStats.findIndex((entry) => entry.key === selectedKey);
    const next = wheelStats[Math.max(0, Math.min(wheelStats.length - 1, index + delta))];
    if (next) setSelectedKey(next.key);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    step(delta);
  };

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
        <div
          ref={boxRef}
          className="lk-wheel-scroller absolute inset-0 flex items-center gap-0.5 overflow-x-auto overflow-y-hidden"
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
        >
          {/* Half a track's width at each end, so the first and last stat can still reach the centre. */}
          <span aria-hidden="true" className="h-10 w-1/2 shrink-0" />
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
                className={`inline-flex h-10 shrink-0 snap-center items-center gap-[3px] ${ink.className}`}
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
          <span aria-hidden="true" className="h-10 w-1/2 shrink-0" />
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
