import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { items } from '../src/data/seed/regMA/catalog';
import {
  buildPrecacheManifest,
  buildVersion,
  collectBuildAssets,
  collectItemIcons,
  injectPrecacheManifest,
  SW_BUILD_PLACEHOLDER,
} from './precache-manifest.mjs';

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
    const manifest = await buildPrecacheManifest({ assets: ['/assets/index-a.js'], indexHtml: '<html>' });

    expect(manifest.assets).toEqual(['/assets/index-a.js']);
    expect(manifest.version).toMatch(/^[0-9a-f]{12}$/);
    expect(manifest.itemIcons).toEqual(collectItemIcons(items));
    // Sanity floor: the catalog carries well over a hundred icons; an empty/tiny manifest means
    // the bundle step silently failed rather than the catalog genuinely shrinking.
    expect(manifest.itemIcons.length).toBeGreaterThan(100);
    expect(manifest.itemIcons.every((path) => path.startsWith('/assets/items/'))).toBe(true);
  });

  it('changes the version for new code but not for a data-only deploy', () => {
    const base = { assets: ['/assets/index-a.js'], itemIcons: ['/assets/items/x.png'], indexHtml: '<a>' };
    expect(buildVersion(base)).toBe(buildVersion({ ...base }));
    expect(buildVersion({ ...base, assets: ['/assets/index-b.js'] })).not.toBe(buildVersion(base));
    expect(buildVersion({ ...base, indexHtml: '<b>' })).not.toBe(buildVersion(base));
  });

  it('lists only the files Vite emitted directly under dist/assets', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'luxray-precache-'));
    await mkdir(join(outDir, 'assets/pokemon'), { recursive: true });
    await writeFile(join(outDir, 'assets/index-a.js'), '');
    await writeFile(join(outDir, 'assets/font-b.woff2'), '');
    await writeFile(join(outDir, 'assets/pokemon/445.png'), '');

    await expect(collectBuildAssets(outDir)).resolves.toEqual(['/assets/font-b.woff2', '/assets/index-a.js']);
  });

  it('injects the manifest into the shipped sw.js and refuses a missing placeholder', async () => {
    const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
    const manifest = { version: 'abc', assets: ['/assets/index-a.js'], itemIcons: [] };

    const built = injectPrecacheManifest(source, manifest);
    expect(built).toContain(`const BUILD = ${JSON.stringify(manifest)};`);
    expect(built).not.toContain(SW_BUILD_PLACEHOLDER);
    expect(() => injectPrecacheManifest(built, manifest)).toThrow('placeholder');
  });
});
