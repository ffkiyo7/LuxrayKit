import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPokeDbOpenDataUpdateReport,
  formatPokeDbOpenDataUpdateReport,
  hasBlockingPokeDbOpenDataIssues,
  validatePokeDbRankedTeamsPayload,
} from './pokedb-open-data-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');

const sources = [
  {
    battleType: 'singles',
    url: 'https://champs.pokedb.tokyo/opendata/s1_single_ranked_teams.json',
    outputPath: resolve(ROOT, 'src/data/external/pokedb/s1_single_ranked_teams.json'),
  },
  {
    battleType: 'doubles',
    url: 'https://champs.pokedb.tokyo/opendata/s1_double_ranked_teams.json',
    outputPath: resolve(ROOT, 'src/data/external/pokedb/s1_double_ranked_teams.json'),
  },
];

const toPokeDbPokemonKey = (championsFormId) => {
  const [dexNo, formNo = '000'] = championsFormId.split('-');
  return `${dexNo}-${String(Number(formNo)).padStart(2, '0')}`;
};

const normalizeName = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[♀]/g, 'female')
    .replace(/[♂]/g, 'male')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const readUtf8 = (relativePath) => readFile(resolve(ROOT, relativePath), 'utf8');

const stableJson = (payload) => `${JSON.stringify(payload)}\n`;

function findArrayRange(text, marker) {
  const markerIndex = text.indexOf(marker);
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
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return undefined;
}

function extractStringProperty(block, propertyName) {
  return block.match(new RegExp(`${propertyName}: '([^']+)'`))?.[1];
}

function parseCatalogEnglishNameMap(texts) {
  const map = new Map();
  const joined = texts.join('\n');
  const regex = /id: '([^']+)'[\s\S]{0,500}?englishName: '([^']+)'/g;
  let match;
  while ((match = regex.exec(joined))) {
    map.set(normalizeName(match[2]), match[1]);
  }
  return map;
}

function parseAllowlistPokemonKeyMap(allowlistText, catalogEnglishNameMap) {
  const entries = allowlistText.match(/\{\s*id: 'reg-ma-[\s\S]*?\n  \}/g) ?? [];
  return entries.reduce((acc, block) => {
    const championsFormId = extractStringProperty(block, 'championsFormId');
    const explicitPokemonId = extractStringProperty(block, 'pokemonId');
    const englishName = extractStringProperty(block, 'englishName');
    if (!championsFormId) return acc;
    const pokemonId = explicitPokemonId ?? catalogEnglishNameMap.get(normalizeName(englishName));
    if (!pokemonId) return acc;
    acc[toPokeDbPokemonKey(championsFormId)] = pokemonId;
    return acc;
  }, {});
}

function parseItemIds(catalogText) {
  const itemArray = findArrayRange(catalogText, 'export const items');
  if (!itemArray) throw new Error('Could not find export const items in catalog.ts.');
  return [...itemArray.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);
}

function parsePokeDbItemNameMap(text) {
  const map = {};
  const regex = /^\s*(?:'([^']+)'|"([^"]+)"|([^:\s]+)):\s*'([^']+)'/gm;
  let match;
  while ((match = regex.exec(text))) {
    map[match[1] ?? match[2] ?? match[3]] = match[4];
  }
  return map;
}

async function fetchJson(source) {
  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'PokemonChampionsToolDataSync/0.1 (local snapshot maintenance)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

const catalogTexts = await Promise.all(
  [
    'src/data/seed/regMA/catalog.ts',
    'src/data/seed/regMA/catalog-batch-001.ts',
    'src/data/seed/regMA/catalog-batch-002.ts',
    'src/data/seed/regMA/catalog-batch-003.ts',
    'src/data/seed/regMA/catalog-batch-004.ts',
    'src/data/seed/regMA/catalog-batch-005.ts',
    'src/data/seed/regMA/catalog-forms.ts',
  ].map(readUtf8),
);
const catalogText = catalogTexts[0];
const allowlistText = await readUtf8('src/data/seed/regMA/allowlist.ts');
const itemMapText = await readUtf8('src/data/external/pokedbItemNameMap.ts');

const catalogEnglishNameMap = parseCatalogEnglishNameMap(catalogTexts);
const pokemonKeyToId = parseAllowlistPokemonKeyMap(allowlistText, catalogEnglishNameMap);
const itemIds = parseItemIds(catalogText);
const itemNameToId = parsePokeDbItemNameMap(itemMapText);

const payloadEntries = await Promise.all(
  sources.map(async (source) => {
    const payload = await fetchJson(source);
    const issues = validatePokeDbRankedTeamsPayload(payload, source.battleType);
    if (issues.length > 0) {
      throw new Error(`PokeDB payload validation failed for ${source.battleType}:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    }
    return [source.battleType, payload];
  }),
);
const battles = Object.fromEntries(payloadEntries);

const report = createPokeDbOpenDataUpdateReport({
  battles,
  pokemonKeyToId,
  itemNameToId,
  itemIds,
});

console.log(formatPokeDbOpenDataUpdateReport(report));

if (hasBlockingPokeDbOpenDataIssues(report)) {
  console.error('\nPokeDB snapshot update stopped. Resolve the reported mapping gaps before writing new data.');
  process.exit(1);
}

const changedSources = [];
for (const source of sources) {
  const nextText = stableJson(battles[source.battleType]);
  const currentText = await readFile(source.outputPath, 'utf8').catch(() => '');
  if (currentText !== nextText) changedSources.push({ ...source, nextText });
}

if (checkOnly) {
  if (changedSources.length > 0) {
    console.error(`\nPokeDB snapshots are stale: ${changedSources.map((source) => source.battleType).join(', ')}`);
    process.exit(1);
  }
  console.log('\nPokeDB snapshots are up to date.');
  process.exit(0);
}

for (const source of changedSources) {
  await mkdir(dirname(source.outputPath), { recursive: true });
  await writeFile(source.outputPath, source.nextText, 'utf8');
  console.log(`Wrote ${source.battleType} snapshot to ${source.outputPath}`);
}

if (changedSources.length > 0) {
  const snapshotModulePath = resolve(ROOT, 'src/data/environmentPokeDbSnapshot.ts');
  const currentModuleText = await readFile(snapshotModulePath, 'utf8');
  const nextModuleText = currentModuleText.replace(/retrievedAt: '[^']+'/, `retrievedAt: '${new Date().toISOString()}'`);
  if (currentModuleText !== nextModuleText) {
    await writeFile(snapshotModulePath, nextModuleText, 'utf8');
    console.log(`Updated retrievedAt in ${snapshotModulePath}`);
  }
} else {
  console.log('\nPokeDB snapshots already match remote data.');
}
