import { writeFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ARTWORK_DIR = resolve(ROOT, 'public/assets/pokemon/artwork');
const THUMBS_DIR = resolve(ROOT, 'public/assets/pokemon/thumbs');
const CATALOG_DIR = resolve(ROOT, 'src/data/seed/regMA');

const ARTWORK_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const THUMB_SIZE = 192;
const UA = 'PokemonChampionsTool/1.0';
const SPRITE_SOURCE_ALIASES = new Map([
  // Pokemon Champions only permits Eternal Flower Floette while keeping the base Floette display name.
  [670, 10061],
]);

await mkdir(ARTWORK_DIR, { recursive: true });
await mkdir(THUMBS_DIR, { recursive: true });

// ── Collect all sprite IDs ──
const files = (await readdir(CATALOG_DIR)).filter(f => f.endsWith('.ts'));
const combined = (await Promise.all(files.map(f => readFile(resolve(CATALOG_DIR, f), 'utf8')))).join('\n');

const spriteIds = new Set();
let m;
const re = /(?:form)?[Aa]rtwork\((\d+)\)/g;
while ((m = re.exec(combined))) spriteIds.add(Number(m[1]));
const dexRe = /nationalDexNo:\s*(\d+)/g;
while ((m = dexRe.exec(combined))) spriteIds.add(Number(m[1]));
const tplRe = /\/assets\/pokemon\/(?:thumbs|artwork)\/\$\{(\d+)\}/g;
while ((m = tplRe.exec(combined))) spriteIds.add(Number(m[1]));

console.log(`Found ${spriteIds.size} sprite IDs`);

const failures = [];
const ids = [...spriteIds].sort((a, b) => a - b);
let idx = 0;

for (const id of ids) {
  idx++;
  const artPath = resolve(ARTWORK_DIR, `${id}.png`);
  const thumbPath = resolve(THUMBS_DIR, `${id}.png`);
  const artExists = existsSync(artPath) && (await readFile(artPath).then(b => b.length).catch(() => 0)) > 0;
  const thumbExists =
    existsSync(thumbPath) &&
    (await readFile(thumbPath).then(b => b.length).catch(() => 0)) > 0 &&
    (await sharp(thumbPath)
      .metadata()
      .then((metadata) => Math.max(metadata.width ?? 0, metadata.height ?? 0) >= THUMB_SIZE)
      .catch(() => false));

  if (artExists && thumbExists) {
    if (idx % 50 === 0) console.log(`  [${idx}/${ids.length}] ${id} cached`);
    continue;
  }

  const sourceId = SPRITE_SOURCE_ALIASES.get(id) ?? id;
  const url = `${ARTWORK_BASE}/${sourceId}.png`;
  try {
    let buf;
    if (artExists) {
      buf = await readFile(artPath);
    } else {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) { failures.push({ id, reason: `HTTP ${r.status}` }); continue; }
      buf = Buffer.from(await r.arrayBuffer());
    }
    if (buf.length === 0) { failures.push({ id, reason: 'empty' }); continue; }

    if (!artExists) await writeFile(artPath, buf);

    if (!thumbExists) {
      try {
        const thumb = await sharp(buf).resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        await writeFile(thumbPath, thumb);
      } catch (e) {
        failures.push({ id, reason: `sharp resize: ${e.message}` });
        continue;
      }
    }

    if (idx % 20 === 0) console.log(`  [${idx}/${ids.length}] ${id}.png done`);
  } catch (e) {
    failures.push({ id, reason: e.message });
  }
  if (idx % 5 === 0) await new Promise(r => setTimeout(r, 100));
}

console.log(`\nProcessed: ${ids.length - failures.length}/${ids.length}`);
if (failures.length > 0) {
  console.error(`FAILURES (${failures.length}):`);
  failures.forEach(f => console.error(`  ${f.id}: ${f.reason}`));
  process.exit(1);
}
console.log('Done.');
