import type { PokemonType } from '../types';

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

export const typeColors: Record<PokemonType, string> = {
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

export const typeLabels: Record<PokemonType, string> = {
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
