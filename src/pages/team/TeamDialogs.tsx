import { Copy, CopyPlus, Import, Pencil, Share2, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { pokemon } from '../../data';
import { getMemberBattleForm } from '../../lib/pokemonForms';
import { canShareTeam, decodeTeamShare, type DecodedTeamShare } from '../../lib/teamShare';
import type { Team } from '../../types';
import { Sheet, Sprite } from '../../components/kit';
import { createTeamFromShare } from '../SharedTeamPreview';
import { TEAM_NAME_MAX_LENGTH } from './teamMeta';

/** The 50px sheet button pair the frames use for every confirm (02-10 / 02-11 / N02-17 / 02-14). */
export function SheetButton({
  children,
  tone = 'secondary',
  disabled,
  grow,
  onClick,
}: {
  children: ReactNode;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  grow?: boolean;
  onClick: () => void;
}) {
  const skin = disabled
    ? 'bg-btn1 text-btnDisabledInk'
    : tone === 'primary'
      ? 'lk-slab bg-accent font-extrabold text-page'
      : tone === 'danger'
        ? 'lk-danger-soft font-extrabold text-danger'
        : 'bg-btn1 font-bold text-textLabel';

  return (
    <button
      className={`inline-flex h-[50px] items-center justify-center gap-2 rounded-2xl px-5 text-base ${grow ? 'min-w-0 flex-1' : ''} ${
        disabled ? 'font-extrabold' : ''
      } ${skin}`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** 02-09 menu row — 60px, hairline-separated, icon + label. */
function MenuRow({
  icon,
  label,
  danger,
  last,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  last?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-[60px] w-full items-center gap-3 text-left ${last ? '' : 'border-b border-[var(--hairline)]'}`}
      type="button"
      onClick={onClick}
    >
      <span className={`shrink-0 ${danger ? 'text-danger' : 'text-textLabel'}`}>{icon}</span>
      <span className={`min-w-0 flex-1 text-base font-bold tracking-[-0.01em] ${danger ? 'text-danger' : 'text-textPrimary'}`}>{label}</span>
    </button>
  );
}

/**
 * 02-09 — one menu for both the list card and the detail page; 分享链接 only appears where the
 * team can actually be shared (6/6). 02-04 draws the list variant as an anchored popover; it is
 * rendered as this same sheet so the two cannot drift apart.
 */
export function TeamMenuSheet({
  team,
  showShare,
  onRename,
  onCopyReplicaCode,
  onShare,
  onDuplicate,
  onDelete,
  onClose,
}: {
  team: Team;
  showShare: boolean;
  onRename: () => void;
  onCopyReplicaCode: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={`${team.name} 的更多操作`} title={team.name} onClose={onClose}>
      <div className="mt-3">
        <MenuRow icon={<Pencil size={18} />} label="重命名" onClick={onRename} />
        {team.replicaCode && <MenuRow icon={<Copy size={18} />} label="复制队伍码" onClick={onCopyReplicaCode} />}
        {showShare && canShareTeam(team) && <MenuRow icon={<Share2 size={18} />} label="分享链接" onClick={onShare} />}
        <MenuRow icon={<CopyPlus size={18} />} label="复制为新队伍" onClick={onDuplicate} />
        <MenuRow danger last icon={<Trash2 size={18} />} label="删除队伍" onClick={onDelete} />
      </div>
    </Sheet>
  );
}

/** 02-10 (rename) and N02-17 (create) share one field; only the copy and the CTA differ. */
export function TeamNameSheet({
  mode,
  draft,
  onDraftChange,
  onConfirm,
  onClose,
}: {
  mode: 'create' | 'rename';
  draft: string;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const create = mode === 'create';
  const title = create ? '新建队伍' : '重命名队伍';

  return (
    <Sheet title={title} onClose={onClose}>
      {create && <p className="mt-1.5 text-xs font-semibold text-textSecondary">起个名字，之后可以随时改</p>}
      <div className="lk-field-on mt-4 flex h-[52px] items-center gap-2.5 rounded-[14px] bg-sunken pl-[14px] pr-1.5">
        <input
          aria-label="队伍名称"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-base font-bold caret-textPrimary outline-none"
          maxLength={TEAM_NAME_MAX_LENGTH}
          type="text"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) onConfirm();
          }}
        />
        {create ? (
          draft.length > 0 && (
            <button
              aria-label="清除队伍名称"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-btn1 text-textLabel"
              type="button"
              onClick={() => onDraftChange('')}
            >
              <X size={15} />
            </button>
          )
        ) : (
          <span className="shrink-0 pr-2 text-xs font-bold text-chevron tabular-nums">
            {draft.length} / {TEAM_NAME_MAX_LENGTH}
          </span>
        )}
      </div>
      {create && (
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-textSecondary">最多 {TEAM_NAME_MAX_LENGTH} 字</span>
          <span className="text-xs font-bold text-textSecondary tabular-nums">
            {draft.length} / {TEAM_NAME_MAX_LENGTH}
          </span>
        </div>
      )}
      <div className="mt-[18px] grid grid-cols-2 gap-2.5">
        <SheetButton onClick={onClose}>取消</SheetButton>
        <SheetButton disabled={!draft.trim()} tone="primary" onClick={onConfirm}>
          {create ? '建立' : '保存'}
        </SheetButton>
      </div>
    </Sheet>
  );
}

/** 02-11 — delete confirmation, with the roster it is about to take with it. */
export function ConfirmDeleteTeamSheet({
  team,
  onCancel,
  onConfirm,
}: {
  team: Team;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet label="确认删除队伍" title={`删除「${team.name}」`} onClose={onCancel}>
      <p className="mt-2 text-sm leading-[21px] text-textLabel">删除后无法恢复。</p>
      {team.members.length > 0 && (
        <div className="mt-4 flex items-center gap-0.5 rounded-[14px] bg-sunken px-[14px] py-3">
          {team.members.slice(0, 6).map((member) => {
            const form = getMemberBattleForm(member);
            const entry = pokemon.find((item) => item.id === member.pokemonId);
            return (
              <Sprite
                key={member.id}
                iconRef={form?.iconRef ?? entry?.iconRef}
                label={form?.chineseName ?? entry?.chineseName ?? '未配置宝可梦'}
                size={36}
              />
            );
          })}
          <span className="flex-1" />
          <span className="shrink-0 text-xs font-bold text-chevron">{team.members.length} 成员</span>
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <SheetButton onClick={onCancel}>取消</SheetButton>
        <SheetButton tone="danger" onClick={onConfirm}>
          <Trash2 size={17} />
          删除
        </SheetButton>
      </div>
    </Sheet>
  );
}

// A pasted value is either a whole share URL or the bare code; both end at the last `/t/`.
const shareCodeFromInput = (value: string) => {
  const trimmed = value.trim();
  const marker = trimmed.lastIndexOf('/t/');
  return (marker >= 0 ? trimmed.slice(marker + 3) : trimmed).replace(/^#\/?/, '').split(/[?#\s]/)[0];
};

/**
 * N02-21 / 02-12 / 02-13 — paste a share link or share code. The sheet decodes as you type so
 * the roster it found is visible before anything is written to IndexedDB.
 */
export function ImportShareSheet({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (team: Team) => Promise<void> | void;
}) {
  const [value, setValue] = useState('');
  const [decoded, setDecoded] = useState<DecodedTeamShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const requestRef = useRef(0);

  const code = shareCodeFromInput(value);

  useEffect(() => {
    setDecoded(null);
    setError(null);
    if (!code) {
      setReading(false);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setReading(true);
    // Decoding inflates and re-validates every id, so debounce it rather than running it on
    // each keystroke of a pasted 200-character code.
    const timeoutId = window.setTimeout(() => {
      decodeTeamShare(code)
        .then((result) => {
          if (requestRef.current !== request) return;
          setDecoded(result);
          setReading(false);
        })
        .catch((decodeError: unknown) => {
          if (requestRef.current !== request) return;
          setError(decodeError instanceof Error ? decodeError.message : '查不到这个分享码。');
          setReading(false);
        });
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [code]);

  const firstMember = decoded?.members.find((member) => member.pokemonId);
  const firstForm = firstMember ? getMemberBattleForm(firstMember) : undefined;

  return (
    <Sheet title="粘贴分享链接 / 分享码" onClose={onClose}>
      <div
        className={`mt-4 flex h-[52px] items-center gap-2.5 rounded-[14px] bg-sunken pl-[14px] pr-3.5 ${
          error ? 'shadow-[inset_0_0_0_1.5px_rgb(var(--color-danger))]' : 'lk-field-on'
        }`}
      >
        <input
          aria-label="分享链接或分享码"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-base font-bold tracking-[0.08em] caret-textPrimary outline-none tabular-nums placeholder:tracking-normal placeholder:text-textSecondary"
          placeholder="#/t/…"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {value.length > 0 && (
          <button
            aria-label="清除分享链接"
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-btn1 text-textLabel"
            type="button"
            onClick={() => setValue('')}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {reading && (
        <div className="mt-[14px] flex h-[68px] items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-btnDisabledInk">读取中</span>
            <span className="mt-2.5 block h-[14px] rounded-full bg-btn1" />
          </span>
        </div>
      )}

      {error && (
        <>
          <p className="mt-2.5 text-[13px] font-bold leading-[18px] text-danger">查不到这个分享码。</p>
          <p className="mt-1 text-xs font-semibold leading-[18px] text-textSecondary">{error}</p>
        </>
      )}

      {decoded && (
        <div className="lk-chip mt-3 flex items-center gap-3 rounded-[14px] p-[14px]">
          <Sprite iconRef={firstForm?.iconRef} label={decoded.name} size={36} />
          <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
            识别到 {decoded.members.length} 个成员 · {decoded.name}
          </span>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <SheetButton onClick={onClose}>取消</SheetButton>
        <SheetButton
          disabled={!decoded}
          tone="primary"
          onClick={() => {
            if (!decoded) return;
            void onImport(createTeamFromShare(decoded, new Date().toISOString()));
          }}
        >
          <Import size={17} />
          导入
        </SheetButton>
      </div>
    </Sheet>
  );
}
