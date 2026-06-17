import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'src/data/seed/regMA');
const OUTPUT_PATH = resolve(DATA_DIR, 'move-catalog.ts');
const POKEBASE_CACHE_DIR = resolve(ROOT, '.npm-cache/pokebase/pokemon-champions');
const POKEAPI_CACHE_DIR = resolve(ROOT, '.npm-cache/pokeapi');

const POKEBASE_POKEMON = 'https://pokebase.app/pokemon-champions/pokemon';
const POKEAPI = 'https://pokeapi.co/api/v2';
const UA = 'PokemonChampionsTool/1.0 (move learnset ingestion)';

const ZH_DATASET_DIR = resolve(ROOT, '.npm-cache/pokemon-dataset-zh');
await mkdir(POKEBASE_CACHE_DIR, { recursive: true });
await mkdir(POKEAPI_CACHE_DIR, { recursive: true });
await mkdir(ZH_DATASET_DIR, { recursive: true });

const TYPE_MAP = {
  Normal: 'Normal',
  Fire: 'Fire',
  Water: 'Water',
  Electric: 'Electric',
  Grass: 'Grass',
  Ice: 'Ice',
  Fighting: 'Fighting',
  Poison: 'Poison',
  Ground: 'Ground',
  Flying: 'Flying',
  Psychic: 'Psychic',
  Bug: 'Bug',
  Rock: 'Rock',
  Ghost: 'Ghost',
  Dragon: 'Dragon',
  Dark: 'Dark',
  Steel: 'Steel',
  Fairy: 'Fairy',
};

const TARGET_LABELS = {
  'all-opponents': '对手全体',
  'all-other-pokemon': '全体邻近目标',
  'all-pokemon': '全场',
  'entire-field': '全场',
  'opponents-field': '对方场地',
  'random-opponent': '随机对手',
  'selected-pokemon': '单体',
  'selected-pokemon-me-first': '单体',
  'specific-move': '指定招式',
  user: '自身',
  'user-and-allies': '我方全体',
  'user-or-ally': '自身或队友',
  'users-field': '我方场地',
};

const PROTECT_TARGETS = new Set(['selected-pokemon', 'all-opponents', 'all-other-pokemon', 'all-pokemon', 'random-opponent']);
const CONTACT_HINTS = [
  'tackle',
  'punch',
  'kick',
  'claw',
  'fang',
  'bite',
  'slam',
  'crash',
  'charge',
  'rush',
  'strike',
  'blitz',
  'lariat',
  'headbutt',
  'tail',
  'chop',
  'jab',
  'thrust',
  'wheel',
  'spin',
  'impact',
  'grip',
  'press',
  'stomp',
  'sweep',
  'whip',
];

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function tsString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;
}

function toNumber(value) {
  if (!value || value === '-') return undefined;
  const normalized = value.replace('%', '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cacheKey(url) {
  return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 180);
}

async function cachedText(url, cacheDir) {
  const path = resolve(cacheDir, `${cacheKey(url)}.html`);
  if (existsSync(path)) return readFile(path, 'utf8');
  const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  await writeFile(path, text, 'utf8');
  return text;
}

async function cachedJson(url) {
  const path = resolve(POKEAPI_CACHE_DIR, `${cacheKey(url)}.json`);
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = await res.json();
  await writeFile(path, JSON.stringify(json), 'utf8');
  return json;
}

async function readCurrentPokemon() {
  const files = ['catalog.ts', ...(await readdir(DATA_DIR)).filter((file) => (file.startsWith('catalog-batch-') || file.startsWith('catalog-forms')) && file.endsWith('.ts'))];
  const entries = new Map();

  for (const file of files) {
    const text = await readFile(resolve(DATA_DIR, file), 'utf8');
    const re =
      /\{\s*\n\s*id:\s*'([^']+)',\s*\n\s*nationalDexNo:\s*(\d+),\s*\n\s*chineseName:\s*'([^']+)',\s*\n\s*englishName:\s*'([^']+)'/g;
    let match;
    while ((match = re.exec(text))) {
      entries.set(match[1], {
        id: match[1],
        nationalDexNo: Number(match[2]),
        chineseName: match[3],
        englishName: match[4],
      });
    }
  }

  return [...entries.values()].sort((a, b) => a.nationalDexNo - b.nationalDexNo || a.id.localeCompare(b.id));
}

function parseAvailableMoves(html) {
  const start = html.indexOf('Available Moves');
  if (start < 0) return [];

  const rows = html.slice(start).split('<div class="table-row odd:bg-zinc-50 dark:odd:bg-zinc-950"').slice(1);
  return rows
    .map((row) => {
      const link = row.match(/href="\/pokemon-champions\/moves\/([^"]+)">([^<]+)<\/a>/);
      if (!link) return null;

      const type = row.match(/<img alt="([A-Za-z]+)"[^>]*width="24"/);
      const category = row.match(/aria-label="(Physical|Special|Status)"/);
      const description = row.match(/hidden lg:table-cell"><span[^>]*>([\s\S]*?)<\/span>/);
      const values = [...row.matchAll(/<span class="table-cell align-middle text-sm p-2">([^<]+)<\/span>/g)].map((match) =>
        decodeHtml(match[1]).trim(),
      );

      return {
        id: link[1],
        englishName: decodeHtml(link[2]).trim(),
        type: TYPE_MAP[type?.[1] ?? ''] ?? 'Normal',
        category: category?.[1] ?? 'Status',
        effectSummary: description ? decodeHtml(description[1]).trim() : '',
        power: toNumber(values[0]),
        accuracy: toNumber(values[1]),
        pp: toNumber(values[2]) ?? 0,
      };
    })
    .filter(Boolean);
}

function findLocalized(entries, languageName) {
  return entries?.find((entry) => entry.language?.name === languageName)?.name;
}

function findFlavorText(entries) {
  const zhHans = entries?.filter((entry) => entry.language?.name === 'zh-hans') ?? [];
  const preferred = [...zhHans].reverse().find((entry) =>
    ['scarlet-violet', 'sword-shield', 'lets-go-pikachu-lets-go-eevee'].includes(entry.version_group?.name),
  );
  return (preferred ?? zhHans.at(-1))?.flavor_text?.replace(/\s+/g, ' ').trim();
}

function inferMakesContact(move) {
  if (move.category !== 'Physical') return false;
  return CONTACT_HINTS.some((hint) => move.id.includes(hint));
}

// ── Chinese text cleaning ──

function cleanChineseText(text) {
  if (!text) return text;
  let cleaned = text.replace(/\s+/g, ' ');
  // Remove half-width spaces between CJK characters
  cleaned = cleaned.replace(/([一-鿿㐀-䶿])\s+([一-鿿㐀-䶿])/g, '$1$2');
  // Remove half-width spaces after Chinese punctuation
  cleaned = cleaned.replace(/([，。！？、；：])\s+/g, '$1');
  // Remove half-width spaces before Chinese punctuation
  cleaned = cleaned.replace(/\s+([，。！？、；：])/g, '$1');
  // Remove trailing/leading spaces
  cleaned = cleaned.trim();
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  return cleaned;
}

// ── Normalize for name matching ──

function normalizeMoveName(name) {
  return (name ?? '').toLowerCase().replace(/[''\-.\s]/g, '');
}

// ── Load 42arch Chinese move dataset ──

const ZH_DATASET_URL = 'https://raw.githubusercontent.com/42arch/pokemon-dataset-zh/main/data/move_list.json';
let zhMoveMap = new Map();

async function loadZhDataset() {
  const cachePath = resolve(ZH_DATASET_DIR, 'move_list.json');
  let json;
  if (existsSync(cachePath)) {
    json = JSON.parse(await readFile(cachePath, 'utf8'));
  } else {
    const res = await fetch(ZH_DATASET_URL, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Failed to fetch ${ZH_DATASET_URL}: ${res.status}`);
    json = await res.json();
    await writeFile(cachePath, JSON.stringify(json), 'utf8');
  }
  const entries = Array.isArray(json) ? json : [];
  for (const entry of entries) {
    const key = normalizeMoveName(entry.name_en);
    if (key) zhMoveMap.set(key, entry);
  }
  console.log(`Loaded ${zhMoveMap.size} Chinese move entries from 42arch dataset`);
}

await loadZhDataset();

// ── Enrich move with Chinese text ──

function isEnglishText(text) {
  if (!text) return true;
  // If text starts with A-Z or a-z and contains more Latin than CJK, it's English
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  return cjk === 0 && latin > 0;
}

// ── Manual overrides for moves not in 42arch dataset yet ──
const MANUAL_ZH = {
  'syrup-bomb': {
    name_zh: '糖浆炸弹',
    description: '使粘稠的麦芽糖浆爆炸，让对手陷入满身糖状态，在3回合内持续降低其速度。',
    accuracy: 85,
  },
};

async function enrichMove(move) {
  const normKey = normalizeMoveName(move.englishName);
  const manualOverride = MANUAL_ZH[move.id];
  const zhEntry = zhMoveMap.get(normKey) || manualOverride;

  try {
    const data = await cachedJson(`${POKEAPI}/move/${move.id}/`);
    // Chinese name: 42arch first, then PokeAPI, never English
    const chineseName = cleanChineseText(
      zhEntry?.name_zh || findLocalized(data.names, 'zh-hans') || undefined,
    );
    // Effect summary: 42arch description first, then PokeAPI flavor text
    const effectSummary = cleanChineseText(
      zhEntry?.description || findFlavorText(data.flavor_text_entries) || move.effectSummary,
    );
    return {
      ...move,
      chineseName: chineseName || undefined,
      effectSummary: effectSummary || undefined,
      targetScope: TARGET_LABELS[data.target?.name] ?? data.target?.name ?? '单体',
      makesContact: inferMakesContact(move),
      affectedByProtect: PROTECT_TARGETS.has(data.target?.name),
      accuracy: manualOverride?.accuracy ?? data.accuracy ?? move.accuracy,
      pp: data.pp ?? move.pp,
    };
  } catch (error) {
    console.warn(`WARN could not enrich move ${move.id}: ${error.message}`);
    const chineseName = zhEntry?.name_zh ? cleanChineseText(zhEntry.name_zh) : undefined;
    const effectSummary = zhEntry?.description ? cleanChineseText(zhEntry.description) : undefined;
    return {
      ...move,
      chineseName: chineseName || undefined,
      effectSummary: effectSummary || undefined,
      targetScope: '单体',
      makesContact: inferMakesContact(move),
      affectedByProtect: move.category !== 'Status',
    };
  }
}

const pokemon = await readCurrentPokemon();
const movesById = new Map();
const failedPokemon = [];

console.log(`Reading PokéBase available moves for ${pokemon.length} Pokémon...`);

for (const [index, entry] of pokemon.entries()) {
  const url = `${POKEBASE_POKEMON}/${entry.id}`;
  try {
    const html = await cachedText(url, POKEBASE_CACHE_DIR);
    const availableMoves = parseAvailableMoves(html);
    if (availableMoves.length === 0) {
      failedPokemon.push(entry);
      console.warn(`[${index + 1}/${pokemon.length}] MISS ${entry.id}: no available moves parsed`);
      continue;
    }

    for (const move of availableMoves) {
      const existing = movesById.get(move.id) ?? { ...move, learnableByPokemonIds: [] };
      existing.learnableByPokemonIds = Array.from(new Set([...existing.learnableByPokemonIds, entry.id]));
      movesById.set(move.id, existing);
    }

    console.log(`[${String(index + 1).padStart(3, '0')}/${pokemon.length}] OK ${entry.id.padEnd(24)} ${availableMoves.length} moves`);
  } catch (error) {
    failedPokemon.push(entry);
    console.warn(`[${index + 1}/${pokemon.length}] FAIL ${entry.id}: ${error.message}`);
  }
}

if (failedPokemon.length > 0) {
  throw new Error(`Could not parse available moves for ${failedPokemon.length} Pokémon: ${failedPokemon.map((entry) => entry.id).join(', ')}`);
}

console.log(`\nEnriching ${movesById.size} unique moves from PokeAPI...`);

const enrichedMoves = [];
for (const [index, move] of [...movesById.values()].sort((a, b) => a.id.localeCompare(b.id)).entries()) {
  const enriched = await enrichMove(move);
  enriched.learnableByPokemonIds.sort((a, b) => {
    const left = pokemon.find((entry) => entry.id === a)?.nationalDexNo ?? 9999;
    const right = pokemon.find((entry) => entry.id === b)?.nationalDexNo ?? 9999;
    return left - right || a.localeCompare(b);
  });
  enrichedMoves.push(enriched);
  if ((index + 1) % 25 === 0 || index + 1 === movesById.size) {
    console.log(`[${index + 1}/${movesById.size}] enriched`);
  }
}

// ── Validate: no English text in Chinese fields ──

const englishNames = [];
const englishEffects = [];
for (const move of enrichedMoves) {
  if (!move.chineseName || isEnglishText(move.chineseName)) {
    englishNames.push(move.id);
  }
  if (!move.effectSummary || isEnglishText(move.effectSummary)) {
    englishEffects.push(move.id);
  }
}
if (englishNames.length > 0) {
  console.error(`\nERROR: ${englishNames.length} moves have English or missing chineseName:`);
  console.error(englishNames.join(', '));
}
if (englishEffects.length > 0) {
  console.error(`\nERROR: ${englishEffects.length} moves have English or missing effectSummary:`);
  console.error(englishEffects.join(', '));
}
if (englishNames.length > 0 || englishEffects.length > 0) {
  process.exit(1);
}

console.log('\nAll moves have verified Chinese names and effect summaries.\n');

const lines = [
  "import type { Move } from '../../../types';",
  '',
  '// Auto-generated from PokéBase Champions Pokémon available-move pages.',
  `// Generated: ${new Date().toISOString()}`,
  `// Source: ${POKEBASE_POKEMON}`,
  '',
  "const moveSourceRefs = ['pokebase-champions-learnsets', 'pokeapi-move-data', 'pokemon-zh-dataset-move-text'];",
  '',
  'export const championsMoves: Move[] = [',
];

for (const move of enrichedMoves) {
  lines.push('  {');
  lines.push(`    id: ${tsString(move.id)},`);
  lines.push(`    chineseName: ${tsString(move.chineseName)},`);
  lines.push(`    englishName: ${tsString(move.englishName)},`);
  lines.push(`    type: ${tsString(move.type)},`);
  lines.push(`    category: ${tsString(move.category)},`);
  if (move.power !== undefined) lines.push(`    power: ${move.power},`);
  if (move.accuracy !== undefined) lines.push(`    accuracy: ${move.accuracy},`);
  lines.push(`    pp: ${move.pp},`);
  lines.push(`    targetScope: ${tsString(move.targetScope)},`);
  lines.push(`    makesContact: ${move.makesContact},`);
  lines.push(`    affectedByProtect: ${move.affectedByProtect},`);
  lines.push(`    effectSummary: ${tsString(move.effectSummary)},`);
  lines.push('    legalInCurrentRule: true,');
  lines.push(`    learnableByPokemonIds: [${move.learnableByPokemonIds.map(tsString).join(', ')}],`);
  lines.push('    sourceRefs: moveSourceRefs,');
  lines.push('  },');
}

lines.push('];');
lines.push('');

await writeFile(OUTPUT_PATH, lines.join('\n'), 'utf8');

const totalLearnsetLinks = enrichedMoves.reduce((sum, move) => sum + move.learnableByPokemonIds.length, 0);
console.log(`\nWrote ${enrichedMoves.length} moves and ${totalLearnsetLinks} Pokémon-move links to ${OUTPUT_PATH}`);
