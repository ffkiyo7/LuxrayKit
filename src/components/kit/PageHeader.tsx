/** Page title block — 34/42/800 over a 13/18 subtitle (every 2026-09 page frame). */
export function PageHeader({
  title,
  subtitle,
  className = '',
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h1 className="text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[13px] font-normal leading-[18px] text-textSecondary">{subtitle}</p>}
    </div>
  );
}
