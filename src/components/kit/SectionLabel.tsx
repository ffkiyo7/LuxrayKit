import type { ReactNode } from 'react';

/** Small all-caps section label — 11/800, 0.14em. `trailing` is the right-aligned hint the
 *  frames put on the same baseline (e.g. 「点档位看方案」). */
export function SectionLabel({
  children,
  trailing,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  trailing?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}) {
  const label = (
    <p className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${tone === 'danger' ? 'text-danger' : 'text-textSecondary'}`}>
      {children}
    </p>
  );
  if (!trailing) return <div className={className}>{label}</div>;
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      {label}
      <span className="shrink-0 text-xs font-normal text-textSecondary">{trailing}</span>
    </div>
  );
}
