import { Check, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { currentRegulation } from '../../../data/environment';
import type { EnvironmentReferenceUsage } from '../../../lib/environmentDataset';
import type { Item, ItemCategory } from '../../../types';
import { ListRow, Sprite } from '../../../components/kit';
import { FacetChip, FacetHeader, FilterPanel, FilterToggle, PickerPage } from './PickerPage';
import type { StagedItemTransfer } from './memberDraft';

/**
 * 03-06 → 03-09 — pick a held item. 03-08 draws six categories plus seven 「效果」 chips; the
 * catalog only carries the three categories below and no effect taxonomy at all, so the page
 * ships the real three and leaves the effect row out rather than inventing a mapping.
 *
 * Taking an item a teammate already holds is a transfer, not a block (拍板决策): 03-09's inline
 * confirmation stages it, and it only reaches the teammate when 保存配置 is pressed.
 */

const categoryLabels: Record<ItemCategory, string> = {
  'held-item': '常规道具',
  berry: '树果',
  'mega-evolution': 'Mega 进化石',
};

const categoryOrder: ItemCategory[] = ['held-item', 'berry', 'mega-evolution'];

const matches = (item: Item, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    item.chineseName.toLowerCase().includes(normalized) ||
    item.englishName.toLowerCase().includes(normalized) ||
    item.effectSummary.toLowerCase().includes(normalized)
  );
};

export function ItemPickerPage({
  pokemonName,
  selectedItemId,
  availableItems,
  environmentStats,
  holderOf,
  onPick,
  onClear,
  onBack,
}: {
  pokemonName: string;
  selectedItemId?: string;
  availableItems: Item[];
  environmentStats?: EnvironmentReferenceUsage[];
  /** The teammate already carrying an item, and the name to put in 03-09's warning. */
  holderOf: (itemId: string) => { id: string; name: string } | undefined;
  onPick: (itemId: string, transfer?: StagedItemTransfer) => void;
  onClear: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  const categoryFacets = useMemo(
    () =>
      categoryOrder
        .map((category) => ({ category, count: availableItems.filter((item) => item.category === category).length }))
        .filter((facet) => facet.count > 0),
    [availableItems],
  );

  const filtered = availableItems.filter(
    (item) => matches(item, query) && (categories.length === 0 || categories.includes(item.category)),
  );

  const usageRates = new Map((environmentStats ?? []).map((stat) => [stat.id, stat.usageRate]));
  const searching = query.trim().length > 0;
  const filtering = categories.length > 0;
  const split = !searching && !filtering;
  const common = split ? filtered.filter((item) => usageRates.has(item.id)) : [];
  common.sort((a, b) => (usageRates.get(b.id) ?? 0) - (usageRates.get(a.id) ?? 0));
  const rest = split ? filtered.filter((item) => !usageRates.has(item.id)) : filtered;

  const summary = searching
    ? `「${query.trim()}」· ${filtered.length} 个结果 · ${currentRegulation} 规则可用`
    : `${categories.map((category) => categoryLabels[category]).join(' · ')} · ${filtered.length} 个结果`;

  const row = (item: Item, index: number, all: Item[]) => {
    const selected = item.id === selectedItemId;
    const holder = holderOf(item.id);
    const usage = usageRates.get(item.id);
    const pending = pendingItemId === item.id;

    return (
      <div key={item.id}>
        <ListRow
          active={selected || pending}
          ariaLabel={item.chineseName}
          bleed={selected || pending}
          className={pending ? 'lk-row-pending' : ''}
          divider={pending ? false : index < all.length - 1}
          height={68}
          leading={<Sprite iconRef={item.iconRef} label={item.chineseName} size={28} />}
          subtitle={filtering ? `${categoryLabels[item.category]} · ${item.effectSummary}` : item.effectSummary}
          title={item.chineseName}
          trailing={
            selected ? (
              <Check className="shrink-0 text-textPrimary" size={18} />
            ) : holder ? (
              <span className="shrink-0 text-xs font-bold text-textPrimary">{holder.name}持有</span>
            ) : usage !== undefined ? (
              <span className="shrink-0 text-xs font-bold tabular-nums text-textSecondary">{usage.toFixed(1)}%</span>
            ) : undefined
          }
          onClick={() => {
            if (selected) return;
            if (holder) {
              setPendingItemId(item.id);
              return;
            }
            onPick(item.id);
          }}
        />
        {pending && holder && (
          <div className="-mx-6 border-b border-[var(--hairline)] bg-[var(--sheet-bg-deep)] px-6 pb-[18px] pt-4">
            <div className="flex gap-2.5">
              <span className="mt-px shrink-0 text-data">
                <TriangleAlert size={17} />
              </span>
              <p className="text-sm font-bold leading-[21px] tracking-[-0.01em]">
                将从{holder.name}身上移除「{item.chineseName}」
              </p>
            </div>
            <p className="mt-2 pl-[27px] text-xs font-semibold leading-[18px] text-textSecondary">
              当前规则不允许同队重复携带相同道具。{holder.name}会变成「无道具」，其余配置不变。
            </p>
            <div className="mt-3.5 flex gap-2.5 pl-[27px]">
              <button
                className="inline-flex h-11 items-center rounded-[14px] bg-btn1 px-[18px] text-sm font-bold text-textLabel"
                type="button"
                onClick={() => setPendingItemId(null)}
              >
                取消
              </button>
              <button
                className="lk-slab inline-flex h-11 flex-1 items-center justify-center rounded-[14px] bg-accent text-sm font-extrabold tracking-[-0.01em] text-page"
                type="button"
                onClick={() => onPick(item.id, { itemId: item.id, fromMemberId: holder.id })}
              >
                移除并给{pokemonName}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <PickerPage
      action={selectedItemId ? { label: '清空', onClick: onClear } : undefined}
      backLabel="返回编辑配置"
      filters={
        <div className="mt-3 flex gap-2">
          <FilterToggle count={categories.length} label="类别" open={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} />
        </div>
      }
      search={{ value: query, onChange: setQuery, placeholder: '搜索道具名', label: '搜索道具名' }}
      subtitle={`${pokemonName} · ${currentRegulation} 规则可用，共 ${availableItems.length} 个`}
      title="道具"
      onBack={onBack}
    >
      {filtersOpen && !searching && (
        <FilterPanel onCollapse={() => setFiltersOpen(false)}>
          <FacetHeader label="类别" selectedCount={categories.length} onReset={() => setCategories([])} />
          <div className="mt-3 flex flex-wrap gap-[7px] px-6">
            {categoryFacets.map((facet) => (
              <FacetChip
                key={facet.category}
                count={facet.count}
                label={categoryLabels[facet.category]}
                selected={categories.includes(facet.category)}
                onClick={() =>
                  setCategories((current) =>
                    current.includes(facet.category)
                      ? current.filter((entry) => entry !== facet.category)
                      : [...current, facet.category],
                  )
                }
              />
            ))}
          </div>
        </FilterPanel>
      )}

      {filtered.length === 0 ? (
        <div className="px-6 pt-10">
          <p className="text-[13px] font-semibold text-textSecondary">{summary}</p>
          <h2 className="mt-6 text-[20px] font-extrabold leading-7 tracking-[-0.01em]">没有匹配的道具</h2>
          <p className="mt-2 text-[13px] font-semibold leading-5 text-textSecondary">去掉一个字，或改用类别筛选。</p>
          <div className="mt-[18px] flex gap-2">
            <button
              className="inline-flex h-[34px] items-center rounded-full bg-surface px-3.5 text-[13px] font-bold text-textLabel"
              type="button"
              onClick={() => setQuery('')}
            >
              清空搜索
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
              {common.length > 0 ? '其余可用' : '可用道具'}
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
