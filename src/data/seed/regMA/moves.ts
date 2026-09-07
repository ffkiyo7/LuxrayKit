import type { Move } from '../../../types';
import { championsMoves } from './move-catalog';

/**
 * The move catalog, re-exported from its own module rather than from `catalog.ts`.
 *
 * `catalog.ts` used to own this line, which made every consumer of the Pokémon catalog — the
 * environment first paint included — statically depend on the 362 KB `move-catalog.ts`. The
 * Pokémon catalog does not use moves for anything, so the dependency lives here instead and
 * only the pages that actually render moves pull the chunk in.
 */
export const moves: Move[] = championsMoves;
