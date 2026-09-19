import { GripVertical, MoreHorizontal, Pencil, Share2, Trash2, Zap } from 'lucide-react';
import { pokemon } from '../../data';
import { getMemberBattleForm } from '../../lib/pokemonForms';
import { canShareTeam } from '../../lib/teamShare';
import type { Team } from '../../types';
import { Sprite, TypeDot } from '../../components/kit';
import { typeLabels } from '../../components/ui';
import { teamListSubtitle } from './teamMeta';

type CardProps = {
  team: Team;
  active: boolean;
  recentlyImported: boolean;
  dragging: boolean;
  dragOffsetY: number;
  dropTarget: boolean;
  setCardRef: (element: HTMLElement | null) => void;
  onOpen: () => void;
  onMenu: () => void;
  onShare: () => void;
  onDragCancel: () => void;
  onDragEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

function DragHandle({
  team,
  dragging,
  onDragCancel,
  onDragEnd,
  onDragMove,
  onDragStart,
}: Pick<CardProps, 'team' | 'dragging' | 'onDragCancel' | 'onDragEnd' | 'onDragMove' | 'onDragStart'>) {
  return (
    <button
      aria-label={`拖动排序 ${team.name}`}
      className={`-ml-2 -mt-1 grid h-9 w-9 shrink-0 touch-none place-items-center rounded-[10px] ${
        dragging ? 'text-textPrimary' : 'text-chevron'
      }`}
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
      <GripVertical size={18} />
    </button>
  );
}

function MemberStrip({ team, size = 50 }: { team: Team; size?: number }) {
  // Empty slots stay blank — the frames deliberately draw no placeholder tile (02-02, N02-15).
  return (
    <div className="mt-[14px] grid grid-cols-6 gap-1.5">
      {team.members.slice(0, 6).map((member) => {
        const form = getMemberBattleForm(member);
        const entry = pokemon.find((item) => item.id === member.pokemonId);
        return (
          <img
            key={member.id}
            alt={form?.chineseName ?? entry?.chineseName ?? '未配置宝可梦'}
            className="w-full object-contain"
            decoding="async"
            loading="lazy"
            src={form?.iconRef ?? entry?.iconRef}
            style={{ height: size }}
          />
        );
      })}
    </div>
  );
}

function CardFooter({ team, onShare }: { team: Team; onShare: () => void }) {
  const shareable = canShareTeam(team);

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--hairline)] pt-[14px]">
      {team.replicaCode ? (
        <span className="truncate text-[13px] font-bold tracking-[0.04em] text-textPrimary tabular-nums">{team.replicaCode}</span>
      ) : (
        <span className="text-[13px] font-semibold text-chevron">无队伍码</span>
      )}
      <button
        aria-label={`分享 ${team.name}`}
        className={`inline-flex shrink-0 items-center gap-1.5 text-[13px] font-bold ${
          shareable ? 'text-textPrimary' : 'text-textSecondary'
        }`}
        disabled={!shareable}
        title={shareable ? '分享队伍' : '满 6 只才能分享'}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onShare();
        }}
      >
        <Share2 size={15} />
        分享
      </button>
    </div>
  );
}

/**
 * 02-02 / N02-15 / N02-16 / N02-18 — the ordinary team card: title, member strip, then the
 * replica-code / 分享 footer. Everything destructive moved into the ⋯ menu (02-04 / 02-09).
 */
export function TeamListCard({
  team,
  active,
  recentlyImported,
  dragging,
  dragOffsetY,
  dropTarget,
  setCardRef,
  onOpen,
  onMenu,
  onShare,
  ...drag
}: CardProps) {
  return (
    <>
      {dropTarget && <div className="lk-pill-on h-[14px] rounded-full" aria-hidden="true" />}
      <section
        ref={setCardRef}
        aria-label={`队伍：${team.name}`}
        className={`relative cursor-pointer rounded-[20px] p-[18px] focus:outline-none focus:ring-2 focus:ring-select/55 ${
          dragging
            ? 'lk-card-dragging z-10 scale-[1.02] bg-btn1 transition-none'
            : recentlyImported
              ? 'lk-field-on bg-btn1 transition-[transform] duration-150'
              : 'lk-card-face shadow-[shadow:var(--lk-card-shadow)] transition-[transform] duration-150'
        }`}
        data-import-highlighted={recentlyImported ? 'true' : undefined}
        role="button"
        style={dragging ? { transform: `translateY(${dragOffsetY}px)` } : undefined}
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onOpen();
        }}
      >
        <div className="flex items-start gap-3">
          <DragHandle team={team} dragging={dragging} {...drag} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="m-0 min-w-0 truncate text-[20px] font-extrabold leading-7 tracking-[-0.01em]">{team.name}</h2>
              {recentlyImported && (
                <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-textPrimary/[0.14] px-[9px] text-[11px] font-extrabold tracking-[0.06em] text-textPrimary">
                  刚导入
                </span>
              )}
              {!recentlyImported && active && (
                <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-btn1 px-[9px] text-[11px] font-extrabold tracking-[0.06em] text-textLabel">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  在用
                </span>
              )}
            </div>
            <p className="mt-[5px] text-[13px] font-semibold text-textSecondary">{teamListSubtitle(team)}</p>
          </div>
          <button
            aria-label={`${team.name} 的更多操作`}
            className={`-mt-1 shrink-0 ${dragging || recentlyImported ? 'text-textLabel' : 'text-chevron'}`}
            title={`${team.name} 的更多操作`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMenu();
            }}
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
        <MemberStrip team={team} />
        <CardFooter team={team} onShare={onShare} />
      </section>
    </>
  );
}

/**
 * 02-02's preset card — the shipped 伦琴猫 team on its first appearance: an amber filament
 * around the card, the single member blown up, and a direct 「接着补齐这支」. Once opened it
 * degrades to the ordinary card above (N02-15).
 */
export function PresetTeamCard({
  team,
  onOpen,
  onMenu,
  onDelete,
}: {
  team: Team;
  onOpen: () => void;
  onMenu: () => void;
  onDelete: () => void;
}) {
  const member = team.members[0];
  const form = member ? getMemberBattleForm(member) : undefined;
  const entry = member ? pokemon.find((item) => item.id === member.pokemonId) : undefined;
  const name = form?.chineseName ?? entry?.chineseName ?? '未配置宝可梦';

  return (
    <section
      aria-label={`队伍：${team.name}`}
      className="lk-preset-card relative overflow-hidden rounded-[20px] p-[18px]"
    >
      <span className="lk-preset-edge lk-preset-edge--top" aria-hidden="true" />
      <span className="lk-preset-edge lk-preset-edge--right" aria-hidden="true" />
      <span className="lk-preset-edge lk-preset-edge--bottom" aria-hidden="true" />
      <span className="lk-preset-edge lk-preset-edge--left" aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-btn1 px-[9px] text-[11px] font-extrabold tracking-[0.06em] text-textLabel">
            <Zap size={12} />
            预设
          </span>
          <h2 className="m-0 mt-2 truncate text-[20px] font-extrabold leading-7 tracking-[-0.01em]">{team.name}</h2>
          <p className="mt-[5px] text-[13px] font-semibold text-textSecondary">{team.members.length}/6 成员</p>
        </div>
        <button
          aria-label={`${team.name} 的更多操作`}
          className="shrink-0 text-chevron"
          title={`${team.name} 的更多操作`}
          type="button"
          onClick={onMenu}
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-[14px]">
        <span className="lk-well grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[18px] bg-sunken">
          <Sprite iconRef={form?.iconRef ?? entry?.iconRef} label={name} size={64} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[17px] font-extrabold tracking-[-0.01em]">{name}</span>
            {entry?.japaneseName && <span className="shrink-0 text-xs font-semibold text-textSecondary">{entry.japaneseName}</span>}
          </div>
          <div className="mt-[5px] flex items-center gap-2 text-[13px] font-semibold text-textSecondary">
            {(form?.types ?? entry?.types ?? []).map((type) => (
              <span key={type} className="inline-flex items-center gap-2">
                <TypeDot type={type} />
                {typeLabels[type]}
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {!member?.itemId && <PresetChip>道具待选</PresetChip>}
            {!hasStatPoints(team) && <PresetChip>SP 未分配</PresetChip>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2 border-t border-[var(--hairline)] pt-[14px]">
        <button
          className="lk-preset-cta inline-flex h-11 items-center justify-center gap-[7px] rounded-[14px] bg-accent text-sm font-extrabold text-page"
          type="button"
          onClick={onOpen}
        >
          <Pencil size={15} />
          接着补齐这支
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[14px] bg-btn1 px-[14px] text-sm font-bold text-textLabel"
          type="button"
          onClick={onDelete}
        >
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </section>
  );
}

function PresetChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-btn2 px-[9px] text-[11px] font-bold text-textSecondary">{children}</span>
  );
}

const hasStatPoints = (team: Team) =>
  team.members.some((member) => Object.values(member.statPoints ?? {}).some((value) => Number(value) > 0));
