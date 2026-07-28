import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ALLOWLIST_PATH = resolve(ROOT, 'src/data/seed/regMA/allowlist.ts');
const METADATA_PATH = resolve(ROOT, 'src/data/seed/regMA/metadata.ts');
const OUTPUT_PATH = resolve(ROOT, 'src/data/external/pokeapi/pokemon_facts.json');
const CACHE_DIR = resolve(ROOT, 'tmp/pokemon-facts-cache');
const POKEAPI_SPECIES_URL = 'https://pokeapi.co/api/v2/pokemon-species';
const MAX_FACT_LENGTH = 48;
const MIN_FACTS = 80;
const CONCURRENCY = 8;

const checkOnly = process.argv.includes('--check');

const versionLabels = {
  scarlet: '《朱》图鉴',
  violet: '《紫》图鉴',
  'legends-arceus': '《传说 阿尔宙斯》图鉴',
  sword: '《剑》图鉴',
  shield: '《盾》图鉴',
  'lets-go-pikachu': '《Let’s Go！皮卡丘》图鉴',
  'lets-go-eevee': '《Let’s Go！伊布》图鉴',
  'ultra-sun': '《究极之日》图鉴',
  'ultra-moon': '《究极之月》图鉴',
  sun: '《太阳》图鉴',
  moon: '《月亮》图鉴',
};

const versionPreference = [
  'scarlet',
  'violet',
  'legends-arceus',
  'sword',
  'shield',
  'ultra-sun',
  'ultra-moon',
  'sun',
  'moon',
  'lets-go-pikachu',
  'lets-go-eevee',
];

const interestingPatterns = [
  /[0-9０-９一二三四五六七八九十百千万亿]/u,
  /据说|甚至|只有|一旦|为了|能够|可以|从不|永远|实际上/u,
  /科学家|研究|传说|谜|宇宙|星星|月亮|梦|思乡/u,
  /声音|气味|温度|猎物|伙伴|睡|公里|千米|吨|年/u,
  /变成|模仿|吸收|储存|发光|融化|结晶|漂浮/u,
];

const genericPatterns = [
  /战斗|攻击|招式|特性|对手/u,
  /力量很强|非常强大|擅长/u,
];

function normalizeText(value) {
  return value
    .replace(/[\s\f]+/g, '')
    .trim();
}

function parseEligibleDexNumbers(source) {
  return [...source.matchAll(/nationalDexNo:\s*(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => a - b);
}

function parseRuleSetId(source) {
  const match = source.match(/currentRuleSet:\s*RuleSet\s*=\s*\{[\s\S]*?\bid:\s*'([^']+)'/);
  if (!match) throw new Error('Unable to resolve currentRuleSet.id from metadata.ts');
  return match[1];
}

function scoreFlavorText(entry) {
  const text = normalizeText(entry.flavor_text);
  if (text.length < 18 || text.length > MAX_FACT_LENGTH) return Number.NEGATIVE_INFINITY;

  let score = 2;
  interestingPatterns.forEach((pattern) => {
    if (pattern.test(text)) score += 2;
  });
  genericPatterns.forEach((pattern) => {
    if (pattern.test(text)) score -= 2;
  });
  const preferenceIndex = versionPreference.indexOf(entry.version.name);
  if (preferenceIndex >= 0) score += (versionPreference.length - preferenceIndex) / versionPreference.length;
  if (text.length >= 24 && text.length <= 42) score += 1;
  return score;
}

function chooseFact(species) {
  const entries = species.flavor_text_entries
    .filter((entry) => entry.language?.name === 'zh-hans' && versionLabels[entry.version?.name])
    .map((entry) => ({
      ...entry,
      flavor_text: normalizeText(entry.flavor_text),
      score: scoreFlavorText(entry),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort(
      (a, b) =>
        b.score - a.score
        || versionPreference.indexOf(a.version.name) - versionPreference.indexOf(b.version.name)
        || a.flavor_text.localeCompare(b.flavor_text, 'zh-CN'),
    );

  const selected = entries[0];
  if (!selected || selected.score < 4) return null;
  return {
    nationalDexNo: species.id,
    text: selected.flavor_text,
    sourceLabel: versionLabels[selected.version.name],
    sourceUrl: `${POKEAPI_SPECIES_URL}/${species.id}/`,
    sourceVersion: selected.version.name,
    interestScore: Number(selected.score.toFixed(2)),
  };
}

async function readCachedSpecies(nationalDexNo) {
  const cachePath = resolve(CACHE_DIR, `${nationalDexNo}.json`);
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const response = await fetch(`${POKEAPI_SPECIES_URL}/${nationalDexNo}/`, {
    headers: { Accept: 'application/json', 'User-Agent': 'LuxrayKit fact snapshot generator' },
  });
  if (!response.ok) {
    throw new Error(`PokeAPI species ${nationalDexNo} returned HTTP ${response.status}`);
  }
  const species = await response.json();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(species)}\n`, 'utf8');
  return species;
}

async function mapWithConcurrency(values, mapper) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, () => worker()));
  return results;
}

function validateSnapshot(snapshot, eligibleDexNumbers, ruleSetId) {
  const failures = [];
  const eligible = new Set(eligibleDexNumbers);
  const seenDexNumbers = new Set();
  const seenTexts = new Set();

  if (snapshot.ruleSetId !== ruleSetId) failures.push(`ruleSetId ${snapshot.ruleSetId} does not match ${ruleSetId}`);
  if (snapshot.source !== POKEAPI_SPECIES_URL) failures.push('source URL is missing or unexpected');
  if (!Array.isArray(snapshot.facts)) failures.push('facts must be an array');

  for (const fact of snapshot.facts ?? []) {
    if (!eligible.has(fact.nationalDexNo)) failures.push(`#${fact.nationalDexNo} is not in the current rule allowlist`);
    if (seenDexNumbers.has(fact.nationalDexNo)) failures.push(`duplicate nationalDexNo ${fact.nationalDexNo}`);
    seenDexNumbers.add(fact.nationalDexNo);
    if (typeof fact.text !== 'string' || fact.text.length < 18 || fact.text.length > MAX_FACT_LENGTH) {
      failures.push(`#${fact.nationalDexNo} has invalid text length`);
    }
    if (/\s/u.test(fact.text ?? '')) {
      failures.push(`#${fact.nationalDexNo} contains unexpected whitespace`);
    }
    const normalized = normalizeText(fact.text ?? '');
    if (seenTexts.has(normalized)) failures.push(`duplicate fact text for #${fact.nationalDexNo}`);
    seenTexts.add(normalized);
    if (!fact.sourceLabel || !fact.sourceUrl || !fact.sourceVersion) {
      failures.push(`#${fact.nationalDexNo} is missing provenance`);
    }
    if (!Number.isFinite(fact.interestScore) || fact.interestScore < 4) {
      failures.push(`#${fact.nationalDexNo} has an invalid interest score`);
    }
  }

  if ((snapshot.facts?.length ?? 0) < MIN_FACTS) {
    failures.push(`only ${snapshot.facts?.length ?? 0} facts generated; minimum is ${MIN_FACTS}`);
  }

  if (failures.length > 0) {
    throw new Error(`Pokemon fact snapshot validation failed:\n- ${failures.join('\n- ')}`);
  }
}

async function main() {
  const [allowlistSource, metadataSource] = await Promise.all([
    readFile(ALLOWLIST_PATH, 'utf8'),
    readFile(METADATA_PATH, 'utf8'),
  ]);
  const eligibleDexNumbers = parseEligibleDexNumbers(allowlistSource);
  const ruleSetId = parseRuleSetId(metadataSource);

  if (checkOnly) {
    const snapshot = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
    validateSnapshot(snapshot, eligibleDexNumbers, ruleSetId);
    console.log(`Pokemon fact snapshot is valid: ${snapshot.facts.length} facts for ${ruleSetId}.`);
    return;
  }

  console.log(`Fetching PokeAPI candidates for ${eligibleDexNumbers.length} current-rule species...`);
  const candidates = await mapWithConcurrency(eligibleDexNumbers, async (nationalDexNo) => {
    const species = await readCachedSpecies(nationalDexNo);
    return chooseFact(species);
  });
  const facts = candidates
    .filter(Boolean)
    .sort((a, b) => a.nationalDexNo - b.nationalDexNo);
  const snapshot = {
    ruleSetId,
    source: POKEAPI_SPECIES_URL,
    selectionPolicy: 'zh-hans entries scored for concise numeric, ecological, behavioral, and lore details; generic battle copy is penalized',
    facts,
  };

  validateSnapshot(snapshot, eligibleDexNumbers, ruleSetId);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${facts.length} facts to ${OUTPUT_PATH}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
