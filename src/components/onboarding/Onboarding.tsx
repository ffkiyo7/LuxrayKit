import { Bug, Check, Lightbulb, MessageCircle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Diorama } from './Diorama';
import type { DioramaScene } from './Diorama';

/* OnboardingFlow — LuxrayKit 首次启动引导（5 屏，聚焦产品价值与核心功能）。
   全部由设计系统的图示与版面拼装：OnboardingSlide、Diorama、BottomCTA。
   「添加到主屏幕」已移出首启引导，改为「我的」里的独立帮助页。所有文案为简体中文。 */

const TOTAL = 5;
const stepLabel = (i: number) => `第 ${i + 1} 步 / 共 ${TOTAL} 步`;

type Slide = {
  scene: DioramaScene;
  title: string;
  body: string;
  custom?: 'feedback';
  maxH: number;
};

const SLIDES: Slide[] = [
  {
    scene: 'environment',
    title: '看懂当前对战环境',
    body: '打开就是环境榜：谁在用、带什么、配什么队，一目了然。',
    maxH: 320,
  },
  {
    scene: 'dex',
    title: '图鉴随查，一搜即达',
    body: 'Pokémon、招式、道具、特性都能查，按属性筛选更快。',
    maxH: 320,
  },
  {
    scene: 'detail',
    title: '每一项数据都看得清',
    body: '点进详情，常用招式与携带道具的使用占比一目了然。数据为上位构筑快照，非官方使用率。',
    maxH: 320,
  },
  {
    scene: 'team',
    title: '搭配并管理你的队伍',
    body: '在「队伍」里编辑成员、能力值与配招，全部存在本地。',
    maxH: 320,
  },
  {
    scene: 'feedback',
    title: '一起把 LuxrayKit 做得更好',
    custom: 'feedback',
    body: '有问题或新想法？随手告诉我们。',
    maxH: 240,
  },
];

/* --- progress dots: the active dot stretches into an accent pill ---------- */
function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div role="tablist" aria-label="引导进度" className="flex items-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} role="tab" aria-selected={i === active} className="lk-progress-dot" data-active={i === active} />
      ))}
    </div>
  );
}

/* --- the layout scaffold for one full-screen onboarding step -------------- */
function OnboardingSlide({
  eyebrow,
  title,
  body,
  illustration,
  illustrationMaxH = 300,
}: {
  eyebrow: string;
  title: string;
  body: ReactNode;
  illustration: ReactNode;
  illustrationMaxH?: number;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* illustration area (flex-basis 0 so it never pushes the title) */}
      <div className="flex min-h-[140px] flex-1 items-center justify-center px-4 pb-2 pt-5">
        <div className="flex h-full w-full items-center justify-center" style={{ maxHeight: illustrationMaxH }}>
          {illustration}
        </div>
      </div>
      {/* step label · headline · body copy */}
      <div className="flex-none px-4 pb-2 text-center">
        <div className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-accent">{eyebrow}</div>
        <h2 className="m-0 text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-textPrimary [text-wrap:balance]">{title}</h2>
        <div className="mx-auto mt-3 max-w-[330px] text-[15px] leading-normal text-textSecondary [text-wrap:pretty]">{body}</div>
      </div>
    </div>
  );
}

/* --- sticky bottom action region ------------------------------------------ */
function BottomCTA({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  count,
  active,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  count: number;
  active: number;
}) {
  return (
    <div
      className="flex flex-none flex-col items-center gap-4 px-4 pt-4"
      style={{
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(0deg, rgb(var(--color-page)) 62%, transparent)',
      }}
    >
      <ProgressDots count={count} active={active} />
      <button
        type="button"
        onClick={onPrimary}
        className="flex h-12 w-full items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-page transition active:scale-[0.98]"
      >
        {primaryLabel}
      </button>
      <button type="button" onClick={onSecondary} className="px-3 py-1 text-sm font-medium text-textSecondary">
        {secondaryLabel}
      </button>
    </div>
  );
}

/* --- feedback: a lightweight entry hint, not a full form ------------------ */
const KINDS = [
  { icon: Bug, label: '反馈问题' },
  { icon: Lightbulb, label: '功能建议' },
  { icon: MessageCircle, label: '留言' },
] as const;

function FeedbackHint({ bodyText }: { bodyText: string }) {
  return (
    <div className="mx-auto w-full max-w-[330px]">
      <p className="mb-4 text-[15px] leading-normal text-textSecondary">{bodyText}</p>
      <div className="flex justify-center gap-2">
        {KINDS.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-textSecondary"
          >
            <Icon size={14} className="text-accent" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --- completion confirmation --------------------------------------------- */
function DoneScreen({ onEnter, onRestart }: { onEnter: () => void; onRestart: () => void }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-5 px-4 text-center"
      style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
    >
      <div className="grid h-[88px] w-[88px] place-items-center rounded-full bg-accent/15 text-accent">
        <Check size={42} strokeWidth={2.4} />
      </div>
      <h2 className="m-0 text-[22px] font-bold text-textPrimary">一切就绪</h2>
      <p className="m-0 max-w-[280px] text-[15px] text-textSecondary">现在就去搜索你的第一只宝可梦吧。</p>
      <button
        type="button"
        onClick={onEnter}
        className="mt-1 flex h-12 w-full max-w-[330px] items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-page transition active:scale-[0.98]"
      >
        开始探索
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 px-3 py-2 text-xs font-semibold text-accent transition active:scale-[0.98]"
      >
        <RotateCcw size={14} />
        重新观看
      </button>
    </div>
  );
}

/**
 * Onboarding — the five-screen first-launch tour. Calls `onComplete` once the
 * user reaches the end, skips, or chooses to enter the app.
 */
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const last = TOTAL - 1;
  const slide = SLIDES[i];

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-[430px] flex-col bg-page text-textPrimary" role="dialog" aria-modal="true" aria-label="LuxrayKit 引导">
      {done ? (
        <DoneScreen
          onEnter={onComplete}
          onRestart={() => {
            setDone(false);
            setI(0);
          }}
        />
      ) : (
        <>
          <div key={i} className="lk-slide-anim min-h-0 flex-1">
            <OnboardingSlide
              eyebrow={stepLabel(i)}
              title={slide.title}
              body={slide.custom === 'feedback' ? <FeedbackHint bodyText={slide.body} /> : slide.body}
              illustration={<Diorama scene={slide.scene} />}
              illustrationMaxH={slide.maxH}
            />
          </div>
          <BottomCTA
            count={TOTAL}
            active={i}
            primaryLabel={i === last ? '开始使用' : '下一步'}
            onPrimary={() => (i === last ? setDone(true) : setI(i + 1))}
            secondaryLabel={i === last ? '发送反馈' : '跳过'}
            onSecondary={() => setDone(true)}
          />
        </>
      )}
    </div>
  );
}
