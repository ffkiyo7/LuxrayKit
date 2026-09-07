import { Trash2 } from 'lucide-react';
import { pokemon } from '../../data';
import { useVisualViewportMetrics } from '../../hooks/useVisualViewportMetrics';
import type { Team } from '../../types';
import { Button, PokemonAvatar } from '../../components/ui';

export function ConfirmDeleteTeamDialog({
  team,
  onCancel,
  onConfirm,
}: {
  team: Team;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[430px]" role="dialog" aria-label="确认删除队伍">
      <div className="absolute inset-0 bg-overlay/70" onClick={onCancel} />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl border border-danger/45 bg-card p-4 shadow-[0_18px_48px_rgb(0_0_0/0.45)]">
        <h3 className="text-base font-semibold text-danger">删除队伍？</h3>
        <p className="mt-2 text-sm text-textSecondary">确定删除「{team.name}」吗？此操作不能撤销。</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="danger" onClick={onConfirm}>
            <Trash2 size={14} />
            确认删除
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TeamNameModal({
  open,
  isRename,
  draft,
  onDraftChange,
  onConfirm,
  onClose,
}: {
  open: boolean;
  isRename: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const viewport = useVisualViewportMetrics(open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 mx-auto max-w-[430px]">
      <div className="absolute inset-0 bg-overlay/60" onClick={onClose} />
      <div
        className="absolute inset-x-0 flex flex-col gap-3 overflow-y-auto rounded-t-xl bg-card p-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
        style={{
          bottom: `${viewport.bottomInset}px`,
          maxHeight: `${Math.round(viewport.height * 0.92)}px`,
        }}
      >
        <h3 className="text-sm font-semibold">{isRename ? '编辑队伍名称' : '新建队伍'}</h3>
        <input
          autoFocus
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-textPrimary outline-none placeholder:text-textMuted"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={onConfirm} disabled={!draft.trim()}>确认</Button>
        </div>
      </div>
    </div>
  );
}

export function LuxrayEasterEggDialog({ onClose }: { onClose: () => void }) {
  const luxray = pokemon.find((entry) => entry.id === 'luxray');

  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[430px]" role="dialog" aria-label="Luxray test 彩蛋" data-bottom-nav-lock="true">
      <div className="absolute inset-0 bg-overlay/70" onClick={onClose} />
      <section className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl border border-accent/45 bg-card p-4 shadow-[0_18px_48px_rgb(0_0_0/0.45)]">
        <div className="flex items-center gap-3">
          <PokemonAvatar iconRef={luxray?.iconRef} label="伦琴猫" size="xl" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Luxray test</p>
            <h3 className="mt-1 text-lg font-semibold">隐藏调试队已接通</h3>
            <p className="mt-1 text-xs leading-5 text-textSecondary">这支初始队伍只保留伦琴猫。它负责照亮配置页，也提醒你：真正重要的队伍，可以从一只喜欢的 Pokémon 开始。</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs font-semibold text-textPrimary">启动读数</p>
          <p className="mt-1 text-xs text-textSecondary">威吓在线 · 磁铁校准 · 疯狂伏特待命</p>
        </div>
        <Button className="mt-4 w-full" onClick={onClose}>
          继续编辑
        </Button>
      </section>
    </div>
  );
}
