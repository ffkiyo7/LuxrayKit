import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'src/data/seed/regMA/catalog.ts');
const ASSETS_DIR = resolve(ROOT, 'public/assets/items');
const MAPPING_OUTPUT = resolve(ROOT, 'src/data/seed/regMA/item-icon-mapping.ts');

const POKEBASE = 'https://pokebase.app/pokemon-champions/items';
const POKEAPI_ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
const UA = 'PokemonChampionsTool/1.0 (data ingestion script)';

await mkdir(ASSETS_DIR, { recursive: true });

// ── Parse catalog.ts for item data ──

const catalogText = await readFile(CATALOG_PATH, 'utf8');

// Helper: match a JS string literal (single or double quoted)
const str = `(?:'([^']*)'|\"([^\"]*)\")`;
const strVal = (m, g1, g2) => m[g1] ?? m[g2];

// Parse heldItemRows: array of [id, chineseName, englishName, effectSummary]
const heldRows = [];
const heldRe = new RegExp(`\\[\\s*${str}\\s*,\\s*${str}\\s*,\\s*${str}\\s*,\\s*${str}\\s*\\]`, 'g');
const heldSection = catalogText.slice(catalogText.indexOf('const heldItemRows'));
const heldEnd = heldSection.indexOf('] as const');
let hm;
while ((hm = heldRe.exec(heldSection.slice(0, heldEnd)))) {
  heldRows.push({ id: strVal(hm, 1, 2), chineseName: strVal(hm, 3, 4), englishName: strVal(hm, 5, 6), effectSummary: strVal(hm, 7, 8), type: 'held' });
}

// Parse berryRows
const berryRows = [];
const berrySection = catalogText.slice(catalogText.indexOf('const berryRows'));
const berryEnd = berrySection.indexOf('] as const');
let bm;
while ((bm = heldRe.exec(berrySection.slice(0, berryEnd)))) {
  berryRows.push({ id: strVal(bm, 1, 2), chineseName: strVal(bm, 3, 4), englishName: strVal(bm, 5, 6), effectSummary: strVal(bm, 7, 8), type: 'berry' });
}

// Parse megaStoneRows: array of [id, chineseName, englishName] or [id, chineseName, englishName, pokemonIds]
const megaStoneRows = [];
const megaSection = catalogText.slice(catalogText.indexOf('const megaStoneRows'));
const megaEnd = megaSection.indexOf('] as const');
const megaRe = new RegExp(`\\[\\s*${str}\\s*,\\s*${str}\\s*,\\s*${str}`, 'g');
let mm;
while ((mm = megaRe.exec(megaSection.slice(0, megaEnd)))) {
  megaStoneRows.push({ id: strVal(mm, 1, 2), chineseName: strVal(mm, 3, 4), englishName: strVal(mm, 5, 6), type: 'mega-stone' });
}

const allItems = [...heldRows, ...megaStoneRows, ...berryRows];
console.log(`Parsed: ${heldRows.length} held items + ${megaStoneRows.length} mega stones + ${berryRows.length} berries = ${allItems.length} legal items`);

// ── Fetch image from the item-specific source ──

async function fetchItemImage(item) {
  // PokéBase's current berry artwork is not a reliable identity reference.
  // Keep berries on the canonical PokeAPI ID → sprite path instead.
  if (item.type === 'berry') return `${POKEAPI_ITEM_SPRITES}/${item.id}.png`;

  const url = `${POKEBASE}/${item.id}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) {
      console.error(`  HTTP ${r.status} for ${item.id}`);
      return null;
    }
    const html = await r.text();

    // Find the sprite image: the 128x128 img on the page
    const spriteMatch = html.match(/<img[^>]*src="([^"]*\?width=128&amp;height=128)"[^>]*\/>/);
    if (spriteMatch) {
      const cleanUrl = spriteMatch[1].replace(/\?.*$/, '');
      return cleanUrl;
    }

    console.error(`  MISS ${item.id}: no sprite img found`);
    return null;
  } catch (e) {
    console.error(`  ERR ${item.id}: ${e.message}`);
    return null;
  }
}

// ── Download image ──

async function downloadImage(url, outPath) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) {
      console.error(`  Download failed for ${url}: ${r.status}`);
      return false;
    }
    const buffer = Buffer.from(await r.arrayBuffer());
    await writeFile(outPath, buffer);
    return true;
  } catch (e) {
    console.error(`  Download error: ${e.message}`);
    return false;
  }
}

// ── Main ──

console.log(`\nFetching item images from their configured sources...\n`);

const results = [];
let idx = 0;
for (const item of allItems) {
  idx++;
  const pct = `[${String(idx).padStart(3, '0')}/${allItems.length}]`;

  const imageUrl = await fetchItemImage(item);
  if (!imageUrl) {
    results.push({ ...item, imageUrl: null, localPath: null, ok: false });
    console.error(`${pct} FAIL ${item.id}`);
    continue;
  }

  // Determine extension from URL
  const ext = imageUrl.match(/\.(png|webp|jpg|jpeg|svg)(\?|$)/)?.[1] || 'png';
  const localPath = `/assets/items/${item.id}.${ext}`;
  const outPath = resolve(ROOT, 'public', localPath.slice(1));

  const ok = await downloadImage(imageUrl, outPath);

  results.push({ ...item, imageUrl, localPath, ext, ok });
  const icon = ok ? 'OK' : 'ERR';
  console.log(`${pct} ${icon}  ${item.id.padEnd(28)} ${localPath}  (${ext})`);

  // Be polite to PokéBase
  await new Promise(r => setTimeout(r, 300));
}

// ── Generate mapping file ──

const okCount = results.filter(r => r.ok).length;
const failCount = results.filter(r => !r.ok).length;

console.log(`\nResults: ${okCount} OK, ${failCount} failed\n`);

if (failCount > 0) {
  console.log('Failed items:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ${r.id} (${r.englishName})`));
}

// Generate iconRef mapping for catalog
const lines = [];
lines.push('// Auto-generated item icon mapping');
lines.push(`// Generated: ${new Date().toISOString()}`);
lines.push(`// Sources: ${POKEBASE} (held items and Mega Stones); ${POKEAPI_ITEM_SPRITES} (berries)`);
lines.push('');
lines.push('export const itemIconMapping: Record<string, string> = {');
for (const r of results) {
  if (r.ok) {
    lines.push(`  '${r.id}': '${r.localPath}',`);
  }
}
lines.push('};');
lines.push('');
lines.push('// Items that could not be fetched (need manual review)');
lines.push('export const missingItemIcons: string[] = [');
for (const r of results) {
  if (!r.ok) {
    lines.push(`  '${r.id}',  // ${r.englishName}`);
  }
}
lines.push('];');

await writeFile(MAPPING_OUTPUT, lines.join('\n'), 'utf8');
console.log(`Wrote mapping to ${MAPPING_OUTPUT}`);
