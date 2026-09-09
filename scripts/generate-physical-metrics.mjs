import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regenerates src/data/seed/regMA/physicalMetrics.ts — the height/weight table DexPage reads.
//
// The file carried a "Generated from cached PokeAPI /pokemon/{id}/ responses" header but no script,
// so every regulation rollover meant hand-adding rows to a generated artifact. This script is that
// missing generator; it was written against the existing 188-row file and reproduces it exactly
// (verified with `--check` before the M-C rows were added).
//
// The table is keyed on `nationalDexNo`, and DexPage looks rows up by the *base* Pokemon's dex
// number, so each row takes the **default variety** (`/pokemon/<dexNo>/`). Alternate forms are
// deliberately not given their own rows: they have no key to live under. That matches the existing
// data (e.g. dex 26 holds base Raichu's metrics, which `raichu-alola` also displays).
//
//   node scripts/generate-physical-metrics.mjs [--check]

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_DIR = resolve(ROOT, 'src/data/seed/regMA');
const OUTPUT_PATH = resolve(SEED_DIR, 'physicalMetrics.ts');
const CACHE_DIR = resolve(ROOT, '.npm-cache/pokeapi');
const POKEAPI = 'https://pokeapi.co/api/v2';
const UA = 'PokemonChampionsTool/1.0 (physical metrics generation)';

const check = process.argv.slice(2).includes('--check');

await mkdir(CACHE_DIR, { recursive: true });

function cacheKey(url) {
  return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 200);
}

async function cachedJson(url) {
  const path = resolve(CACHE_DIR, `${cacheKey(url)}.json`);
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  console.log(`  GET ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = await res.json();
  await writeFile(path, JSON.stringify(json), 'utf8');
  return json;
}

/** Every `nationalDexNo` referenced by a catalog row, deduplicated. */
async function catalogDexNumbers() {
  const files = (await readdir(SEED_DIR)).filter(
    (file) =>
      file === 'catalog.ts' ||
      file === 'catalog-forms.ts' ||
      (file.startsWith('catalog-batch-') && file.endsWith('.ts')),
  );
  const dexNumbers = new Set();
  for (const file of files) {
    const text = await readFile(resolve(SEED_DIR, file), 'utf8');
    for (const match of text.matchAll(/nationalDexNo:\s*(\d+)/g)) {
      dexNumbers.add(Number(match[1]));
    }
  }
  return [...dexNumbers].sort((a, b) => a - b);
}

const dexNumbers = await catalogDexNumbers();
console.log(`Catalog references ${dexNumbers.length} distinct national dex numbers.`);

const rows = [];
for (const dexNo of dexNumbers) {
  const poke = await cachedJson(`${POKEAPI}/pokemon/${dexNo}/`);
  if (poke.id !== dexNo) {
    throw new Error(`/pokemon/${dexNo}/ returned id ${poke.id}; expected the default variety.`);
  }
  if (typeof poke.height !== 'number' || typeof poke.weight !== 'number') {
    throw new Error(`/pokemon/${dexNo}/ has no height/weight.`);
  }
  rows.push({ dexNo, heightDm: poke.height, weightHg: poke.weight });
}

const lines = [
  '// Generated from cached PokeAPI /pokemon/{id}/ responses.',
  '// heightDm uses decimeters; weightHg uses hectograms.',
  'export type PokemonPhysicalMetrics = { heightDm: number; weightHg: number };',
  '',
  'export const pokemonPhysicalMetricsByDexNo: Record<number, PokemonPhysicalMetrics> = {',
  ...rows.map((row) => `  ${row.dexNo}: { heightDm: ${row.heightDm}, weightHg: ${row.weightHg} },`),
  '};',
  '',
];
const output = lines.join('\n');

if (check) {
  const current = await readFile(OUTPUT_PATH, 'utf8');
  if (current === output) {
    console.log(`OK: ${OUTPUT_PATH} is up to date (${rows.length} rows).`);
    process.exit(0);
  }
  console.error(`STALE: ${OUTPUT_PATH} differs from the regenerated output (${rows.length} rows).`);
  process.exit(1);
}

await writeFile(OUTPUT_PATH, output, 'utf8');
console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
