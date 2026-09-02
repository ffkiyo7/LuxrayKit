import { writeFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CACHE_DIR = resolve(ROOT, '.npm-cache', 'pokeapi');
const POKEAPI = 'https://pokeapi.co/api/v2';

const SEED_DIR = resolve(ROOT, 'src/data/seed/regMA');
const ALLOWLIST_PATH = resolve(SEED_DIR, 'allowlist.ts');
const CATALOG_PATH = resolve(SEED_DIR, 'catalog.ts');

const DEFAULT_SOURCE_REFS = [
  'reg-mb-official-eligible-pokemon',
  'pokeapi-pokemon-data',
  'pokeapi-official-artwork',
  'manual-seed-review',
];

const pad = (n) => String(n).padStart(3, '0');
const batchFileName = (n) => `catalog-batch-${pad(n)}.ts`;

// ── CLI ────────────────────────────────────────────────────────
//
// Nothing about the batch is hard-coded any more: a regulation rollover can add any number of
// Pokemon, so the batch number auto-discovers (highest existing batch + 1), the size is a flag
// (`--size=all` for "everything still missing"), and the source refs come from the caller —
// they must name entries that exist in `dataSourceManifest`, and `reg-ma-*` is no longer
// assumed. Usage:
//
//   node scripts/generate-catalog-batch.mjs [--batch=N] [--size=N|all] [--source-refs=a,b,c]
//                                           [--list] [--dry-run]

function parseArgs(argv) {
  const flags = new Map();
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match) throw new Error(`Unrecognized argument: ${arg}`);
    flags.set(match[1], match[2] ?? 'true');
  }

  const known = new Set(['batch', 'size', 'source-refs', 'list', 'dry-run', 'help']);
  for (const key of flags.keys()) {
    if (!known.has(key)) throw new Error(`Unknown flag --${key}. Known: ${[...known].join(', ')}`);
  }

  const rawSize = flags.get('size');
  const size =
    rawSize === undefined ? 40 : rawSize === 'all' ? Number.POSITIVE_INFINITY : Number(rawSize);
  if (!(size > 0)) throw new Error(`--size must be a positive number or "all" (got "${rawSize}").`);

  const rawBatch = flags.get('batch');
  const batchNumber = rawBatch === undefined ? undefined : Number(rawBatch);
  if (rawBatch !== undefined && (!Number.isInteger(batchNumber) || batchNumber < 1)) {
    throw new Error(`--batch must be a positive integer (got "${rawBatch}").`);
  }

  const rawRefs = flags.get('source-refs');
  const sourceRefs = rawRefs === undefined
    ? DEFAULT_SOURCE_REFS
    : rawRefs.split(',').map((ref) => ref.trim()).filter(Boolean);
  if (sourceRefs.length === 0) throw new Error('--source-refs must list at least one ref.');

  return {
    batchNumber,
    size,
    sourceRefs,
    list: flags.has('list'),
    dryRun: flags.has('dry-run'),
    help: flags.has('help'),
  };
}

/** Batch numbers already present on disk, ascending. */
async function existingBatchNumbers() {
  const files = await readdir(SEED_DIR);
  return files
    .map((file) => /^catalog-batch-(\d+)\.ts$/.exec(file))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    'Usage: node scripts/generate-catalog-batch.mjs [--batch=N] [--size=N|all] [--source-refs=a,b,c] [--list] [--dry-run]',
  );
  process.exit(0);
}

const knownBatches = await existingBatchNumbers();

if (args.list) {
  console.log(`Existing catalog batches (${knownBatches.length}): ${knownBatches.map(pad).join(', ') || '(none)'}`);
  console.log(`Next batch number would be: ${pad((knownBatches.at(-1) ?? 0) + 1)}`);
  process.exit(0);
}

const BATCH_NUMBER = args.batchNumber ?? (knownBatches.at(-1) ?? 0) + 1;
const BATCH_SIZE = args.size;
const batchSourceRefs = args.sourceRefs;
const BATCH_OUTPUT = resolve(SEED_DIR, batchFileName(BATCH_NUMBER));

if (args.batchNumber === undefined) {
  console.log(`Auto-selected batch ${pad(BATCH_NUMBER)} (existing: ${knownBatches.map(pad).join(', ') || 'none'}).`);
} else if (knownBatches.includes(BATCH_NUMBER)) {
  console.warn(`WARNING: batch ${pad(BATCH_NUMBER)} already exists and will be overwritten.`);
}
console.log(`Batch size: ${BATCH_SIZE === Number.POSITIVE_INFINITY ? 'all remaining' : BATCH_SIZE}`);
console.log(`Source refs: ${batchSourceRefs.join(', ')}`);

const artwork = (n) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`;

await mkdir(CACHE_DIR, { recursive: true });

// ── Cache helpers ──────────────────────────────────────────────

async function cachedFetch(url) {
  const key = url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 200);
  const cachePath = resolve(CACHE_DIR, `${key}.json`);
  if (existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  }
  console.log(`  GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  await writeFile(cachePath, JSON.stringify(data));
  return data;
}

async function pokeapi(endpoint) {
  return cachedFetch(`${POKEAPI}${endpoint}`);
}

// ── Name helpers ───────────────────────────────────────────────

function findName(names, lang) {
  const entry = names?.find((n) => n.language?.name === lang);
  return entry?.name ?? undefined;
}

// ── Type mapping ───────────────────────────────────────────────

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

// ── Move category mapping ─────────────────────────────────────

const DAMAGE_CLASS = { physical: 'Physical', special: 'Special', status: 'Status' };

// ── Allowlist parsing ──────────────────────────────────────────

async function parseAllowlist() {
  const text = await readFile(ALLOWLIST_PATH, 'utf8');
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

// ── Existing catalog IDs ───────────────────────────────────────

async function getExistingIds() {
  const pokemonIds = new Set();
  const abilityIds = new Set();
  const moveIds = new Set();
  const existingDexNos = new Set();

  // Read catalog.ts and all batch files
  const CATALOG_DIR = dirname(CATALOG_PATH);
  const catalogText = await readFile(CATALOG_PATH, 'utf8');
  const batchFiles = (await readdir(CATALOG_DIR)).filter((f) => f.startsWith('catalog-batch-') && f.endsWith('.ts'));
  const allTexts = [catalogText];
  for (const f of batchFiles) {
    allTexts.push(await readFile(resolve(CATALOG_DIR, f), 'utf8'));
  }
  const combined = allTexts.join('\n');

  // nationalDexNo is unique to Pokemon entries
  const dexRe = /nationalDexNo:\s*(\d+)/g;
  let d;
  while ((d = dexRe.exec(combined))) {
    existingDexNos.add(Number(d[1]));
  }

  // Collect ALL id values from all files (Pokemon, ability, and move namespaces don't overlap in practice)
  const idRe = /id:\s*'([^']+)'/g;
  let m;
  while ((m = idRe.exec(combined))) {
    const id = m[1];
    pokemonIds.add(id);
    abilityIds.add(id);
    moveIds.add(id);
  }

  return { pokemonIds, abilityIds, moveIds, existingDexNos };
}

// ── PokeAPI data fetching ──────────────────────────────────────

async function fetchPokemonData(nationalDexNo) {
  const [poke, species] = await Promise.all([
    pokeapi(`/pokemon/${nationalDexNo}/`),
    pokeapi(`/pokemon-species/${nationalDexNo}/`),
  ]);
  return { poke, species };
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

function extractLearnableMoves(poke) {
  const moveSet = new Set();
  for (const m of poke.moves) {
    const hasRecent = m.version_group_details.some((d) => {
      const vg = d.version_group?.name ?? '';
      return vg.includes('scarlet') || vg.includes('violet') || vg.includes('sword') || vg.includes('shield') || vg === 'legends-arceus';
    });
    if (hasRecent) {
      moveSet.add(m.move.name);
    }
  }
  if (moveSet.size === 0) {
    // Fallback: take all level-up moves from any version
    for (const m of poke.moves) {
      if (m.version_group_details.some((d) => d.move_learn_method?.name === 'level-up')) {
        moveSet.add(m.move.name);
      }
    }
  }
  return [...moveSet];
}

// ── Ability effect summary generation ──────────────────────────

async function fetchAbilityChineseName(abilityName) {
  try {
    const data = await pokeapi(`/ability/${abilityName}/`);
    const zhName = findName(data.names, 'zh-hans');
    return zhName;
  } catch {
    return undefined;
  }
}

// ── Generate ability effect summary ────────────────────────────

function abilityEffectSummary(abilityId) {
  // Chinese effect summaries — always preferred over English API data
  const known = {
    'analytic': '目标换人时，对该目标的招式威力提升。',
    'anger-point': '被击中要害后攻击大幅提升。',
    'anticipation': '感知对手是否持有危险招式。',
    'big-pecks': '防御不会被降低。',
    'cloud-nine': '场上天气效果失效。',
    'competitive': '能力被降低时特攻提升。',
    'contrary': '能力变化反转，提升变降低、降低变提升。',
    'cursed-body': '受到招式时有概率使该招式被封印。',
    'cute-charm': '被接触时可能使对手着迷。',
    'damp': '阻止自爆类招式。',
    'dry-skin': '受到水属性招式时回复 HP，受火属性招式伤害增加。',
    'drought': '登场时开启晴天。',
    'drizzle': '登场时开启雨天。',
    'early-bird': '更快从睡眠中醒来。',
    'flash-fire': '受到火属性招式时提升自身火属性威力。',
    'forecast': '根据天气改变形态。',
    'frisk': '登场时可以查看对手携带的道具。',
    'gluttony': 'HP 降低时更早食用树果。',
    'guts': '异常状态时攻击提升。',
    'heavy-metal': '体重变为原来的两倍。',
    'huge-power': '攻击力大幅提升。',
    'hydration': '下雨时解除异常状态。',
    'hyper-cutter': '攻击不会被降低。',
    'ice-body': '冰雹天气中每回合回复 HP。',
    'illuminate': '更容易遇到野生 Pokémon。',
    'immunity': '不会陷入中毒状态。',
    'imposter': '登场后变为与对手相同的形态。',
    'infiltrator': '可以突破光墙/反射壁/替身。',
    'inner-focus': '不会被畏缩。',
    'insomnia': '不会陷入睡眠状态。',
    'intimidate': '登场时降低对手攻击。',
    'iron-fist': '拳击类招式威力提升。',
    'justified': '被恶属性招式打中后攻击提升。',
    'keen-eye': '命中率不会被降低。',
    'klutz': '无法使用携带的道具。',
    'leaf-guard': '晴天下不会陷入异常状态。',
    'levitate': '不受地面属性招式影响。',
    'light-metal': '体重变为原来的一半。',
    'lightning-rod': '吸引电属性招式并提升特攻。',
    'limber': '不会被麻痹。',
    'magic-bounce': '反射部分变化招式。',
    'magic-guard': '只受到攻击伤害，不受其他方式造成的伤害。',
    'magma-armor': '不会被冰冻。',
    'marvel-scale': '异常状态时防御提升。',
    'minus': '有正电特性的同伴在场时特攻提升。',
    'mold-breaker': '无视对手特性造成招式效果。',
    'moody': '每回合一项能力提升、另一项降低。',
    'moxie': '打倒对手后攻击提升。',
    'multiscale': '满 HP 时受到的伤害降低。',
    'natural-cure': '换下场时自动解除异常状态。',
    'no-guard': '双方招式均必定命中。',
    'oblivious': '不会被着迷或挑衅。',
    'overcoat': '不受天气伤害和粉末类招式影响。',
    'own-tempo': '不会被混乱。',
    'pickpocket': '被接触时夺取对手携带的道具。',
    'plus': '有负电特性的同伴在场时特攻提升。',
    'poison-heal': '中毒时每回合回复 HP。',
    'poison-point': '被接触时可能使对手中毒。',
    'poison-touch': '使用接触招式时可能使对手中毒。',
    'prankster': '先制使用变化招式。',
    'pressure': '对手使用招式时消耗更多 PP。',
    'pure-power': '攻击力大幅提升。',
    'quick-feet': '异常状态时速度提升。',
    'rain-dish': '下雨时每回合回复 HP。',
    'reckless': '有反作用伤害的招式威力提升。',
    'regenerator': '换下场时回复 HP。',
    'rivalry': '面对同性对手时威力提升，异性时降低。',
    'rock-head': '不会受到自身招式的反作用伤害。',
    'rough-skin': '受到接触招式时给予对手反伤。',
    'sand-force': '沙暴中强化部分属性招式。',
    'sand-stream': '登场时开启沙暴。',
    'sand-veil': '沙暴中提升闪避。',
    'sap-sipper': '被草属性招式攻击后攻击提升。',
    'scrappy': '一般/格斗属性招式也能击中幽灵属性对手。',
    'sharpness': '切割类招式威力提升。',
    'shed-skin': '每回合有概率解除异常状态。',
    'sheer-force': '有追加效果的招式威力提升，但不再触发附加效果。',
    'shell-armor': '不会被击中要害。',
    'sniper': '击中要害时伤害更高。',
    'snow-cloak': '冰雹中提升闪避。',
    'snow-warning': '登场时开启冰雹。',
    'solar-power': '晴天下提升特攻并持续损失 HP。',
    'solid-rock': '受到效果绝佳招式时伤害降低。',
    'soundproof': '免疫声音类招式。',
    'speed-boost': '每回合结束时速度提升。',
    'stall': '总是后手使用招式。',
    'static': '被接触时可能麻痹对手。',
    'steadfast': '畏缩时速度提升。',
    'sturdy': '满 HP 时不会被一击打倒。',
    'super-luck': '击中要害率提升。',
    'swarm': 'HP 降低时强化虫属性招式。',
    'synchronize': '中毒/麻痹/灼伤时，对手也陷入相同状态。',
    'tangled-feet': '混乱时提升闪避。',
    'technician': '弱威力招式威力提升。',
    'telepathy': '不会被同伴的全体招式击中。',
    'thick-fat': '降低受到的火属性和冰属性伤害。',
    'torrent': 'HP 降低时强化水属性招式。',
    'tough-claws': '强化接触类招式。',
    'trace': '登场时复制对手的特性。',
    'unaware': '无视对手能力变化。',
    'unnerve': '让对手无法使用树果。',
    'volt-absorb': '受到电属性招式时回复 HP。',
    'water-absorb': '受到水属性招式时回复 HP。',
    'weak-armor': '受到物理招式时防御降低、速度提升。',
    'white-smoke': '防止能力被对手降低。',
  };
  return known[abilityId] ?? '待确认特性效果。';
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('Parsing allowlist...');
  const allowlist = await parseAllowlist();
  console.log(`Found ${allowlist.length} allowlist entries`);

  const { pokemonIds: existingPokeIds, abilityIds: existingAbilityIds, moveIds: existingMoveIds, existingDexNos } = await getExistingIds();
  console.log(`Existing catalog: ${existingPokeIds.size} pokemon (${existingDexNos.size} unique dex), ${existingAbilityIds.size} abilities, ${existingMoveIds.size} moves`);

  // Select batch: base-form entries not yet in catalog (check by nationalDexNo and pokemonId)
  const candidates = allowlist.filter((e) => {
    if (e.formName) return false;
    if (existingDexNos.has(e.nationalDexNo)) return false;
    if (e.pokemonId && existingPokeIds.has(e.pokemonId)) return false;
    return true;
  });
  const batch = candidates.slice(0, BATCH_SIZE);

  console.log(`Processing batch of ${batch.length} Pokemon...`);

  const newPokemon = [];
  const newAbilities = [];
  const newMoves = [];
  const allAbilityIds = new Set();
  const allMoveIds = new Set();
  let errors = 0;

  for (let i = 0; i < batch.length; i++) {
    const entry = batch[i];
    const dexNo = entry.nationalDexNo;
    const pct = `[${i + 1}/${batch.length}]`;

    try {
      console.log(`${pct} #${dexNo} ${entry.englishName}...`);
      const { poke, species } = await fetchPokemonData(dexNo);

      const pokemonId = poke.name; // PokeAPI canonical lowercase id
      const zhName = findName(species.names, 'zh-hans') || entry.englishName;
      const jaName = findName(species.names, 'ja-hrkt') || findName(species.names, 'ja') || '';
      const types = poke.types.map((t) => mapType(t.type.name));
      const baseStats = extractBaseStats(poke);
      const abilities = extractAbilities(poke);
      const learnableMoves = extractLearnableMoves(poke);

      // Track new abilities
      for (const ab of abilities) {
        if (!existingAbilityIds.has(ab)) {
          allAbilityIds.add(ab);
        }
      }
      // Filter learnableMoves to only include moves already in the catalog
      const filteredMoves = learnableMoves.filter((m) => existingMoveIds.has(m));
      // If no existing moves match, default to 'protect' which every Pokemon can learn
      const finalMoves = filteredMoves.length > 0 ? filteredMoves : (existingMoveIds.has('protect') ? ['protect'] : []);

      // Check mega eligibility against megaAllowlist names
      const megaAllowlistNames = new Set([
        'Mega Venusaur','Mega Charizard X','Mega Charizard Y','Mega Blastoise','Mega Beedrill',
        'Mega Pidgeot','Mega Clefable','Mega Alakazam','Mega Victreebel','Mega Slowbro',
        'Mega Gengar','Mega Kangaskhan','Mega Starmie','Mega Pinsir','Mega Gyarados',
        'Mega Aerodactyl','Mega Dragonite','Mega Meganium','Mega Feraligatr','Mega Ampharos',
        'Mega Steelix','Mega Scizor','Mega Heracross','Mega Skarmory','Mega Houndoom',
        'Mega Tyranitar','Mega Gardevoir','Mega Sableye','Mega Aggron','Mega Medicham',
        'Mega Manectric','Mega Sharpedo','Mega Camerupt','Mega Altaria','Mega Banette',
        'Mega Chimecho','Mega Absol','Mega Glalie','Mega Lopunny','Mega Garchomp',
        'Mega Lucario','Mega Abomasnow','Mega Gallade','Mega Froslass','Mega Emboar',
        'Mega Excadrill','Mega Audino','Mega Chandelure','Mega Golurk','Mega Chesnaught',
        'Mega Delphox','Mega Greninja','Mega Floette','Mega Meowstic','Mega Hawlucha',
        'Mega Crabominable','Mega Drampa','Mega Scovillain','Mega Glimmora',
      ]);
      const canMega = megaAllowlistNames.has(`Mega ${entry.englishName}`);

      const isExistingPoke = existingPokeIds.has(pokemonId);

      newPokemon.push({
        id: pokemonId,
        nationalDexNo: dexNo,
        chineseName: zhName,
        englishName: entry.englishName,
        japaneseName: jaName,
        iconRef: artwork(dexNo),
        types,
        baseStats,
        legalInCurrentRule: true,
        forms: [],
        abilities,
        learnableMoves: finalMoves,
        canMega: false,
        megaForms: [],
        notes: `Batch ${pad(BATCH_NUMBER)} catalog row from PokeAPI structured data joined to the eligible-Pokemon allowlist. Manual review still required.`,
        sourceRefs: batchSourceRefs,
      });
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      errors++;
    }

    // Small delay to be polite to PokeAPI
    if (i < batch.length - 1) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Fetch ability Chinese names
  console.log(`\nFetching Chinese names for ${allAbilityIds.size} new abilities...`);
  const abilityZhNames = new Map();
  let abIdx = 0;
  for (const abId of allAbilityIds) {
    abIdx++;
    try {
      const zhName = await fetchAbilityChineseName(abId);
      abilityZhNames.set(abId, zhName);
      if (abIdx % 10 === 0) console.log(`  Ability ${abIdx}/${allAbilityIds.size}`);
    } catch {
      abilityZhNames.set(abId, undefined);
    }
    if (abIdx < allAbilityIds.size) await new Promise((r) => setTimeout(r, 100));
  }

  // Build ability entries
  for (const [abId, zhName] of abilityZhNames) {
    const pokemonWithAbility = newPokemon
      .filter((p) => p.abilities.includes(abId))
      .map((p) => p.id);

    newAbilities.push({
      id: abId,
      chineseName: zhName || abId.charAt(0).toUpperCase() + abId.slice(1),
      englishName: abId.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      effectSummary: abilityEffectSummary(abId),
      pokemonIds: pokemonWithAbility,
      calculationImpact: 'pending',
      legalInCurrentRule: true,
      sourceRefs: batchSourceRefs,
    });
  }

  // ── Generate output file ──────────────────────────────────────

  const escapeStr = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const lines = [];

  lines.push(`// Auto-generated batch ${BATCH_NUMBER}: ${newPokemon.length} Pokemon, ${newAbilities.length} abilities`);
  lines.push(`// Generated from PokeAPI on ${new Date().toISOString()}`);
  lines.push(`// Source: ${POKEAPI}`);
  lines.push('');
  lines.push("import type { Ability, Pokemon } from '../../../types';");
  lines.push('');
  lines.push(`const batchRefs = [${batchSourceRefs.map((ref) => `'${escapeStr(ref)}'`).join(', ')}];`);
  lines.push(`const artwork = (n: number) => \`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/\${n}.png\`;`);
  lines.push('');

  // Abilities
  lines.push(`export const abilitiesBatch${String(BATCH_NUMBER).padStart(3, '0')}: Ability[] = [`);
  for (const ab of newAbilities) {
    lines.push('  {');
    lines.push(`    id: '${escapeStr(ab.id)}',`);
    lines.push(`    chineseName: '${escapeStr(ab.chineseName)}',`);
    lines.push(`    englishName: '${escapeStr(ab.englishName)}',`);
    lines.push(`    effectSummary: '${escapeStr(ab.effectSummary)}',`);
    lines.push(`    pokemonIds: [${ab.pokemonIds.map((id) => `'${escapeStr(id)}'`).join(', ')}],`);
    lines.push(`    calculationImpact: 'pending',`);
    lines.push(`    legalInCurrentRule: true,`);
    lines.push(`    sourceRefs: batchRefs,`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');

  // Pokemon
  lines.push(`export const pokemonBatch${String(BATCH_NUMBER).padStart(3, '0')}: Pokemon[] = [`);
  for (const p of newPokemon) {
    lines.push('  {');
    lines.push(`    id: '${escapeStr(p.id)}',`);
    lines.push(`    nationalDexNo: ${p.nationalDexNo},`);
    lines.push(`    chineseName: '${escapeStr(p.chineseName)}',`);
    lines.push(`    englishName: '${escapeStr(p.englishName)}',`);
    lines.push(`    japaneseName: '${escapeStr(p.japaneseName)}',`);
    lines.push(`    iconRef: artwork(${p.nationalDexNo}),`);
    lines.push(`    types: [${p.types.map((t) => `'${t}'`).join(', ')}],`);
    lines.push(`    baseStats: { hp: ${p.baseStats.hp}, attack: ${p.baseStats.attack}, defense: ${p.baseStats.defense}, specialAttack: ${p.baseStats.specialAttack}, specialDefense: ${p.baseStats.specialDefense}, speed: ${p.baseStats.speed} },`);
    lines.push(`    legalInCurrentRule: true,`);
    lines.push(`    forms: [],`);
    lines.push(`    abilities: [${p.abilities.map((a) => `'${escapeStr(a)}'`).join(', ')}],`);
    lines.push(`    learnableMoves: [${p.learnableMoves.map((m) => `'${escapeStr(m)}'`).join(', ')}],`);
    lines.push(`    canMega: false,`);
    lines.push(`    megaForms: [],`);
    lines.push(`    notes: '${escapeStr(p.notes)}',`);
    lines.push(`    sourceRefs: batchRefs,`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');

  const output = lines.join('\n');
  if (args.dryRun) {
    console.log(`\n[dry-run] Would write ${newPokemon.length} Pokemon + ${newAbilities.length} abilities to ${BATCH_OUTPUT}`);
    console.log('[dry-run] catalog.ts would be left untouched.');
    return;
  }
  await writeFile(BATCH_OUTPUT, output, 'utf8');
  console.log(`\nWrote ${newPokemon.length} Pokemon + ${newAbilities.length} abilities to ${BATCH_OUTPUT}`);

  if (errors > 0) {
    console.log(`\nWARNING: ${errors} Pokemon failed to fetch.`);
  }

  // ── Update catalog.ts to import and spread the batch ──────────

  console.log('\nUpdating catalog.ts...');
  let catalog = await readFile(CATALOG_PATH, 'utf8');

  // Check if already imported
  if (catalog.includes(batchFileName(BATCH_NUMBER).replace(/\.ts$/, ''))) {
    console.log('  Batch already imported in catalog.ts, skipping.');
    return;
  }

  // Add the import right after catalog.ts's type import. Matched by pattern rather than by an
  // exact string so adding a type to that import does not silently no-op this rewrite.
  const typeImport = /^import type \{[^}]*\} from '\.\.\/\.\.\/\.\.\/types';$/m;
  if (!typeImport.test(catalog)) {
    throw new Error('Could not find catalog.ts type import anchor; update generate-catalog-batch.mjs.');
  }
  catalog = catalog.replace(
    typeImport,
    (line) => `${line}\nimport { pokemonBatch${pad(BATCH_NUMBER)}, abilitiesBatch${pad(BATCH_NUMBER)} } from './${batchFileName(BATCH_NUMBER).replace(/\.ts$/, '')}';`,
  );

  // Spread batch abilities / pokemon into their arrays.
  for (const [anchor, spread] of [
    ['export const abilities: Ability[] = [', `...abilitiesBatch${pad(BATCH_NUMBER)},`],
    ['export const pokemon: Pokemon[] = [', `...pokemonBatch${pad(BATCH_NUMBER)},`],
  ]) {
    if (!catalog.includes(anchor)) {
      throw new Error(`Could not find catalog.ts anchor "${anchor}"; update generate-catalog-batch.mjs.`);
    }
    catalog = catalog.replace(anchor, `${anchor}\n  ${spread}`);
  }

  await writeFile(CATALOG_PATH, catalog, 'utf8');
  console.log('  Done.');

  console.log('\nBatch generation complete!');
  console.log(`Run: npm test       to verify`);
  console.log(`Run: npm run build  to verify`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
