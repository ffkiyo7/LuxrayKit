import type { ReactNode } from 'react';

/**
 * The capsule used for 双打/单打, 天气, 形态 and the speed-nature triple. Selected is the one
 * place the violet `select` shows up (fill + 1.5px ring, see the token comment in styles.css);
 * idle is a flat `surface` capsule.
 */
export function Pill({
  children,
  selected,
  height = 34,
  grow = false,
  tone = 'select',
  onClick,
  ariaLabel,
  className = '',
}: {
  children: ReactNode;
  selected?: boolean;
  height?: number;
  /** Equal-width segments (the speed-nature triple in 05-05) instead of content width. */
  grow?: boolean;
  /** 05-05 draws its nature triple without the violet: neutral fill over a sunken well. */
  tone?: 'select' | 'plain';
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  const skin = selected
    ? tone === 'select'
      ? 'lk-pill-on font-extrabold text-textPrimary'
      : 'bg-textPrimary/10 font-extrabold text-textPrimary'
    : tone === 'select'
      ? 'bg-surface font-semibold text-textLabel'
      : 'bg-sunken font-semibold text-textSecondary';

  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] ${
        grow ? 'min-w-0 flex-1' : ''
      } ${skin} ${className}`}
      style={{ height }}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
