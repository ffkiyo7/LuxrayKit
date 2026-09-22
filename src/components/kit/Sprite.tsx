import { useState } from 'react';

/**
 * Bare Pokémon / item sprite — the 2026-09 frames drop the circular avatar chip and place the
 * artwork straight on the surface. Falls back to the name's first character when the icon is
 * missing or fails to load.
 */
/**
 * `size` is normally a px number. It also takes a raw CSS length so a caller can hand the sprite a
 * container-relative size (the 01-01 hero passes `var(--lk-hero-art)`, which scales with the card).
 */
export function Sprite({
  iconRef,
  label,
  size,
  className = '',
}: {
  iconRef?: string;
  label: string;
  size: number | string;
  className?: string;
}) {
  // Keyed by src: a recycled row that once failed must not stay on the letter fallback after
  // its `iconRef` changes.
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const isImage = Boolean(iconRef && /^(https?:|\/|\.\.?\/|data:image\/)/.test(iconRef));

  if (!isImage || failedSrc === iconRef) {
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-full bg-elevated font-bold text-textSecondary ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: typeof size === 'number' ? Math.round(size * 0.4) : `calc(${size} * 0.4)`,
        }}
      >
        {label.charAt(0)}
      </span>
    );
  }

  // No `decoding="async"`: with no chip behind the artwork, an async decode shows as an empty
  // slot every time a list remounts, even when the file is already cached.
  return (
    <img
      alt={label}
      className={`shrink-0 object-contain ${className}`}
      loading="lazy"
      src={iconRef}
      style={{ width: size, height: size }}
      onError={() => setFailedSrc(iconRef)}
    />
  );
}
