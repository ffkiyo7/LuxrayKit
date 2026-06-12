import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { pokemon } from '../data';
import type { Pokemon } from '../types';
import { PokemonAvatar, TypeBadge } from './ui';

// The on-screen keyboard overlays the bottom of the layout viewport without
// resizing it (notably on iOS), so a bottom-anchored sheet — and the short
// result list right under its input — ends up hidden behind the keyboard.
// Track the visual viewport to lift the sheet above the keyboard and cap its
// height to the still-visible area.
const useKeyboardAwareSheet = (open: boolean) => {
  const [style, setStyle] = useState<{ bottom: number; maxHeight: string }>({ bottom: 0, maxHeight: '70vh' });

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!open || !vv) return;

    const update = () => {
      const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const maxHeight = Math.min(vv.height * 0.92, window.innerHeight * 0.7);
      setStyle({ bottom: keyboardInset, maxHeight: `${Math.round(maxHeight)}px` });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

  return style;
};

export function PokemonPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (pokemon: Pokemon) => void;
}) {
  const [query, setQuery] = useState('');
  const sheetStyle = useKeyboardAwareSheet(open);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pokemon;
    return pokemon.filter(
      (p) =>
        p.chineseName.toLowerCase().includes(q) ||
        p.englishName.toLowerCase().includes(q) ||
        p.id.includes(q),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 bg-overlay/60" onClick={onClose} />
      <div
        className="absolute left-1/2 flex min-h-[40vh] w-full max-w-[430px] -translate-x-1/2 flex-col rounded-t-xl bg-card"
        style={{ bottom: sheetStyle.bottom, maxHeight: sheetStyle.maxHeight }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <Search size={18} className="shrink-0 text-textSecondary" />
          <input
            autoFocus
            type="text"
            inputMode="search"
            className="flex-1 bg-transparent text-sm text-textPrimary outline-none placeholder:text-textMuted"
            placeholder="搜索 Pokémon 名称..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-textSecondary active:scale-[0.98]"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-textMuted">未找到匹配的 Pokémon</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-elevated"
                onClick={() => {
                  onPick(p);
                  setQuery('');
                }}
              >
                <PokemonAvatar iconRef={p.iconRef} label={p.chineseName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.chineseName}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {p.types.map((type) => (
                    <TypeBadge key={type} type={type} size="sm" />
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
