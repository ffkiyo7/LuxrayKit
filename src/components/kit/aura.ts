import type { CSSProperties } from 'react';
import type { PokemonType } from '../../types';
import { typeColors } from '../ui';

/**
 * The Pokémon's own two type colours as CSS variables. A surface paints its halo from them with
 * `color-mix(in srgb, var(--lk-aura-c1) <stop>, transparent)`, see `.lk-member-aura` in p3.css.
 */
export const auraStyle = (types: readonly PokemonType[]): CSSProperties =>
  ({
    '--lk-aura-c1': typeColors[types[0]] ?? '#8e8e93',
    '--lk-aura-c2': typeColors[types[1] ?? types[0]] ?? '#8e8e93',
  }) as CSSProperties;
