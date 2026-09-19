import { Check, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { currentRegulation } from '../../../data/environment';
import type { EnvironmentReferenceUsage } from '../../../lib/environmentDataset';
import type { Move, PokemonType } from '../../../types';
import { ListRow, TypeDot } from '../../../components/kit';
import { typeLabels } from '../../../components/ui';
import { FacetChip, FacetHeader, FilterPanel, FilterToggle, PickerPage } from './PickerPage';

/** 03-02 → 03-05 — pick one move for one slot. Staged only; 取消 in the editor rolls it back. */

const categoryLabels: Record<Move['category'], string> = { Physical: '物理', Special: '特殊', Status: '变化' };

const moveLine = (move: Move) =>
  [
    typeLabels[move.type],
    categoryLabels[move.category],
    move.power ? `威力 ${move.power}${move.accuracy ? ` / 命中 ${move.accuracy}` : ''}` : move.accuracy ? `命中 ${move.accuracy}` : undefined,
    `PP ${move.pp}`,
  ]
    .filter(Boolean)
    .join(' · ');

// NFKC folds full-width letters, so `DD` finds 「ＤＤ金勾臂」; the id covers hyphenated English.
const fold = (value: string) => value.normalize('NFKC').trim().toLowerCase();

const matches = (move: Move, query: string) => {
  const normalized = fold(query);
  if (!normalized) return true;
  return [move.chineseName, move.englishName, move.id].some((field) => fold(field).includes(normalized));
};

export function MovePickerPage({
  slot,
  pokemonName,
  selectedMoveId,
  takenSlots,
  availableMoves,
  environmentStats,
  title,
  backLabel = '返回编辑配置',
  onPick,
  onBack,
}: {
  /** The damage calculator has a single move, so 「招式 1」 would read wrong there. */
  title?: string;
  backLabel?: string;
  slot: number;
  pokemonName: string;
  selectedMoveId?: string;
  /** moveId → the 1-based slot that already holds it, so 03-02 can grey it out. */
  takenSlots: Map<string, number>;
  availableMoves: Move[];
  environmentStats?: EnvironmentReferenceUsage[];
  onPick: (moveId: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [types, setTypes] = useState<PokemonType[]>([]);
  const [categories, setCategories] = useState<Array<Move['category']>>([]);

  const typeFacets = useMemo(() => {
    const counts = new Map<PokemonType, number>();
    availableMoves.forEach((move) => counts.set(move.type, (counts.get(move.type) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || typeLabels[a[0]].localeCompare(typeLabels[b[0]], 'zh-Hans-CN'));
  }, [availableMoves]);

  const categoryFacets = useMemo(
    () =>
      (['Physical', 'Special', 'Status'] as const).map((category) => ({
        category,
        count: availableMoves.filter((move) => move.category === category).length,
      })),
    [availableMoves],
  );

  const filtered = availableMoves.filter(
    (move) =>
      matches(move, query) &&
      (types.length === 0 || types.includes(move.type)) &&
      (categories.length === 0 || categories.includes(move.category)),
  );

  const usageRates = new Map((environmentStats ?? []).map((stat) => [stat.id, stat.usageRate]));
  const filtering = types.length > 0 || categories.length > 0;
  const searching = query.trim().length > 0;
  // 环境常用 / 其余可学 is the resting split (03-02); a query or a facet collapses it into one
  // list headed by what was asked for (03-03 / 03-04).
  const split = !searching && !filtering;
  const common = split ? filtered.filter((move) => usageRates.has(move.id)) : [];
  common.sort((a, b) => (usageRates.get(b.id) ?? 0) - (usageRates.get(a.id) ?? 0));
  const rest = split ? filtered.filter((move) => !usageRates.has(move.id)) : filtered;

  const toggleType = (type: PokemonType) =>
    setTypes((current) => (current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]));
  const toggleCategory = (category: Move['category']) =>
    setCategories((current) => (current.includes(category) ? current.filter((entry) => entry !== category) : [...current, category]));

  const row = (move: Move, index: number, all: Move[]) => {
    const selected = move.id === selectedMoveId;
    const takenBy = takenSlots.get(move.id);
    const usage = usageRates.get(move.id);

    return (
      <ListRow
        key={move.id}
        active={selected}
        ariaLabel={move.chineseName}
        bleed={selected}
        divider={index < all.length - 1}
        height={68}
        leading={<TypeDot type={move.type} />}
        subtitle={moveLine(move)}
        title={
          takenBy ? (
            <span className="flex items-baseline gap-2">
              <span className="text-textSecondary">{move.chineseName}</span>
              <span className="text-[11px] font-bold text-textPrimary">已在招式 {takenBy}</span>
            </span>
          ) : (
            move.chineseName
          )
        }
        trailing={
          selected ? (
            <Check className="shrink-0 text-textPrimary" size={18} />
          ) : usage !== undefined ? (
            <span className="shrink-0 text-xs font-bold tabular-nums text-textSecondary">{usage.toFixed(1)}%</span>
          ) : undefined
        }
        onClick={takenBy ? undefined : () => onPick(move.id)}
      />
    );
  };

  const summary = searching
    ? `「${query.trim()}」· ${filtered.length} 个结果 · ${pokemonName}可学`
    : `${[...types.map((type) => typeLabels[type]), ...categories.map((category) => categoryLabels[category])].join(' · ')} · ${filtered.length} 个结果`;

  return (
    <PickerPage
      backLabel={backLabel}
      filters={
        <div className="mt-3 flex gap-2">
          <FilterToggle count={types.length} label="属性" open={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} />
          <FilterToggle count={categories.length} label="分类" open={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} />
        </div>
      }
      search={{ value: query, onChange: setQuery, placeholder: '搜索招式名', label: '搜索招式名' }}
      subtitle={`${pokemonName} · ${currentRegulation} 规则可学，共 ${availableMoves.length} 个`}
      title={title ?? `招式 ${slot + 1}`}
      onBack={onBack}
    >
      {filtersOpen && !searching && (
        <FilterPanel onCollapse={() => setFiltersOpen(false)}>
          <FacetHeader label="属性" selectedCount={types.length} onReset={() => setTypes([])} />
          <div className="mt-3 flex flex-wrap gap-[7px] px-6">
            {typeFacets.map(([type, count]) => (
              <FacetChip
                key={type}
                count={count}
                label={typeLabels[type]}
                leading={<TypeDot size={8} type={type} />}
                selected={types.includes(type)}
                onClick={() => toggleType(type)}
              />
            ))}
          </div>
          <p className="mt-[18px] px-6 text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">分类</p>
          <div className="mt-3 flex gap-[7px] px-6">
            {categoryFacets.map((facet) => (
              <FacetChip
                key={facet.category}
                count={facet.count}
                label={categoryLabels[facet.category]}
                selected={categories.includes(facet.category)}
                onClick={() => toggleCategory(facet.category)}
              />
            ))}
          </div>
        </FilterPanel>
      )}

      {filtered.length === 0 ? (
        <div className="px-6 pt-10">
          <p className="text-[13px] font-semibold text-textSecondary">{summary}</p>
          <h2 className="mt-6 text-[20px] font-extrabold leading-7 tracking-[-0.01em]">没有匹配的招式</h2>
          <p className="mt-2 text-[13px] font-semibold leading-5 text-textSecondary">去掉一个字，或改用属性筛选。</p>
          <div className="mt-[18px] flex gap-2">
            <button
              className="inline-flex h-[34px] items-center rounded-full bg-surface px-3.5 text-[13px] font-bold text-textLabel"
              type="button"
              onClick={() => setQuery('')}
            >
              清空搜索
            </button>
            <button
              className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-bold text-textPrimary"
              type="button"
              onClick={() => {
                setQuery('');
                setFiltersOpen(true);
              }}
            >
              按属性筛选
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      ) : split ? (
        <>
          {common.length > 0 && (
            <section className="px-6 pt-6">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">环境常用</p>
              <div className="mt-1.5">{common.map(row)}</div>
            </section>
          )}
          <section className="px-6 pt-6">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">
              {common.length > 0 ? '其余可学' : '可学招式'}
            </p>
            <div className="mt-1.5">{rest.map(row)}</div>
          </section>
        </>
      ) : (
        <section className="px-6 pt-[18px]">
          <p className="text-[13px] font-semibold text-textSecondary">{summary}</p>
          <div className="mt-2.5">{rest.map(row)}</div>
        </section>
      )}
    </PickerPage>
  );
}
