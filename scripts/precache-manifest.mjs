import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogEntryPoint = resolve(ROOT, 'src/data/seed/regMA/catalog.ts');
const bundledCatalogPath = resolve(ROOT, '.npm-cache/precache-manifest-catalog.mjs');

export const PRECACHE_MANIFEST_FILENAME = 'precache-manifest.json';
/** Only same-origin item sprites are precached; a remote artwork URL is not our asset to cache. */
const ITEM_ICON_PREFIX = '/assets/items/';

/** Unique, sorted item icon paths for a catalog's items. Exported for the unit test. */
export function collectItemIcons(items) {
  const icons = new Set();
  for (const item of items ?? []) {
    if (typeof item?.iconRef === 'string' && item.iconRef.startsWith(ITEM_ICON_PREFIX)) {
      icons.add(item.iconRef);
    }
  }
  return [...icons].sort();
}

async function loadCatalog() {
  await mkdir(dirname(bundledCatalogPath), { recursive: true });
  await esbuild.build({
    entryPoints: [catalogEntryPoint],
    outfile: bundledCatalogPath,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(bundledCatalogPath).href}?t=${Date.now()}`);
}

/**
 * The service worker used to carry a hand-written array of ~120 item icon paths, which silently
 * drifted from the catalog every time an item was added. Generate it from the same `iconRef`
 * fields the UI renders instead.
 */
export async function buildPrecacheManifest({ generatedAt = new Date().toISOString() } = {}) {
  const { items } = await loadCatalog();
  return { generatedAt, itemIcons: collectItemIcons(items) };
}

/** `outDir` may be relative (Vite's build.outDir default is "dist"); resolve it against `root`. */
export async function writePrecacheManifest(outDir, { root = ROOT, ...options } = {}) {
  const manifest = await buildPrecacheManifest(options);
  const target = resolve(root, outDir);
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, PRECACHE_MANIFEST_FILENAME), `${JSON.stringify(manifest)}\n`);
  return manifest;
}
