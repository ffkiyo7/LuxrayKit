import { ChevronUp, Edit3, Gauge, Info, Swords, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { abilities, currentRuleNatureOptions, items, moves, pokemon } from '../../data';
import { memberBattleStats, memberLabel } from '../../lib/calculations';
import { getMemberBattleForm } from '../../lib/pokemonForms';
import { MAX_TOTAL_STAT_POINTS, statPointTotal } from '../../lib/statPoints';
import type { TeamMember } from '../../types';
import { Card, Chip, PokemonAvatar, TypeBadge } from '../../components/ui';
import { HeldItemLine } from './HeldItem';

export function MemberCard({
  member,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onOpenSpeed,
  onOpenCalculator,
}: {
  member: TeamMember;
  expanded: boolean;
  onToggle: (memberId: string) => void;
  onEdit: (member: TeamMember) => void;
  onDelete: (memberId: string) => void | Promise<void>;
  onOpenSpeed: (memberId: string) => void;
  onOpenCalculator: (memberId: string, side: 'attacker' | 'defender') => void;
}) {
  const [showStatsHint, setShowStatsHint] = useState(false);
  const [calcSidePrompt, setCalcSidePrompt] = useState(false);
  const entry = pokemon.find((item) => item.id === member.pokemonId);
  const battleForm = getMemberBattleForm(member);
  const item = items.find((candidate) => candidate.id === member.itemId);
  const ability = abilities.find((candidate) => candidate.id === member.abilityId);
  const learnedMoves = member.moveIds.map((id) => moves.find((move) => move.id === id)?.chineseName).filter(Boolean);
  const battleStats = memberBattleStats(member);
  const natureOption = currentRuleNatureOptions.find((candidate) => member.nature.includes(candidate.id));
  const statDisplayRows = [
    { key: 'hp', label: 'HP', value: battleStats.hp, sp: member.statPoints.hp ?? 0 },
    { key: 'attack', label: '攻击', value: battleStats.attack, sp: member.statPoints.attack ?? 0 },
    { key: 'defense', label: '防御', value: battleStats.defense, sp: member.statPoints.defense ?? 0 },
    { key: 'specialAttack', label: '特攻', value: battleStats.specialAttack, sp: member.statPoints.specialAttack ?? 0 },
    { key: 'specialDefense', label: '特防', value: battleStats.specialDefense, sp: member.statPoints.specialDefense ?? 0 },
    { key: 'speed', label: '速度', value: battleStats.speed, sp: member.statPoints.speed ?? 0 },
  ] as const;
  const natureMarker = (label: string) => {
    if (!natureOption || natureOption.neutral) return null;
    if ((natureOption.up as readonly string[]).includes(label)) return <span className="text-danger">↑</span>;
    if ((natureOption.down as readonly string[]).includes(label)) return <span className="text-accent">↓</span>;
    return null;
  };

  return (
    <Card className={`relative ${expanded ? 'col-span-2' : 'min-h-[136px]'} bg-card`}>
      {!expanded && (
        <button
          className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-lg text-textMuted active:scale-[0.98]"
          title="删除成员"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onDelete(member.id);
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
      <button className="block w-full text-left" onClick={() => onToggle(member.id)}>
        <div className={expanded ? 'flex gap-3' : 'flex flex-col items-center text-center'}>
          <div className={`${expanded ? '' : 'mb-2'} shrink-0`}>
            <PokemonAvatar iconRef={battleForm?.iconRef ?? entry?.iconRef} label={battleForm?.chineseName ?? entry?.chineseName ?? '未配置 Pokemon'} size={expanded ? 'md' : 'xl'} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`${expanded ? 'mb-1 justify-start' : 'mb-1 justify-center'} flex flex-wrap items-center gap-1.5`}>
              <h3 className="truncate text-sm font-semibold">{battleForm?.chineseName ?? memberLabel(member)}</h3>
              {expanded &&
                battleForm?.types.map((type) => (
                  <TypeBadge key={type} type={type} size="sm" />
                ))}
            </div>
            {!expanded && (
              <div className="mt-2 flex min-h-5 justify-center gap-1">
                {battleForm?.types.map((type) => (
                  <TypeBadge key={type} type={type} size="sm" />
                ))}
              </div>
            )}
            {!expanded && <HeldItemLine item={item} className="mx-auto mt-2 max-w-[120px] justify-center text-[11px]" />}
            {expanded && (
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-textSecondary">
                <HeldItemLine item={item} className="min-w-0 max-w-[140px]" />
                <span className="shrink-0">·</span>
                <span className="truncate">{ability?.chineseName ?? '未选特性'}</span>
              </p>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-textSecondary">
                <span>性格</span>
                <span className="font-semibold text-textPrimary">{member.nature}</span>
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto pb-1 hide-scrollbar">
                {(learnedMoves.length ? learnedMoves : ['未配置招式']).map((move) => (
                  <Chip key={move}>{move}</Chip>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="grid h-8 w-8 place-items-center rounded-lg text-textMuted" title="编辑成员" onClick={() => onEdit(member)}>
                <Edit3 size={15} />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-textMuted" title="收起成员" onClick={() => onToggle(member.id)}>
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          {battleForm && (
            <>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold text-textSecondary">能力值 / SP</p>
                  <button
                    type="button"
                    aria-label="能力值与 SP 说明"
                    aria-expanded={showStatsHint}
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-border text-textMuted"
                    onClick={() => setShowStatsHint((value) => !value)}
                  >
                    <Info size={10} />
                  </button>
                </div>
                <p className="text-[11px] text-textMuted">Lv.50 · 已用 {statPointTotal(member.statPoints)}/{MAX_TOTAL_STAT_POINTS}</p>
              </div>
              {showStatsHint && (
                <p className="mt-1 rounded-lg bg-elevated p-2 text-[11px] leading-5 text-textMuted">
                  左侧为当前能力值，右侧为该项 SP；性格修正用箭头标记。
                </p>
              )}
              <button
                className="mt-1.5 w-full rounded-lg border border-border bg-elevated p-2 text-left active:scale-[0.99]"
                type="button"
                onClick={() => onEdit(member)}
              >
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {statDisplayRows.map((row) => (
                    <div key={row.key} className="grid grid-cols-[34px_1fr_36px_26px] items-center gap-1.5 text-[11px]">
                      <span className="flex items-center gap-0.5 text-textSecondary">
                        {row.label}
                        {natureMarker(row.label)}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-border">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (row.value / 220) * 100)}%` }} />
                      </span>
                      <span className="text-right font-semibold text-textPrimary">{row.value}</span>
                      <span className={`text-right font-semibold ${row.sp > 0 ? 'text-warning' : 'text-textMuted'}`}>{row.sp}</span>
                    </div>
                  ))}
                </div>
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-textSecondary active:scale-[0.98]"
                  onClick={() => onOpenSpeed(member.id)}
                >
                  <Gauge size={13} className="text-accent" /> 速度线
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-textSecondary active:scale-[0.98]"
                  onClick={() => setCalcSidePrompt(true)}
                >
                  <Swords size={13} className="text-accent" /> 伤害计算
                </button>
              </div>
            </>
          )}
        </>
      )}
      {calcSidePrompt && (
        <div className="fixed inset-0 z-40 mx-auto flex max-w-[430px] items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="选择计算角色">
          <button className="absolute inset-0 h-full w-full bg-overlay/70" type="button" aria-label="取消" onClick={() => setCalcSidePrompt(false)} />
          <div className="relative w-full rounded-2xl border border-border bg-card p-4 shadow-xl">
            <p className="text-sm font-semibold">代入伤害计算</p>
            <p className="mt-1 text-xs text-textSecondary">{battleForm?.chineseName ?? memberLabel(member)} 作为哪一方？</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-page active:scale-[0.98]"
                onClick={() => { setCalcSidePrompt(false); onOpenCalculator(member.id, 'attacker'); }}
              >
                进攻方
              </button>
              <button
                type="button"
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm font-semibold text-textPrimary active:scale-[0.98]"
                onClick={() => { setCalcSidePrompt(false); onOpenCalculator(member.id, 'defender'); }}
              >
                防守方
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
