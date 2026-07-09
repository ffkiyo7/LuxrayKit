import type { LucideIcon } from 'lucide-react';
import { productName } from '../branding';
import { productContextLabel } from '../data/schedule';
import { IconButton } from './ui';

export function Header({
  contextLabel = productContextLabel(),
  rightIcon,
  onRightClick,
  rightLabel = '页面操作',
}: {
  /** Season · Regulation line. Defaults to the schedule-derived label; pass the live season. */
  contextLabel?: string;
  rightIcon?: LucideIcon;
  onRightClick?: () => void;
  rightLabel?: string;
}) {
  return (
    <header className="mb-3 flex items-center justify-between">
      <div>
        <h1 className="text-[17px] font-semibold tracking-normal">{productName}</h1>
        <p className="text-xs text-textSecondary">{contextLabel}</p>
      </div>
      {rightIcon && onRightClick ? <IconButton icon={rightIcon} label={rightLabel} onClick={onRightClick} /> : null}
    </header>
  );
}
