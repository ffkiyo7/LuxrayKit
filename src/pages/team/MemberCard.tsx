import { ChevronRight, ChevronUp, Plus } from 'lucide-react';
import { abilities, currentRuleNatureOptions, items, moves, pokemon } from '../../data';
import { memberBattleStats, memberLabel } from '../../lib/calculations';
import { getMemberBattleForm } from '../../lib/pokemonForms';
import { MAX_TOTAL_STAT_POINTS, statPointTotal } from '../../lib/statPoints';
import type { TeamMember } from '../../types';
import { auraStyle, Sprite, TypeDot } from '../../components/kit';
import { typeLabels } from '../../components/ui';

// The frames scale every stat bar against the same ceiling, so a 184 speed and a 112 HP stay
// comparable across the grid.
const STAT_BAR_CEILING = 220;

const statRows = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'specialAttack', label: '特攻' },
  { key: 'specialDefense', label: '特防' },
  { key: 'speed', label: '速度' },
] as const;

function StatCell({
  label,
  value,
  base,
  invested,
  marker,
}: {
  label: string;
  value: number;
  base: number;
  invested: boolean;
  marker: 'up' | 'down' | null;
}) {
  const basePercent = Math.min(100, (base / STAT_BAR_CEILING) * 100);
  const spPercent = Math.min(100 - basePercent, (Math.max(0, value - base) / STAT_BAR_CEILING) * 100);

  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-xs ${invested ? 'font-bold text-textPrimary' : 'font-semibold text-textSecondary'}`}>{label}</span>
        {marker && (
          <span className={`text-xs font-extrabold ${invested ? 'text-data' : 'lk-glyph-ink'}`}>{marker === 'up' ? '↑' : '↓'}</span>
        )}
        <span className="flex-1" />
        <span className="text-[20px] font-extrabold tracking-[-0.01em] tabular-nums">{value}</span>
      </div>
      <div className="lk-stat-track mt-[7px] flex h-1 gap-0.5 overflow-hidden rounded-full">
        <div className="lk-stat-fill" style={{ width: `${basePercent}%` }} />
        {spPercent > 0 && <div className="bg-data" style={{ width: `${spPercent}%` }} />}
      </div>
    </div>
  );
}

/**
 * 02-05 / 02-08 / N02-19 — the expanded member card. Its face is tinted with the member's own
 * type colours; the stat grid splits each bar into the base value and what SP added on top.
 */
export function ExpandedMemberCard({
  member,
  onCollapse,
  onEdit,
}: {
  member: TeamMember;
  onCollapse: () => void;
  onEdit: () => void;
}) {
  const entry = pokemon.find((item) => item.id === member.pokemonId);
  const form = getMemberBattleForm(member);
  const item = items.find((candidate) => candidate.id === member.itemId);
  const ability = abilities.find((candidate) => candidate.id === member.abilityId);
  const name = form?.chineseName ?? memberLabel(member);
  const types = form?.types ?? entry?.types ?? [];
  const stats = memberBattleStats(member);
  const baseStats = memberBattleStats({ ...member, statPoints: {} });
  const memberMoves = member.moveIds
    .map((moveId) => moves.find((move) => move.id === moveId))
    .filter((move): move is NonNullable<typeof move> => Boolean(move));
  const natureOption = currentRuleNatureOptions.find((candidate) => member.nature.includes(candidate.id));

  const natureMarker = (label: string): 'up' | 'down' | null => {
    if (!natureOption || natureOption.neutral) return null;
    if ((natureOption.up as readonly string[]).includes(label)) return 'up';
    if ((natureOption.down as readonly string[]).includes(label)) return 'down';
    return null;
  };

  return (
    <section
      aria-label={`${name} 配置`}
      className="lk-member-aura col-span-2 rounded-[20px] px-[18px] pt-[18px]"
      style={auraStyle(types)}
    >
      <div className="flex items-center gap-[14px]">
        <div className="relative h-[84px] w-[84px] shrink-0">
          <Sprite iconRef={form?.iconRef ?? entry?.iconRef} label={name} size={84} />
          {item?.iconRef && (
            <img
              alt={item.chineseName}
              className="lk-item-badge absolute -right-0.5 bottom-0 h-[27px] w-[27px] object-contain"
              src={item.iconRef}
              title={item.chineseName}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="m-0 text-[22px] font-extrabold leading-[26px] tracking-[-0.01em]">{name}</h2>
            {entry?.japaneseName && <span className="text-xs font-semibold text-textSecondary">{entry.japaneseName}</span>}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs font-bold tracking-[0.04em] text-textSecondary">
            {types.map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <TypeDot type={type} />
                {typeLabels[type]}
              </span>
            ))}
          </p>
          <p className="mt-[9px] text-xs font-semibold text-textLabel">
            {[ability?.chineseName ?? '未选特性', member.nature].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button aria-label={`收起 ${name}`} className="shrink-0 text-textSecondary" title="收起" type="button" onClick={onCollapse}>
          <ChevronUp size={20} />
        </button>
      </div>

      {/* Owner design 2026-09-19: the four moves as a 2×2 of chips; an unused slot stays blank. */}
      {memberMoves.length > 0 && (
        <ul aria-label={`${name} 的招式`} className="m-0 mt-4 grid list-none grid-cols-2 gap-2 p-0">
          {memberMoves.map((move) => (
            <li key={move.id} className="flex h-11 min-w-0 items-center gap-2.5 rounded-[14px] bg-btn2 px-3.5">
              <TypeDot type={move.type} />
              <span className="truncate text-[15px] font-bold">{move.chineseName}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-[18px] flex items-baseline justify-between">
        <p className="m-0 text-[13px] font-bold text-textLabel">能力值</p>
        <p className="m-0 inline-flex items-center gap-1.5 text-xs font-semibold text-textSecondary">
          <span className="h-[3px] w-4 rounded-full bg-data" aria-hidden="true" />
          已投 SP {statPointTotal(member.statPoints)}/{MAX_TOTAL_STAT_POINTS}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-[18px] gap-y-[14px]">
        {statRows.map((row) => (
          <StatCell
            key={row.key}
            base={baseStats[row.key]}
            invested={Number(member.statPoints[row.key] ?? 0) > 0}
            label={row.label}
            marker={natureMarker(row.label)}
            value={stats[row.key]}
          />
        ))}
      </div>

      <button
        className="lk-edit-entry mt-4 flex h-12 w-full items-center justify-center gap-[7px] border-t border-[var(--hairline-strong)] text-sm font-bold"
        type="button"
        onClick={onEdit}
      >
        编辑配置
        <ChevronRight size={17} />
      </button>
    </section>
  );
}

/** 02-05's compact member tile: sprite, name, types, held item. */
export function MemberTile({ member, onExpand }: { member: TeamMember; onExpand: () => void }) {
  const entry = pokemon.find((item) => item.id === member.pokemonId);
  const form = getMemberBattleForm(member);
  const item = items.find((candidate) => candidate.id === member.itemId);
  const name = form?.chineseName ?? memberLabel(member);
  const types = form?.types ?? entry?.types ?? [];

  return (
    <button
      aria-label={`展开 ${name}`}
      className="lk-card-face flex flex-col items-center rounded-[20px] p-4 text-center shadow-[shadow:var(--lk-card-shadow)]"
      type="button"
      onClick={onExpand}
    >
      <Sprite iconRef={form?.iconRef ?? entry?.iconRef} label={name} size={72} />
      <span className="mt-1.5 block w-full truncate text-[17px] font-bold tracking-[-0.01em]">{name}</span>
      <span className="mt-2 flex items-center justify-center gap-2.5 text-xs font-semibold text-textSecondary">
        {types.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <TypeDot size={7} type={type} />
            {typeLabels[type]}
          </span>
        ))}
      </span>
      <span className="mt-2.5 inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-textLabel">
        {item?.iconRef && <img alt="" className="h-4 w-4 shrink-0 object-contain" src={item.iconRef} />}
        <span className="truncate">{item?.chineseName ?? '未选道具'}</span>
      </span>
    </button>
  );
}

/** 02-07's empty slot — a sunken tile with a single 44px 「+」. */
export function EmptyMemberSlot({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      aria-label="添加成员"
      className="lk-slot grid min-h-[158px] place-items-center rounded-[20px] bg-sunken p-4"
      type="button"
      onClick={onAdd}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-btn1 text-textPrimary">
        <Plus size={20} />
      </span>
    </button>
  );
}
