import { ChevronDown, ChevronLeft, ChevronUp, Filter, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { abilities, moves } from '../data';
import { pokemonPhysicalMetricsByDexNo } from '../data/seed/regMA/physicalMetrics';
import { attackingTypes, defensiveMatchupMultiplier, statRows } from '../lib/calculations';
import { currentRuleMovesForPokemon, currentRuleSelectableItems } from '../lib/currentRuleCatalog';
import { createId } from '../lib/id';
import { evaluateMemberLegality } from '../lib/legality';
import { getDexFormEntries, type DexFormEntry } from '../lib/pokemonForms';
import { useAppStore } from '../state/AppContext';
import type { Move, PokemonType } from '../types';
import { Button, Card, EmptyState, PokemonAvatar, TypeBadge } from '../components/ui';

type DexTab = 'pokemon' | 'moves' | 'items' | 'abilities';
type TypeFilter = { label: string; value: PokemonType };
type MoveSortKey = 'type' | 'power';
type SortDirection = 'asc' | 'desc';
type PortraitSize = 'list' | 'detail';

const typeFilters: TypeFilter[] = [
  { label: '一般', value: 'Normal' },
  { label: '火', value: 'Fire' },
  { label: '水', value: 'Water' },
  { label: '电', value: 'Electric' },
  { label: '草', value: 'Grass' },
  { label: '冰', value: 'Ice' },
  { label: '格斗', value: 'Fighting' },
  { label: '毒', value: 'Poison' },
  { label: '地面', value: 'Ground' },
  { label: '飞行', value: 'Flying' },
  { label: '超能力', value: 'Psychic' },
  { label: '虫', value: 'Bug' },
  { label: '岩石', value: 'Rock' },
  { label: '幽灵', value: 'Ghost' },
  { label: '龙', value: 'Dragon' },
  { label: '恶', value: 'Dark' },
  { label: '钢', value: 'Steel' },
  { label: '妖精', value: 'Fairy' },
];

const typeLabelByValue = Object.fromEntries(typeFilters.map((filter) => [filter.value, filter.label])) as Record<PokemonType, string>;
const categoryLabels = { Physical: '物理', Special: '特殊', Status: '变化' };
const categoryOrder = { Physical: 0, Special: 1, Status: 2 };
const typeOrder = Object.fromEntries(typeFilters.map((filter, index) => [filter.value, index])) as Record<PokemonType, number>;

const statLabels = {
  HP: 'HP',
  '攻': '攻击',
  '防': '防御',
  '特攻': '特攻',
  '特防': '特防',
  '速': '速度',
} as const;

const ABILITY_OWNER_PREVIEW_LIMIT = 5;

function moveSearchRank(move: Move, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const fields = [move.chineseName, move.englishName, move.id, typeLabelByValue[move.type], move.type, categoryLabels[move.category], move.effectSummary].map((value) => value.toLowerCase());
  if (fields.some((value) => value === normalized)) return 3;
  if (fields.some((value) => value.startsWith(normalized))) return 2;
  if (fields.some((value) => value.includes(normalized))) return 1;
  return -1;
}

function filterMovesForDisplay(moveList: Move[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return moveList;
  return moveList
    .map((move, index) => ({ move, index, rank: moveSearchRank(move, normalized) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ move }) => move);
}

function compareMovePower(a: Move, b: Move, direction: SortDirection) {
  const aIsStatus = a.category === 'Status';
  const bIsStatus = b.category === 'Status';
  if (aIsStatus !== bIsStatus) return aIsStatus ? 1 : -1;
  if (!aIsStatus && !bIsStatus) {
    const powerDiff = (a.power ?? 0) - (b.power ?? 0);
    if (powerDiff !== 0) return direction === 'asc' ? powerDiff : -powerDiff;
  }
  return a.englishName.localeCompare(b.englishName, 'en-US');
}

function sortMovesForDisplay(moveList: Move[], sortKey: MoveSortKey, direction: SortDirection = 'asc') {
  return [...moveList].sort((a, b) => {
    const directionMultiplier = direction === 'asc' ? 1 : -1;
    if (sortKey === 'type') {
      return (
        (typeOrder[a.type] - typeOrder[b.type]) * directionMultiplier
        || categoryOrder[a.category] - categoryOrder[b.category]
        || a.englishName.localeCompare(b.englishName, 'en-US')
      );
    }
    return compareMovePower(a, b, direction) || typeOrder[a.type] - typeOrder[b.type] || a.englishName.localeCompare(b.englishName, 'en-US');
  });
}

function formatNationalDexNo(value: number) {
  return `#${String(value).padStart(4, '0')}`;
}

function formatMultiplier(multiplier: number) {
  return multiplier === 0.25 ? '1/4' : multiplier === 0.5 ? '1/2' : `${multiplier}`;
}

function formatHeight(heightDm?: number) {
  return Number.isFinite(heightDm) ? `${((heightDm ?? 0) / 10).toFixed(1)} m` : undefined;
}

function formatWeight(weightHg?: number) {
  return Number.isFinite(weightHg) ? `${((weightHg ?? 0) / 10).toFixed(1)} kg` : undefined;
}

function PokemonPortrait({ iconRef, label, size }: { iconRef?: string; label: string; size: PortraitSize }) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const dimensions = size === 'detail' ? 'h-20 w-20' : 'h-14 w-14';
  const isImage = Boolean(
    iconRef?.startsWith('http://') ||
      iconRef?.startsWith('https://') ||
      iconRef?.startsWith('/') ||
      iconRef?.startsWith('./') ||
      iconRef?.startsWith('../') ||
      iconRef?.startsWith('data:image/'),
  );
  const imageFailed = Boolean(iconRef && failedSrc === iconRef);

  return (
    <div className={`grid aspect-square shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-elevated ${dimensions}`}>
      {isImage && !imageFailed ? (
        <img
          src={iconRef}
          alt={label}
          className="block h-full w-full object-contain p-1"
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(iconRef)}
        />
      ) : (
        <span className="text-lg font-bold text-accent">{label.charAt(0)}</span>
      )}
    </div>
  );
}

function PokemonListCard({ entry, onOpen }: { entry: DexFormEntry; onOpen: () => void }) {
  return (
    <button className="w-full text-left" type="button" onClick={onOpen}>
      <Card className="grid grid-cols-[56px_1fr_auto] items-center gap-3 p-3 transition active:scale-[0.99]">
        <PokemonPortrait iconRef={entry.iconRef} label={entry.chineseName} size="list" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-textMuted">{formatNationalDexNo(entry.basePokemon.nationalDexNo)}</p>
          <h3 className="truncate text-base font-semibold leading-5 text-textPrimary">{entry.chineseName}</h3>
          <p className="mt-0.5 truncate text-[11px] text-textSecondary">{entry.japaneseName} / {entry.englishName}</p>
        </div>
        <div className="flex max-w-[94px] flex-wrap justify-end gap-1">
          {entry.types.map((type) => (
            <TypeBadge key={type} type={type} size="sm" />
          ))}
        </div>
      </Card>
    </button>
  );
}

function StatBars({ entry }: { entry: DexFormEntry }) {
  const total = Object.values(entry.baseStats).reduce((a, b) => a + b, 0);
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-textPrimary">种族值</h4>
        <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-textPrimary">总和 {total}</span>
      </div>
      <div className="space-y-1.5">
        {statRows(entry.baseStats).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[42px_34px_1fr] items-center gap-2 text-[11px]">
            <span className="text-textSecondary">{statLabels[label]}</span>
            <span className="font-semibold text-textPrimary">{value}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-border">
              <span className="block h-full rounded-full bg-accent/75" style={{ width: `${Math.min(100, (value / 180) * 100)}%` }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MatchupTile({ type, multiplier }: { type: PokemonType; multiplier: number }) {
  const tone =
    multiplier > 1
      ? 'border-danger/35 bg-missingBg text-danger'
      : multiplier === 0
        ? 'border-accent/35 bg-accent/10 text-textPrimary'
        : 'border-success/30 bg-success/10 text-textPrimary';
  return (
    <div className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-1 ${tone}`}>
      <span className={multiplier > 1 ? '' : 'opacity-80'}>
        <TypeBadge type={type} size="sm" />
      </span>
      <span className="text-[12px] font-black leading-none">×{formatMultiplier(multiplier)}</span>
    </div>
  );
}

function TypeMatchups({ entry }: { entry: DexFormEntry }) {
  const rows = attackingTypes
    .map((type) => ({ type, multiplier: defensiveMatchupMultiplier(type, entry.types) }))
    .filter(({ multiplier }) => multiplier !== 1)
    .sort((a, b) => b.multiplier - a.multiplier || typeOrder[a.type] - typeOrder[b.type]);
  const weaknesses = rows.filter(({ multiplier }) => multiplier > 1);
  const resistances = rows.filter(({ multiplier }) => multiplier > 0 && multiplier < 1).sort((a, b) => a.multiplier - b.multiplier || typeOrder[a.type] - typeOrder[b.type]);
  const immunities = rows.filter(({ multiplier }) => multiplier === 0);

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-textPrimary">属性关系</h4>
        <span className="text-[11px] text-textMuted">受到攻击时</span>
      </div>
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-bold text-danger">弱点</p>
          <div className="grid grid-cols-4 gap-1.5">
            {weaknesses.length > 0 ? weaknesses.map((row) => <MatchupTile key={`weak-${row.type}`} {...row} />) : <span className="col-span-4 text-xs text-textMuted">无明显弱点</span>}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-textPrimary">抵抗 / 免疫</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[...resistances, ...immunities].length > 0
              ? [...resistances, ...immunities].map((row) => <MatchupTile key={`resist-${row.type}`} {...row} />)
              : <span className="col-span-4 text-xs text-textMuted">无抵抗或免疫</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function TypeFilterSheet({
  selectedTypes,
  showMegaOnly,
  onToggle,
  onToggleMega,
  onClear,
  onClose,
}: {
  selectedTypes: PokemonType[];
  showMegaOnly: boolean;
  onToggle: (type: PokemonType) => void;
  onToggleMega: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">属性筛选</h3>
          <p className="text-xs text-textSecondary">最多选择 2 个属性，双选时只显示同时具备两种属性的 Pokémon</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭属性筛选" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {typeFilters.map((filter) => {
          const active = selectedTypes.includes(filter.value);
          const disabled = !active && selectedTypes.length >= 2;
          return (
            <button
              key={filter.value}
              aria-label={`${filter.label}属性`}
              aria-pressed={active}
              className={`flex min-h-10 items-center justify-center rounded-lg border p-2 text-xs active:scale-[0.99] ${
                active ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-secondary text-textSecondary'
              } disabled:cursor-not-allowed disabled:opacity-45`}
              disabled={disabled}
              type="button"
              onClick={() => onToggle(filter.value)}
            >
              <TypeBadge type={filter.value} size="sm" />
            </button>
          );
        })}
      </div>
      <button
        className={`mt-3 flex min-h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-xs font-semibold ${
          showMegaOnly ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-secondary text-textSecondary'
        }`}
        type="button"
        aria-pressed={showMegaOnly}
        onClick={onToggleMega}
      >
        <span>仅显示 Mega 形态</span>
        <span>{showMegaOnly ? '已开启' : '未开启'}</span>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClear} disabled={selectedTypes.length === 0 && !showMegaOnly}>
          清空
        </Button>
        <Button onClick={onClose}>完成</Button>
      </div>
    </div>
  );
}

function MoveTypeFilterSheet({
  selectedType,
  onSelect,
  onClear,
  onClose,
}: {
  selectedType: PokemonType | null;
  onSelect: (type: PokemonType) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">招式属性筛选</h3>
          <p className="text-xs text-textSecondary">最多选择 1 个属性，只筛选当前宝可梦可学会招式</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭招式属性筛选" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {typeFilters.map((filter) => {
          const active = selectedType === filter.value;
          return (
            <button
              key={filter.value}
              aria-label={`${filter.label}属性招式`}
              aria-pressed={active}
              className={`flex min-h-10 items-center justify-center rounded-lg border p-2 text-xs active:scale-[0.99] ${
                active ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-secondary text-textSecondary'
              }`}
              type="button"
              onClick={() => onSelect(filter.value)}
            >
              <TypeBadge type={filter.value} size="sm" />
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClear} disabled={!selectedType}>
          清空
        </Button>
        <Button onClick={onClose}>完成</Button>
      </div>
    </div>
  );
}

function PokemonDetail({
  entry,
  onBack,
  onOpenSpeed,
  onOpenCalculator,
}: {
  entry: DexFormEntry;
  onBack: () => void;
  onOpenSpeed: (pokemonId: string) => void;
  onOpenCalculator: (pokemonId: string) => void;
}) {
  const { teams, updateMember } = useAppStore();
  const [expandedAbilityIds, setExpandedAbilityIds] = useState<string[]>([]);
  const [showLargeImage, setShowLargeImage] = useState(false);
  const [moveSortKey, setMoveSortKey] = useState<MoveSortKey>('power');
  const [moveSortDirection, setMoveSortDirection] = useState<SortDirection>('asc');
  const [moveQuery, setMoveQuery] = useState('');
  const [selectedMoveType, setSelectedMoveType] = useState<PokemonType | null>(null);
  const [showMoveTypeFilter, setShowMoveTypeFilter] = useState(false);
  const activeTeam = teams[0];
  const entryAbilities = entry.abilities
    .map((id) => abilities.find((ability) => ability.id === id))
    .filter(Boolean) as typeof abilities;
  const entryMoves = useMemo(() => currentRuleMovesForPokemon(entry.basePokemon.id), [entry.basePokemon.id]);
  const visibleEntryMoves = useMemo(
    () => {
      const filteredByType = selectedMoveType ? entryMoves.filter((move) => move.type === selectedMoveType) : entryMoves;
      return sortMovesForDisplay(filterMovesForDisplay(filteredByType, moveQuery), moveSortKey, moveSortDirection);
    },
    [entryMoves, moveQuery, moveSortDirection, moveSortKey, selectedMoveType],
  );
  const physicalMetrics = pokemonPhysicalMetricsByDexNo[entry.basePokemon.nationalDexNo];
  const heightLabel = formatHeight(physicalMetrics?.heightDm);
  const weightLabel = formatWeight(physicalMetrics?.weightHg);
  const moveTypeFilterLabel = selectedMoveType ? typeLabelByValue[selectedMoveType] : '全部';

  const addToTeam = async () => {
    if (!activeTeam || activeTeam.members.length >= 6) return;
    const member = {
      id: createId('member'),
      pokemonId: entry.basePokemon.id,
      formId: entry.id,
      abilityId: entry.abilities[0],
      itemId: entry.requiredItemId,
      moveIds: currentRuleMovesForPokemon(entry.basePokemon.id).slice(0, 2).map((move) => move.id),
      nature: '爽朗',
      statPoints: { speed: 32 },
      level: 50,
      notes: '从图鉴加入。',
      legalityStatus: 'needs-review' as const,
    };
    const result = evaluateMemberLegality(member, activeTeam);
    await updateMember(activeTeam.id, { ...member, legalityStatus: result.status });
  };
  const toggleAbility = (abilityId: string) => {
    setExpandedAbilityIds((current) => (current.includes(abilityId) ? current.filter((id) => id !== abilityId) : [...current, abilityId]));
  };

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack}>
        <ChevronLeft size={14} />
        返回图鉴列表
      </Button>
      <Card className="space-y-3 p-3">
        <div className="flex gap-3">
          <button
            className="shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            type="button"
            aria-label={`查看${entry.chineseName}大图`}
            onClick={() => setShowLargeImage(true)}
          >
            <PokemonPortrait iconRef={entry.iconRef} label={entry.chineseName} size="detail" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wide text-textMuted">{formatNationalDexNo(entry.basePokemon.nationalDexNo)}</p>
            <h3 className="truncate text-lg font-semibold leading-6 text-textPrimary">{entry.chineseName}</h3>
            <p className="mt-0.5 truncate text-[11px] text-textSecondary">{entry.japaneseName} / {entry.englishName}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {entry.types.map((type) => (
                <TypeBadge key={type} type={type} />
              ))}
            </div>
            {(heightLabel || weightLabel) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {heightLabel && (
                  <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5">
                    <span className="text-[9px] text-textMuted">身高</span>
                    <span className="text-[10px] font-semibold text-textPrimary">{heightLabel}</span>
                  </span>
                )}
                {weightLabel && (
                  <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5">
                    <span className="text-[9px] text-textMuted">体重</span>
                    <span className="text-[10px] font-semibold text-textPrimary">{weightLabel}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-textPrimary">特性</h4>
          </div>
          <div className="grid gap-2">
            {entryAbilities.map((ability) => {
              const expanded = expandedAbilityIds.includes(ability.id);
              return (
                <button
                  key={ability.id}
                  className="w-full rounded-lg border border-border bg-secondary p-2 text-left"
                  type="button"
                  aria-expanded={expanded}
                  aria-label={expanded ? `收起${ability.chineseName}说明` : `展开${ability.chineseName}说明`}
                  onClick={() => toggleAbility(ability.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="text-xs font-semibold text-textPrimary">{ability.chineseName}</span>
                      <span className="ml-2 text-[11px] text-textMuted">{ability.englishName}</span>
                    </span>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-textSecondary">
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                  {expanded && <p className="mt-1 border-t border-divider pt-1.5 text-xs leading-relaxed text-textSecondary">{ability.effectSummary}</p>}
                </button>
              );
            })}
          </div>
        </div>

        <StatBars entry={entry} />
        <TypeMatchups entry={entry} />

        <section className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-textPrimary">可学会招式</h4>
            <span className="text-[11px] text-textMuted">{visibleEntryMoves.length}/{entryMoves.length}</span>
          </div>
          <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
            <label className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary px-2 py-1.5">
              <Search size={14} className="shrink-0 text-textMuted" />
              <input
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-textMuted"
                placeholder="搜索当前宝可梦招式"
                value={moveQuery}
                onChange={(event) => setMoveQuery(event.target.value)}
              />
            </label>
            <button
              className={`relative inline-flex h-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition active:scale-[0.98] ${
                selectedMoveType ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-secondary text-textSecondary'
              }`}
              type="button"
              aria-label="打开招式属性筛选"
              title={`招式属性：${moveTypeFilterLabel}`}
              onClick={() => setShowMoveTypeFilter(true)}
            >
              <Filter size={14} />
              {selectedMoveType && <span className="ml-1">1</span>}
            </button>
          </div>
          {selectedMoveType && (
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">招式属性：{moveTypeFilterLabel}</span>
              <button className="text-[11px] font-semibold text-textSecondary" type="button" onClick={() => setSelectedMoveType(null)}>
                清除
              </button>
            </div>
          )}
          <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-1 rounded-lg border border-border bg-secondary p-1">
            {([
              ['type', '属性'],
              ['power', '威力'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`min-h-8 rounded-md text-xs font-semibold ${moveSortKey === key ? 'bg-card text-accent' : 'text-textSecondary'}`}
                type="button"
                aria-pressed={moveSortKey === key}
                onClick={() => setMoveSortKey(key)}
              >
                {label}
              </button>
            ))}
            <button
              className="min-h-8 rounded-md px-2 text-xs font-semibold text-textSecondary"
              type="button"
              onClick={() => setMoveSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))}
            >
              {moveSortDirection === 'asc' ? '升序' : '降序'}
            </button>
          </div>
          <p className="mb-2 text-[11px] text-textMuted">默认按伤害招式威力由低到高排列，变化招式置后，同类同威力按英文名排序。</p>
          <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {visibleEntryMoves.map((move) => (
              <div key={move.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-lg border border-border bg-secondary p-2">
                <TypeBadge type={move.type} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-textPrimary">{move.chineseName} <span className="font-normal text-textMuted">{move.englishName}</span></p>
                  <p className="text-[11px] text-textMuted">{categoryLabels[move.category]} · {move.targetScope}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-textSecondary">{move.effectSummary}</p>
                </div>
                <p className="shrink-0 text-right text-[11px] text-textSecondary">
                  威力 {move.power ?? '-'}<br />
                  命中 {move.accuracy ?? '-'}<br />
                  PP {move.pp}
                </p>
              </div>
            ))}
            {visibleEntryMoves.length === 0 && <p className="rounded-lg bg-secondary p-2 text-xs text-textSecondary">暂无匹配招式。</p>}
          </div>
          {showMoveTypeFilter && (
            <MoveTypeFilterSheet
              selectedType={selectedMoveType}
              onSelect={(type) => setSelectedMoveType((current) => (current === type ? null : type))}
              onClear={() => setSelectedMoveType(null)}
              onClose={() => setShowMoveTypeFilter(false)}
            />
          )}
        </section>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="ghost" onClick={addToTeam}>
            <Plus size={13} />
            加入队伍
          </Button>
          <Button variant="ghost" onClick={() => onOpenSpeed(entry.basePokemon.id)}>
            → 速度线
          </Button>
          <Button variant="ghost" onClick={() => onOpenCalculator(entry.basePokemon.id)}>
            → 计算
          </Button>
        </div>
      </Card>
      {showLargeImage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay/70 p-6" role="dialog" aria-modal="true" aria-label={`${entry.chineseName}大图`}>
          <button className="absolute inset-0 cursor-default" type="button" aria-label="关闭" onClick={() => setShowLargeImage(false)} />
          <div className="relative z-10 w-full max-w-[360px]">
            <button className="absolute right-0 top-0 z-20 grid h-9 w-9 place-items-center rounded-lg bg-card text-textSecondary" type="button" title="关闭" onClick={() => setShowLargeImage(false)}>
              <X size={18} />
            </button>
            <img className="mx-auto max-h-[70vh] w-full object-contain drop-shadow-2xl" src={entry.artworkRef ?? entry.iconRef} alt={entry.chineseName} />
            <p className="mt-3 text-center text-sm font-semibold text-onOverlay">{entry.chineseName}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function DexPage({
  onOpenSpeed,
  onOpenCalculator,
}: {
  onOpenSpeed: (pokemonId: string) => void;
  onOpenCalculator: (pokemonId: string) => void;
}) {
  const [tab, setTab] = useState<DexTab>('pokemon');
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<PokemonType[]>([]);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showMegaOnly, setShowMegaOnly] = useState(false);
  const [selectedCatalogMoveType, setSelectedCatalogMoveType] = useState<PokemonType | null>(null);
  const [showCatalogMoveTypeFilter, setShowCatalogMoveTypeFilter] = useState(false);
  const [expandedMoveId, setExpandedMoveId] = useState<string | null>(null);
  const [detailPokemonId, setDetailPokemonId] = useState<string | null>(null);
  const [expandedAbilityListIds, setExpandedAbilityListIds] = useState<string[]>([]);
  const dexEntries = useMemo(
    () =>
      getDexFormEntries().sort(
        (a, b) => a.basePokemon.nationalDexNo - b.basePokemon.nationalDexNo || Number(a.isMega) - Number(b.isMega) || a.id.localeCompare(b.id),
      ),
    [],
  );

  const filteredPokemon = useMemo(
    () =>
      dexEntries.filter((entry) => {
        const matchesQuery = `${entry.chineseName} ${entry.englishName} ${entry.japaneseName}`.toLowerCase().includes(query.toLowerCase());
        const matchesType = selectedTypes.length === 0 || selectedTypes.every((type) => entry.types.includes(type));
        const matchesMega = !showMegaOnly || entry.isMega;
        return matchesQuery && matchesType && matchesMega;
      }),
    [dexEntries, query, selectedTypes, showMegaOnly],
  );
  const detailPokemon = detailPokemonId ? dexEntries.find((entry) => entry.id === detailPokemonId) ?? null : null;
  const activeFilterCount = selectedTypes.length + (showMegaOnly ? 1 : 0);
  const typeFilterLabel = selectedTypes.length === 0 ? '属性：全部' : `属性：${selectedTypes.map((type) => typeLabelByValue[type]).join(' + ')}`;
  const catalogMoveTypeLabel = selectedCatalogMoveType ? typeLabelByValue[selectedCatalogMoveType] : '全部';
  const matchesSearch = (...values: Array<string | number | undefined>) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return values.some((value) => String(value ?? '').toLowerCase().includes(normalized));
  };
  const filteredMoves = useMemo(
    () =>
      moves.filter(
        (move) =>
          (!selectedCatalogMoveType || move.type === selectedCatalogMoveType)
          && matchesSearch(move.chineseName, move.englishName, move.id, typeLabelByValue[move.type], move.type, categoryLabels[move.category], move.category),
      ),
    [query, selectedCatalogMoveType],
  );
  const sortedFilteredMoves = useMemo(() => sortMovesForDisplay(filteredMoves, 'type'), [filteredMoves]);
  const selectableItems = useMemo(() => currentRuleSelectableItems(), []);
  const filteredItems = useMemo(
    () => selectableItems.filter((item) => matchesSearch(item.chineseName, item.englishName, item.effectSummary)),
    [query, selectableItems],
  );
  const filteredAbilities = useMemo(
    () => abilities.filter((ability) => matchesSearch(ability.chineseName, ability.englishName)),
    [query],
  );
  const sortedFilteredAbilities = useMemo(
    () => [...filteredAbilities].sort((a, b) => a.englishName.localeCompare(b.englishName, 'en-US')),
    [filteredAbilities],
  );

  const toggleTypeFilter = (type: PokemonType) => {
    setSelectedTypes((current) => {
      if (current.includes(type)) return current.filter((item) => item !== type);
      if (current.length >= 2) return current;
      return [...current, type];
    });
  };
  const toggleAbilityListItem = (abilityId: string) => {
    setExpandedAbilityListIds((current) => (current.includes(abilityId) ? current.filter((id) => id !== abilityId) : [...current, abilityId]));
  };
  const openAbilityOwner = (entry: DexFormEntry) => {
    setTab('pokemon');
    setQuery('');
    setSelectedTypes([]);
    setShowTypeFilter(false);
    setDetailPokemonId(entry.id);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">规则内图鉴</h2>
        <p className="text-xs text-textSecondary">Pokémon / 招式 / 道具 / 特性 · 当前规则数据</p>
      </div>

      <div className="flex gap-4 border-b border-divider text-sm">
        {[
          ['pokemon', 'Pokémon'],
          ['moves', '招式'],
          ['items', '道具'],
          ['abilities', '特性'],
        ].map(([id, label]) => (
          <button key={id} className={`pb-2 ${tab === id ? 'border-b-2 border-accent text-accent' : 'text-textMuted'}`} onClick={() => setTab(id as DexTab)}>
            {label}
          </button>
        ))}
      </div>

      <div className={`${tab === 'pokemon' || tab === 'moves' ? 'grid grid-cols-[minmax(0,1fr)_auto]' : 'grid grid-cols-1'} gap-2`}>
        <label className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search size={16} className="shrink-0 text-textMuted" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-textMuted"
            aria-label="搜索 Pokémon / 招式 / 道具 / 特性"
            placeholder="搜索名称"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {tab === 'pokemon' && (
          <button
            className={`relative inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition active:scale-[0.98] ${
              activeFilterCount > 0 ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-card text-textSecondary'
            }`}
            type="button"
            aria-label="打开图鉴过滤"
            onClick={() => setShowTypeFilter(true)}
          >
            <Filter size={16} />
            {activeFilterCount > 0 && <span className="ml-1 text-xs">{activeFilterCount}</span>}
          </button>
        )}
        {tab === 'moves' && (
          <button
            className={`relative inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition active:scale-[0.98] ${
              selectedCatalogMoveType ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-card text-textSecondary'
            }`}
            type="button"
            aria-label="打开招式属性筛选"
            title={`招式属性：${catalogMoveTypeLabel}`}
            onClick={() => setShowCatalogMoveTypeFilter(true)}
          >
            <Filter size={16} />
            {selectedCatalogMoveType && <span className="ml-1 text-xs">1</span>}
          </button>
        )}
      </div>

      {tab === 'pokemon' && (
        <>
          {(selectedTypes.length > 0 || showMegaOnly) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-semibold text-textSecondary">{typeFilterLabel}</span>
              {showMegaOnly && <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">仅 Mega</span>}
              <Button variant="ghost" onClick={() => { setSelectedTypes([]); setShowMegaOnly(false); setDetailPokemonId(null); }}>
                清空
              </Button>
            </div>
          )}
          {filteredPokemon.length === 0 ? (
            <EmptyState title="没有找到相关内容" action={<Button onClick={() => { setQuery(''); setSelectedTypes([]); setShowMegaOnly(false); setDetailPokemonId(null); }}>清除筛选</Button>} />
          ) : detailPokemon ? (
            <PokemonDetail
              entry={detailPokemon}
              onBack={() => setDetailPokemonId(null)}
              onOpenSpeed={onOpenSpeed}
              onOpenCalculator={onOpenCalculator}
            />
          ) : (
            <div className="space-y-2">
              {filteredPokemon.map((entry) => (
                <PokemonListCard key={entry.id} entry={entry} onOpen={() => setDetailPokemonId(entry.id)} />
              ))}
            </div>
          )}
          {showTypeFilter && (
            <TypeFilterSheet
              selectedTypes={selectedTypes}
              showMegaOnly={showMegaOnly}
              onToggle={toggleTypeFilter}
              onToggleMega={() => setShowMegaOnly((value) => !value)}
              onClear={() => { setSelectedTypes([]); setShowMegaOnly(false); }}
              onClose={() => setShowTypeFilter(false)}
            />
          )}
        </>
      )}

      {tab === 'moves' && (
        <>
          {selectedCatalogMoveType && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">招式属性：{catalogMoveTypeLabel}</span>
              <Button variant="ghost" onClick={() => setSelectedCatalogMoveType(null)}>
                清空
              </Button>
            </div>
          )}
          {sortedFilteredMoves.length === 0 ? (
            <EmptyState title="没有找到相关招式" action={<Button onClick={() => { setQuery(''); setSelectedCatalogMoveType(null); }}>清除搜索</Button>} />
          ) : (
          <div className="space-y-2">
            {sortedFilteredMoves.map((move) => {
              const isExpanded = expandedMoveId === move.id;
              return (
              <Card key={move.id} className="flex items-start gap-3">
                <TypeBadge type={move.type} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{move.chineseName} {move.englishName}</h3>
                  <p className="text-xs text-textSecondary">{categoryLabels[move.category]} · 威力 {move.power ?? '-'} · 命中 {move.accuracy ?? '-'} · PP {move.pp}</p>
                  {isExpanded && <p className="mt-1 text-xs leading-relaxed text-textSecondary">{move.effectSummary}</p>}
                </div>
                <button className="grid h-6 w-6 shrink-0 place-items-center rounded text-textMuted" onClick={() => setExpandedMoveId(isExpanded ? null : move.id)} aria-label={isExpanded ? '收起说明' : '展开说明'}>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </Card>
            );
            })}
          </div>
          )}
          {showCatalogMoveTypeFilter && (
            <MoveTypeFilterSheet
              selectedType={selectedCatalogMoveType}
              onSelect={(type) => setSelectedCatalogMoveType((current) => (current === type ? null : type))}
              onClear={() => setSelectedCatalogMoveType(null)}
              onClose={() => setShowCatalogMoveTypeFilter(false)}
            />
          )}
        </>
      )}

      {tab === 'items' && (
        filteredItems.length === 0 ? (
          <EmptyState title="没有找到相关道具" action={<Button onClick={() => setQuery('')}>清除搜索</Button>} />
        ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <Card key={item.id} className="flex items-center gap-3">
              <PokemonAvatar iconRef={item.iconRef} label={item.chineseName} size="sm" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{item.chineseName}</h3>
                <p className="truncate text-xs text-textSecondary">{item.effectSummary}</p>
              </div>
            </Card>
          ))}
        </div>
        )
      )}

      {tab === 'abilities' && (
        sortedFilteredAbilities.length === 0 ? (
          <EmptyState title="没有找到相关特性" action={<Button onClick={() => setQuery('')}>清除搜索</Button>} />
        ) : (
        <div className="space-y-2">
          {sortedFilteredAbilities.map((ability) => {
            const expanded = expandedAbilityListIds.includes(ability.id);
            const abilityEntries = dexEntries.filter((entry) => entry.abilities.includes(ability.id));
            const previewEntries = abilityEntries.slice(0, ABILITY_OWNER_PREVIEW_LIMIT);
            const hiddenEntryCount = Math.max(0, abilityEntries.length - previewEntries.length);
            return (
              <Card key={ability.id} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 text-sm font-semibold">{ability.chineseName} {ability.englishName}</h3>
                    <div className="-space-x-2 flex shrink-0 justify-end">
                      {previewEntries.map((entry) => (
                        <PokemonAvatar key={entry.id} iconRef={entry.iconRef} label={entry.chineseName} size="xs" />
                      ))}
                      {hiddenEntryCount > 0 && (
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-elevated text-[10px] font-semibold text-textSecondary">
                          +{hiddenEntryCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-2 border-t border-divider pt-2">
                      <p className="text-xs text-textSecondary">{ability.effectSummary}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {abilityEntries.map((entry) => (
                          <button key={entry.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-secondary p-1.5 text-left" type="button" onClick={() => openAbilityOwner(entry)}>
                            <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} size="xs" />
                            <span className="truncate text-[11px] font-semibold text-textPrimary">{entry.chineseName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-textMuted"
                  type="button"
                  aria-label={expanded ? `收起${ability.chineseName}说明` : `展开${ability.chineseName}说明`}
                  aria-expanded={expanded}
                  onClick={() => toggleAbilityListItem(ability.id)}
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </Card>
            );
          })}
        </div>
        )
      )}
    </div>
  );
}
