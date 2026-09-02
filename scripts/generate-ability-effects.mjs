import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(ROOT, '.npm-cache', '52poke-abilities');
const DATA_DIR = resolve(ROOT, 'src/data/seed/regMA');

const CHECK_ONLY = process.argv.slice(2).includes('--check');

/**
 * catalog.ts plus every catalog-batch-NNN.ts, discovered from disk and ordered by batch number.
 * This used to be a hand-maintained list, which silently stopped covering batch 006 — new
 * batches' ability rows kept their placeholder text with no error. Run with `--check` to print
 * what would be processed without touching the network or any file.
 */
async function discoverCatalogFiles() {
  const batches = (await readdir(DATA_DIR))
    .map((file) => ({ file, match: /^catalog-batch-(\d+)\.ts$/.exec(file) }))
    .filter((entry) => entry.match)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]))
    .map((entry) => entry.file);

  return ['catalog.ts', ...batches].map((file) => resolve(DATA_DIR, file));
}

const FILES = await discoverCatalogFiles();

const API = 'https://wiki.52poke.com/api.php';
const POKEAPI = 'https://pokeapi.co/api/v2';
const USER_AGENT = 'PokemonChampionsToolDataSync/0.1 (local seed generation)';
const ABILITY_REFS = "['pokemon-zhwiki-ability-text', 'pokeapi-pokemon-data']";

await mkdir(CACHE_DIR, { recursive: true });

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeTs(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function findArrayRange(text, marker) {
  const markerIndex = typeof marker === 'number' ? marker : text.indexOf(marker);
  if (markerIndex === -1) return undefined;
  const equalsIndex = text.indexOf('=', markerIndex);
  const start = text.indexOf('[', equalsIndex);
  if (start === -1) return undefined;

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth++;
    if (char === ']') depth--;
    if (depth === 0) return { start, end: index + 1 };
  }
  return undefined;
}

function splitTopLevelObjects(arrayText) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < arrayText.length; index++) {
    const char = arrayText[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(arrayText.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function extractAbilityRows(text) {
  const match = text.match(/export const \w+\s*:\s*Ability\[\]\s*=\s*\[/);
  if (!match) return [];
  const range = findArrayRange(text, match.index);
  if (!range) return [];
  return splitTopLevelObjects(text.slice(range.start + 1, range.end - 1))
    .map((block) => ({
      id: block.match(/id:\s*'([^']+)'/)?.[1],
      chineseName: block.match(/chineseName:\s*'((?:\\'|[^'])*)'/)?.[1]?.replace(/\\'/g, "'"),
      englishName: block.match(/englishName:\s*'((?:\\'|[^'])*)'/)?.[1]?.replace(/\\'/g, "'"),
    }))
    .filter((row) => row.id && row.chineseName);
}

function normalizeWikiText(value) {
  let text = value.trim();
  const zhHans = text.match(/zh-hans:([^;}]+)/);
  if (zhHans) text = zhHans[1];
  text = text
    .replace(/-\{|\}-/g, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function extractInfoboxText(wikitext) {
  const match = wikitext.match(/\|text=([\s\S]*?)(?:\n\||\n\}\})/);
  return match ? normalizeWikiText(match[1]) : undefined;
}

async function cachedWikiTitle(title) {
  const cachePath = resolve(CACHE_DIR, `${title.replace(/[<>:"/\\|?*]/g, '_')}.json`);
  if (existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  }

  const url = new URL(API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'content');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${title}`);
  const data = await response.json();
  await writeFile(cachePath, JSON.stringify(data), 'utf8');
  return data;
}

async function cachedWikiPage(chineseName) {
  return cachedWikiTitle(`${chineseName}（特性）`);
}

async function cachedWikiSearch(query) {
  const cachePath = resolve(CACHE_DIR, `search_${query.replace(/[<>:"/\\|?*]/g, '_')}.json`);
  if (existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  }

  const url = new URL(API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for search ${query}`);
  const data = await response.json();
  await writeFile(cachePath, JSON.stringify(data), 'utf8');
  return data;
}

async function cachedPokeApiAbility(abilityId) {
  const cachePath = resolve(CACHE_DIR, `pokeapi_${abilityId}.json`);
  if (existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  }
  const response = await fetch(`${POKEAPI}/ability/${abilityId}/`, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for PokeAPI ability ${abilityId}`);
  const data = await response.json();
  await writeFile(cachePath, JSON.stringify(data), 'utf8');
  return data;
}

async function fetchPokeApiChineseName(abilityId) {
  const data = await cachedPokeApiAbility(abilityId);
  return data.names?.find((name) => name.language?.name === 'zh-hans')?.name;
}

function extractInfoboxName(wikitext) {
  const match = wikitext.match(/\|name=([^\n|]+)/);
  return match ? normalizeWikiText(match[1]) : undefined;
}

function extractInfoboxEnglishName(wikitext) {
  const match = wikitext.match(/\|enname=([^\n|]+)/);
  return match ? normalizeWikiText(match[1]) : undefined;
}

function sameName(a, b) {
  return String(a ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchAbilityText(row) {
  const data = await cachedWikiPage(row.chineseName);
  const page = data.query?.pages?.[0];
  let content = page?.revisions?.[0]?.slots?.main?.content;
  if (content?.match(/^#REDIRECT\s+\[\[([^\]]+)\]\]/i)) {
    const redirectTarget = content.match(/^#REDIRECT\s+\[\[([^\]]+)\]\]/i)?.[1];
    const redirectedName = redirectTarget?.replace(/（特性）$/, '');
    if (redirectedName) {
      const redirectedData = await cachedWikiPage(redirectedName);
      content = redirectedData.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
    }
  }
  if (!content || page?.missing || !sameName(extractInfoboxEnglishName(content), row.englishName)) {
    const search = await cachedWikiSearch(`${row.englishName ?? row.id} 特性`);
    const title = search.query?.search?.find((candidate) => candidate.title.endsWith('（特性）'))?.title;
    if (title) {
      const searchedData = await cachedWikiTitle(title);
      content = searchedData.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
    }
  }
  const redirectTarget = content?.match(/^#REDIRECT\s+\[\[([^\]]+)\]\]/i)?.[1];
  if (redirectTarget) {
    const redirectedName = redirectTarget.replace(/（特性）$/, '');
    const redirectedData = await cachedWikiPage(redirectedName);
    content = redirectedData.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  }
  const effectSummary = content ? extractInfoboxText(content) : undefined;
  if (!effectSummary) {
    throw new Error(`Missing effect text for ${row.id} ${row.chineseName}`);
  }
  return { effectSummary, chineseName: content ? extractInfoboxName(content) : undefined };
}

function ensureAbilityRefsConst(text) {
  if (text.includes('const abilityRefs =')) return text;
  if (text.includes('const batchRefs =')) {
    return text.replace(/(const batchRefs = \[[^\n]+\];)/, `$1\nconst abilityRefs = ${ABILITY_REFS};`);
  }
  if (text.includes('const catalogRefs =')) {
    return text.replace(/(const catalogRefs = \[[^\n]+\];)/, `$1\nconst abilityRefs = ${ABILITY_REFS};`);
  }
  return text;
}

function updateAbilityArray(text, effectById) {
  let changedRows = 0;
  const updated = text.replace(/(\{\s*\n\s*id:\s*'([^']+)',[\s\S]*?\n\s*\},)/g, (block, _whole, id) => {
    const row = effectById.get(id);
    if (!row || !/calculationImpact:\s*'/.test(block)) return block;
    const updatedObject = block
      .replace(/chineseName:\s*'((?:\\'|[^'])*)',/, `chineseName: '${escapeTs(row.chineseName)}',`)
      .replace(/effectSummary:\s*'((?:\\'|[^'])*)',/, `effectSummary: '${escapeTs(row.effectSummary)}',`)
      .replace(/sourceRefs:\s*[^,\n]+,/, 'sourceRefs: abilityRefs,');
    if (updatedObject !== block) changedRows++;
    return updatedObject;
  });
  return { text: updated, changedRows };
}

async function main() {
  const rowsById = new Map();
  for (const file of FILES) {
    const text = await readFile(file, 'utf8');
    for (const row of extractAbilityRows(text)) {
      if (!rowsById.has(row.id)) rowsById.set(row.id, row);
    }
  }

  console.log(`Found ${rowsById.size} unique ability rows.`);

  if (CHECK_ONLY) {
    console.log(`\nWould process ${FILES.length} catalog files:`);
    for (const file of FILES) {
      const text = await readFile(file, 'utf8');
      const rows = extractAbilityRows(text);
      console.log(`  ${file.slice(ROOT.length + 1)} — ${rows.length} ability rows`);
    }
    console.log('\n--check: no network requests made and no files written.');
    return;
  }

  const effectById = new Map();
  let index = 0;
  for (const row of rowsById.values()) {
    index++;
    const [effect, pokeApiChineseName] = await Promise.all([fetchAbilityText(row), fetchPokeApiChineseName(row.id)]);
    const chineseName = pokeApiChineseName || effect.chineseName || row.chineseName;
    effectById.set(row.id, { ...effect, chineseName });
    console.log(`[${index}/${rowsById.size}] ${chineseName} ${row.id}`);
    if (index < rowsById.size) await new Promise((resolve) => setTimeout(resolve, 550));
  }

  for (const file of FILES) {
    const original = await readFile(file, 'utf8');
    const prepared = ensureAbilityRefsConst(original);
    const updated = updateAbilityArray(prepared, effectById);
    if (updated.text !== original) {
      await writeFile(file, updated.text, 'utf8');
      console.log(`Updated ${file} (${updated.changedRows} ability rows)`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
