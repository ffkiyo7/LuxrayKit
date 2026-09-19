import { describe, expect, it } from 'vitest';
import { pokemon } from '.';
import { lowConfidencePokemonColorIds, pokemonColorsById } from './seed/regMA/pokemonColors';

const THUMB_PREFIX = '/assets/pokemon/thumbs/';

/** The table's key: the sprite id an `iconRef` carries. */
const spriteId = (iconRef: string) => iconRef.slice(THUMB_PREFIX.length, -'.png'.length);

const dexSpriteIds = [...new Set([...pokemon, ...pokemon.flatMap((entry) => entry.megaForms)].map((entry) => entry.iconRef))]
  .filter((iconRef) => iconRef.startsWith(THUMB_PREFIX))
  .map(spriteId);

describe('pokemonColorsById', () => {
  it('covers every dex entry and Mega form that has a thumbnail', () => {
    expect(dexSpriteIds.length).toBeGreaterThan(300);
    const missing = dexSpriteIds.filter((id) => !pokemonColorsById[id]);
    expect(missing, `no sampled colour for: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every row two lowercase 6-digit hex colours', () => {
    for (const [id, colours] of Object.entries(pokemonColorsById)) {
      expect(colours, `${id} must be [c1, c2]`).toHaveLength(2);
      for (const colour of colours) {
        expect(colour, `${id} colour`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('flags low-confidence sprites with ids that exist in the table', () => {
    for (const id of lowConfidencePokemonColorIds) {
      expect(pokemonColorsById[id], `${id} is flagged but has no row`).toBeDefined();
    }
  });
});
