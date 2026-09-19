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
 * inertia and the snap for free. Two things keep that snap honest:
 *  - every item is the same fixed width and only *paints* smaller away from the centre
 *    (`transform`), so choosing a stat never moves the snap points under the finger;
 *  - the stat under the centre is followed live while the track moves, rather than read once
 *    after a guess at when the gesture ended.
 * Tapping an item and the arrow keys stay. A mouse wheel has no horizontal axis and would be
 * pulled back by the mandatory snap tick by tick, so its vertical delta steps the selection
 * one stat at a time instead of nudging `scrollLeft`.
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
//
// The frame's 17 / 15 / 14 / 13px steps are painted as scales of one 17px box: a real font-size
// change would resize the item and shift every snap point the moment the selection changes.
const wheelInk = (distance: number) => {
  if (distance === 0) return { className: 'font-extrabold tracking-[-0.01em] text-textPrimary', style: {} };
  if (distance === 1) {
    return { className: 'font-semibold', style: { color: 'var(--lk-wheel-d1)', transform: 'scale(0.88)' } };
  }
  if (distance === 2) {
    return { className: 'font-semibold', style: { color: 'var(--lk-wheel-d2)', transform: 'scale(0.82, 0.74)' } };
  }
  return {
    className: 'font-semibold opacity-75',
    style: { color: 'var(--lk-wheel-d3)', transform: 'scale(0.76, 0.63)' },
  };
};

/** Wheel travel that counts as one stat, and the pause between two steps of one spin. */
const WHEEL_STEP_DELTA = 40;
const WHEEL_STEP_INTERVAL = 110;
/** A programmatic scroll that never reports arriving stops owning the track after this long. */
const TARGET_TIMEOUT = 700;

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
  const selectedRef = useRef(selectedKey);
  selectedRef.current = selectedKey;
  // While a scroll we started ourselves (tap, key, wheel step) is on its way, the stats it
  // passes are not choices: the track is only read back once it reports the target.
  const targetRef = useRef<StatKey | null>(null);
  const targetTimerRef = useRef(0);
  // A selection that came *from* the track is already centred by the snap; scrolling to it
  // again would fight the gesture that produced it.
  const fromScrollRef = useRef(false);
  const frameRef = useRef(0);
  const centredRef = useRef(false);

  const releaseTarget = () => {
    targetRef.current = null;
    window.clearTimeout(targetTimerRef.current);
  };

  const centreOn = (key: StatKey, behavior: ScrollBehavior) => {
    const box = boxRef.current;
    const item = itemRefs.current[key];
    if (!box || !item) return;
    const left = item.offsetLeft + item.offsetWidth / 2 - box.clientWidth / 2;
    if (Math.abs(box.scrollLeft - left) < 1) return;
    targetRef.current = key;
    window.clearTimeout(targetTimerRef.current);
    targetTimerRef.current = window.setTimeout(releaseTarget, TARGET_TIMEOUT);
    box.scrollTo({ left, behavior });
  };

  useLayoutEffect(() => {
    if (fromScrollRef.current) {
      fromScrollRef.current = false;
      return;
    }
    // The very first pass places the stored stat without animating past its neighbours.
    centreOn(selectedKey, centredRef.current ? 'smooth' : 'auto');
    centredRef.current = true;
  }, [selectedKey]);

  const step = (delta: number) => {
    const index = wheelStats.findIndex((entry) => entry.key === selectedRef.current);
    const next = wheelStats[Math.max(0, Math.min(wheelStats.length - 1, index + delta))];
    if (next) setSelectedKey(next.key);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // React's own wheel listener is passive, so taking over the vertical axis needs a native one
  // to be able to cancel the page scroll it would otherwise cause.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let travelled = 0;
    let lastStepAt = 0;
    let idleTimer = 0;
    const onWheel = (event: WheelEvent) => {
      // A trackpad's sideways swipe is a real horizontal scroll: the native snap handles it.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      travelled += event.deltaY;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        travelled = 0;
      }, 180);
      if (Math.abs(travelled) < WHEEL_STEP_DELTA) return;
      const now = performance.now();
      if (now - lastStepAt < WHEEL_STEP_INTERVAL) return;
      lastStepAt = now;
      stepRef.current(travelled > 0 ? 1 : -1);
      travelled = 0;
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.clearTimeout(idleTimer);
      box.removeEventListener('wheel', onWheel);
    };
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(targetTimerRef.current);
      window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

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
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      const nearest = keyNearestCentre();
      if (!nearest) return;
      if (targetRef.current) {
        if (nearest === targetRef.current) releaseTarget();
        return;
      }
      if (nearest === selectedRef.current) return;
      fromScrollRef.current = true;
      setSelectedKey(nearest);
    });
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
          className="lk-wheel-scroller absolute inset-0 flex items-center overflow-x-auto overflow-y-hidden"
          onKeyDown={handleKeyDown}
          onPointerDown={releaseTarget}
          onScroll={handleScroll}
          onTouchStart={releaseTarget}
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
                className={`lk-wheel-item inline-flex h-10 w-[60px] shrink-0 snap-center items-center justify-center gap-[3px] text-[17px] ${ink.className}`}
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
