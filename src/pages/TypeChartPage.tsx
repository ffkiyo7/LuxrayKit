import { ArrowLeftRight } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TypeBadge, typeColors, typeLabels } from '../components/ui';
import { pokemon } from '../data';
import { attackingTypes, defensiveMatchupMultiplier } from '../lib/calculations';
import { defensiveProfile, offensiveProfile } from '../lib/typeChart';
import type { PokemonType } from '../types';

const DIAL_STEP = 9;
const DIAL_PILL_RADIUS = 380;
const DIAL_TICK_RADIUS = 348;
const DIAL_APEX_Y = 36;
const DIAL_PX_PER_DEGREE = 4.9;
const MATRIX_CELL_SIZE = 44;
const MATRIX_ROW_HEADER_WIDTH = 62;

type TypeChartMode = 'quick' | 'matrix';
type Selection = { attacker: PokemonType; defender: PokemonType };
type CustomProperties = CSSProperties & Record<`--${string}`, string | number>;

type MascotPlacement = {
  dex: number;
  x: string;
  y: string;
  scale: number;
  rotate: number;
  mirror: 1 | -1;
};

const mascotPlacements: Record<PokemonType, MascotPlacement> = {
  Normal: { dex: 143, x: '50%', y: '62%', scale: 1.15, rotate: 0, mirror: 1 },
  Fire: { dex: 6, x: '76%', y: '42%', scale: 1.1, rotate: -6, mirror: 1 },
  Water: { dex: 130, x: '20%', y: '48%', scale: 1.2, rotate: 5, mirror: -1 },
  Electric: { dex: 405, x: '74%', y: '52%', scale: 1.18, rotate: 0, mirror: -1 },
  Grass: { dex: 3, x: '24%', y: '60%', scale: 1.1, rotate: 0, mirror: 1 },
  Ice: { dex: 471, x: '76%', y: '58%', scale: 0.95, rotate: 0, mirror: -1 },
  Fighting: { dex: 448, x: '26%', y: '48%', scale: 1, rotate: -4, mirror: 1 },
  Poison: { dex: 748, x: '75%', y: '64%', scale: 1.05, rotate: 8, mirror: 1 },
  Ground: { dex: 445, x: '77%', y: '46%', scale: 1.12, rotate: 0, mirror: -1 },
  Flying: { dex: 823, x: '74%', y: '36%', scale: 1.15, rotate: -8, mirror: 1 },
  Psychic: { dex: 282, x: '25%', y: '46%', scale: 1.05, rotate: 0, mirror: 1 },
  Bug: { dex: 637, x: '50%', y: '40%', scale: 1.35, rotate: 0, mirror: 1 },
  Rock: { dex: 248, x: '24%', y: '46%', scale: 1.1, rotate: 0, mirror: -1 },
  Ghost: { dex: 94, x: '30%', y: '52%', scale: 1.05, rotate: -6, mirror: 1 },
  Dragon: { dex: 149, x: '76%', y: '48%', scale: 1.1, rotate: 0, mirror: 1 },
  Dark: { dex: 197, x: '75%', y: '62%', scale: 1, rotate: 0, mirror: -1 },
  Steel: { dex: 376, x: '25%', y: '56%', scale: 1.15, rotate: 4, mirror: 1 },
  Fairy: { dex: 700, x: '76%', y: '50%', scale: 1.05, rotate: -4, mirror: 1 },
};

const artworkByDex = new Map(pokemon.map((entry) => [entry.nationalDexNo, entry.artworkRef ?? entry.iconRef]));

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const placeOnArc = (theta: number, radius: number, scale = 1) => {
  const radians = (theta * Math.PI) / 180;
  const centerY = DIAL_APEX_Y + DIAL_PILL_RADIUS;
  const x = radius * Math.sin(radians);
  const y = centerY - radius * Math.cos(radians);
  const opacity = Math.max(0, Math.min(1, (30 - Math.abs(theta)) / 8));
  return {
    x,
    y,
    opacity,
    visible: opacity > 0,
    transform: `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${theta.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
  };
};

const buzz = () => {
  try {
    navigator.vibrate?.(6);
  } catch {
    // iOS does not expose the Vibration API; the dial naturally degrades to visual feedback.
  }
};

function TypeDial({
  selectedIndex,
  onSelect,
  onSettled,
}: {
  selectedIndex: number;
  onSelect: (index: number, settled: boolean) => void;
  onSettled: () => void;
}) {
  const dialRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tickRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const rotationRef = useRef(-selectedIndex * DIAL_STEP);
  const selectedIndexRef = useRef(selectedIndex);
  const tweenRef = useRef(0);
  const lastWheelRef = useRef(0);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{ id: number; x: number; total: number } | null>(null);

  selectedIndexRef.current = selectedIndex;

  const layout = useCallback(() => {
    const rotation = rotationRef.current;
    pillRefs.current.forEach((element, index) => {
      if (!element) return;
      const theta = index * DIAL_STEP + rotation;
      const proximity = Math.max(0, 1 - Math.abs(theta) / DIAL_STEP);
      const placement = placeOnArc(theta, DIAL_PILL_RADIUS, 0.92 + 0.26 * proximity);
      element.style.transform = placement.transform;
      element.style.opacity = placement.opacity.toFixed(3);
      element.style.visibility = placement.visible ? 'visible' : 'hidden';
      element.style.pointerEvents = placement.visible ? 'auto' : 'none';
      element.setAttribute('aria-pressed', String(index === selectedIndexRef.current));
    });
    tickRefs.current.forEach((element, index) => {
      if (!element) return;
      const theta = (index * DIAL_STEP) / 4 + rotation;
      const placement = placeOnArc(theta, DIAL_TICK_RADIUS);
      element.style.transform = placement.transform;
      element.style.opacity = placement.opacity.toFixed(3);
      element.style.visibility = placement.visible ? 'visible' : 'hidden';
    });
  }, []);

  const snapTo = useCallback((targetIndex: number, done?: () => void) => {
    const target = -targetIndex * DIAL_STEP;
    const id = ++tweenRef.current;
    if (prefersReducedMotion()) {
      rotationRef.current = target;
      layout();
      done?.();
      return;
    }
    const from = rotationRef.current;
    const startedAt = performance.now();
    const frame = (now: number) => {
      if (id !== tweenRef.current) return;
      const progress = Math.min(1, (now - startedAt) / 220);
      const eased = 1 - (1 - progress) ** 3;
      rotationRef.current = from + (target - from) * eased;
      layout();
      if (progress < 1) window.requestAnimationFrame(frame);
      else done?.();
    };
    window.requestAnimationFrame(frame);
  }, [layout]);

  useLayoutEffect(() => {
    if (dragRef.current) return;
    snapTo(selectedIndex);
  }, [selectedIndex, snapTo]);

  useLayoutEffect(() => {
    layout();
  }, [layout]);

  const choose = (nextIndex: number, settled = true) => {
    const index = Math.max(0, Math.min(attackingTypes.length - 1, nextIndex));
    if (index !== selectedIndexRef.current) buzz();
    onSelect(index, settled);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    tweenRef.current += 1;
    dragRef.current = { id: event.pointerId, x: event.clientX, total: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    drag.x = event.clientX;
    drag.total += Math.abs(delta);
    rotationRef.current += delta / DIAL_PX_PER_DEGREE;
    const minimum = -(attackingTypes.length - 1) * DIAL_STEP;
    if (rotationRef.current > 0) rotationRef.current *= 0.35;
    if (rotationRef.current < minimum) rotationRef.current = minimum + (rotationRef.current - minimum) * 0.35;
    const nearest = Math.max(0, Math.min(attackingTypes.length - 1, Math.round(-rotationRef.current / DIAL_STEP)));
    if (nearest !== selectedIndexRef.current) choose(nearest, false);
    layout();
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    if (drag.total > 6) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      snapTo(selectedIndexRef.current, onSettled);
    } else {
      snapTo(selectedIndexRef.current);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const moves: Partial<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      Home: -selectedIndexRef.current,
      End: attackingTypes.length - 1 - selectedIndexRef.current,
    };
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    choose(selectedIndexRef.current + delta);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelRef.current < 140) return;
    lastWheelRef.current = now;
    choose(selectedIndexRef.current + Math.sign(event.deltaY || event.deltaX));
  };

  const ticks = Array.from({ length: (attackingTypes.length - 1) * 4 + 1 });
  const selectedType = attackingTypes[selectedIndex];

  return (
    <div
      ref={dialRef}
      className="lk-type-dial"
      style={{ '--lk-type-color': typeColors[selectedType] } as CustomProperties}
      role="slider"
      tabIndex={0}
      aria-label="选择属性"
      aria-valuemin={0}
      aria-valuemax={attackingTypes.length - 1}
      aria-valuenow={selectedIndex}
      aria-valuetext={`${typeLabels[selectedType]}属性`}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    >
      <div className="lk-type-dial__spot" aria-hidden="true" />
      <div className="lk-type-dial__track">
        {attackingTypes.map((type, index) => (
          <button
            ref={(node) => {
              pillRefs.current[index] = node;
            }}
            key={type}
            className="lk-type-dial__pill"
            style={{ '--lk-type-color': typeColors[type] } as CustomProperties}
            type="button"
            tabIndex={-1}
            aria-label={`${typeLabels[type]}属性`}
            aria-pressed={index === selectedIndex}
            onClick={() => {
              if (!suppressClickRef.current) choose(index);
            }}
          >
            {typeLabels[type]}
          </button>
        ))}
        {ticks.map((_, index) => (
          <span
            ref={(node) => {
              tickRefs.current[index] = node;
            }}
            // The dial scale is positional; the stable numeric index is its identity.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={`lk-type-dial__tick ${index % 4 === 0 ? '' : 'lk-type-dial__tick--minor'}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="lk-type-dial__needle" aria-hidden="true" />
    </div>
  );
}

function ClickableTypeBadge({ type, onSelect }: { type: PokemonType; onSelect: (type: PokemonType) => void }) {
  return (
    <button className="lk-type-badge-button" type="button" aria-label={`查看${typeLabels[type]}属性速查`} onClick={() => onSelect(type)}>
      <TypeBadge type={type} />
    </button>
  );
}

function TypeShelf({
  tone,
  multiplier,
  label,
  types,
  onSelect,
}: {
  tone: 'good' | 'bad' | 'null';
  multiplier: string;
  label: string;
  types: PokemonType[];
  onSelect: (type: PokemonType) => void;
}) {
  if (types.length === 0) return null;
  return (
    <div className={`lk-type-shelf lk-type-shelf--${tone}`}>
      <div className="lk-type-shelf__label">
        <span className="lk-type-shelf__multiplier">{multiplier}</span>
        <span className="lk-type-shelf__name">{label}</span>
      </div>
      <div className="lk-type-shelf__badges">
        {types.map((type) => <ClickableTypeBadge key={type} type={type} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function TypeAnswerCard({ type, animationVersion, onSelect }: { type: PokemonType; animationVersion: number; onSelect: (type: PokemonType) => void }) {
  const offense = offensiveProfile(type);
  const defense = defensiveProfile(type);
  const mascot = mascotPlacements[type];
  const artworkRef = artworkByDex.get(mascot.dex);
  const label = typeLabels[type];
  const style = {
    '--lk-type-color': typeColors[type],
    '--lk-mascot-x': mascot.x,
    '--lk-mascot-y': mascot.y,
    '--lk-mascot-scale': mascot.scale,
    '--lk-mascot-rotate': `${mascot.rotate}deg`,
    '--lk-mascot-mirror': mascot.mirror,
  } as CustomProperties;

  return (
    <section className="lk-type-answer" style={style} aria-live="polite" aria-atomic="true">
      <div className="lk-type-answer__aura" aria-hidden="true" />
      <div key={`${type}-${animationVersion}`} className={animationVersion > 0 ? 'lk-type-answer__content lk-type-answer__content--switching' : 'lk-type-answer__content'}>
        <div className="lk-type-answer__hero">
          {artworkRef && (
            <div
              className="lk-type-answer__mascot"
              style={{ WebkitMaskImage: `url(${artworkRef})`, maskImage: `url(${artworkRef})` }}
              aria-hidden="true"
            />
          )}
          <p className="lk-type-answer__glyph" data-length={label.length}>{label}</p>
          <p className="lk-type-answer__english">{type.toUpperCase()}</p>
        </div>
        <div className="lk-type-answer__panel">
          <div className="lk-type-answer__group-title"><h3>进攻</h3></div>
          <TypeShelf tone="good" multiplier="×2" label="效果绝佳" types={offense.superEffective} onSelect={onSelect} />
          <TypeShelf tone="bad" multiplier="×½" label="效果不佳" types={offense.notVery} onSelect={onSelect} />
          <TypeShelf tone="null" multiplier="×0" label="没有效果" types={offense.noEffect} onSelect={onSelect} />

          <div className="lk-type-answer__group-title"><h3>防守</h3></div>
          <TypeShelf tone="bad" multiplier="×2" label="弱点" types={defense.weakTo} onSelect={onSelect} />
          <TypeShelf tone="good" multiplier="×½" label="抵抗" types={defense.resistedBy} onSelect={onSelect} />
          <TypeShelf tone="null" multiplier="×0" label="免疫" types={defense.immuneTo} onSelect={onSelect} />
        </div>
      </div>
    </section>
  );
}

const compactMultiplier = (value: number) => {
  if (value === 2) return '2';
  if (value === 0.5) return '½';
  if (value === 0) return '0';
  return '•';
};

const fullMultiplier = (value: number) => (value === 0.5 ? '×½' : `×${value}`);

const outcome = (value: number) => {
  if (value === 2) return '效果绝佳';
  if (value === 0.5) return '效果不佳';
  if (value === 0) return '没有效果';
  return '效果一般';
};

const multiplierTone = (value: number) => {
  if (value === 2) return 'super';
  if (value === 0.5) return 'resisted';
  if (value === 0) return 'immune';
  return 'neutral';
};

function MatrixTypePill({ type }: { type: PokemonType }) {
  return <span className="lk-type-matrix__type-pill" style={{ '--lk-type-color': typeColors[type] } as CustomProperties}>{typeLabels[type]}</span>;
}

const scrollViewport = (viewport: HTMLDivElement, left: number, top: number, behavior: ScrollBehavior) => {
  if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior });
  else {
    viewport.scrollLeft = Math.max(0, left);
    viewport.scrollTop = Math.max(0, top);
  }
};

function TypeMatrix({ initialAttacker }: { initialAttacker: PokemonType }) {
  const [selection, setSelection] = useState<Selection>({ attacker: initialAttacker, defender: 'Grass' });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const scrollModeRef = useRef<'if-needed' | 'center-smooth'>('if-needed');
  const multiplier = defensiveMatchupMultiplier(selection.attacker, [selection.defender]);

  const revealSelection = useCallback((next: Selection, mode: 'if-needed' | 'center-smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const row = attackingTypes.indexOf(next.attacker);
    const column = attackingTypes.indexOf(next.defender);
    const cellLeft = MATRIX_ROW_HEADER_WIDTH + column * MATRIX_CELL_SIZE;
    const cellRight = cellLeft + MATRIX_CELL_SIZE;
    const cellTop = MATRIX_CELL_SIZE + row * MATRIX_CELL_SIZE;
    const cellBottom = cellTop + MATRIX_CELL_SIZE;
    const margin = MATRIX_CELL_SIZE / 2;
    const visibleLeft = viewport.scrollLeft + MATRIX_ROW_HEADER_WIDTH;
    const visibleRight = viewport.scrollLeft + viewport.clientWidth;
    const visibleTop = viewport.scrollTop + MATRIX_CELL_SIZE;
    const visibleBottom = viewport.scrollTop + viewport.clientHeight;
    const horizontalNeeded = cellLeft < visibleLeft + margin || cellRight > visibleRight - margin;
    const verticalNeeded = cellTop < visibleTop + margin || cellBottom > visibleBottom - margin;
    if (mode === 'if-needed' && !horizontalNeeded && !verticalNeeded) return;
    const centeredLeft = cellLeft + MATRIX_CELL_SIZE / 2 - viewport.clientWidth / 2;
    const centeredTop = cellTop + MATRIX_CELL_SIZE / 2 - viewport.clientHeight / 2;
    scrollViewport(
      viewport,
      mode === 'center-smooth' || horizontalNeeded ? centeredLeft : viewport.scrollLeft,
      mode === 'center-smooth' || verticalNeeded ? centeredTop : viewport.scrollTop,
      mode === 'center-smooth' && !prefersReducedMotion() ? 'smooth' : 'auto',
    );
  }, []);

  useLayoutEffect(() => {
    revealSelection(selection, scrollModeRef.current);
    scrollModeRef.current = 'if-needed';
  }, [revealSelection, selection]);

  const selectCell = (next: Selection) => {
    if (suppressClickRef.current) return;
    scrollModeRef.current = 'if-needed';
    setSelection(next);
  };

  const focusCell = (next: Selection) => {
    window.requestAnimationFrame(() => cellRefs.current.get(`${next.attacker}:${next.defender}`)?.focus({ preventScroll: true }));
  };

  const handleCellKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, row: number, column: number) => {
    const moves: Partial<Record<string, [number, number]>> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(attackingTypes.length - 1, row + move[0]));
    const nextColumn = Math.max(0, Math.min(attackingTypes.length - 1, column + move[1]));
    const next = { attacker: attackingTypes[nextRow], defender: attackingTypes[nextColumn] };
    scrollModeRef.current = 'if-needed';
    setSelection(next);
    focusCell(next);
  };

  const swap = () => {
    scrollModeRef.current = 'center-smooth';
    setSelection({ attacker: selection.defender, defender: selection.attacker });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const viewport = event.currentTarget;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false,
    };
    viewport.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 6) drag.moved = true;
    if (!drag.moved) return;
    event.currentTarget.scrollLeft = drag.scrollLeft - deltaX;
    event.currentTarget.scrollTop = drag.scrollTop - deltaY;
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
  };

  const cells = useMemo(() => attackingTypes.flatMap((attacker, row) => attackingTypes.map((defender, column) => ({
    attacker,
    defender,
    row,
    column,
    multiplier: defensiveMatchupMultiplier(attacker, [defender]),
  }))), []);

  return (
    <div className="space-y-2.5">
      <section className="lk-type-matrix__result" aria-live="polite" aria-atomic="true">
        <div className="lk-type-matrix__result-copy">
          <MatrixTypePill type={selection.attacker} />
          <span className="lk-type-matrix__role">攻击</span>
          <MatrixTypePill type={selection.defender} />
          <span className="lk-type-matrix__outcome">· {outcome(multiplier)} {fullMultiplier(multiplier)}</span>
        </div>
        <button className="lk-type-matrix__swap" type="button" aria-label="交换攻击方与防御方" onClick={swap}>
          <ArrowLeftRight aria-hidden="true" size={17} />
          <span>交换</span>
        </button>
      </section>

      <div className="lk-type-matrix__shell">
        <div
          ref={viewportRef}
          className="lk-type-matrix__viewport hide-scrollbar"
          aria-label="属性克制矩阵，可横向及纵向拖动"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
        >
          <div
            className="lk-type-matrix__grid"
            style={{
              gridTemplateColumns: `${MATRIX_ROW_HEADER_WIDTH}px repeat(${attackingTypes.length}, ${MATRIX_CELL_SIZE}px)`,
              gridTemplateRows: `${MATRIX_CELL_SIZE}px repeat(${attackingTypes.length}, ${MATRIX_CELL_SIZE}px)`,
            }}
          >
            <div className="lk-type-matrix__corner">攻 \ 防</div>
            {attackingTypes.map((type, column) => (
              <div
                key={`column-${type}`}
                className={`lk-type-matrix__column-header ${selection.defender === type ? 'is-selected-axis' : ''}`}
                style={{ gridColumn: column + 2, gridRow: 1, '--lk-type-color': typeColors[type] } as CustomProperties}
              >
                {typeLabels[type]}
              </div>
            ))}
            {attackingTypes.map((type, row) => (
              <div
                key={`row-${type}`}
                className={`lk-type-matrix__row-header ${selection.attacker === type ? 'is-selected-axis' : ''}`}
                style={{ gridColumn: 1, gridRow: row + 2, '--lk-type-color': typeColors[type] } as CustomProperties}
              >
                {typeLabels[type]}
              </div>
            ))}
            {cells.map(({ attacker, defender, row, column, multiplier: cellMultiplier }) => {
              const selected = attacker === selection.attacker && defender === selection.defender;
              const inRow = attacker === selection.attacker;
              const inColumn = defender === selection.defender;
              return (
                <button
                  ref={(node) => {
                    const key = `${attacker}:${defender}`;
                    if (node) cellRefs.current.set(key, node);
                    else cellRefs.current.delete(key);
                  }}
                  key={`${attacker}-${defender}`}
                  className={`lk-type-matrix__cell is-${multiplierTone(cellMultiplier)} ${inRow ? 'is-row' : ''} ${inColumn ? 'is-column' : ''} ${selected ? 'is-selected-cell' : ''}`}
                  style={{ gridColumn: column + 2, gridRow: row + 2 }}
                  type="button"
                  tabIndex={selected ? 0 : -1}
                  aria-label={`${typeLabels[attacker]}攻击${typeLabels[defender]}，${outcome(cellMultiplier)}，${fullMultiplier(cellMultiplier)}`}
                  aria-pressed={selected}
                  onClick={() => selectCell({ attacker, defender })}
                  onKeyDown={(event) => handleCellKeyDown(event, row, column)}
                >
                  {selected ? fullMultiplier(cellMultiplier) : compactMultiplier(cellMultiplier)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="lk-type-matrix__edge-fade lk-type-matrix__edge-fade--left" aria-hidden="true" />
        <div className="lk-type-matrix__edge-fade lk-type-matrix__edge-fade--right" aria-hidden="true" />
      </div>
    </div>
  );
}

export function TypeChartPage() {
  const fireIndex = attackingTypes.indexOf('Fire');
  const [mode, setMode] = useState<TypeChartMode>('quick');
  const [selectedIndex, setSelectedIndex] = useState(fireIndex);
  const [animationVersion, setAnimationVersion] = useState(0);
  const selectedType = attackingTypes[selectedIndex];

  const selectType = (type: PokemonType) => {
    const nextIndex = attackingTypes.indexOf(type);
    if (nextIndex === selectedIndex) return;
    setSelectedIndex(nextIndex);
    setAnimationVersion((version) => version + 1);
  };

  return (
    <section className="space-y-3" aria-labelledby="type-chart-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="type-chart-title" className="text-[22px] font-bold tracking-[-0.02em]">属性速查</h2>
        <div className="flex rounded-[10px] border border-border bg-page p-0.5" aria-label="属性速查显示模式">
          {([
            ['quick', '速查'],
            ['matrix', '完整矩阵'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={`rounded-[7px] px-3 py-1.5 text-xs font-semibold ${mode === value ? 'bg-accent text-page' : 'text-textSecondary'}`}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'quick' ? (
        <div>
          <TypeDial
            selectedIndex={selectedIndex}
            onSelect={(index, settled) => {
              setSelectedIndex(index);
              if (settled) setAnimationVersion((version) => version + 1);
            }}
            onSettled={() => setAnimationVersion((version) => version + 1)}
          />
          <TypeAnswerCard type={selectedType} animationVersion={animationVersion} onSelect={selectType} />
        </div>
      ) : (
        <TypeMatrix initialAttacker={selectedType} />
      )}
    </section>
  );
}
