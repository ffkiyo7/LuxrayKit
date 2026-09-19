import { describe, expect, it } from 'vitest';
import { auraStyle, spriteIdFromIconRef } from './aura';
import { typeColors } from '../ui';
import { pokemonColorsById } from '../../data/seed/regMA/pokemonColors';

describe('spriteIdFromIconRef', () => {
  it('reads the sprite id out of a thumbnail path', () => {
    expect(spriteIdFromIconRef('/assets/pokemon/thumbs/445.png')).toBe('445');
    expect(spriteIdFromIconRef('/assets/pokemon/thumbs/10033.png')).toBe('10033');
  });

  it("keeps a Champions Mega's string id intact", () => {
    expect(spriteIdFromIconRef('/assets/pokemon/thumbs/mega-starmie.png')).toBe('mega-starmie');
  });

  it('has no id for a missing ref or a path that is not a thumbnail', () => {
    expect(spriteIdFromIconRef(undefined)).toBeUndefined();
    expect(spriteIdFromIconRef('')).toBeUndefined();
    expect(spriteIdFromIconRef('/assets/items/leftovers.png')).toBeUndefined();
    expect(spriteIdFromIconRef('https://example.test/thumbs/6.png')).toBeUndefined();
    expect(spriteIdFromIconRef('/assets/pokemon/thumbs/6.webp')).toBeUndefined();
    expect(spriteIdFromIconRef('/assets/pokemon/thumbs/.png')).toBeUndefined();
  });
});

describe('auraStyle', () => {
  it("uses the Pokemon's own body colours when the sprite has a sampled row", () => {
    const [c1, c2] = pokemonColorsById['445'];
    expect(auraStyle(['Dragon', 'Ground'], '/assets/pokemon/thumbs/445.png')).toEqual({
      '--lk-aura-c1': c1,
      '--lk-aura-c2': c2,
    });
  });

  it('falls back to the two type colours without an iconRef', () => {
    expect(auraStyle(['Dragon', 'Ground'])).toEqual({
      '--lk-aura-c1': typeColors.Dragon,
      '--lk-aura-c2': typeColors.Ground,
    });
  });

  it('falls back for a sprite that has no sampled row', () => {
    expect(pokemonColorsById['not-a-sprite']).toBeUndefined();
    expect(auraStyle(['Fire'], '/assets/pokemon/thumbs/not-a-sprite.png')).toEqual({
      '--lk-aura-c1': typeColors.Fire,
      '--lk-aura-c2': typeColors.Fire,
    });
  });

  it('repeats the single type when a fallback Pokemon has only one', () => {
    expect(auraStyle(['Electric'])).toEqual({
      '--lk-aura-c1': typeColors.Electric,
      '--lk-aura-c2': typeColors.Electric,
    });
  });
});
