import type { LucideIcon } from 'lucide-react';
import { productContextLabel, productName } from '../branding';
import { IconButton } from './ui';

export function Header({
  rightIcon,
  onRightClick,
  rightLabel = '页面操作',
}: {
  rightIcon?: LucideIcon;
  onRightClick?: () => void;
  rightLabel?: string;
}) {
  return (
    <header className="mb-3 flex items-center justify-between">
      <div>
        <h1 className="text-[17px] font-semibold tracking-normal">{productName}</h1>
        <p className="text-xs text-textSecondary">{productContextLabel}</p>
      </div>
      {rightIcon && onRightClick ? <IconButton icon={rightIcon} label={rightLabel} onClick={onRightClick} /> : null}
    </header>
  );
}
