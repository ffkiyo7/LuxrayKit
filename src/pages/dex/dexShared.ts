import { attackingTypes } from '../../lib/calculations';
import { typeLabels } from '../../components/ui';
import type { ItemCategory, Move, PokemonType } from '../../types';

export type DexTab = 'pokemon' | 'moves' | 'items' | 'abilities';
export type MoveCategory = Move['category'];
export type MoveSortKey = 'type' | 'power-asc' | 'power-desc';

/** Catalog order in every frame is the national type order, which `attackingTypes` already is. */
export const typeOptions = attackingTypes;
export const typeLabelByValue = typeLabels;
export const typeOrder = Object.fromEntries(attackingTypes.map((type, index) => [type, index])) as Record<PokemonType, number>;

export const categoryLabels: Record<MoveCategory, string> = { Physical: '物理', Special: '特殊', Status: '变化' };
export const categoryOrder: Record<MoveCategory, number> = { Physical: 0, Special: 1, Status: 2 };
export const moveCategories: MoveCategory[] = ['Physical', 'Special', 'Status'];

/**
 * 04-07 draws six item categories and a row of 「效果」 chips; the catalog only carries these
 * three, so only these three are offered (see the delivery report).
 */
export const itemCategoryOptions: Array<{ label: string; value: ItemCategory }> = [
  { label: '常规道具', value: 'held-item' },
  { label: '树果', value: 'berry' },
  { label: 'Mega 进化石', value: 'mega-evolution' },
];
export const itemCategoryLabelByValue = Object.fromEntries(
  itemCategoryOptions.map((option) => [option.value, option.label]),
) as Record<ItemCategory, string>;

export const statLabels = {
  HP: 'HP',
  '攻': '攻击',
  '防': '防御',
  '特攻': '特攻',
  '特防': '特防',
  '速': '速度',
} as const;

/** 04-09 draws the rails against a 200 ceiling, which is roughly the highest base stat in play. */
export const STAT_BAR_CEILING = 200;

export const formatMultiplier = (multiplier: number) =>
  multiplier === 0.25 ? '×¼' : multiplier === 0.5 ? '×½' : `×${multiplier}`;

export const formatDexNo = (value: number) => `No.${value}`;

export const formatHeight = (heightDm?: number) =>
  Number.isFinite(heightDm) ? `${((heightDm ?? 0) / 10).toFixed(1)} m` : undefined;

export const formatWeight = (weightHg?: number) =>
  Number.isFinite(weightHg) ? `${((weightHg ?? 0) / 10).toFixed(1)} kg` : undefined;

/** 04-05 row meta: 「物理 · 威力 100 · 命中 100 · PP 10」, with 「-」 where the move has none. */
export const catalogMoveMeta = (move: Move) =>
  `${categoryLabels[move.category]} · 威力 ${move.power ?? '-'} · 命中 ${move.accuracy ?? '-'} · PP ${move.pp}`;

/**
 * 04-09 learnable-move meta, which drops whatever the move does not have rather than printing
 * a dash: damaging moves read 「威力 90 / 命中 100」, status moves fall back to 命中 then PP.
 */
export const learnableMoveMeta = (move: Move) => {
  const head = `${typeLabelByValue[move.type]} · ${categoryLabels[move.category]}`;
  if (move.power) return `${head} · 威力 ${move.power} / 命中 ${move.accuracy ?? '-'}`;
  if (move.accuracy) return `${head} · 命中 ${move.accuracy}`;
  return `${head} · PP ${move.pp}`;
};

export const compareMoveByPower = (a: Move, b: Move, descending: boolean) => {
  const aIsStatus = a.category === 'Status';
  const bIsStatus = b.category === 'Status';
  // 「变化招式置后」 (04-09) holds in both directions — the toggle only reorders damaging moves.
  if (aIsStatus !== bIsStatus) return aIsStatus ? 1 : -1;
  if (!aIsStatus && !bIsStatus) {
    const powerDiff = (a.power ?? 0) - (b.power ?? 0);
    if (powerDiff !== 0) return descending ? -powerDiff : powerDiff;
  }
  return a.englishName.localeCompare(b.englishName, 'en-US');
};

export const sortMoves = (moveList: Move[], sortKey: MoveSortKey) =>
  [...moveList].sort((a, b) => {
    if (sortKey === 'type') {
      return (
        typeOrder[a.type] - typeOrder[b.type]
        || categoryOrder[a.category] - categoryOrder[b.category]
        || a.englishName.localeCompare(b.englishName, 'en-US')
      );
    }
    return compareMoveByPower(a, b, sortKey === 'power-desc') || typeOrder[a.type] - typeOrder[b.type];
  });

const moveSearchRank = (move: Move, normalized: string) => {
  const fields = [
    move.chineseName,
    move.englishName,
    move.id,
    typeLabelByValue[move.type],
    move.type,
    categoryLabels[move.category],
    move.effectSummary,
  ].map((value) => value.toLowerCase());
  if (fields.some((value) => value === normalized)) return 3;
  if (fields.some((value) => value.startsWith(normalized))) return 2;
  if (fields.some((value) => value.includes(normalized))) return 1;
  return -1;
};

/** Name-first ranking, so typing a move's exact name floats it above description matches. */
export const filterMovesByQuery = (moveList: Move[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return moveList;
  return moveList
    .map((move, index) => ({ move, index, rank: moveSearchRank(move, normalized) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ move }) => move);
};

export const matchesQuery = (query: string, ...values: Array<string | number | undefined>) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(normalized));
};
