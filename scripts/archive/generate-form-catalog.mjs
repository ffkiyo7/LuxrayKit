import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'src/data/seed/regMA');
const CACHE_DIR = resolve(ROOT, '.npm-cache/pokeapi');
const POKEAPI = 'https://pokeapi.co/api/v2';
const UA = 'PokemonChampionsTool/1.0 (form catalog generation)';

await mkdir(CACHE_DIR, { recursive: true });

const formRefs = [
  'reg-ma-official-eligible-pokemon',
  'pokeapi-pokemon-data',
  'pokeapi-official-artwork',
  'manual-seed-review',
];

// championsFormId → PokeAPI endpoint id
const FORM_POKEAPI_IDS = {
  '0026-001': 'raichu-alola',
  '0038-001': 'ninetales-alola',
  '0059-001': 'arcanine-hisui',
  '0080-002': 'slowbro-galar',
  '0128-001': 'tauros-paldea-combat-breed',
  '0128-002': 'tauros-paldea-blaze-breed',
  '0128-003': 'tauros-paldea-aqua-breed',
  '0157-001': 'typhlosion-hisui',
  '0199-001': 'slowking-galar',
  '0479-000': 'rotom',
  '0479-001': 'rotom-heat',
  '0479-002': 'rotom-wash',
  '0479-003': 'rotom-frost',
  '0479-004': 'rotom-fan',
  '0479-005': 'rotom-mow',
  '0503-001': 'samurott-hisui',
  '0571-001': 'zoroark-hisui',
  '0618-001': 'stunfisk-galar',
  '0678-000': 'meowstic-male',
  '0678-001': 'meowstic-female',
  '0706-001': 'goodra-hisui',
  '0711-000': 'gourgeist-average',
  '0711-001': 'gourgeist-small',
  '0711-002': 'gourgeist-large',
  '0711-003': 'gourgeist-super',
  '0713-001': 'avalugg-hisui',
  '0724-001': 'decidueye-hisui',
  '0745-000': 'lycanroc-midday',
  '0745-001': 'lycanroc-midnight',
  '0745-002': 'lycanroc-dusk',
  '0902-000': 'basculegion-male',
  '0902-001': 'basculegion-female',
};

// Chinese name fallbacks where PokeAPI is insufficient
const ZH_FALLBACKS = {
  'tauros-paldea-combat-breed': '肯泰罗（帕底亚的样子・斗战种）',
  'tauros-paldea-blaze-breed': '肯泰罗（帕底亚的样子・火炽种）',
  'tauros-paldea-aqua-breed': '肯泰罗（帕底亚的样子・水澜种）',
  'basculegion-male': '幽尾玄鱼（雄性）',
  'basculegion-female': '幽尾玄鱼（雌性）',
};

// ── Helpers ──

function cacheKey(url) {
  return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 200);
}

async function cachedJson(url) {
  const path = resolve(CACHE_DIR, `${cacheKey(url)}.json`);
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = await res.json();
  await writeFile(path, JSON.stringify(json));
  return json;
}

async function pokeapi(endpoint) {
  return cachedJson(`${POKEAPI}${endpoint}`);
}

function findName(names, lang) {
  return names?.find((n) => n.language?.name === lang)?.name;
}

function extractBaseStats(poke) {
  const s = {};
  for (const stat of poke.stats) {
    const name = stat.stat.name;
    if (name === 'hp') s.hp = stat.base_stat;
    else if (name === 'attack') s.attack = stat.base_stat;
    else if (name === 'defense') s.defense = stat.base_stat;
    else if (name === 'special-attack') s.specialAttack = stat.base_stat;
    else if (name === 'special-defense') s.specialDefense = stat.base_stat;
    else if (name === 'speed') s.speed = stat.base_stat;
  }
  return s;
}

function extractAbilities(poke) {
  return poke.abilities
    .sort((a, b) => a.slot - b.slot)
    .map((a) => a.ability.name);
}

const TYPE_MAP = {
  normal: 'Normal', fire: 'Fire', water: 'Water', electric: 'Electric',
  grass: 'Grass', ice: 'Ice', fighting: 'Fighting', poison: 'Poison',
  ground: 'Ground', flying: 'Flying', psychic: 'Psychic', bug: 'Bug',
  rock: 'Rock', ghost: 'Ghost', dragon: 'Dragon', dark: 'Dark',
  steel: 'Steel', fairy: 'Fairy',
};

function mapType(t) {
  return TYPE_MAP[t] ?? t;
}

// ── Chinese name strategy ──

function buildChineseName(speciesZhName, formNameZh, allowlistEnglishName, pokeapiId) {
  // Use explicit fallback if available
  if (ZH_FALLBACKS[pokeapiId]) {
    return ZH_FALLBACKS[pokeapiId];
  }

  // If no form name, use species name
  if (!formNameZh) return speciesZhName;

  // If form_name is just "${species}的样子" (base form marker), use species name
  if (formNameZh === `${speciesZhName}的样子`) return speciesZhName;

  // If form_name contains the species name, it's a complete replacement (e.g. 加热洛托姆)
  if (formNameZh.includes(speciesZhName)) return formNameZh;

  // If form_name contains 的样子/的模樣, it's a suffix pattern (e.g. 阿罗拉的样子)
  if (/[的样子模樣]/.test(formNameZh)) {
    const suffix = formNameZh.replace(/的样子$/, '');
    return `${speciesZhName}（${suffix}的样子）`;
  }

  // Otherwise, form_name is a descriptor (e.g. size, color) — combine with species
  return `${speciesZhName}（${formNameZh}）`;
}

// ── Parse allowlist ──

async function parseAllowlist() {
  const text = await readFile(resolve(DATA_DIR, 'allowlist.ts'), 'utf8');
  const entries = [];
  const re = /\{\s*\n\s*id:\s*'([^']+)',\s*\n(?:\s*pokemonId:\s*'([^']+)',\s*\n)?\s*championsFormId:\s*'([^']+)',\s*\n\s*nationalDexNo:\s*(\d+),\s*\n\s*englishName:\s*'([^']+)'(?:,\s*\n\s*formName:\s*'([^']+)')?/g;
  let m;
  while ((m = re.exec(text))) {
    entries.push({
      id: m[1],
      pokemonId: m[2] || undefined,
      championsFormId: m[3],
      nationalDexNo: Number(m[4]),
      englishName: m[5],
      formName: m[6] || undefined,
    });
  }
  return entries;
}

// ── Check existing catalog IDs ──

async function getExistingIds() {
  const files = (await import('fs/promises')).readdir;
  const dirFiles = await (await import('node:fs/promises')).readdir(DATA_DIR);
  const tsFiles = dirFiles.filter((f) => f.endsWith('.ts') && f !== 'catalog-forms.ts');
  const allTexts = [];
  for (const f of tsFiles) {
    allTexts.push(await readFile(resolve(DATA_DIR, f), 'utf8'));
  }
  const combined = allTexts.join('\n');

  const existingIds = new Set();
  const idRe = /id:\s*'([^']+)'/g;
  let m;
  while ((m = idRe.exec(combined))) {
    existingIds.add(m[1]);
  }
  return existingIds;
}

// ── Main ──

async function main() {
  const allowlist = await parseAllowlist();
  const existingIds = await getExistingIds();

  // Select form entries (those with formName) that have a PokeAPI mapping
  const formEntries = allowlist.filter((e) => e.formName && FORM_POKEAPI_IDS[e.championsFormId]);

  console.log(`Found ${formEntries.length} form entries to process`);
  console.log(`Existing catalog has ${existingIds.size} IDs\n`);

  const results = [];
  const failures = [];

  for (let i = 0; i < formEntries.length; i++) {
    const entry = formEntries[i];
    const pokeapiId = FORM_POKEAPI_IDS[entry.championsFormId];
    const pct = `[${String(i + 1).padStart(2, '0')}/${formEntries.length}]`;

    // Skip if already in catalog
    if (existingIds.has(pokeapiId)) {
      console.log(`${pct} SKIP ${entry.championsFormId} ${entry.englishName} (already in catalog as '${pokeapiId}')`);
      continue;
    }

    try {
      console.log(`${pct} #${entry.nationalDexNo} ${entry.englishName} → ${pokeapiId}`);

      const [poke, species] = await Promise.all([
        pokeapi(`/pokemon/${pokeapiId}/`),
        pokeapi(`/pokemon-species/${entry.nationalDexNo}/`),
      ]);

      // spriteId = PokeAPI numeric id from the pokemon endpoint
      const spriteId = poke.id;

      // Names
      const speciesZhName = findName(species.names, 'zh-hans');
      const speciesJaName = findName(species.names, 'ja-hrkt') || findName(species.names, 'ja');

      // Try form-specific names
      let formNameZh;
      let formNameJa;
      try {
        const formData = await pokeapi(`/pokemon-form/${pokeapiId}/`);
        formNameZh = findName(formData.form_names, 'zh-hans');
        formNameJa = findName(formData.form_names, 'ja-hrkt');
      } catch {
        // Form endpoint might not exist; that's OK
      }

      const chineseName = buildChineseName(speciesZhName, formNameZh, entry.englishName, pokeapiId);
      const japaneseName = speciesJaName || entry.englishName;

      if (!formNameJa && !speciesJaName) {
        console.warn(`  WARN: No Japanese name found for ${pokeapiId}, falling back to English`);
      }

      const types = poke.types.map((t) => mapType(t.type.name));
      const baseStats = extractBaseStats(poke);
      const abilities = extractAbilities(poke);

      results.push({
        id: pokeapiId,
        nationalDexNo: entry.nationalDexNo,
        chineseName,
        englishName: entry.englishName,
        japaneseName,
        spriteId,
        types,
        baseStats,
        abilities,
      });

      console.log(`  OK spriteId=${spriteId} types=[${types.join(', ')}] zh="${chineseName}" ja="${japaneseName}"`);
      console.log(`  stats: hp=${baseStats.hp} atk=${baseStats.attack} def=${baseStats.defense} spa=${baseStats.specialAttack} spd=${baseStats.specialDefense} spe=${baseStats.speed}`);
      console.log(`  abilities: [${abilities.join(', ')}]`);
    } catch (err) {
      console.error(`  FAIL: ${err.message}`);
      failures.push({ championsFormId: entry.championsFormId, englishName: entry.englishName, error: err.message });
    }

    if (i < formEntries.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failures:`);
    for (const f of failures) {
      console.error(`  ${f.championsFormId} ${f.englishName}: ${f.error}`);
    }
    process.exit(1);
  }

  console.log(`\nSuccessfully processed ${results.length} forms`);

  // ── Generate output ──
  const escapeStr = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const lines = [];
  lines.push('// Auto-generated form Pokemon catalog');
  lines.push(`// Generated from PokeAPI on ${new Date().toISOString()}`);
  lines.push(`// Source: ${POKEAPI}`);
  lines.push('');
  lines.push("import type { Pokemon } from '../../../types';");
  lines.push('');
  lines.push("const formRefs = [");
  lines.push("  'reg-ma-official-eligible-pokemon',");
  lines.push("  'pokeapi-pokemon-data',");
  lines.push("  'pokeapi-official-artwork',");
  lines.push("  'manual-seed-review',");
  lines.push('];');
  lines.push('');
  lines.push('export const pokemonForms032: Pokemon[] = [');

  for (const p of results) {
    lines.push('  {');
    lines.push(`    id: '${escapeStr(p.id)}',`);
    lines.push(`    nationalDexNo: ${p.nationalDexNo},`);
    lines.push(`    chineseName: '${escapeStr(p.chineseName)}',`);
    lines.push(`    englishName: '${escapeStr(p.englishName)}',`);
    lines.push(`    japaneseName: '${escapeStr(p.japaneseName)}',`);
    lines.push(`    iconRef: \`/assets/pokemon/thumbs/\${${p.spriteId}}.png\`,`);
    lines.push(`    types: [${p.types.map((t) => `'${t}'`).join(', ')}],`);
    lines.push(`    baseStats: { hp: ${p.baseStats.hp}, attack: ${p.baseStats.attack}, defense: ${p.baseStats.defense}, specialAttack: ${p.baseStats.specialAttack}, specialDefense: ${p.baseStats.specialDefense}, speed: ${p.baseStats.speed} },`);
    lines.push('    legalInCurrentRule: true,');
    lines.push('    forms: [],');
    lines.push(`    abilities: [${p.abilities.map((a) => `'${escapeStr(a)}'`).join(', ')}],`);
    lines.push('    learnableMoves: [],');
    lines.push('    canMega: false,');
    lines.push('    megaForms: [],');
    lines.push(`    notes: 'Form Pokemon catalog row from PokeAPI structured data joined to official Reg M-A allowlist. Manual review still required.',`);
    lines.push('    sourceRefs: formRefs,');
    lines.push('  },');
  }

  lines.push('];');
  lines.push('');

  const outputPath = resolve(DATA_DIR, 'catalog-forms.ts');
  await writeFile(outputPath, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${results.length} form Pokemon to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
