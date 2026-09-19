import { ArrowLeftRight, ChevronUp, X } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Sprite, TypeDot } from '../components/kit';
import { typeLabels } from '../components/ui';
import { currentRuleSet, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { attackingTypes, defensiveMatchupMultiplier } from '../lib/calculations';
import { recordToolResult } from '../lib/toolActivity';
import { defenseBuckets, defensiveProfile, offensiveProfile, representativeSpecies } from '../lib/typeChart';
import type { Pokemon, PokemonType } from '../types';

const MATRIX_CELL_SIZE = 44;
const MATRIX_ROW_HEADER_WIDTH = 62;

type TypeChartTab = 'single' | 'dual' | 'matrix';
type Selection = { attacker: PokemonType; defender: PokemonType };
type Slot = 'primary' | 'secondary';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const multiplierLabel = (value: number) => {
  if (value === 0.25) return '×¼';
  if (value === 0.5) return '×½';
  return `×${value}`;
};

const outcome = (value: number) => {
  if (value === 2) return '效果绝佳';
  if (value === 0.5) return '效果不佳';
  if (value === 0) return '没有效果';
  return '效果一般';
};

const multiplierTone = (value: number) => {
  if (value > 1) return 'super';
  if (value === 0) return 'immune';
  if (value < 1) return 'resisted';
  return 'neutral';
};

/** 06-01 的属性轨胶囊：32px、8px 圆点、选中是紫环。 */
function RailPill({ type, selected, onSelect }: { type: PokemonType; selected: boolean; onSelect: (type: PokemonType) => void }) {
  return (
    <button
      aria-pressed={selected}
      className={`inline-flex h-8 shrink-0 items-center gap-[7px] rounded-full px-3 text-[13px] ${
        selected ? 'lk-pill-on font-bold text-textPrimary' : 'bg-surface font-semibold text-textLabel'
      }`}
      type="button"
      onClick={() => onSelect(type)}
    >
      <TypeDot size={8} type={type} />
      {typeLabels[type]}
    </button>
  );
}

/** 结果区的属性 chip：32px、7px 圆点。 */
function TypeChip({ type }: { type: PokemonType }) {
  return (
    <span className="lk-type-chip inline-flex h-8 items-center gap-1.5 rounded-full px-[11px] text-xs font-bold text-textLabel">
      <TypeDot size={7} type={type} />
      {typeLabels[type]}
    </span>
  );
}

function Shelf({ tone, name, multiplier, types }: { tone: 'good' | 'bad'; name: string; multiplier: string; types: PokemonType[] }) {
  if (types.length === 0) return null;
  return (
    <div>
      <p className={`flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] ${tone === 'good' ? 'text-success' : 'text-danger'}`}>
        <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
        {name}
        <span className="font-extrabold tracking-[0.08em] tabular-nums">{multiplier}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-[7px]">
        {types.map((type) => <TypeChip key={type} type={type} />)}
      </div>
    </div>
  );
}

/** 全宽属性轨：左右溢出 24px 页边距，右侧 48px 渐隐提示还能滑。 */
function TypeRail({ selected, label, className = '', onSelect }: { selected: PokemonType | null; label: string; className?: string; onSelect: (type: PokemonType) => void }) {
  return (
    <div className={`relative ${className}`}>
      <div aria-label={label} className="hide-scrollbar flex gap-2 overflow-x-auto px-6" role="group">
        {attackingTypes.map((type) => (
          <RailPill key={type} selected={type === selected} type={type} onSelect={onSelect} />
        ))}
      </div>
      <div aria-hidden="true" className="lk-type-rail-fade" />
    </div>
  );
}

function SingleTypeView({ type, onSelect }: { type: PokemonType; onSelect: (type: PokemonType) => void }) {
  const offense = offensiveProfile(type);
  const defense = defensiveProfile(type);
  const label = typeLabels[type];

  return (
    <>
      <TypeRail className="mt-3.5" label="选择属性" selected={type} onSelect={onSelect} />

      <section className="px-6 pt-6">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{label} · 进攻时</h2>
        <div className="mt-3.5 space-y-4">
          <Shelf multiplier="×2" name="效果绝佳" tone="good" types={offense.superEffective} />
          <Shelf multiplier="×½" name="效果不佳" tone="bad" types={offense.notVery} />
          <Shelf multiplier="×0" name="没有效果" tone="bad" types={offense.noEffect} />
        </div>
      </section>

      <section className="px-6 pt-[26px]">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{label} · 防守时</h2>
        <div className="mt-3.5 space-y-4">
          <Shelf multiplier="×2" name="被克" tone="bad" types={defense.weakTo} />
          <Shelf multiplier="×½" name="抵抗" tone="good" types={defense.resistedBy} />
          <Shelf multiplier="×0" name="免疫" tone="good" types={defense.immuneTo} />
        </div>
      </section>
    </>
  );
}

function TypeSlot({
  slot,
  type,
  editing,
  onEdit,
  onClear,
}: {
  slot: Slot;
  type: PokemonType | null;
  editing: boolean;
  onEdit: () => void;
  onClear?: () => void;
}) {
  const name = slot === 'primary' ? '主属性' : '副属性';
  return (
    <div className={`relative flex min-w-0 flex-1 rounded-2xl bg-surface ${editing ? 'lk-type-slot--editing' : 'lk-type-slot'}`}>
      <button
        aria-label={`选择${name}`}
        aria-pressed={editing}
        className="flex min-w-0 flex-1 flex-col gap-[7px] p-3.5 text-left"
        type="button"
        onClick={onEdit}
      >
        <span className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${editing ? 'text-textPrimary' : 'text-textSecondary'}`}>
          {name}
        </span>
        <span className="flex items-center gap-[9px]">
          {type ? <TypeDot size={12} type={type} /> : <span aria-hidden="true" className="lk-type-slot-empty h-3 w-3 shrink-0 rounded-full" />}
          <span
            className={`min-w-0 flex-1 text-[20px] font-extrabold tracking-[-0.01em] ${type ? '' : 'text-textSecondary'} ${
              type && onClear ? 'pr-[31px]' : ''
            }`}
          >
            {type ? typeLabels[type] : '—'}
          </span>
        </span>
      </button>
      {type && onClear && (
        <button
          aria-label={`清空${name}`}
          className="lk-type-slot-clear absolute bottom-3.5 right-3.5 grid h-[22px] w-[22px] place-items-center rounded-full text-textLabel"
          type="button"
          onClick={onClear}
        >
          <X aria-hidden="true" size={12} />
        </button>
      )}
    </div>
  );
}

function DualTypeView({
  primary,
  secondary,
  editing,
  representative,
  onEdit,
  onCollapse,
  onPick,
  onClearSecondary,
}: {
  primary: PokemonType;
  secondary: PokemonType | null;
  editing: Slot | null;
  representative: Pokemon | null;
  onEdit: (slot: Slot) => void;
  onCollapse: () => void;
  onPick: (type: PokemonType) => void;
  onClearSecondary: () => void;
}) {
  const types = secondary ? [primary, secondary] : [primary];
  const buckets = defenseBuckets(types);

  return (
    <>
      <div className="mt-3.5 flex gap-2.5 px-6">
        <TypeSlot editing={editing === 'primary'} slot="primary" type={primary} onEdit={() => onEdit('primary')} />
        <TypeSlot
          editing={editing === 'secondary'}
          slot="secondary"
          type={secondary}
          onClear={onClearSecondary}
          onEdit={() => onEdit('secondary')}
        />
      </div>

      {representative ? (
        <div className="mt-3 flex items-center gap-2.5 px-6">
          <Sprite iconRef={representative.iconRef} label={representative.chineseName} size={36} />
          <p className="flex min-w-0 items-baseline gap-[7px]">
            <span className="text-sm font-bold tracking-[-0.01em] text-textLabel">{representative.chineseName}</span>
            <span className="text-xs font-semibold text-textMuted">{representative.japaneseName}</span>
          </p>
        </div>
      ) : (
        <p className="mt-3 px-6 text-[13px] font-semibold leading-5 text-textSecondary">当前规则内没有这个属性组合的宝可梦</p>
      )}

      {editing && (
        <div className="lk-type-rail-panel mt-[18px] py-4">
          <div className="flex items-baseline justify-between gap-3 px-6">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textPrimary">
              正在选{editing === 'primary' ? '主属性' : '副属性'}
            </p>
            <button className="inline-flex items-center gap-1.5 text-[13px] font-bold text-textLabel" type="button" onClick={onCollapse}>
              收起
              <ChevronUp aria-hidden="true" size={14} />
            </button>
          </div>
          <div aria-label="选择属性" className="mt-3 flex flex-wrap gap-[7px] px-6" role="group">
            {attackingTypes.map((type) => (
              <RailPill
                key={type}
                selected={type === (editing === 'primary' ? primary : secondary)}
                type={type}
                onSelect={onPick}
              />
            ))}
          </div>
        </div>
      )}

      <div className={editing ? 'px-6' : 'mt-5 border-t border-[var(--hairline)] px-6'}>
        <div className="mt-5 space-y-4">
          {buckets.map((bucket) => (
            <Shelf
              key={bucket.multiplier}
              multiplier={multiplierLabel(bucket.multiplier)}
              name={bucket.multiplier > 1 ? '弱点' : bucket.multiplier === 0 ? '免疫' : '抵抗'}
              tone={bucket.multiplier > 1 ? 'bad' : 'good'}
              types={bucket.types}
            />
          ))}
        </div>
      </div>
    </>
  );
}

const scrollViewport = (viewport: HTMLDivElement, left: number, top: number, behavior: ScrollBehavior) => {
  if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior });
  else {
    viewport.scrollLeft = Math.max(0, left);
    viewport.scrollTop = Math.max(0, top);
  }
};

function MatrixResult({ selection, onSwap }: { selection: Selection; onSwap: () => void }) {
  const multiplier = defensiveMatchupMultiplier(selection.attacker, [selection.defender]);
  const tone = multiplierTone(multiplier);
  const ink = tone === 'super' ? 'text-success' : tone === 'neutral' ? 'text-textSecondary' : 'text-danger';

  return (
    <section aria-atomic="true" aria-live="polite" className="mx-6 mt-4 flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3">
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="lk-type-chip inline-flex h-8 items-center gap-[7px] rounded-full px-3 text-sm font-bold text-textPrimary">
          <TypeDot size={8} type={selection.attacker} />
          {typeLabels[selection.attacker]}
        </span>
        <span className="text-xs font-semibold text-textSecondary">打</span>
        <span className="lk-type-chip inline-flex h-8 items-center gap-[7px] rounded-full px-3 text-sm font-bold text-textPrimary">
          <TypeDot size={8} type={selection.defender} />
          {typeLabels[selection.defender]}
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2.5">
        <p className="flex flex-col items-end gap-0.5">
          <span className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${ink}`}>{outcome(multiplier)}</span>
          <span className={`text-[28px] font-extrabold leading-none tracking-[-0.01em] tabular-nums ${ink}`}>{multiplierLabel(multiplier)}</span>
        </p>
        <button
          aria-label="交换攻击方与防御方"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-btn1 text-textPrimary"
          type="button"
          onClick={onSwap}
        >
          <ArrowLeftRight aria-hidden="true" size={18} />
        </button>
      </div>
    </section>
  );
}

function MatrixLegend() {
  return (
    <div className="flex gap-3.5 px-6 pt-[18px]">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
        <span aria-hidden="true" className="lk-type-legend-swatch lk-type-legend-swatch--super" />
        效果绝佳 ×2
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger">
        <span aria-hidden="true" className="lk-type-legend-swatch lk-type-legend-swatch--resisted" />
        效果不佳 ×½
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-textSecondary">
        <span aria-hidden="true" className="lk-type-legend-swatch" />
        ×1
      </span>
    </div>
  );
}

function TypeMatrix() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const scrollModeRef = useRef<'if-needed' | 'center-smooth'>('if-needed');

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
    if (!selection) return;
    revealSelection(selection, scrollModeRef.current);
    scrollModeRef.current = 'if-needed';
  }, [revealSelection, selection]);

  const selectCell = (next: Selection) => {
    if (suppressClickRef.current) return;
    scrollModeRef.current = 'if-needed';
    setSelection(next);
    recordToolResult({ tool: 'typeChart', type: next.attacker });
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
    if (!selection) return;
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
    <>
      {selection ? <MatrixResult selection={selection} onSwap={swap} /> : null}

      <div className="ml-6 mt-3.5 overflow-hidden rounded-[4px]">
        <div
          ref={viewportRef}
          aria-label="属性克制矩阵，可横向及纵向拖动"
          className="lk-type-matrix__viewport hide-scrollbar"
          onPointerCancel={finishPointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
        >
          <div
            className="lk-type-matrix__grid"
            style={{
              gridTemplateColumns: `${MATRIX_ROW_HEADER_WIDTH}px repeat(${attackingTypes.length}, ${MATRIX_CELL_SIZE}px)`,
              gridTemplateRows: `${MATRIX_CELL_SIZE}px repeat(${attackingTypes.length}, ${MATRIX_CELL_SIZE}px)`,
            }}
          >
            <div className="lk-type-matrix__corner" />
            {attackingTypes.map((type, column) => (
              <div
                key={`column-${type}`}
                className={`lk-type-matrix__column-header ${selection?.defender === type ? 'is-selected-axis' : ''}`}
                style={{ gridColumn: column + 2, gridRow: 1 }}
              >
                <TypeDot type={type} />
                <span>{typeLabels[type]}</span>
              </div>
            ))}
            {attackingTypes.map((type, row) => (
              <div
                key={`row-${type}`}
                className={`lk-type-matrix__row-header ${selection?.attacker === type ? 'is-selected-axis' : ''}`}
                style={{ gridColumn: 1, gridRow: row + 2 }}
              >
                <TypeDot type={type} />
                <span>{typeLabels[type]}</span>
              </div>
            ))}
            {cells.map(({ attacker, defender, row, column, multiplier }) => {
              const selected = attacker === selection?.attacker && defender === selection?.defender;
              const inCross = selection !== null && (attacker === selection.attacker || defender === selection.defender);
              const tabbable = selection ? selected : row === 0 && column === 0;
              return (
                <button
                  ref={(node) => {
                    const key = `${attacker}:${defender}`;
                    if (node) cellRefs.current.set(key, node);
                    else cellRefs.current.delete(key);
                  }}
                  key={`${attacker}-${defender}`}
                  aria-label={`${typeLabels[attacker]}攻击${typeLabels[defender]}，${outcome(multiplier)}，${multiplierLabel(multiplier)}`}
                  aria-pressed={selected}
                  className={`lk-type-matrix__cell is-${multiplierTone(multiplier)} ${inCross ? 'is-cross' : ''} ${
                    selection && !inCross ? 'is-dimmed' : ''
                  } ${selected ? 'is-selected-cell' : ''}`}
                  style={{ gridColumn: column + 2, gridRow: row + 2 }}
                  tabIndex={tabbable ? 0 : -1}
                  type="button"
                  onClick={() => selectCell({ attacker, defender })}
                  onKeyDown={(event) => handleCellKeyDown(event, row, column)}
                >
                  {multiplier === 1 ? '·' : multiplierLabel(multiplier)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selection ? null : <MatrixLegend />}
    </>
  );
}

const tabs: Array<{ id: TypeChartTab; label: string }> = [
  { id: 'single', label: '单属性' },
  { id: 'dual', label: '双属性' },
  { id: 'matrix', label: '完整矩阵' },
];

export function TypeChartPage({ environment }: { environment: EnvironmentState | null }) {
  const [tab, setTab] = useState<TypeChartTab>('single');
  const [primary, setPrimary] = useState<PokemonType>('Dragon');
  const [secondary, setSecondary] = useState<PokemonType | null>(null);
  // The secondary slot starts empty, so the rail opens on it (06-04); clearing it reopens the rail.
  const [editing, setEditing] = useState<Slot | null>('secondary');

  // Ranking order of the current rule's battle type: the representative species is whoever in the
  // combination stands highest in it. An environment that has not loaded yet leaves every species
  // unranked, which falls back to the lowest dex number.
  const rankByPokemonId = useMemo(() => {
    const usage = environment?.pokemonUsage[currentRuleSet.battleType] ?? [];
    return new Map(usage.map((entry, index) => [entry.pokemonId, index]));
  }, [environment]);

  const representative = useMemo(() => {
    const types = secondary ? [primary, secondary] : [primary];
    const legal = pokemon.filter((entry) => entry.legalInCurrentRule);
    return representativeSpecies(legal, types, (entry) => rankByPokemonId.get(entry.id) ?? null);
  }, [primary, rankByPokemonId, secondary]);

  // Picking a type is one deliberate tap, so 04-01's card takes it as it happens. Arrow-key
  // walks across the matrix are not picks and stay unrecorded.
  const pickSingleType = (type: PokemonType) => {
    setPrimary(type);
    recordToolResult({ tool: 'typeChart', type });
  };

  const pickForSlot = (type: PokemonType) => {
    const slot = editing ?? 'primary';
    // A species never carries the same type twice, so picking the other slot's type swaps the pair
    // rather than producing a doubled multiplier.
    if (slot === 'primary') {
      if (secondary === type) setSecondary(primary);
      setPrimary(type);
      recordToolResult({ tool: 'typeChart', type });
    } else {
      if (primary === type) setPrimary(secondary ?? primary);
      setSecondary(type);
      recordToolResult({ tool: 'typeChart', type: primary === type ? (secondary ?? primary) : primary });
    }
    setEditing(null);
  };

  return (
    <div className="pb-8">
      <h1 className="px-6 pt-5 text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">属性速查</h1>

      <div aria-label="属性速查显示模式" className="mx-6 mt-3.5 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="group">
        {tabs.map((option) => (
          <button
            key={option.id}
            aria-pressed={tab === option.id}
            className={`grid h-[34px] place-items-center rounded-[9px] text-sm ${
              tab === option.id ? 'lk-type-segment-on font-bold text-textPrimary' : 'font-semibold text-textSecondary'
            }`}
            type="button"
            onClick={() => setTab(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'single' && <SingleTypeView type={primary} onSelect={pickSingleType} />}
      {tab === 'dual' && (
        <DualTypeView
          editing={editing}
          primary={primary}
          representative={representative}
          secondary={secondary}
          onClearSecondary={() => {
            setSecondary(null);
            setEditing('secondary');
          }}
          onCollapse={() => setEditing(null)}
          onEdit={setEditing}
          onPick={pickForSlot}
        />
      )}
      {tab === 'matrix' && <TypeMatrix />}
    </div>
  );
}
