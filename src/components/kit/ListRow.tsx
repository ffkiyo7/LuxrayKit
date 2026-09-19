import type { ReactNode } from 'react';

/**
 * The hairline-separated row the frames use everywhere. Heights differ per frame (68 for a
 * Pokémon/move row, 64 for a labelled field, 60 for a tier or SP row, 44 for a stat readout),
 * so the caller always passes one rather than picking from a "standard" set.
 *
 * `bleed` reproduces the frames' full-width selected rows: the row escapes the 24px page
 * gutter and re-adds it as padding, so its highlight runs edge to edge.
 */
export function ListRow({
  height,
  leading,
  title,
  subtitle,
  trailing,
  active,
  divider = true,
  bleed = false,
  gap = 12,
  onClick,
  ariaLabel,
  className = '',
}: {
  height: number;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  divider?: boolean;
  bleed?: boolean;
  gap?: number;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-[17px] leading-tight tracking-[-0.01em] ${active ? 'font-extrabold text-textPrimary' : 'font-bold'}`}>
          {title}
        </span>
        {subtitle && (
          <span className={`mt-[3px] block truncate text-xs font-semibold tabular-nums ${active ? 'text-textLabel' : 'text-textSecondary'}`}>
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
    </>
  );

  const shell = [
    'flex items-center',
    // `w-full` plus a negative margin only shifts the row left; the bleed has to widen it by
    // both gutters or the highlight stops 48px short of the right edge.
    bleed ? '-mx-6 w-[calc(100%+3rem)] px-6' : 'w-full',
    divider ? 'border-b border-[var(--hairline)]' : '',
    active ? 'lk-row-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!onClick) {
    return (
      <div className={shell} style={{ height, gap }}>
        {body}
      </div>
    );
  }

  return (
    <button aria-label={ariaLabel} className={shell} style={{ height, gap }} type="button" onClick={onClick}>
      {body}
    </button>
  );
}
