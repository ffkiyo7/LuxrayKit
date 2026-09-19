import { Trash2 } from 'lucide-react';
import { moves } from '../../../data';
import { statPointKeys } from '../../../lib/statPoints';
import type { Team, TeamMember } from '../../../types';
import { Sheet, Sprite } from '../../../components/kit';
import { SheetButton } from '../TeamDialogs';
import type { DraftChange } from './memberDraft';

/** N03-12 — the one interruption 返回 is allowed, and only when something is unsaved. */
export function DiscardChangesSheet({
  changes,
  onKeepEditing,
  onDiscard,
}: {
  changes: DraftChange[];
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <Sheet label="放弃改动确认" title="放弃改动？" onClose={onKeepEditing}>
      <p className="mt-2 text-sm leading-[21px] text-textLabel">下面 {changes.length} 项还没保存，返回后会回到保存前的配置。</p>
      <div className="mt-4 rounded-[14px] bg-sunken px-[14px] py-1">
        {changes.map((change, index) => (
          <div
            key={`${change.label}-${change.detail}`}
            className={`flex h-11 items-center gap-3 ${index < changes.length - 1 ? 'border-b border-[var(--hairline)]' : ''}`}
          >
            <span className="min-w-0 flex-1 text-sm font-semibold text-textLabel">{change.label}</span>
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-textSecondary">{change.detail}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <SheetButton onClick={onKeepEditing}>继续编辑</SheetButton>
        <SheetButton tone="danger" onClick={onDiscard}>
          放弃
        </SheetButton>
      </div>
    </Sheet>
  );
}

const statLabels: Record<string, string> = {
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  specialAttack: '特攻',
  specialDefense: '特防',
  speed: '速度',
};

/** 02-14's roster line: 「顺风 / 拍落 / 助攻 / 棉花孢子 · SP 速度 32 · HP 32」. */
const memberSummary = (member: TeamMember) => {
  const moveNames = member.moveIds
    .map((moveId) => moves.find((move) => move.id === moveId)?.chineseName)
    .filter(Boolean)
    .join(' / ');
  const invested = statPointKeys
    .filter((key) => Number(member.statPoints[key] ?? 0) > 0)
    .map((key, index) => `${index === 0 ? 'SP ' : ''}${statLabels[key]} ${member.statPoints[key]}`);
  return [moveNames, ...invested].filter(Boolean).join(' · ');
};

/** 02-14 — removing a member from the editor's 🗑 button. */
export function ConfirmRemoveMemberSheet({
  team,
  member,
  memberName,
  iconRef,
  onCancel,
  onConfirm,
}: {
  team: Team;
  member: TeamMember;
  memberName: string;
  iconRef?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const summary = memberSummary(member);

  return (
    <Sheet label="确认移除成员" title={`从队伍移除${memberName}`} onClose={onCancel}>
      <p className="mt-2 text-sm font-semibold leading-[21px] text-textLabel">
        这支队伍会变成 {team.members.length - 1}/6{team.replicaCode ? '，队伍码失效' : ''}。
      </p>
      <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-sunken p-[14px]">
        <Sprite iconRef={iconRef} label={memberName} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold tracking-[-0.01em]">{memberName}</span>
          {summary && <span className="mt-1 block text-xs font-semibold text-textSecondary">{summary}</span>}
        </span>
      </div>
      <p className="mt-2.5 text-xs font-semibold leading-[18px] text-textSecondary">招式与已投 SP 一并丢弃，道具回到未携带。</p>
      <div className="mt-[18px] grid grid-cols-2 gap-2.5">
        <SheetButton onClick={onCancel}>取消</SheetButton>
        <SheetButton tone="danger" onClick={onConfirm}>
          <Trash2 size={17} />
          移除成员
        </SheetButton>
      </div>
    </Sheet>
  );
}
