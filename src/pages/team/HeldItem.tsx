import type { Item } from '../../types';

/**
 * Held-item sprite + label, shared by the member card, the member editor header and the item
 * picker rows. Small enough that it lived inside TeamPage; it stays one module so those three
 * places cannot drift apart.
 */
export function HeldItemIcon({
  iconRef,
  label,
  className = 'h-6 w-6',
}: {
  iconRef?: string;
  label: string;
  className?: string;
}) {
  if (!iconRef) return <span className={`shrink-0 ${className}`} aria-hidden="true" />;

  return (
    <img
      className={`shrink-0 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${className}`}
      src={iconRef}
      alt={label}
      loading="lazy"
      decoding="async"
    />
  );
}

export function HeldItemLine({ item, className = '' }: { item?: Item; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-textSecondary ${className}`}>
      {item?.iconRef && <HeldItemIcon iconRef={item.iconRef} label={item.chineseName} className="h-4 w-4" />}
      <span className="truncate">{item?.chineseName ?? '未选道具'}</span>
    </span>
  );
}
