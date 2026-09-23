import { Download, TriangleAlert, Unlink, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { abilities, currentDataVersion, currentRuleSet, items, moves } from '../data';
import { createId } from '../lib/id';
import { getMemberBattleForm } from '../lib/pokemonForms';
import { MAX_TOTAL_STAT_POINTS, statPointKeys, statPointLabels, statPointTotal } from '../lib/statPoints';
import { decodeTeamShare, type DecodedTeamShare } from '../lib/teamShare';
import type { Team, TeamMember } from '../types';
import { Sprite } from '../components/kit/Sprite';

const abilityName = (abilityId?: string) =>
  abilityId ? abilities.find((entry) => entry.id === abilityId)?.chineseName ?? abilityId : '未设置特性';

const itemName = (itemId?: string) => (itemId ? items.find((entry) => entry.id === itemId)?.chineseName ?? itemId : '无道具');

const moveName = (moveId: string) => moves.find((entry) => entry.id === moveId)?.chineseName ?? moveId;

const statSummary = (member: TeamMember) => {
  const total = statPointTotal(member.statPoints ?? {});
  const used = statPointKeys
    .filter((key) => Number(member.statPoints?.[key] ?? 0) > 0)
    .map((key) => `${statPointLabels[key]} ${member.statPoints?.[key]}`);
  return used.length > 0 ? `${used.join(' · ')} · 共 ${total}/${MAX_TOTAL_STAT_POINTS}` : `SP 未分配 · 0/${MAX_TOTAL_STAT_POINTS}`;
};

/**
 * Build the local team a share link becomes. Fresh ids, current rule/version stamps, and a
 * `share-link-import` source so the origin stays visible in a backup export.
 */
export const createTeamFromShare = (decoded: Pick<DecodedTeamShare, 'name' | 'members'>, sharedAt: string): Team => {
  const importedAt = new Date().toISOString();
  return {
    id: createId('team'),
    name: decoded.name,
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
    members: decoded.members,
    createdAt: importedAt,
    updatedAt: importedAt,
    notes: '',
    source: { kind: 'share-link-import', sharedAt, importedAt },
  };
};

function MemberRow({ member, index, divider }: { member: TeamMember; index: number; divider: boolean }) {
  const form = getMemberBattleForm(member);
  const name = form?.chineseName ?? `空位 ${index + 1}`;

  return (
    <li className={`flex items-start gap-3 py-3 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}>
      <Sprite iconRef={form?.iconRef} label={name} size={40} />
      <div className="min-w-0 flex-1 text-[11px] font-semibold text-textSecondary">
        <p className="truncate text-sm font-bold text-textPrimary">{name}</p>
        <p className="mt-[3px] truncate">
          {abilityName(member.abilityId)} · {itemName(member.itemId)} · {member.nature}
        </p>
        <p className="mt-0.5 truncate">{member.moveIds.length > 0 ? member.moveIds.map(moveName).join(' / ') : '未设置招式'}</p>
        <p className="mt-0.5 truncate">{statSummary(member)}</p>
      </div>
    </li>
  );
}

/** N08-11: three placeholder rows while the code is being decoded. */
function LoadingBody() {
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {[44, 38, 50].map((width) => (
        <div key={width} className="flex h-[68px] items-center gap-3">
          <span className="h-12 w-12 shrink-0 rounded-[14px] bg-textPrimary/[0.06]" />
          <span className="min-w-0 flex-1">
            <span className="block h-3.5 rounded-full bg-textPrimary/[0.09]" style={{ width: `${width}%` }} />
            <span className="mt-2 block h-3 w-3/5 rounded-full bg-textPrimary/[0.06]" />
          </span>
        </div>
      ))}
      <p className="mt-1 text-[13px] font-semibold text-textSecondary">读取中</p>
    </div>
  );
}

/** 08-10: the link itself is unusable, so there is nothing to preview — a whole screen, not a card. */
function ExpiredLink({ onClose, onGoToTeams }: { onClose: () => void; onGoToTeams: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);
  return (
    <div
      ref={dialogRef}
      aria-label="分享链接已失效"
      aria-modal="true"
      className="fixed inset-0 z-50 mx-auto max-w-[430px] overflow-y-auto bg-page outline-none"
      data-bottom-nav-lock="true"
      role="dialog"
      tabIndex={-1}
    >
      <div className="flex justify-end px-6 pt-5">
        <button aria-label="关闭分享的队伍" className="grid h-9 w-9 place-items-center rounded-full bg-surface text-textLabel" type="button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="px-6 pt-12">
        <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-surface text-textSecondary shadow-[inset_0_0_0_1px_var(--hairline)]">
          <Unlink size={22} />
        </span>
        <h1 className="mt-[22px] text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">链接已失效</h1>
        <p className="mt-2.5 text-[15px] font-semibold leading-[22px] text-textSecondary">
          分享链接把队伍数据写在地址里，被截断或对方改过队伍后就打不开了。
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            className="lk-btn-primary flex h-[50px] items-center justify-center rounded-2xl bg-accent text-base font-extrabold tracking-[-0.01em] text-page"
            type="button"
            onClick={onGoToTeams}
          >
            去我的队伍
          </button>
        </div>
        <p className="mt-[18px] text-xs font-semibold leading-[18px] text-textMuted">本机已有的队伍不受影响。</p>
      </div>
    </div>
  );
}

/**
 * The `#/t/<code>` screen: decode, show what the link contains, and only write to IndexedDB
 * when the viewer actually asks. Decoding happens here rather than in the router so a broken
 * link renders an explanation instead of a blank page.
 */
export function SharedTeamPreview({
  code,
  onClose,
  onImport,
  onGoToTeams,
}: {
  code: string;
  onClose: () => void;
  onImport: (team: Team) => Promise<void> | void;
  onGoToTeams: () => void;
}) {
  const [decoded, setDecoded] = useState<DecodedTeamShare | null>(null);
  const [failed, setFailed] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    setDecoded(null);
    setFailed(false);
    decodeTeamShare(code)
      .then((result) => {
        if (active) setDecoded(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [code]);

  const confirmImport = async () => {
    if (!decoded || importing) return;
    setImporting(true);
    try {
      await onImport(createTeamFromShare(decoded, new Date().toISOString()));
    } finally {
      setImporting(false);
    }
  };

  // Owned here, above the early return, so the hook order is the same whichever view renders.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose, !failed);

  if (failed) return <ExpiredLink onClose={onClose} onGoToTeams={onGoToTeams} />;

  const empty = decoded?.members.length === 0;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 mx-auto max-w-[430px] outline-none"
      role="dialog"
      aria-label="分享的队伍"
      aria-modal="true"
      data-bottom-nav-lock="true"
      tabIndex={-1}
    >
      <button className="lk-dialog-overlay absolute inset-0 h-full w-full" type="button" aria-label="关闭分享的队伍" onClick={onClose} />
      <section className="lk-panel absolute inset-x-4 top-1/2 max-h-[calc(100vh-2rem)] -translate-y-1/2 overflow-y-auto rounded-[20px] p-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">Shared team</p>
            {decoded ? (
              <h2 className="mt-1.5 text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{decoded.name}</h2>
            ) : (
              <span className="mt-2.5 block h-[22px] w-[150px] rounded-full bg-textPrimary/[0.09]" />
            )}
            {decoded && !empty && <p className="mt-1 text-xs font-semibold text-textSecondary">{decoded.members.length}/6 成员</p>}
            {!decoded && <span className="mt-2 block h-3 w-[76px] rounded-full bg-textPrimary/[0.06]" />}
          </div>
          <button
            aria-label="关闭分享的队伍"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-btn2 text-textLabel"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        {!decoded && <LoadingBody />}

        {empty && (
          <div className="pb-1.5 pt-[18px]">
            <p className="text-[17px] font-extrabold tracking-[-0.01em]">这份分享没有成员</p>
            <p className="mt-2 text-[13px] font-semibold leading-5 text-textSecondary">
              链接能打开，但里面一只宝可梦也没有。可以让对方补齐后重新分享。
            </p>
          </div>
        )}

        {decoded && !empty && (
          <ul className="mt-3.5 rounded-[14px] bg-sunken px-3">
            {decoded.members.map((member, index) => (
              <MemberRow key={member.id} divider={index < decoded.members.length - 1} index={index} member={member} />
            ))}
          </ul>
        )}

        {decoded && decoded.warnings.length > 0 && (
          <div className="mt-3 rounded-[14px] px-3.5 py-3" style={{ background: 'rgb(var(--color-data) / 0.1)' }}>
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-data">
              <TriangleAlert aria-hidden="true" size={14} />
              部分配置不在当前规则
            </p>
            <ul className="mt-2.5 flex flex-col gap-2">
              {decoded.warnings.map((warning) => (
                <li key={warning} className="flex gap-[9px] text-xs font-semibold leading-[18px] text-data">
                  <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full bg-data" />
                  <span className="min-w-0 flex-1">{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {decoded && (
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <button
              className={`flex h-11 items-center justify-center rounded-[14px] bg-btn2 text-[15px] font-bold ${importing ? 'text-textSecondary' : 'text-textLabel'}`}
              type="button"
              onClick={onClose}
            >
              关闭
            </button>
            <button
              className={`flex h-11 items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold ${
                importing ? 'bg-btn1 text-textLabel' : 'bg-accent text-page'
              }`}
              disabled={importing}
              type="button"
              onClick={() => void confirmImport()}
            >
              {importing ? '导入中' : <><Download size={16} />导入到我的队伍</>}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
