import type { ReactNode } from 'react';

/**
 * The 2026-09 button ladder. Primary is the near-white (dark) / ink (light) slab from N05-09;
 * secondary has three floors keyed to the frame height it carries — 50 `btn1`, 48 `btn2`,
 * 44 `btn3` — all with `textLabel` ink. `shape="pill"` is the 32px 「完成」capsule (N05-07).
 */
export function KitButton({
  children,
  variant = 'secondary',
  height = 48,
  shape = 'rounded',
  grow = false,
  disabled,
  ariaLabel,
  onClick,
  className = '',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  height?: number;
  shape?: 'rounded' | 'pill';
  grow?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
  className?: string;
}) {
  const floor = height >= 50 ? 'bg-btn1' : height >= 48 ? 'bg-btn2' : 'bg-btn3';
  const skin = disabled
    ? 'bg-btn1 text-btnDisabledInk'
    : variant === 'primary'
      ? 'lk-btn-primary bg-accent text-page'
      : `${floor} text-textLabel`;

  return (
    <button
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 ${shape === 'pill' ? 'rounded-full px-3.5' : 'rounded-[14px] px-4'} ${
        grow ? 'min-w-0 flex-1' : ''
      } ${shape === 'pill' ? 'text-[13px]' : 'text-[15px]'} ${variant === 'primary' ? 'font-extrabold tracking-[-0.01em]' : 'font-bold'} ${skin} ${className}`}
      disabled={disabled}
      style={{ height }}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
