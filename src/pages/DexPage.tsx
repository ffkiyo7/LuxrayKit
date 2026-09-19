import { SlidersHorizontal } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { abilities, moves } from '../data';
import { currentRegulation } from '../data/schedule';
import { currentRuleSelectableItems } from '../lib/currentRuleCatalog';
import { getDexFormEntries, type DexFormEntry } from '../lib/pokemonForms';
import { recordDexEntry } from '../lib/toolActivity';
import { useHashRoute } from '../hooks/useHashRoute';
import type { ItemCategory, PokemonType } from '../types';
import { PageHeader, SearchField, SectionLabel, TypeDot } from '../components/kit';
import {
  CountChip,
  DexEmptyState,
  DexTabs,
  DisclosureChip,
  EmptyStateAction,
  FilterPanel,
  PanelFooter,
  RemovableChip,
  ToggleChip,
} from './dex/DexControls';
import { AbilityRow, ItemRow, MoveRow, PokemonRow } from './dex/DexLists';
import { PokemonDetail } from './dex/PokemonDetail';
import {
  categoryLabels,
  filterMovesByQuery,
  itemCategoryLabelByValue,
  itemCategoryOptions,
  matchesQuery,
  moveCategories,
  sortMoves,
  typeLabelByValue,
  typeOptions,
  type DexTab,
  type MoveCategory,
} from './dex/dexShared';

const MAX_POKEMON_TYPE_FILTERS = 2;

const ownerSearchText = (entry: DexFormEntry) => `${entry.chineseName} ${entry.englishName} ${entry.japaneseName}`;

export function DexPage({
  onOpenCalculator,
  initialTab = 'pokemon',
}: {
  onOpenCalculator: (pokemonId: string) => void;
  initialTab?: DexTab;
}) {
  const [tab, setTab] = useState<DexTab>(initialTab);
  const [query, setQuery] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<PokemonType[]>([]);
  const [showMegaOnly, setShowMegaOnly] = useState(false);
  const [selectedMoveType, setSelectedMoveType] = useState<PokemonType | null>(null);
  const [selectedMoveCategory, setSelectedMoveCategory] = useState<MoveCategory | null>(null);
  const [selectedItemCategories, setSelectedItemCategories] = useState<ItemCategory[]>([]);
  const [expandedMoveId, setExpandedMoveId] = useState<string | null>(null);
  const [expandedAbilityId, setExpandedAbilityId] = useState<string | null>(null);

  // The open Pokémon comes from #/tools/dex/:pokemonId so a dex entry is linkable and the
  // hardware back button closes the detail. Tab, search and filters stay local — they are
  // a working set, not a destination.
  const { route, navigate, back } = useHashRoute();
  const detailPokemonId = route.name === 'dex-pokemon' ? route.pokemonId : null;

  // The list and the detail share one window scroll. Without this a row tapped far down the
  // list opens its detail at that same offset; and coming back should land on the row, not the
  // top. useLayoutEffect so neither correction is ever painted.
  const listScrollRef = useRef(0);
  const previousDetailRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
    const previous = previousDetailRef.current;
    previousDetailRef.current = detailPokemonId;
    if (detailPokemonId) {
      window.scrollTo({ top: 0, left: 0 });
    } else if (previous) {
      window.scrollTo({ top: listScrollRef.current, left: 0 });
    }
  }, [detailPokemonId]);

  const openDetail = (entry: DexFormEntry) => {
    // Read here, not in the effect: by then the detail is in the DOM and a shorter page has
    // already clamped the offset.
    if (!detailPokemonId && typeof window !== 'undefined') listScrollRef.current = window.scrollY;
    recordDexEntry({ kind: 'pokemon', id: entry.id, label: entry.chineseName, iconRef: entry.iconRef });
    navigate({ name: 'dex-pokemon', pokemonId: entry.id });
  };

  const dexEntries = useMemo(
    () =>
      getDexFormEntries().sort(
        (a, b) => a.basePokemon.nationalDexNo - b.basePokemon.nationalDexNo || Number(a.isMega) - Number(b.isMega) || a.id.localeCompare(b.id),
      ),
    [],
  );
  const selectableItems = useMemo(currentRuleSelectableItems, []);
  const ownersByAbility = useMemo(() => {
    const index = new Map<string, Array<{ entry: DexFormEntry; searchText: string }>>();
    dexEntries.forEach((entry) => {
      const searchText = ownerSearchText(entry);
      entry.abilities.forEach((abilityId) => {
        const current = index.get(abilityId) ?? [];
        current.push({ entry, searchText });
        index.set(abilityId, current);
      });
    });
    return index;
  }, [dexEntries]);

  // ── Pokémon ──
  const pokemonByQuery = useMemo(
    () => dexEntries.filter((entry) => matchesQuery(query, entry.chineseName, entry.englishName, entry.japaneseName)),
    [dexEntries, query],
  );
  const filteredPokemon = useMemo(
    () =>
      pokemonByQuery.filter(
        (entry) => selectedTypes.every((type) => entry.types.includes(type)) && (!showMegaOnly || entry.isMega),
      ),
    [pokemonByQuery, selectedTypes, showMegaOnly],
  );
  const pokemonTypeCounts = useMemo(
    () =>
      Object.fromEntries(
        typeOptions.map((type) => [type, pokemonByQuery.filter((entry) => entry.types.includes(type)).length]),
      ) as Record<PokemonType, number>,
    [pokemonByQuery],
  );

  // ── Moves ──
  const movesByQuery = useMemo(() => filterMovesByQuery(moves, query), [query]);
  const movesByType = useMemo(
    () => (selectedMoveType ? movesByQuery.filter((move) => move.type === selectedMoveType) : movesByQuery),
    [movesByQuery, selectedMoveType],
  );
  const filteredMoves = useMemo(
    () => sortMoves(selectedMoveCategory ? movesByType.filter((move) => move.category === selectedMoveCategory) : movesByType, 'type'),
    [movesByType, selectedMoveCategory],
  );
  const moveTypeCounts = useMemo(
    () =>
      Object.fromEntries(typeOptions.map((type) => [type, movesByQuery.filter((move) => move.type === type).length])) as Record<
        PokemonType,
        number
      >,
    [movesByQuery],
  );
  const moveCategoryCounts = useMemo(
    () =>
      Object.fromEntries(moveCategories.map((category) => [category, movesByType.filter((move) => move.category === category).length])) as Record<
        MoveCategory,
        number
      >,
    [movesByType],
  );

  // ── Items ──
  const itemsByQuery = useMemo(
    () => selectableItems.filter((item) => matchesQuery(query, item.chineseName, item.englishName, item.effectSummary)),
    [query, selectableItems],
  );
  const filteredItems = useMemo(
    () => itemsByQuery.filter((item) => selectedItemCategories.length === 0 || selectedItemCategories.includes(item.category)),
    [itemsByQuery, selectedItemCategories],
  );
  const itemCategoryCounts = useMemo(
    () =>
      Object.fromEntries(
        itemCategoryOptions.map((option) => [option.value, itemsByQuery.filter((item) => item.category === option.value).length]),
      ) as Record<ItemCategory, number>,
    [itemsByQuery],
  );

  // ── Abilities ──
  const filteredAbilities = useMemo(
    () =>
      abilities
        .filter((ability) =>
          matchesQuery(
            query,
            ability.chineseName,
            ability.englishName,
            (ownersByAbility.get(ability.id) ?? []).map((owner) => owner.searchText).join(' '),
          ),
        )
        .sort((a, b) => a.englishName.localeCompare(b.englishName, 'en-US')),
    [ownersByAbility, query],
  );

  const clearSearch = () => setQuery('');
  const toggleType = (type: PokemonType) =>
    setSelectedTypes((current) => {
      if (current.includes(type)) return current.filter((value) => value !== type);
      if (current.length >= MAX_POKEMON_TYPE_FILTERS) return current;
      return [...current, type];
    });
  const openTab = (next: DexTab) => {
    setTab(next);
    setFilterPanelOpen(false);
  };
  const openAbilityOwner = (entry: DexFormEntry) => {
    setTab('pokemon');
    setQuery('');
    setSelectedTypes([]);
    openDetail(entry);
  };
  const expandMove = (moveId: string) => {
    const next = expandedMoveId === moveId ? null : moveId;
    setExpandedMoveId(next);
    const move = next ? moves.find((candidate) => candidate.id === next) : undefined;
    if (move) recordDexEntry({ kind: 'move', id: move.id, label: move.chineseName });
  };
  const expandAbility = (abilityId: string) => {
    const next = expandedAbilityId === abilityId ? null : abilityId;
    setExpandedAbilityId(next);
    const ability = next ? abilities.find((candidate) => candidate.id === next) : undefined;
    if (ability) recordDexEntry({ kind: 'ability', id: ability.id, label: ability.chineseName });
  };

  const detailPokemon = detailPokemonId ? dexEntries.find((entry) => entry.id === detailPokemonId) ?? null : null;
  if (detailPokemon) {
    return <PokemonDetail entry={detailPokemon} onBack={back} onOpenCalculator={onOpenCalculator} />;
  }

  const regulationId = currentRegulation().id;
  const pokemonFilterLabels = [...selectedTypes.map((type) => typeLabelByValue[type])];
  const pokemonSectionLabel =
    selectedTypes.length > 0 || showMegaOnly
      ? [pokemonFilterLabels.join(' + '), showMegaOnly ? '仅 Mega' : undefined].filter(Boolean).join(' · ')
      : `全部 ${filteredPokemon.length}`;

  return (
    <div className="pb-8">
      <PageHeader
        className="px-6 pt-5"
        subtitle={`${regulationId} 规则数据 · 宝可梦 ${dexEntries.length} · 招式 ${moves.length} · 道具 ${selectableItems.length} · 特性 ${abilities.length}`}
        title="规则内图鉴"
      />
      <SearchField className="mx-6 mt-4" label="搜索图鉴" placeholder="搜索名称" value={query} onChange={setQuery} />
      <DexTabs className="mx-6 mt-3.5" value={tab} onChange={openTab} />

      {tab === 'pokemon' && (
        <>
          <div className="mx-6 mt-3 flex flex-wrap items-center gap-2">
            {selectedTypes.map((type) => (
              <RemovableChip key={type} ariaLabel={`移除${typeLabelByValue[type]}属性筛选`} onRemove={() => toggleType(type)}>
                <TypeDot size={8} type={type} />
                {typeLabelByValue[type]}
              </RemovableChip>
            ))}
            {showMegaOnly && (
              <RemovableChip ariaLabel="移除仅 Mega 筛选" onRemove={() => setShowMegaOnly(false)}>
                仅 Mega
              </RemovableChip>
            )}
            <DisclosureChip label="属性" open={filterPanelOpen} onClick={() => setFilterPanelOpen((open) => !open)} />
            {!showMegaOnly && !filterPanelOpen && <ToggleChip label="仅 Mega" onClick={() => setShowMegaOnly(true)} />}
          </div>
          {filterPanelOpen && (
            <FilterPanel>
              <SectionLabel className="px-6" trailing="再点一次取消">
                {selectedTypes.length > 0 ? `属性 · 最多选 2 个 · 已选 ${selectedTypes.length}` : '属性 · 最多选 2 个'}
              </SectionLabel>
              <div className="mt-3 flex flex-wrap gap-[7px] px-6">
                {typeOptions.map((type) => (
                  <CountChip
                    key={type}
                    ariaLabel={`${typeLabelByValue[type]}属性`}
                    count={pokemonTypeCounts[type]}
                    selected={selectedTypes.includes(type)}
                    onClick={() => toggleType(type)}
                  >
                    <TypeDot size={8} type={type} />
                    {typeLabelByValue[type]}
                  </CountChip>
                ))}
              </div>
              <div className="mt-[18px] flex h-12 items-center gap-3 border-t border-[var(--hairline)] px-6">
                <span className="min-w-0 flex-1 text-[15px] font-bold">仅 Mega</span>
                <button
                  aria-checked={showMegaOnly}
                  aria-label="仅 Mega"
                  className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${
                    showMegaOnly ? 'justify-end' : 'justify-start bg-track'
                  }`}
                  role="switch"
                  style={showMegaOnly ? { background: 'var(--track-on)' } : undefined}
                  type="button"
                  onClick={() => setShowMegaOnly((value) => !value)}
                >
                  <span
                    className={`h-6 w-6 rounded-full ${showMegaOnly ? '' : 'bg-knob'}`}
                    style={showMegaOnly ? { background: 'var(--knob-on)' } : undefined}
                  />
                </button>
              </div>
              <PanelFooter resultLabel={`${filteredPokemon.length} 只结果`} onCollapse={() => setFilterPanelOpen(false)} />
            </FilterPanel>
          )}
          {filteredPokemon.length === 0 ? (
            <DexEmptyState
              actions={
                <>
                  <EmptyStateAction
                    onClick={() => {
                      clearSearch();
                      setSelectedTypes([]);
                      setShowMegaOnly(false);
                    }}
                  >
                    显示全部 {dexEntries.length}
                  </EmptyStateAction>
                  <EmptyStateAction strong onClick={() => setFilterPanelOpen(true)}>
                    按属性筛选
                  </EmptyStateAction>
                </>
              }
              description={
                query.trim()
                  ? `${regulationId} 规则只开放 ${dexEntries.length} 只，${query.trim()}不在其中。`
                  : `${regulationId} 规则只开放 ${dexEntries.length} 只，${pokemonSectionLabel} 没有匹配。`
              }
              title="图鉴里没有这只"
            />
          ) : (
            <section className="px-6 pt-[22px]">
              <SectionLabel trailing={selectedTypes.length > 0 || showMegaOnly ? `${filteredPokemon.length} 只结果` : undefined}>
                {pokemonSectionLabel}
              </SectionLabel>
              <div className="mt-1.5">
                {filteredPokemon.map((entry, index) => (
                  <PokemonRow
                    key={entry.id}
                    divider={index < filteredPokemon.length - 1}
                    entry={entry}
                    onOpen={() => openDetail(entry)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'moves' && (
        <>
          <div className="mx-6 mt-3 flex flex-wrap items-center gap-2">
            {selectedMoveType && (
              <RemovableChip ariaLabel={`移除${typeLabelByValue[selectedMoveType]}属性筛选`} onRemove={() => setSelectedMoveType(null)}>
                <TypeDot size={8} type={selectedMoveType} />
                {typeLabelByValue[selectedMoveType]}
              </RemovableChip>
            )}
            {selectedMoveCategory && (
              <RemovableChip ariaLabel={`移除${categoryLabels[selectedMoveCategory]}分类筛选`} onRemove={() => setSelectedMoveCategory(null)}>
                {categoryLabels[selectedMoveCategory]}
              </RemovableChip>
            )}
            <DisclosureChip
              icon={<SlidersHorizontal size={14} />}
              label="筛选"
              open={filterPanelOpen}
              onClick={() => setFilterPanelOpen((open) => !open)}
            />
          </div>
          {filterPanelOpen && (
            <FilterPanel>
              <SectionLabel className="px-6" trailing="再点一次取消">
                {selectedMoveType ? '招式属性 · 已选 1' : '招式属性'}
              </SectionLabel>
              <div className="mt-3 flex flex-wrap gap-[7px] px-6">
                {typeOptions.map((type) => (
                  <CountChip
                    key={type}
                    ariaLabel={`${typeLabelByValue[type]}属性招式`}
                    count={moveTypeCounts[type]}
                    selected={selectedMoveType === type}
                    onClick={() => setSelectedMoveType((current) => (current === type ? null : type))}
                  >
                    <TypeDot size={8} type={type} />
                    {typeLabelByValue[type]}
                  </CountChip>
                ))}
              </div>
              <SectionLabel className="mt-[18px] px-6">分类</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-[7px] px-6">
                {moveCategories.map((category) => (
                  <CountChip
                    key={category}
                    ariaLabel={`${categoryLabels[category]}招式`}
                    count={moveCategoryCounts[category]}
                    selected={selectedMoveCategory === category}
                    onClick={() => setSelectedMoveCategory((current) => (current === category ? null : category))}
                  >
                    {categoryLabels[category]}
                  </CountChip>
                ))}
              </div>
              <PanelFooter resultLabel={`${filteredMoves.length} 条结果`} onCollapse={() => setFilterPanelOpen(false)} />
            </FilterPanel>
          )}
          {filteredMoves.length === 0 ? (
            <DexEmptyState
              actions={
                <>
                  <EmptyStateAction
                    onClick={() => {
                      clearSearch();
                      setSelectedMoveType(null);
                      setSelectedMoveCategory(null);
                    }}
                  >
                    显示全部 {moves.length}
                  </EmptyStateAction>
                  <EmptyStateAction strong onClick={() => setFilterPanelOpen(true)}>
                    按属性筛选
                  </EmptyStateAction>
                </>
              }
              description={`${regulationId} 规则可学的 ${moves.length} 个招式里没有匹配的名称。`}
              title="没有这个招式"
            />
          ) : (
            <section className="px-6 pt-[22px]">
              <SectionLabel>按属性排序 · {filteredMoves.length} 条</SectionLabel>
              <div className="mt-1.5">
                {filteredMoves.map((move, index) => (
                  <MoveRow
                    key={move.id}
                    divider={index < filteredMoves.length - 1}
                    expanded={expandedMoveId === move.id}
                    move={move}
                    onToggle={() => expandMove(move.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'items' && (
        <>
          <div className="mx-6 mt-3 flex flex-wrap items-center gap-2">
            {selectedItemCategories.map((category) => (
              <RemovableChip
                key={category}
                ariaLabel={`移除${itemCategoryLabelByValue[category]}筛选`}
                onRemove={() => setSelectedItemCategories((current) => current.filter((value) => value !== category))}
              >
                {itemCategoryLabelByValue[category]}
              </RemovableChip>
            ))}
            <DisclosureChip label="类别" open={filterPanelOpen} onClick={() => setFilterPanelOpen((open) => !open)} />
          </div>
          {filterPanelOpen && (
            <FilterPanel>
              <SectionLabel className="px-6" trailing="再点一次取消">
                类别
              </SectionLabel>
              <div className="mt-3 flex flex-wrap gap-[7px] px-6">
                {itemCategoryOptions.map((option) => (
                  <CountChip
                    key={option.value}
                    ariaLabel={option.label}
                    count={itemCategoryCounts[option.value]}
                    selected={selectedItemCategories.includes(option.value)}
                    onClick={() =>
                      setSelectedItemCategories((current) =>
                        current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value],
                      )
                    }
                  >
                    {option.label}
                  </CountChip>
                ))}
              </div>
              <PanelFooter resultLabel={`${filteredItems.length} 个结果`} onCollapse={() => setFilterPanelOpen(false)} />
            </FilterPanel>
          )}
          {filteredItems.length === 0 ? (
            <DexEmptyState
              actions={
                <>
                  <EmptyStateAction
                    onClick={() => {
                      clearSearch();
                      setSelectedItemCategories([]);
                    }}
                  >
                    显示全部 {selectableItems.length}
                  </EmptyStateAction>
                  <EmptyStateAction strong onClick={() => setFilterPanelOpen(true)}>
                    按类别筛选
                  </EmptyStateAction>
                </>
              }
              description={`对战可携带的 ${selectableItems.length} 个道具里没有匹配的名称。`}
              title="没有这个道具"
            />
          ) : (
            <section className="px-6 pt-[22px]">
              <SectionLabel trailing={selectedItemCategories.length > 0 ? '按名称排序' : undefined}>
                {selectedItemCategories.length > 0
                  ? `${selectedItemCategories.map((category) => itemCategoryLabelByValue[category]).join(' · ')} · ${filteredItems.length} 个`
                  : `可携带 ${filteredItems.length}`}
              </SectionLabel>
              <div className="mt-1.5">
                {filteredItems.map((item, index) => (
                  <ItemRow key={item.id} divider={index < filteredItems.length - 1} item={item} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'abilities' &&
        (filteredAbilities.length === 0 ? (
          <DexEmptyState
            actions={<EmptyStateAction onClick={clearSearch}>显示全部 {abilities.length}</EmptyStateAction>}
            description={`${abilities.length} 个特性里没有匹配，持有者名称也没有匹配。`}
            title="没有这个特性"
          />
        ) : (
          <section className="px-6 pt-[22px]">
            <SectionLabel trailing={query.trim() ? undefined : '按名称排序'}>
              {query.trim() ? `搜到 ${filteredAbilities.length} 条 · 含持有者匹配` : `全部 ${filteredAbilities.length}`}
            </SectionLabel>
            <div className="mt-1.5">
              {filteredAbilities.map((ability, index) => {
                const ownerRows = ownersByAbility.get(ability.id) ?? [];
                // A name search puts the Pokémon that matched it first, so the preview avatar is
                // the one the user was looking for rather than the lowest dex number.
                const matching = query.trim() ? ownerRows.filter((owner) => matchesQuery(query, owner.searchText)) : [];
                const owners = [...matching, ...ownerRows.filter((owner) => !matching.includes(owner))].map((owner) => owner.entry);
                return (
                  <AbilityRow
                    key={ability.id}
                    ability={ability}
                    divider={index < filteredAbilities.length - 1}
                    expanded={expandedAbilityId === ability.id}
                    owners={owners}
                    onOpenOwner={openAbilityOwner}
                    onToggle={() => expandAbility(ability.id)}
                  />
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
