import { ChevronDown, ChevronLeft, ChevronUp, Filter, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { abilities, moves } from '../data';
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
type SecondaryNameMode = 'english' | 'japanese';
type MoveSortKey = 'type' | 'category' | 'power';

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

function sortMovesForDisplay(moveList: Move[], sortKey: MoveSortKey) {
  return [...moveList].sort((a, b) => {
    if (sortKey === 'type') {
      return typeOrder[a.type] - typeOrder[b.type] || categoryOrder[a.category] - categoryOrder[b.category] || a.chineseName.localeCompare(b.chineseName, 'zh-Hans-CN');
    }
    if (sortKey === 'category') {
      return categoryOrder[a.category] - categoryOrder[b.category] || typeOrder[a.type] - typeOrder[b.type] || a.chineseName.localeCompare(b.chineseName, 'zh-Hans-CN');
    }
    return (b.power ?? -1) - (a.power ?? -1) || typeOrder[a.type] - typeOrder[b.type] || a.chineseName.localeCompare(b.chineseName, 'zh-Hans-CN');
  });
}

function TypeFilterSheet({
  selectedTypes,
  onToggle,
  onClear,
  onClose,
}: {
  selectedTypes: PokemonType[];
  onToggle: (type: PokemonType) => void;
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
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClear} disabled={selectedTypes.length === 0}>
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
  const [secondaryNameMode, setSecondaryNameMode] = useState<SecondaryNameMode>('english');
  const [expandedAbilityIds, setExpandedAbilityIds] = useState<string[]>([]);
  const [showLargeImage, setShowLargeImage] = useState(false);
  const [movesExpanded, setMovesExpanded] = useState(false);
  const [moveSortKey, setMoveSortKey] = useState<MoveSortKey>('type');
  const activeTeam = teams[0];
  const entryAbilities = entry.abilities
    .map((id) => abilities.find((ability) => ability.id === id))
    .filter(Boolean) as typeof abilities;
  const entryMoves = useMemo(() => currentRuleMovesForPokemon(entry.basePokemon.id), [entry.basePokemon.id]);
  const sortedEntryMoves = useMemo(() => sortMovesForDisplay(entryMoves, moveSortKey), [entryMoves, moveSortKey]);
  const weaknesses = attackingTypes
    .map((type) => ({ type, multiplier: defensiveMatchupMultiplier(type, entry.types) }))
    .filter((matchup) => matchup.multiplier > 1);
  const resistances = attackingTypes
    .map((type) => ({ type, multiplier: defensiveMatchupMultiplier(type, entry.types) }))
    .filter((matchup) => matchup.multiplier > 0 && matchup.multiplier < 1);
  const immunities = attackingTypes.filter((type) => defensiveMatchupMultiplier(type, entry.types) === 0);

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
  const secondaryName = secondaryNameMode === 'english' ? entry.englishName : entry.japaneseName;

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack}>
        <ChevronLeft size={14} />
        返回图鉴列表
      </Button>
      <Card>
        <div className="mb-3 flex gap-3">
          <button
            className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent"
            type="button"
            aria-label={`查看${entry.chineseName}大图`}
            onClick={() => setShowLargeImage(true)}
          >
            <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} size="lg" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">{entry.chineseName}</h3>
            <div className="mt-1 flex items-center gap-2">
              <p className="truncate text-xs text-textSecondary">{secondaryName}</p>
              <button
                className="rounded border border-border px-2 py-1 text-[11px] text-textSecondary"
                type="button"
                onClick={() => setSecondaryNameMode((mode) => (mode === 'english' ? 'japanese' : 'english'))}
              >
                {secondaryNameMode === 'english' ? '切日文' : '切英文'}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
            {entry.types.map((type) => (
              <TypeBadge key={type} type={type} />
            ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] text-textSecondary">特性</p>
          {entryAbilities.map((ability) => {
            const expanded = expandedAbilityIds.includes(ability.id);
            return (
              <button key={ability.id} className="w-full rounded-lg border border-border bg-secondary p-2 text-left" type="button" onClick={() => toggleAbility(ability.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{ability.chineseName}</span>
                  <span className="text-[11px] text-textMuted">{expanded ? '收起' : '展开'}</span>
                </div>
                {expanded && <p className="mt-1 text-xs text-textSecondary">{ability.effectSummary}</p>}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] text-textSecondary">种族值</p>
          <div className="space-y-1.5">
            {statRows(entry.baseStats).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[42px_34px_1fr] items-center gap-2 text-[11px]">
                <span className="text-textSecondary">{statLabels[label]}</span>
                <span className="font-semibold text-textPrimary">{value}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-border">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (value / 180) * 100)}%` }} />
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[42px_34px_1fr] items-center gap-2 border-t border-divider pt-1.5 text-[11px]">
              <span className="text-textSecondary">总和</span>
              <span className="font-semibold text-textPrimary">{Object.values(entry.baseStats).reduce((a, b) => a + b, 0)}</span>
              <span />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <button
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-left"
            type="button"
            aria-expanded={movesExpanded}
            onClick={() => setMovesExpanded((expanded) => !expanded)}
          >
            <span className="text-xs font-semibold">当前规则可学会招式</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-textSecondary">
              {entryMoves.length} 个
              {movesExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </button>
          {movesExpanded && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1">
                {([
                  ['type', '属性'],
                  ['category', '性质'],
                  ['power', '威力'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    className={`min-h-8 rounded-md text-xs ${moveSortKey === key ? 'bg-accent text-page' : 'text-textSecondary'}`}
                    type="button"
                    aria-pressed={moveSortKey === key}
                    onClick={() => setMoveSortKey(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {sortedEntryMoves.map((move) => (
                  <div key={move.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-lg border border-border bg-secondary p-2">
                    <TypeBadge type={move.type} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{move.chineseName}</p>
                      <p className="text-[11px] text-textMuted">{categoryLabels[move.category]} · {move.targetScope}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-textSecondary">{move.effectSummary}</p>
                    </div>
                    <p className="shrink-0 text-right text-[11px] text-textSecondary">
                      威力 {move.power ?? '-'}<br />
                      命中 {move.accuracy ?? '-'}<br />
                      PP {move.pp}
                    </p>
                  </div>
                ))}
                {entryMoves.length === 0 && <p className="rounded-lg bg-secondary p-2 text-xs text-textSecondary">暂无当前规则招式数据。</p>}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] text-textSecondary">属性相克</p>
          <div className="space-y-2">
            {[
              ['弱点', weaknesses],
              ['抗性', resistances],
              ['免疫', immunities.map((type) => ({ type, multiplier: 0 }))],
            ].map(([label, rows]) => (
              <div key={label as string} className="rounded-lg border border-border bg-secondary p-2">
                <p className="mb-1 text-[11px] text-textMuted">{label as string}</p>
                <div className="flex flex-wrap gap-1">
                  {(rows as Array<{ type: PokemonType; multiplier: number }>).length > 0 ? (
                    (rows as Array<{ type: PokemonType; multiplier: number }>).map(({ type, multiplier }) => (
                      <span key={`${label}-${type}`} className="inline-flex items-center gap-1">
                        <TypeBadge type={type} size="sm" />
                        {multiplier !== 0 && <span className="text-[10px] text-textMuted">×{multiplier}</span>}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-textMuted">无</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

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
  const typeFilterLabel = selectedTypes.length === 0 ? '属性：全部' : `属性：${selectedTypes.map((type) => typeLabelByValue[type]).join(' + ')}`;
  const matchesSearch = (...values: Array<string | number | undefined>) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return values.some((value) => String(value ?? '').toLowerCase().includes(normalized));
  };
  const filteredMoves = useMemo(
    () => moves.filter((move) => matchesSearch(move.chineseName, move.englishName, move.id, typeLabelByValue[move.type], move.type, categoryLabels[move.category], move.category)),
    [query],
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
        <p className="text-xs text-textSecondary">Pokémon / 招式 / 道具 / 特性 · 当前规则模拟数据</p>
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

      <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search size={16} className="text-textMuted" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-textMuted"
          placeholder="搜索名称"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {tab === 'pokemon' && (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setShowTypeFilter(true)}>
              <Filter size={13} />
              {typeFilterLabel}
            </Button>
            <Button variant="ghost" aria-pressed={showMegaOnly} onClick={() => setShowMegaOnly((v) => !v)}>
              仅 Mega
            </Button>
            {selectedTypes.length > 0 && (
              <Button variant="ghost" onClick={() => { setSelectedTypes([]); setDetailPokemonId(null); }}>
                清空
              </Button>
            )}
          </div>
          {filteredPokemon.length === 0 ? (
            <EmptyState title="没有找到相关内容" action={<Button onClick={() => { setQuery(''); setSelectedTypes([]); setDetailPokemonId(null); }}>清除筛选</Button>} />
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
                <button key={entry.id} className="w-full" onClick={() => setDetailPokemonId(entry.id)}>
                  <Card className="flex items-center gap-3 text-left">
                    <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{entry.chineseName}</h3>
                      <p className="text-xs text-textSecondary">#{entry.basePokemon.nationalDexNo}</p>
                    </div>
                    <div className="flex gap-1">
                      {entry.types.map((type) => (
                        <TypeBadge key={type} type={type} />
                      ))}
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          )}
          {showTypeFilter && (
            <TypeFilterSheet
              selectedTypes={selectedTypes}
              onToggle={toggleTypeFilter}
              onClear={() => setSelectedTypes([])}
              onClose={() => setShowTypeFilter(false)}
            />
          )}
        </>
      )}

      {tab === 'moves' && (
        sortedFilteredMoves.length === 0 ? (
          <EmptyState title="没有找到相关招式" action={<Button onClick={() => setQuery('')}>清除搜索</Button>} />
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
        )
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
