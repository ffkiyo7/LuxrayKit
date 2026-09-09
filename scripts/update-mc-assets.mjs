// Reg M-C local asset maintenance, modelled on scripts/update-mb-assets.mjs.
//
// Two independent blocks, deliberately kept separate so the Mega/item work and the base-Pokémon work
// can be authored and merged without touching each other:
//   1. MEGA + ITEM BLOCK  — the 6 new Mega form thumbs/artwork and the 18 new item icons.
//   2. BASE POKEMON BLOCK — the new base species' dex-numbered thumbs/artwork.
//
// Source URLs are pinned rather than re-discovered on every run: PokéBase serves the Champions
// artwork from content-addressed URLs, so pinning makes a re-run reproducible and makes the
// `dataAudit.test.ts` icon hashes meaningful.
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UA = 'LuxrayKitDataSync/0.4 (M-C local asset maintenance)';
const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// 1. MEGA + ITEM BLOCK
// ─────────────────────────────────────────────────────────────────────────────

// PokéBase Champions form artwork, read from the `icon.url` field of each form's row in the
// embedded payload of https://pokebase.app/pokemon-champions/pokemon (retrieved 2026-09-09).
const mcMegaArtworkUrls = {
  'mega-absol-z': 'https://img.pokebase.app/pokemon-champions/8-9zF2oq8wl2ea8T9Z-Lc.png',
  'mega-garchomp-z': 'https://img.pokebase.app/pokemon-champions/ctVRT6RR0EsAdQoKAyaSl.png',
  'mega-lucario-z': 'https://img.pokebase.app/pokemon-champions/TFgU1DHKfH8g7cmzYxJsJ.png',
  'mega-salamence': 'https://img.pokebase.app/pokemon-champions/NwJYIOlU4PcSuSD7rCxzl.png',
  'mega-golisopod': 'https://img.pokebase.app/pokemon-champions/xTYNUKMyo4M91H25m4mj9.png',
  'mega-baxcalibur': 'https://img.pokebase.app/pokemon-champions/DWHbe11uFUEIoGEI_aknK.png',
};

// PokéBase Champions item icons, read from the `icon.url` field of each item's row in the embedded
// payload of https://pokebase.app/pokemon-champions/items (retrieved 2026-09-09; the list is a single
// page of 166 items, `totalPages: 1`).
const mcItemIconUrls = {
  'absolite-z': 'https://img.pokebase.app/pokemon-champions/4sa6uen6CAQKTecbyDY7l.png',
  'garchompite-z': 'https://img.pokebase.app/pokemon-champions/ktw4gTszGb2wY2ia0Ph6w.png',
  'lucarionite-z': 'https://img.pokebase.app/pokemon-champions/gODbUhtTGnI-mIiMcZb6B.png',
  'salamencite': 'https://img.pokebase.app/pokemon-champions/qZ3XVMttSRs5B15d5YEZ-.png',
  'golisopite': 'https://img.pokebase.app/pokemon-champions/9uZZv8IEWhRM9GiWsLWgG.png',
  'baxcalibrite': 'https://img.pokebase.app/pokemon-champions/ztXFvKCrLS8_qvssduG7d.png',
  'leek': 'https://img.pokebase.app/pokemon-champions/IU62RazzqrGZWuJHZSIwc.png',
  'rocky-helmet': 'https://img.pokebase.app/pokemon-champions/U_DUm1gXlZnv7NOJRVPyn.png',
  'air-balloon': 'https://img.pokebase.app/pokemon-champions/BP8U2sL7mhqfcs8qRdJB1.png',
  'red-card': 'https://img.pokebase.app/pokemon-champions/LXrtAEy8XyzkMHBaiEZ_a.png',
  'binding-band': 'https://img.pokebase.app/pokemon-champions/6F_gBxIDuPuiPY1ibykaO.png',
  'eject-button': 'https://img.pokebase.app/pokemon-champions/lGY1sqGVCeRFY9WVGack_.png',
  'normal-gem': 'https://img.pokebase.app/pokemon-champions/8U-i_zQ8VivIObHaSzrZE.png',
  'terrain-extender': 'https://img.pokebase.app/pokemon-champions/UdBCaFZMdM21J8kfh_PqM.png',
  'electric-seed': 'https://img.pokebase.app/pokemon-champions/gKmcOhPnff9WRtzdgU8W0.png',
  'psychic-seed': 'https://img.pokebase.app/pokemon-champions/soG6PfWKypITHDOPSJOJf.png',
  'misty-seed': 'https://img.pokebase.app/pokemon-champions/bqKWsGJRSCOviqig7Jx_H.png',
  'grassy-seed': 'https://img.pokebase.app/pokemon-champions/u-UzvwzY_W8Tte1q-vDTZ.png',
  // `kings-rock` is NOT listed here on purpose: it was already in the catalog with a local snapshot
  // before M-C, and re-downloading it would churn an asset nothing asked to change.
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. BASE POKEMON BLOCK — owned by the base-catalog pass; add `[dexNo, id]` pairs here.
// ─────────────────────────────────────────────────────────────────────────────

const mcBasePokemon = [];

// ─────────────────────────────────────────────────────────────────────────────

const ensureDir = (path) => mkdir(dirname(path), { recursive: true });

function requireOk(response, url) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
}

async function fetchBufferWithCurl(url, cause) {
  const command = process.platform === 'win32' ? 'curl.exe' : 'curl';
  try {
    const { stdout } = await execFileAsync(
      command,
      ['-L', '--fail', '--silent', '--show-error', '--connect-timeout', '20', '--max-time', '60', '-A', UA, url],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    error.cause = cause;
    throw error;
  }
}

async function fetchBuffer(url) {
  // PokéBase's image host rejects the plain fetch() client, so go straight to curl for it.
  if (url.startsWith('https://img.pokebase.app/') || url.startsWith('https://i.pokebase.app/')) {
    return fetchBufferWithCurl(url);
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' },
      });
      requireOk(response, url);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((delay) => setTimeout(delay, attempt * 1000));
    }
  }
  return fetchBufferWithCurl(url, lastError);
}

async function writePng(path, buffer, options = {}) {
  await ensureDir(path);
  const image = sharp(buffer);
  const pipeline = options.resize
    ? image.resize(options.resize.width, options.resize.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : image;
  await pipeline.png().toFile(path);
}

async function writeMegaAssets() {
  for (const [id, source] of Object.entries(mcMegaArtworkUrls)) {
    const buffer = await fetchBuffer(source);
    await writePng(resolve(ROOT, `public/assets/pokemon/artwork/${id}.png`), buffer);
    await writePng(resolve(ROOT, `public/assets/pokemon/thumbs/${id}.png`), buffer, { resize: { width: 256, height: 256 } });
    console.log(`mega ${id} <- ${source}`);
  }
}

async function writeItemAssets() {
  for (const [id, source] of Object.entries(mcItemIconUrls)) {
    const buffer = await fetchBuffer(source);
    await writePng(resolve(ROOT, `public/assets/items/${id}.png`), buffer);
    console.log(`item ${id} <- ${source}`);
  }
}

async function writeBasePokemonAssets() {
  for (const [dexNo, id] of mcBasePokemon) {
    const thumbPath = resolve(ROOT, `public/assets/pokemon/thumbs/${dexNo}.png`);
    const artworkPath = resolve(ROOT, `public/assets/pokemon/artwork/${dexNo}.png`);
    if (existsSync(thumbPath) && existsSync(artworkPath)) {
      console.log(`pokemon ${id} ${dexNo} exists`);
      continue;
    }
    const source = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNo}.png`;
    const buffer = await fetchBuffer(source);
    await writePng(artworkPath, buffer);
    await writePng(thumbPath, buffer, { resize: { width: 256, height: 256 } });
    console.log(`pokemon ${id} ${dexNo} <- PokeAPI official artwork`);
  }
}

await writeMegaAssets();
await writeItemAssets();
await writeBasePokemonAssets();
