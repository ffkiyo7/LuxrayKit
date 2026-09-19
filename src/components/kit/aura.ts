import type { CSSProperties } from 'react';
import type { PokemonType } from '../../types';
import { typeColors } from '../ui';
import { pokemonColorsById } from '../../data/seed/regMA/pokemonColors';

const THUMB_PREFIX = '/assets/pokemon/thumbs/';
const THUMB_SUFFIX = '.png';

/**
 * The sprite id inside a thumbnail `iconRef`, which is how `pokemonColorsById` is keyed:
 * `/assets/pokemon/thumbs/445.png` → `445`, `…/mega-starmie.png` → `mega-starmie`. Anything that is
 * not a thumbnail path (an item icon, a remote URL, a missing ref) has no sprite id.
 */
export function spriteIdFromIconRef(iconRef: string | undefined): string | undefined {
  if (!iconRef?.startsWith(THUMB_PREFIX) || !iconRef.endsWith(THUMB_SUFFIX)) return undefined;
  const id = iconRef.slice(THUMB_PREFIX.length, -THUMB_SUFFIX.length);
  return id.length > 0 ? id : undefined;
}

/**
 * The two halo colours as CSS variables. A surface paints its halo from them with
 * `color-mix(in srgb, var(--lk-aura-c1) <stop>, transparent)`, see `.lk-member-aura` in p3.css.
 *
 * Preferred source is the Pokémon's own body colours, sampled off its artwork
 * (`src/data/seed/regMA/pokemonColors.ts`, keyed on the sprite id `iconRef` carries). A Mega or
 * regional form has its own artwork and so its own colours. Without an `iconRef` — or for a sprite
 * that has no sampled row — this falls back to the two type colours.
 */
export const auraStyle = (types: readonly PokemonType[], iconRef?: string): CSSProperties => {
  const spriteId = spriteIdFromIconRef(iconRef);
  const body = spriteId ? pokemonColorsById[spriteId] : undefined;
  return {
    '--lk-aura-c1': body?.[0] ?? typeColors[types[0]] ?? '#8e8e93',
    '--lk-aura-c2': body?.[1] ?? typeColors[types[1] ?? types[0]] ?? '#8e8e93',
  } as CSSProperties;
};
