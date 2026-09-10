import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'src/data/seed/regMA/catalog.ts');
// No `?regulation=` filter on purpose. It used to pin `m-b`, which is exactly the kind of hardcoded
// regulation AGENTS.md §1 forbids — and PokéBase ignores the parameter anyway (the list is one page of
// every item, `totalPages: 1`). Availability is read off each row's `availableInChampions` instead.
const POKEBASE_ITEMS = 'https://pokebase.app/pokemon-champions/items';
const POKEBASE_ITEM_PAGE = 'https://pokebase.app/pokemon-champions/items';
const POKEAPI_ITEM_API = 'https://pokeapi.co/api/v2/item';
const POKEAPI_ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
const USER_AGENT = 'LuxrayKitItemAudit/1.0 (read-only catalog audit)';
const CONCURRENCY = 4;
const WRITE_IMAGES = process.argv.includes('--write');
const SHOW_REPORT = process.argv.includes('--report');
const execFileAsync = promisify(execFile);
const manuallyReviewedChineseNames = new Map([
  ['fairy-feather', { name: '妖精之羽', sourceUrl: 'https://wiki.52poke.com/wiki/妖精之羽（道具）' }],
  // PokeAPI files Leek under its pre-Gen-VIII slug `stick`, so `/item/leek` 404s. The catalog keeps
  // PokéBase's `leek` slug (it is also the icon path), so pin PokeAPI's zh-hans name for `stick`.
  ['leek', { name: '大葱', sourceUrl: `${POKEAPI_ITEM_API}/stick` }],
]);

const normalizeName = (value) => value.replaceAll('’', "'");
const stringLiteral = `(?:'([^']*)'|\"([^\"]*)\")`;
const stringValue = (match, firstGroup, secondGroup) => match[firstGroup] ?? match[secondGroup];

function parseRows(catalogText, sectionName, fields, sourceCategory) {
  const sectionStart = catalogText.indexOf(`const ${sectionName}`);
  if (sectionStart < 0) throw new Error(`Could not find ${sectionName}`);
  const section = catalogText.slice(sectionStart);
  const sectionEnd = section.indexOf('] as const');
  if (sectionEnd < 0) throw new Error(`Could not find end of ${sectionName}`);

  const trailingPokemonIds = fields === 3 ? '(?:\\s*,\\s*\\[[^\\]]*\\])?' : '';
  const expression = new RegExp(`\\[\\s*${Array.from({ length: fields }, () => stringLiteral).join('\\s*,\\s*')}${trailingPokemonIds}\\s*\\]`, 'g');
  const rows = [];
  let match;
  while ((match = expression.exec(section.slice(0, sectionEnd)))) {
    rows.push({
      id: stringValue(match, 1, 2),
      chineseName: stringValue(match, 3, 4),
      englishName: stringValue(match, 5, 6),
      effectSummary: fields === 4 ? stringValue(match, 7, 8) : null,
      sourceCategory,
    });
  }
  return rows;
}

function parseCatalog(catalogText) {
  return [
    ...parseRows(catalogText, 'heldItemRows', 4, 'held-item'),
    ...parseRows(catalogText, 'megaStoneRows', 3, 'mega-evolution'),
    ...parseRows(catalogText, 'berryRows', 4, 'berry'),
  ];
}

async function fetchWithCurl(url, accept) {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '-L',
      '--fail',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '20',
      '--max-time',
      '60',
      '-A',
      USER_AGENT,
      '-H',
      `Accept: ${accept}`,
      url,
    ],
    { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout;
}

// The item payload is a React Flight stream split across many `self.__next_f.push([1,"…"])` calls, and
// no single chunk is valid JSON on its own — so decode every chunk and concatenate before parsing.
// (The previous version inspected one chunk at a time and had stopped finding the payload entirely.)
function parsePokebaseList(html) {
  const chunks = [];
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      const payload = JSON.parse(match[1]);
      if (typeof payload === 'string') chunks.push(payload);
    } catch {
      // A Flight segment need not be a JSON string literal; skip it.
    }
  }

  // Rows look like `{"name":…,"slug":"air-balloon",…,"availableInChampions":true,…}`. Each row is
  // self-contained, so walk the slugs and parse the enclosing object by brace matching.
  const text = chunks.join('');
  const items = new Map();
  for (const slugMatch of text.matchAll(/"slug":"([a-z0-9-]+)"/g)) {
    if (items.has(slugMatch[1])) continue;
    const row = enclosingJsonObject(text, slugMatch.index);
    if (row && typeof row.name === 'string' && typeof row.category === 'string') items.set(slugMatch[1], row);
  }

  if (items.size === 0) throw new Error('Could not find the PokéBase item data payload');
  return items;
}

// Walk back to the `{` that opens the object containing `index`, then forward to its matching `}`.
function enclosingJsonObject(text, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0 && index - i < 20000; i -= 1) {
    if (text[i] === '}') depth += 1;
    else if (text[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth -= 1;
    }
  }
  if (start < 0) return null;

  depth = 0;
  for (let i = start; i < text.length && i - start < 20000; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function imagePixelHash(input) {
  const pixels = await sharp(input)
    .ensureAlpha()
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer();
  return createHash('sha256').update(pixels).digest('hex');
}

async function fetchChineseNameReference(item) {
  if (item.sourceCategory === 'mega-evolution') return null;
  if (manuallyReviewedChineseNames.has(item.id)) return manuallyReviewedChineseNames.get(item.id);

  const sourceUrl = `${POKEAPI_ITEM_API}/${item.id}`;
  const data = JSON.parse((await fetchWithCurl(sourceUrl, 'application/json')).toString('utf8'));
  const name = data.names?.find((entry) => entry.language?.name === 'zh-hans')?.name;
  if (!name) throw new Error(`PokeAPI item has no zh-hans name: ${item.id}`);
  return { name, sourceUrl };
}

async function auditItem(item, reference) {
  const pageUrl = `${POKEBASE_ITEM_PAGE}/${item.id}`;
  if (!reference) return { ...item, pageUrl, error: 'missing from the PokéBase Champions item list' };
  if (reference.availableInChampions === false) {
    return { ...item, pageUrl, reference, error: 'PokéBase reports availableInChampions: false' };
  }
  const imageSourceUrl = item.sourceCategory === 'berry'
    ? `${POKEAPI_ITEM_SPRITES}/${item.id}.png`
    : reference.icon?.url;
  if (!imageSourceUrl) return { ...item, pageUrl, error: 'reference item has no icon URL', reference };

  const localPath = resolve(ROOT, 'public/assets/items', `${item.id}.png`);
  try {
    const [sourceBuffer, chineseNameReference] = await Promise.all([
      fetchWithCurl(imageSourceUrl, 'image/png,image/*;q=0.8,*/*;q=0.5'),
      fetchChineseNameReference(item),
    ]);
    const [referenceHash, localHash] = await Promise.all([imagePixelHash(sourceBuffer), imagePixelHash(localPath)]);
    const imageMatches = referenceHash === localHash;
    const titleMatches = normalizeName(reference.name) === normalizeName(item.englishName);
    const chineseNameMatches = chineseNameReference === null || chineseNameReference.name === item.chineseName;
    const categoryMatches = reference.category === item.sourceCategory;

    if (WRITE_IMAGES && !imageMatches) await writeFile(localPath, sourceBuffer);

    return {
      ...item,
      pageUrl,
      reference,
      imageSourceUrl,
      chineseNameReference,
      titleMatches,
      chineseNameMatches,
      categoryMatches,
      imageMatches,
      imageWritten: WRITE_IMAGES && !imageMatches,
      error: null,
    };
  } catch (error) {
    return { ...item, pageUrl, reference, imageSourceUrl, error: error instanceof Error ? error.message : String(error) };
  }
}

async function mapConcurrent(values, worker) {
  const results = new Array(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
      while (index < values.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await worker(values[currentIndex]);
      }
    }),
  );
  return results;
}

const catalog = await readFile(CATALOG_PATH, 'utf8');
const items = parseCatalog(catalog);
const referenceById = parsePokebaseList((await fetchWithCurl(POKEBASE_ITEMS, 'text/html')).toString('utf8'));
const results = await mapConcurrent(items, (item) => auditItem(item, referenceById.get(item.id)));
const failures = results.filter((result) => (
  result.error
  || !result.titleMatches
  || result.chineseNameMatches === false
  || !result.categoryMatches
  || (!WRITE_IMAGES && !result.imageMatches)
));

for (const result of failures) {
  const reasons = [
    result.error,
    result.titleMatches === false ? `English name ${JSON.stringify(result.reference?.name)} != ${JSON.stringify(result.englishName)}` : null,
    result.chineseNameMatches === false
      ? `Chinese name ${JSON.stringify(result.chineseNameReference?.name)} != ${JSON.stringify(result.chineseName)}`
      : null,
    result.categoryMatches === false ? `category ${JSON.stringify(result.reference?.category)} != ${JSON.stringify(result.sourceCategory)}` : null,
    result.imageMatches === false ? 'local image differs from reference image' : null,
  ].filter(Boolean);
  console.log(`${result.id}: ${reasons.join('; ')}${result.imageSourceUrl ? `; reference ${result.imageSourceUrl}` : ''}`);
}

if (SHOW_REPORT) {
  for (const result of results) {
    console.log(JSON.stringify({
      id: result.id,
      chineseName: result.chineseName,
      referenceChineseName: result.chineseNameReference?.name,
      chineseNameSourceUrl: result.chineseNameReference?.sourceUrl,
      englishName: result.englishName,
      localEffectSummary: result.effectSummary,
      referenceDescription: result.reference?.description,
      sourceCategory: result.sourceCategory,
      referenceCategory: result.reference?.category,
      imageSourceUrl: result.imageSourceUrl,
      imageMatches: result.imageMatches,
      error: result.error,
    }));
  }
}

const written = results.filter((result) => result.imageWritten).length;
console.log(`Audited ${results.length} catalog items for names, category, and image identity: ${results.length - failures.length} match, ${failures.length} require review${WRITE_IMAGES ? `, ${written} image snapshots refreshed` : ''}.`);

if (failures.length > 0) process.exitCode = 1;
