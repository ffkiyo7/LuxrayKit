import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogEntryPoint = resolve(ROOT, 'src/data/seed/regMA/catalog.ts');
const bundledCatalogPath = resolve(ROOT, '.npm-cache/precache-manifest-catalog.mjs');

/** The exact line public/sw.js ships with; the build swaps it for the real manifest. */
export const SW_BUILD_PLACEHOLDER = "const BUILD = { version: 'dev', assets: [], itemIcons: [] };";
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
 * Vite's own output: the files directly under dist/assets (JS, CSS, the font). The sprite folders
 * public/ copies into dist/assets/pokemon|items are subdirectories and deliberately not listed.
 */
export async function collectBuildAssets(outDir) {
  const entries = await readdir(resolve(outDir, 'assets'), { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => `/assets/${entry.name}`).sort();
}

/**
 * Changes exactly when a returning user needs new code: hashed asset names cover every chunk,
 * index.html covers the shell. A data-only deploy (the daily PokeDB JSON) leaves it alone, so it
 * does not raise an update prompt for a file the worker refreshes in the background anyway.
 */
export function buildVersion({ assets, itemIcons, indexHtml }) {
  return createHash('sha256').update(JSON.stringify({ assets, itemIcons, indexHtml })).digest('hex').slice(0, 12);
}

/**
 * The service worker used to carry a hand-written array of ~120 item icon paths, which silently
 * drifted from the catalog every time an item was added. Generate it from the same `iconRef`
 * fields the UI renders instead.
 */
export async function buildPrecacheManifest({ assets = [], indexHtml = '' } = {}) {
  const { items } = await loadCatalog();
  const itemIcons = collectItemIcons(items);
  return { version: buildVersion({ assets, itemIcons, indexHtml }), assets, itemIcons };
}

/** Swap the placeholder line for the manifest; a missing placeholder is a broken build, not a no-op. */
export function injectPrecacheManifest(source, manifest) {
  const at = source.indexOf(SW_BUILD_PLACEHOLDER);
  if (at === -1 || source.indexOf(SW_BUILD_PLACEHOLDER, at + 1) !== -1) {
    throw new Error('sw.js must contain the BUILD placeholder line exactly once');
  }
  return source.replace(SW_BUILD_PLACEHOLDER, `const BUILD = ${JSON.stringify(manifest)};`);
}

/** `outDir` may be relative (Vite's build.outDir default is "dist"); resolve it against `root`. */
export async function writePrecacheManifest(outDir, { root = ROOT } = {}) {
  const target = resolve(root, outDir);
  const swPath = resolve(target, 'sw.js');
  const [assets, indexHtml, swSource] = await Promise.all([
    collectBuildAssets(target),
    readFile(resolve(target, 'index.html'), 'utf8'),
    readFile(swPath, 'utf8'),
  ]);
  const manifest = await buildPrecacheManifest({ assets, indexHtml });
  await writeFile(swPath, injectPrecacheManifest(swSource, manifest));
  return manifest;
}
