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
const POKEBASE_ITEMS = 'https://pokebase.app/pokemon-champions/items?regulation=m-b';
const POKEBASE_ITEM_PAGE = 'https://pokebase.app/pokemon-champions/items';
const POKEAPI_ITEM_API = 'https://pokeapi.co/api/v2/item';
const POKEAPI_ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
const USER_AGENT = 'LuxrayKitItemAudit/1.0 (read-only catalog audit)';
const CONCURRENCY = 4;
const WRITE_IMAGES = process.argv.includes('--write');
const SHOW_REPORT = process.argv.includes('--report');
const execFileAsync = promisify(execFile);
const manuallyReviewedChineseNames = new Map([
  ['fairy-feather', '妖精之羽'],
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

function parsePokebaseList(html) {
  const callPrefix = 'self.__next_f.push(';
  let cursor = 0;
  while (cursor >= 0) {
    const start = html.indexOf(callPrefix, cursor);
    if (start < 0) break;
    const end = html.indexOf(')</script>', start);
    if (end < 0) break;
    cursor = end + 1;

    try {
      const callArgument = html.slice(start + callPrefix.length, end);
      const payload = JSON.parse(callArgument)[1];
      if (typeof payload !== 'string' || !payload.includes('"data":{"docs":')) continue;
      const itemList = JSON.parse(payload.slice(payload.indexOf('[')));
      const docs = itemList.find((entry) => entry?.data?.docs)?.data.docs;
      if (Array.isArray(docs)) return new Map(docs.map((item) => [item.slug, item]));
    } catch {
      // Keep searching: a React Flight segment need not be a JSON item payload.
    }
  }

  throw new Error('Could not find the PokéBase item data payload');
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
  if (manuallyReviewedChineseNames.has(item.id)) {
    return {
      name: manuallyReviewedChineseNames.get(item.id),
      sourceUrl: 'https://wiki.52poke.com/wiki/妖精之羽（道具）',
    };
  }

  const sourceUrl = `${POKEAPI_ITEM_API}/${item.id}`;
  const data = JSON.parse((await fetchWithCurl(sourceUrl, 'application/json')).toString('utf8'));
  const name = data.names?.find((entry) => entry.language?.name === 'zh-hans')?.name;
  if (!name) throw new Error(`PokeAPI item has no zh-hans name: ${item.id}`);
  return { name, sourceUrl };
}

async function auditItem(item, reference) {
  const pageUrl = `${POKEBASE_ITEM_PAGE}/${item.id}`;
  if (!reference) return { ...item, pageUrl, error: 'missing from PokéBase current M-B item list' };
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
