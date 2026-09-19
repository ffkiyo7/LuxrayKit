import { useState } from 'react';

/**
 * Bare Pokémon / item sprite — the 2026-09 frames drop the circular avatar chip and place the
 * artwork straight on the surface. Falls back to the name's first character when the icon is
 * missing or fails to load.
 */
export function Sprite({ iconRef, label, size, className = '' }: { iconRef?: string; label: string; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const isImage = Boolean(iconRef && /^(https?:|\/|\.\.?\/|data:image\/)/.test(iconRef));

  if (!isImage || failed) {
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-full bg-elevated font-bold text-textSecondary ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {label.charAt(0)}
      </span>
    );
  }

  return (
    <img
      alt={label}
      className={`shrink-0 object-contain ${className}`}
      decoding="async"
      loading="lazy"
      src={iconRef}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
