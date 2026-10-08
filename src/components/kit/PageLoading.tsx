/** Page-level placeholder (N08-15): the shape of a page, not a spinner. */
export function PageLoading({ label = '正在载入页面' }: { label?: string }) {
  return (
    <div>
      <div className="px-6 pt-11">
        <span className="block h-[34px] w-[46%] rounded-xl bg-textPrimary/[0.09]" />
        <span className="mt-3 block h-[13px] w-[68%] rounded-full bg-textPrimary/[0.06]" />
        <span className="mt-[22px] block h-11 rounded-[14px] bg-textPrimary/[0.05]" />
      </div>
      <div className="flex flex-col gap-3.5 px-6 pt-[22px]">
        {[0.05, 0.05, 0.04, 0.03].map((alpha, index) => (
          <span key={index} className="block h-[68px] rounded-2xl" style={{ background: `rgb(var(--color-text-primary) / ${alpha})` }} />
        ))}
      </div>
      <div className="flex items-center gap-2.5 px-6 pt-7">
        <span className="inline-block h-3 w-14 rounded-full bg-textPrimary/[0.09]" />
        <span className="text-[13px] font-semibold text-textSecondary" role="status">
          {label}
        </span>
      </div>
    </div>
  );
}
