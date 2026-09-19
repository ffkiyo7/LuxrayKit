import { BarChart3, Library, ShieldHalf, TriangleAlert } from 'lucide-react';
import { abilities, items, moves, pokemon } from '../../data';
import type { EnvironmentState } from '../../data/environment';
import { useAppStore } from '../../state/AppContext';
import { SectionLabel } from '../../components/kit/SectionLabel';
import { ProfileRow } from './ProfileRow';
import { SubPageHeader } from './SubPageHeader';

const updatedLabel = (iso?: string) =>
  iso
    ? `${new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))} 更新`
    : '随版本内置';

/** 离线缓存 (N08-10) — what is on the device, plus the last failed refresh when there was one. */
export function OfflineCachePage({
  environment,
  onBack,
  onOpenMethodology,
}: {
  environment: EnvironmentState | null;
  onBack: () => void;
  onOpenMethodology: () => void;
}) {
  const { lastRefreshError } = useAppStore();

  return (
    <div className="pb-7">
      <SubPageHeader subtitle="图鉴与环境快照缓存在本机，断网也能查" title="离线缓存" onBack={onBack} />

      <section className="px-6 pt-[22px]">
        <div className="rounded-[18px] bg-surface p-4">
          <p className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.01em]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
            已缓存
          </p>
          <p className="mt-2 text-[13px] font-semibold leading-5 text-textLabel">
            规则内图鉴、环境榜单与属性表都在本机。断网时这些页面照常打开，只有刷新需要网络。
          </p>
        </div>
      </section>

      <section className="px-6 pt-[26px]">
        <SectionLabel>缓存内容</SectionLabel>
        <div className="mt-1.5">
          <ProfileRow
            icon={<Library size={17} />}
            subtitle={`宝可梦 ${pokemon.length} · 招式 ${moves.length} · 道具 ${items.length} · 特性 ${abilities.length}`}
            tile="lk-tile--blue"
            title="规则内图鉴"
            trailing={null}
          />
          <ProfileRow
            icon={<BarChart3 size={17} />}
            subtitle={updatedLabel(environment?.updatedAt)}
            tile="lk-tile--teal"
            title="环境榜单"
            trailing={null}
          />
          <ProfileRow divider={false} icon={<ShieldHalf size={17} />} subtitle="随版本内置" tile="lk-tile--pink" title="属性表" trailing={null} />
        </div>
      </section>

      {lastRefreshError && (
        <section className="px-6 pt-[22px]">
          <div className="lk-panel rounded-[18px] p-4">
            <p className="flex items-center gap-2 text-[15px] font-extrabold text-danger">
              <TriangleAlert size={16} />
              上次刷新失败
            </p>
            <p className="mt-2 text-[13px] font-semibold leading-5 text-textLabel">{lastRefreshError}</p>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <button className="inline-flex h-11 items-center justify-center rounded-[14px] bg-btn1 px-4 text-sm font-bold text-textPrimary" type="button" onClick={onOpenMethodology}>
                看数据口径
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
