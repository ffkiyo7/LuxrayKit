import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regenerates src/data/seed/regMA/hiddenAbilities.ts — which of a Pokemon's abilities PokeAPI
// flags `is_hidden` (「梦特」). The catalog generator drops that flag (`extractAbilities` keeps the
// slot order and nothing else), so the dex had no way to tell a hidden ability from a regular one.
//
// The table is a **marker only**: the dex still renders the ability list the Champions catalog
// carries. Champions hands out a few abilities mainline does not, so an id listed here that the
// catalog never gives that Pokemon is simply never looked up — this file never adds or removes an
// ability.
//
// Rows are keyed on the catalog's Pokemon id (the PokeAPI slug, e.g. `raichu-alola`) rather than on
// a dex number, because alternate forms share a dex number but not an ability list.
//
//   node scripts/generate-hidden-abilities.mjs [--check] [--offline]
//
// `--offline` fails instead of fetching, so a run can be proven to have used only the local cache.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_DIR = resolve(ROOT, 'src/data/seed/regMA');
const OUTPUT_PATH = resolve(SEED_DIR, 'hiddenAbilities.ts');
const CACHE_DIR = resolve(ROOT, '.npm-cache/pokeapi');
const POKEAPI = 'https://pokeapi.co/api/v2';
const UA = 'PokemonChampionsTool/1.0 (hidden ability generation)';

const args = process.argv.slice(2);
const check = args.includes('--check');
const offline = args.includes('--offline');

await mkdir(CACHE_DIR, { recursive: true });

function cacheKey(url) {
  return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 200);
}

function cached(url) {
  const path = resolve(CACHE_DIR, `${cacheKey(url)}.json`);
  return existsSync(path) ? path : undefined;
}

async function cachedJson(url) {
  const hit = cached(url);
  if (hit) return JSON.parse(await readFile(hit, 'utf8'));
  if (offline) throw new Error(`--offline: ${url} is not cached.`);
  console.log(`  GET ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = await res.json();
  await writeFile(resolve(CACHE_DIR, `${cacheKey(url)}.json`), JSON.stringify(json), 'utf8');
  return json;
}

/** `{ id, nationalDexNo }` for every catalog row, in id order. */
async function catalogPokemon() {
  const files = (await readdir(SEED_DIR)).filter(
    (file) =>
      file === 'catalog.ts' ||
      file === 'catalog-forms.ts' ||
      (file.startsWith('catalog-batch-') && file.endsWith('.ts')),
  );
  const rows = new Map();
  for (const file of files) {
    const text = await readFile(resolve(SEED_DIR, file), 'utf8');
    // Pokemon rows are the only ones that carry a `nationalDexNo`, and the id always precedes it.
    // The window stops at the next `id:` so the last ability row in a batch file cannot reach
    // forward into the first Pokemon row's dex number.
    for (const match of text.matchAll(/id:\s*'([^']+)',(?:(?!\bid:)[\s\S])*?nationalDexNo:\s*(\d+)/g)) {
      rows.set(match[1], Number(match[2]));
    }
  }
  return [...rows].map(([id, nationalDexNo]) => ({ id, nationalDexNo })).sort((a, b) => a.id.localeCompare(b.id, 'en-US'));
}

/**
 * The PokeAPI variety for a catalog id. `/pokemon/<id>/` is the canonical URL, but the repo's cache
 * was filled by the dex-number generators, so a default variety also resolves through
 * `/pokemon/<dexNo>/` — accepted only when the response names the very id we asked for.
 */
async function fetchVariety({ id, nationalDexNo }) {
  const byId = `${POKEAPI}/pokemon/${id}/`;
  if (cached(byId) || !offline) {
    try {
      return await cachedJson(byId);
    } catch (error) {
      // PokeAPI names some default varieties with a suffix the catalog drops (`pyroar` is
      // `pyroar-male` there), so the bare id 404s and the dex number has to stand in.
      if (!String(error.message).startsWith('HTTP 404')) throw error;
    }
  }
  const byDexNo = `${POKEAPI}/pokemon/${nationalDexNo}/`;
  if (!cached(byDexNo) && offline) return undefined;
  const poke = await cachedJson(byDexNo);
  return poke.name === id || poke.name.startsWith(`${id}-`) ? poke : undefined;
}

const catalog = await catalogPokemon();
console.log(`Catalog carries ${catalog.length} Pokemon.`);

const rows = [];
const unresolved = [];
for (const entry of catalog) {
  const poke = await fetchVariety(entry);
  if (!poke) {
    unresolved.push(entry.id);
    continue;
  }
  const hidden = poke.abilities
    .filter((ability) => ability.is_hidden)
    .sort((a, b) => a.slot - b.slot)
    .map((ability) => ability.ability.name);
  if (hidden.length > 0) rows.push({ id: entry.id, hidden });
}

if (unresolved.length > 0) {
  console.log(`Not resolved (left out of the table): ${unresolved.length} — ${unresolved.join(', ')}`);
}

const lines = [
  '// Generated from cached PokeAPI /pokemon/{id}/ responses by scripts/generate-hidden-abilities.mjs.',
  '// A marker table only: the dex renders the ability list the Champions catalog carries, and an id',
  "// here that the catalog never gives that Pokemon is never looked up. Rows with no hidden ability",
  '// are omitted.',
  '',
  'export const hiddenAbilityIdsByPokemonId: Record<string, string[]> = {',
  ...rows.map((row) => `  '${row.id}': [${row.hidden.map((id) => `'${id}'`).join(', ')}],`),
  '};',
  '',
];
const output = lines.join('\n');

if (check) {
  const current = existsSync(OUTPUT_PATH) ? await readFile(OUTPUT_PATH, 'utf8') : '';
  if (current === output) {
    console.log(`OK: ${OUTPUT_PATH} is up to date (${rows.length} rows).`);
    process.exit(0);
  }
  console.error(`STALE: ${OUTPUT_PATH} differs from the regenerated output (${rows.length} rows).`);
  process.exit(1);
}

await writeFile(OUTPUT_PATH, output, 'utf8');
console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
