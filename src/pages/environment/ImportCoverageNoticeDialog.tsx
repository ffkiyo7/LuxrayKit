import { Import, X } from 'lucide-react';
import { useRef } from 'react';
import type { EnvironmentTeamSample } from '../../data/environment';
import { useDialogFocus } from '../../hooks/useDialogFocus';

const TEAM_SIZE = 6;

/**
 * 07-04 — what a sample actually carries, and the confirmation step every upper-build import
 * goes through: the card on 环境 首页, the 相关上位构筑 row on a Pokémon detail and the 上位构筑
 * list card all raise this one dialog. The frame lists only what is *missing* below the count
 * line, so a fully-covered sample shows the counts and nothing else.
 */
export function ImportCoverageNoticeDialog({
  sample,
  onCancel,
  onContinue,
}: {
  sample: EnvironmentTeamSample;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onCancel);
  const itemCount = sample.slots.filter((slot) => slot.itemId).length;
  const spreadCount = sample.slots.filter((slot) => Object.keys(slot.statPoints ?? {}).length > 0).length;
  const moveCount = sample.slots.filter((slot) => slot.moveIds.length > 0).length;
  const counts = [
    `宝可梦 ${sample.slots.length} / ${TEAM_SIZE}`,
    `道具 ${itemCount} / ${TEAM_SIZE}`,
    ...(spreadCount > 0 ? [`SP ${spreadCount} / ${TEAM_SIZE}`] : []),
    ...(moveCount > 0 ? [`配招 ${moveCount} / ${TEAM_SIZE}`] : []),
  ].join(' · ');

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 mx-auto max-w-[430px] outline-none"
      role="dialog"
      aria-label="导入确认"
      aria-modal="true"
      data-bottom-nav-lock="true"
      tabIndex={-1}
    >
      <button className="lk-sheet-overlay absolute inset-0 h-full w-full" type="button" aria-label="关闭导入确认" onClick={onCancel} />
      <section className="lk-sheet absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-[20px] p-[22px]">
        <div className="flex items-start gap-3">
          <h2 className="m-0 flex-1 text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">
            导入「{sample.title}」
          </h2>
          <button
            aria-label="关闭导入确认"
            className="-mr-1 -mt-0.5 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-btn1 text-textLabel"
            type="button"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-[21px] text-textLabel">这份样本可带入宝可梦、道具、SP 分配。</p>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-textLabel" />
            <span className="text-sm font-bold tabular-nums">{counts}</span>
          </div>
          {!sample.hasMoves && (
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-data" />
              <span className="text-sm font-bold text-data">配招未公开</span>
            </div>
          )}
          {!sample.replicaCode && (
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-disabled" />
              <span className="text-sm font-bold text-textSecondary">无队伍码</span>
            </div>
          )}
        </div>
        <div className="mt-[18px] h-px bg-[var(--hairline)]" />
        <button
          className="lk-env-slab mt-[18px] flex h-11 w-full items-center justify-center gap-[7px] rounded-[14px] bg-accent text-[15px] font-extrabold text-page"
          type="button"
          onClick={onContinue}
        >
          <Import aria-hidden="true" size={16} />
          继续导入
        </button>
      </section>
    </div>
  );
}
