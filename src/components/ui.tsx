import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { LegalityStatus, PokemonType } from '../types';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`surface-shadow rounded-lg border border-border bg-card p-3 ${className}`}>{children}</section>;
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const variants = {
    primary: 'bg-accent text-page',
    ghost: 'border border-accent/40 bg-transparent text-accent',
    danger: 'border border-danger/40 bg-transparent text-danger',
  };
  return (
    <button
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-border disabled:text-textMuted disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-textSecondary active:scale-[0.98]"
      {...props}
    >
      <Icon size={18} />
    </button>
  );
}

export function Chip({
  children,
  active,
  className = '',
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-xs ${
        active ? 'border-accent bg-accent text-page' : 'border-border bg-card text-textSecondary'
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function Badge({ status, children }: { status?: LegalityStatus | 'version' | 'current'; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    legal: 'bg-legalBg text-success',
    illegal: 'bg-missingBg text-danger',
    'needs-review': 'bg-reviewBg text-warning',
    'missing-config': 'bg-missingBg text-danger',
    version: 'bg-accent/15 text-accent',
    current: 'bg-accent/15 text-accent',
  };
  return <span className={`inline-flex rounded px-1.5 py-1 text-[11px] font-semibold ${styles[status ?? 'version']}`}>{children}</span>;
}

const typeColors: Record<PokemonType, string> = {
  Normal: '#a8a77a',
  Fire: '#ee8130',
  Water: '#6390f0',
  Electric: '#f7d02c',
  Grass: '#7ac74c',
  Ice: '#96d9d6',
  Fighting: '#c22e28',
  Poison: '#a33ea1',
  Ground: '#e2bf65',
  Flying: '#a98ff3',
  Psychic: '#f95587',
  Bug: '#a6b91a',
  Rock: '#b6a136',
  Ghost: '#735797',
  Dragon: '#6f35fc',
  Dark: '#705746',
  Steel: '#b7b7ce',
  Fairy: '#d685ad',
};

const typeLabels: Record<PokemonType, string> = {
  Normal: '一般',
  Fire: '火',
  Water: '水',
  Electric: '电',
  Grass: '草',
  Ice: '冰',
  Fighting: '格斗',
  Poison: '毒',
  Ground: '地面',
  Flying: '飞行',
  Psychic: '超能力',
  Bug: '虫',
  Rock: '岩石',
  Ghost: '幽灵',
  Dragon: '龙',
  Dark: '恶',
  Steel: '钢',
  Fairy: '妖精',
};

export function TypeBadge({ type, size = 'md' }: { type: PokemonType; size?: 'sm' | 'md' }) {
  const dimensions = size === 'sm' ? 'h-5 w-10 text-[10px]' : 'h-6 w-11 text-[11px]';
  return (
    <span
      aria-label={`${typeLabels[type]}属性`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-semibold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${dimensions}`}
      style={{
        backgroundColor: `${typeColors[type]}dd`,
        borderColor: `${typeColors[type]}`,
      }}
      title={`${typeLabels[type]}属性`}
    >
      <span className="translate-y-px leading-none">{typeLabels[type]}</span>
    </span>
  );
}

export function PokemonAvatar({
  iconRef,
  label,
  size = 'sm',
}: {
  iconRef?: string;
  label: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizes = {
    xs: 'h-8 w-8 text-xs',
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-16 w-16 text-lg',
  };
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const isImage = Boolean(
    iconRef?.startsWith('http://') ||
      iconRef?.startsWith('https://') ||
      iconRef?.startsWith('/') ||
      iconRef?.startsWith('./') ||
      iconRef?.startsWith('../') ||
      iconRef?.startsWith('data:image/'),
  );
  const imageFailed = Boolean(iconRef && failedSrc === iconRef);

  if (!isImage || imageFailed) {
    const fallback = imageFailed ? label.charAt(0) : iconRef ?? label.charAt(0);
    return (
      <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-elevated font-bold text-accent ${sizes[size]}`}>
        {fallback}
      </div>
    );
  }

  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-elevated font-bold text-accent ${sizes[size]}`}>
      <img
        src={iconRef}
        alt={label}
        className="h-full w-full object-contain p-0.5"
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(iconRef)}
      />
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-border bg-secondary px-4 py-8 text-center">
      <p className="mb-3 text-sm text-textSecondary">{title}</p>
      {action}
    </div>
  );
}
