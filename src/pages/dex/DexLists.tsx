import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import type { Ability, Item, Move } from '../../types';
import type { DexFormEntry } from '../../lib/pokemonForms';
import { Sprite, TypeDot } from '../../components/kit';
import { catalogMoveMeta, typeLabelByValue } from './dexShared';

/** 04-04 row: artwork, name (plus the MEGA badge from N04-06), then the type dots. */
export function PokemonRow({ entry, divider, onOpen }: { entry: DexFormEntry; divider: boolean; onOpen: () => void }) {
  return (
    <button
      className={`flex h-[68px] w-full items-center gap-3.5 text-left ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      type="button"
      onClick={onOpen}
    >
      <Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{entry.chineseName}</span>
          {entry.isMega && (
            <span className="lk-chip inline-flex h-5 shrink-0 items-center rounded-md px-[7px] text-[10px] font-extrabold tracking-[0.06em] text-textLabel">
              MEGA
            </span>
          )}
        </span>
        <span className="mt-1 flex items-center gap-2.5 text-xs font-semibold text-textSecondary">
          {entry.types.map((type) => (
            <span key={type} className="inline-flex items-center gap-[5px]">
              <TypeDot size={7} type={type} />
              {typeLabelByValue[type]}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight className="lk-p4a-list-chevron shrink-0" size={18} />
    </button>
  );
}

/** 04-05 row: name pair, type + stat line, and the effect text once expanded. */
export function MoveRow({
  move,
  expanded,
  divider,
  onToggle,
}: {
  move: Move;
  expanded: boolean;
  divider: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={expanded ? `收起${move.chineseName}说明` : `展开${move.chineseName}说明`}
      className={`flex w-full items-start gap-3.5 py-4 text-left ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      type="button"
      onClick={onToggle}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{move.chineseName}</span>
          <span className="shrink-0 text-xs font-semibold text-chevron">{move.englishName}</span>
        </span>
        <span className="mt-[5px] flex items-center gap-2.5 text-xs font-semibold text-textSecondary">
          <span className="inline-flex items-center gap-[5px]">
            <TypeDot size={7} type={move.type} />
            {typeLabelByValue[move.type]}
          </span>
          <span>{catalogMoveMeta(move)}</span>
        </span>
        {expanded && <span className="mt-2 block text-[13px] leading-[18px] text-textSecondary">{move.effectSummary}</span>}
      </span>
      <span className="lk-p4a-list-chevron mt-1 shrink-0">
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </span>
    </button>
  );
}

/** 04-07 row: the item sprite and a single clipped line of effect text. */
export function ItemRow({ item, divider }: { item: Item; divider: boolean }) {
  return (
    <div className={`flex h-[68px] items-center gap-3.5 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}>
      <Sprite iconRef={item.iconRef} label={item.chineseName} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold tracking-[-0.01em]">{item.chineseName}</p>
        <p className="mt-[3px] truncate text-xs font-medium text-textSecondary">{item.effectSummary}</p>
      </div>
    </div>
  );
}

/**
 * 04-08 row: collapsed it previews one owner; expanded it prints the effect and every owner as
 * a tappable tile that jumps to that Pokémon's detail.
 */
export function AbilityRow({
  ability,
  owners,
  expanded,
  divider,
  onToggle,
  onOpenOwner,
}: {
  ability: Ability;
  owners: DexFormEntry[];
  expanded: boolean;
  divider: boolean;
  onToggle: () => void;
  onOpenOwner: (entry: DexFormEntry) => void;
}) {
  const heading = (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className={`truncate text-[17px] tracking-[-0.01em] ${expanded ? 'font-extrabold' : 'font-bold'}`}>{ability.chineseName}</span>
      <span className="shrink-0 text-xs font-semibold text-chevron">{ability.englishName}</span>
    </span>
  );

  if (!expanded) {
    return (
      <button
        aria-expanded={false}
        aria-label={`展开${ability.chineseName}说明`}
        className={`flex h-[68px] w-full items-center gap-3.5 text-left ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
        type="button"
        onClick={onToggle}
      >
        {heading}
        {owners[0] && (
          <span className="lk-p4a-muted shrink-0 rounded-full">
            <Sprite iconRef={owners[0].iconRef} label={owners[0].chineseName} size={30} />
          </span>
        )}
        <ChevronDown className="lk-p4a-list-chevron shrink-0" size={16} />
      </button>
    );
  }

  return (
    <div className={`py-4 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}>
      <button
        aria-expanded
        aria-label={`收起${ability.chineseName}说明`}
        className="flex w-full items-start gap-3.5 text-left"
        type="button"
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1">
          {heading}
          <span className="mt-2 block text-[13px] leading-[18px] text-textSecondary">{ability.effectSummary}</span>
        </span>
        <ChevronUp className="lk-p4a-list-chevron mt-0.5 shrink-0" size={16} />
      </button>
      {owners.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {owners.map((owner) => (
            <button
              key={owner.id}
              className="lk-p4a-muted flex h-11 min-w-0 items-center gap-2 rounded-xl px-2.5 text-left"
              type="button"
              onClick={() => onOpenOwner(owner)}
            >
              <Sprite iconRef={owner.iconRef} label={owner.chineseName} size={28} />
              <span className="min-w-0 truncate text-[13px] font-bold">{owner.chineseName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
