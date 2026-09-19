import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The 我的 list row (08-01, N08-01, N08-10): 32px tinted icon tile, 16/700 title over a 12/600
 * subtitle, hairline below. Its own component rather than kit's `ListRow` because these frames
 * draw a 16px title and let the subtitle wrap to two lines.
 */
export function ProfileRow({
  tile,
  icon,
  title,
  subtitle,
  trailing = <ChevronRight className="shrink-0 text-chevron" size={18} />,
  height = 64,
  divider = true,
  onClick,
}: {
  /** One of the `lk-tile--*` modifiers. */
  tile: string;
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  height?: number;
  divider?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={`lk-tile ${tile} grid h-8 w-8 shrink-0 place-items-center rounded-[10px]`}>{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-bold tracking-[-0.01em]">{title}</span>
        {subtitle && <span className="mt-[3px] block text-xs font-semibold leading-[17px] text-textSecondary">{subtitle}</span>}
      </span>
      {trailing}
    </>
  );

  const shell = `flex w-full items-center gap-3 ${divider ? 'border-b border-[var(--hairline)]' : ''}`;

  if (!onClick) {
    return (
      <div className={shell} style={{ minHeight: height }}>
        {body}
      </div>
    );
  }

  return (
    <button className={shell} style={{ minHeight: height }} type="button" onClick={onClick}>
      {body}
    </button>
  );
}
