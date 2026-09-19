import { TriangleAlert } from 'lucide-react';
import { KitButton } from '../components/kit/KitButton';

// ── Loading / failure (01-07, 01-08) ──

export function EnvironmentLoadingView() {
  return (
    <div className="px-6 pt-11">
      <h1 className="text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">今日环境</h1>
      <p className="mt-1.5 text-[13px] leading-[18px] text-textSecondary">正在载入环境数据</p>
      <div className="lk-env-skeleton mt-5 h-[200px] rounded-[20px]" />
      <div className="mt-5 h-11 rounded-xl bg-surface" />
      <div className="mt-7 flex items-center justify-between">
        <div className="lk-env-skeleton h-5 w-[88px] rounded-full" />
        <div className="lk-env-skeleton h-3.5 w-14 rounded-full" />
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex h-[68px] items-center gap-3.5 border-b border-[var(--hairline)]">
          <div className="lk-env-skeleton h-4 w-6 rounded-full" />
          <div className="lk-env-skeleton h-12 w-12 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="lk-env-skeleton h-4 w-[120px] rounded-full" />
            <div className="lk-env-skeleton mt-2 h-[11px] w-[72px] rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EnvironmentErrorView({ onRetry, onOpenTeams }: { onRetry: () => void; onOpenTeams: () => void }) {
  return (
    <div>
      <div className="px-6 pt-11">
        <h1 className="text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">今日环境</h1>
      </div>
      <div className="px-6 pt-14">
        <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-danger/[0.14] text-danger shadow-[inset_0_0_0_1.5px_rgb(var(--color-danger)/0.35)]">
          <TriangleAlert size={22} />
        </span>
        <h2 className="mt-[22px] text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">环境数据没载入</h2>
        <p className="mt-2.5 text-[15px] font-semibold leading-[22px] text-textSecondary">
          本机没有可用的环境数据。连上网络后重试即可，队伍与本地数据不受影响。
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <KitButton height={50} variant="primary" onClick={onRetry}>
            重试
          </KitButton>
          <KitButton height={50} onClick={onOpenTeams}>
            先去我的队伍
          </KitButton>
        </div>
      </div>
    </div>
  );
}
