import { Share2 } from 'lucide-react';
import { SectionLabel } from '../../components/kit/SectionLabel';
import { SubPageHeader } from './SubPageHeader';

const steps = [
  { title: '点底部的分享按钮', body: '在 Safari 里打开本页，点工具栏中间的分享图标。' },
  { title: '选「添加到主屏幕」', body: '在列表里往下翻一点就能看到。' },
  { title: '确认名称后添加', body: '桌面上会出现 Luxray Kit 的图标。' },
];

/** 添加到主屏幕 (N08-16). Illustrated for Safari, which is the only browser that hides it. */
export function InstallPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="pb-7">
      <SubPageHeader subtitle="Safari 里加一次，之后从桌面直接打开，离线也能用" title="添加到主屏幕" onBack={onBack} />

      <section className="px-6 pt-[22px]">
        <div className="flex items-center gap-3.5 rounded-[18px] bg-surface p-[18px]">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-btn1 text-textLabel">
            <Share2 size={22} />
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-textLabel">Safari 底部工具栏的分享按钮</span>
        </div>
      </section>

      <section className="px-6 pt-[26px]">
        <SectionLabel>三步</SectionLabel>
        <div className="mt-1.5">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className={`flex gap-3.5 py-4 ${index < steps.length - 1 ? 'border-b border-[var(--hairline)]' : ''}`}
            >
              <span className="lk-tile lk-tile--blue grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-sm font-extrabold tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold tracking-[-0.01em]">{step.title}</span>
                <span className="mt-1 block text-[13px] font-semibold leading-5 text-textSecondary">{step.body}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
