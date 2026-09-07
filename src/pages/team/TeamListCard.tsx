import { Edit3, GripVertical } from 'lucide-react';
import { pokemon } from '../../data';
import { getMemberBattleForm } from '../../lib/pokemonForms';
import type { Team } from '../../types';
import { PokemonAvatar } from '../../components/ui';

export function TeamListCard({
  team,
  active,
  recentlyImported,
  index,
  dragging,
  dragOffsetY,
  dropTarget,
  setCardRef,
  onEdit,
  onDelete,
  onDragCancel,
  onDragEnd,
  onDragMove,
  onDragStart,
}: {
  team: Team;
  active: boolean;
  recentlyImported: boolean;
  index: number;
  dragging: boolean;
  dragOffsetY: number;
  dropTarget: boolean;
  setCardRef: (element: HTMLElement | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragCancel: () => void;
  onDragEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const visibleMembers = team.members.slice(0, 6);
  const openOnKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onEdit();
  };

  return (
    <section
      ref={setCardRef}
      aria-label={`队伍：${team.name}`}
      role="button"
      tabIndex={0}
      data-import-highlighted={recentlyImported ? 'true' : undefined}
      style={dragging ? { transform: `translateY(${dragOffsetY}px)` } : undefined}
      className={`surface-shadow relative cursor-pointer rounded-lg border bg-card p-3 focus:outline-none focus:ring-2 focus:ring-accent/55 ${
        recentlyImported
          ? 'border-success ring-2 ring-success/45 shadow-[0_0_0_1px_rgb(var(--color-success)/0.35)]'
          : active
            ? 'border-accent shadow-[0_0_0_1px_rgb(var(--color-accent)/0.45)]'
            : 'border-border'
      } ${
        dragging
          ? 'z-10 scale-[1.01] cursor-grabbing shadow-[0_18px_36px_rgb(0_0_0/0.32)] transition-none'
          : 'transition-[transform,box-shadow,border-color] duration-150'
      } ${dropTarget ? 'ring-1 ring-accent/35' : ''}`}
      onClick={onEdit}
      onKeyDown={openOnKeyboard}
    >
      <button
        aria-label={`删除 ${team.name}`}
        className="absolute right-3 top-2.5 grid h-5 w-5 place-items-center rounded-md border border-danger/45 bg-black transition active:scale-[0.96]"
        title={`删除 ${team.name}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <span className="h-px w-2.5 rounded-full bg-danger" aria-hidden="true" />
      </button>
      <button
        aria-label={`编辑 ${team.name}`}
        className="absolute right-9 top-2.5 z-10 grid h-5 w-5 place-items-center rounded-md border border-border bg-secondary text-textMuted transition active:scale-[0.96]"
        title={`编辑 ${team.name}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <Edit3 size={12} />
      </button>
      <div className="flex items-start justify-between gap-3 pr-14">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{team.name}</span>
          <p className="mt-1 text-xs text-textSecondary">{team.members.length}/6 成员</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
          {visibleMembers.map((member) => {
            const entry = pokemon.find((item) => item.id === member.pokemonId);
            const battleForm = getMemberBattleForm(member);
            return (
              <PokemonAvatar
                key={member.id}
                iconRef={battleForm?.iconRef ?? entry?.iconRef}
                label={battleForm?.chineseName ?? entry?.chineseName ?? '未配置 Pokémon'}
                size="sm"
              />
            );
          })}
          {Array.from({ length: Math.max(0, 6 - visibleMembers.length) }).map((_, emptyIndex) => (
            <span key={`empty-${emptyIndex}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-border text-[10px] text-textMuted">
              +
            </span>
          ))}
        </div>
        <button
          aria-label={`拖动排序 ${team.name}`}
          className="grid h-9 w-[18px] shrink-0 touch-none place-items-center rounded-md border border-border bg-secondary text-textMuted transition active:scale-[0.96] active:text-textSecondary"
          title={`拖动排序 ${team.name}`}
          type="button"
          onClick={(event) => event.stopPropagation()}
          onPointerCancel={onDragCancel}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            onDragStart(event);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            onDragMove(event);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            onDragEnd(event);
          }}
        >
          <GripVertical size={12} />
        </button>
      </div>
    </section>
  );
}
