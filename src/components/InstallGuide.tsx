import {
  BadgeCheck,
  BarChart3,
  Check,
  Download,
  MoreVertical,
  Share,
  Smartphone,
  Sparkles,
  SquarePlus,
  UserCircle,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { productName } from '../branding';
import {
  detectPlatform,
  isIosSafari,
  isStandalone,
  promptInstall,
  useInstallPromptAvailable,
  type InstallPlatform,
} from '../lib/pwa';
import { Button } from './ui';

type InstallStep = {
  icon: LucideIcon;
  text: string;
};

const installWhy = [
  '全屏沉浸，没有浏览器地址栏占位',
  '桌面图标一点即开，像原生 App',
  '本地缓存离线可用，数据只存在你的设备',
];

const featureHighlights: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: BarChart3,
    title: '环境速览',
    description: '当季使用排名、招式 / 道具真实占比，配上上位构筑样本，一键导入到自己的队伍。',
  },
  {
    icon: Users,
    title: '队伍配置',
    description: '本地搭建并编辑队伍，自动做合法性校验，还能生成一张可分享的队伍图。',
  },
  {
    icon: Wrench,
    title: '对战工具',
    description: 'Gen9 伤害计算器与规则内图鉴，随时查招式、特性、种族值与属性克制。',
  },
  {
    icon: UserCircle,
    title: '个性与备份',
    description: '深色 / 浅色主题切换，本地备份导入导出，离线也能照常使用。',
  },
];

const platformStepsMap: Record<InstallPlatform, InstallStep[]> = {
  ios: [
    { icon: Share, text: '点按 Safari 底部工具栏的「分享」按钮' },
    { icon: SquarePlus, text: '在菜单里向下找到并选择「添加到主屏幕」' },
    { icon: Check, text: '点右上角「添加」，回到桌面即可打开' },
  ],
  android: [
    { icon: MoreVertical, text: '点按浏览器右上角的菜单（⋮）' },
    { icon: Download, text: '选择「安装应用」或「添加到主屏幕」' },
    { icon: Check, text: '确认后桌面会出现 LuxrayKit 图标' },
  ],
  desktop: [
    { icon: Download, text: '点击地址栏右侧的「安装」图标' },
    { icon: MoreVertical, text: '或打开浏览器菜单 →「安装 LuxrayKit」' },
    { icon: Check, text: '安装后可从任务栏 / 启动台直接打开' },
  ],
  other: [
    { icon: MoreVertical, text: '打开当前浏览器的菜单' },
    { icon: SquarePlus, text: '选择「添加到主屏幕」或「安装应用」' },
    { icon: Check, text: '完成后即可从桌面独立打开' },
  ],
};

const iosOtherBrowserSteps: InstallStep[] = [
  { icon: Share, text: '点按浏览器的「分享」按钮，再选择「在 Safari 中打开」' },
  { icon: SquarePlus, text: '在 Safari 中再次打开分享菜单，选择「添加到主屏幕」' },
  { icon: Check, text: '点右上角「添加」，回到桌面即可打开' },
];

const platformHint: Record<InstallPlatform, string> = {
  ios: 'iPhone / iPad · Safari',
  android: 'Android · Chrome',
  desktop: '桌面浏览器',
  other: '当前浏览器',
};

export function InstallGuide({ onDismiss }: { onDismiss: () => void }) {
  const platform = useMemo(detectPlatform, []);
  const iosSafari = useMemo(isIosSafari, []);
  const standalone = useMemo(isStandalone, []);
  const promptAvailable = useInstallPromptAvailable();
  const steps = platform === 'ios' && !iosSafari ? iosOtherBrowserSteps : platformStepsMap[platform];

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') onDismiss();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="安装与上手指引"
      data-bottom-nav-lock="true"
      className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col bg-page"
    >
      <div className="flex items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-textSecondary">
          <Sparkles size={12} className="text-accent" />
          欢迎
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-textSecondary active:scale-[0.98]"
          onClick={onDismiss}
        >
          稍后再说
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-3">
        <header className="flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-card">
            <img src="/icon.svg" alt="" aria-hidden="true" className="h-10 w-10" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight">欢迎使用 {productName}</h2>
            <p className="mt-0.5 text-xs text-textSecondary">Pokémon Champions 对战助手 · 把它装到桌面体验最好</p>
          </div>
        </header>

        <section className="surface-shadow rounded-xl border border-accent/40 bg-gradient-to-b from-accent/10 to-card p-4">
          {standalone ? (
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
                <BadgeCheck size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">已经在 App 模式运行</h3>
                <p className="mt-1 text-xs leading-5 text-textSecondary">
                  你已经把 {productName} 添加到主屏幕了，现在正以独立窗口运行。下面是快速上手指引。
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                  <Smartphone size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">添加到主屏幕，像 App 一样用</h3>
                  <p className="text-[11px] text-textMuted">
                    {platform === 'ios' && !iosSafari ? 'iPhone / iPad · 请使用 Safari 安装' : platformHint[platform]}
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1.5">
                {installWhy.map((reason) => (
                  <li key={reason} className="flex items-start gap-2 text-xs leading-5 text-textSecondary">
                    <Check size={14} className="mt-0.5 shrink-0 text-accent" />
                    {reason}
                  </li>
                ))}
              </ul>

              {promptAvailable ? (
                <div className="mt-4 space-y-2">
                  <Button className="w-full" onClick={handleInstall}>
                    <Download size={14} />
                    一键添加到主屏幕
                  </Button>
                  <p className="text-center text-[11px] text-textMuted">浏览器会弹出确认窗口，点「安装」即可</p>
                </div>
              ) : (
                <ol className="mt-4 space-y-2">
                  {steps.map((step, index) => {
                    const StepIcon = step.icon;
                    return (
                      <li key={step.text} className="flex items-center gap-3 rounded-lg border border-border bg-secondary p-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                          {index + 1}
                        </span>
                        <span className="flex-1 text-xs leading-5 text-textSecondary">{step.text}</span>
                        <StepIcon size={16} className="shrink-0 text-textSecondary" />
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-textMuted">你可以用它做这些</h3>
          <div className="grid gap-2">
            {featureHighlights.map(({ icon: Icon, title, description }) => (
              <div key={title} className="surface-shadow flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-textSecondary">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="border-t border-divider bg-page/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Button className="h-11 w-full text-sm" onClick={onDismiss}>
          开始使用
        </Button>
      </div>
    </div>
  );
}
