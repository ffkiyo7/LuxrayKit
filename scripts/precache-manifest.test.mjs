import { describe, expect, it } from 'vitest';
import { items } from '../src/data/seed/regMA/catalog';
import { buildPrecacheManifest, collectItemIcons } from './precache-manifest.mjs';

describe('service worker precache manifest', () => {
  it('keeps only unique, sorted, same-origin item icon paths', () => {
    expect(collectItemIcons([
      { iconRef: '/assets/items/oran-berry.png' },
      { iconRef: '/assets/items/leftovers.png' },
      { iconRef: '/assets/items/oran-berry.png' },
      // Remote artwork is not ours to precache, and a catalog row may have no icon at all.
      { iconRef: 'https://example.com/remote.png' },
      { iconRef: undefined },
      {},
    ])).toEqual(['/assets/items/leftovers.png', '/assets/items/oran-berry.png']);
  });

  it('generates the list from the live item catalog rather than a hand-written copy', async () => {
    const manifest = await buildPrecacheManifest({ generatedAt: '2026-09-07T00:00:00.000Z' });

    expect(manifest.generatedAt).toBe('2026-09-07T00:00:00.000Z');
    expect(manifest.itemIcons).toEqual(collectItemIcons(items));
    // Sanity floor: the catalog carries well over a hundred icons; an empty/tiny manifest means
    // the bundle step silently failed rather than the catalog genuinely shrinking.
    expect(manifest.itemIcons.length).toBeGreaterThan(100);
    expect(manifest.itemIcons.every((path) => path.startsWith('/assets/items/'))).toBe(true);
  });
});
