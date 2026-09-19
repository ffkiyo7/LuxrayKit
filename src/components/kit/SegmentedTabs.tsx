/** The two-up segmented control inside a well (05-03 / N05-09 我的队伍 · 环境常用). */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-1 rounded-xl bg-sunken p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.id}
          aria-pressed={value === option.id}
          className={`grid h-[34px] place-items-center rounded-[9px] text-sm ${
            value === option.id ? 'bg-segmentOn font-bold text-textPrimary' : 'font-semibold text-textSecondary'
          }`}
          type="button"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
