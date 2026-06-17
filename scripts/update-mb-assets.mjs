import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UA = 'LuxrayKitDataSync/0.3 (M-B local asset maintenance)';
const execFileAsync = promisify(execFile);

const basePokemon = [
  [45, 'vileplume'],
  [211, 'qwilfish'],
  [254, 'sceptile'],
  [257, 'blaziken'],
  [260, 'swampert'],
  [303, 'mawile'],
  [376, 'metagross'],
  [398, 'staraptor'],
  [518, 'musharna'],
  [545, 'scolipede'],
  [560, 'scrafty'],
  [604, 'eelektross'],
  [668, 'pyroar'],
  [687, 'malamar'],
  [689, 'barbaracle'],
  [691, 'dragalge'],
  [861, 'grimmsnarl'],
  [870, 'falinks'],
  [904, 'overqwil'],
  [972, 'houndstone'],
  [979, 'annihilape'],
  [1000, 'gholdengo'],
];

const pokeApiMegaArtworkIds = {
  'mega-blaziken': 10050,
  'mega-mawile': 10052,
  'mega-swampert': 10064,
  'mega-sceptile': 10065,
  'mega-metagross': 10076,
};

const pokebaseMegaSlugs = {
  'mega-raichu-x': 'raichu-mega-x',
  'mega-raichu-y': 'raichu-mega-y',
  'mega-staraptor': 'staraptor-mega',
  'mega-scolipede': 'scolipede-mega',
  'mega-scrafty': 'scrafty-mega',
  'mega-eelektross': 'eelektross-mega',
  'mega-pyroar': 'pyroar-mega',
  'mega-malamar': 'malamar-mega',
  'mega-barbaracle': 'barbaracle-mega',
  'mega-dragalge': 'dragalge-mega',
  'mega-falinks': 'falinks-mega',
};

const mbMegaIds = [
  'mega-raichu-x',
  'mega-raichu-y',
  'mega-sceptile',
  'mega-blaziken',
  'mega-swampert',
  'mega-mawile',
  'mega-metagross',
  'mega-staraptor',
  'mega-scolipede',
  'mega-scrafty',
  'mega-eelektross',
  'mega-pyroar',
  'mega-malamar',
  'mega-barbaracle',
  'mega-dragalge',
  'mega-falinks',
];

const pokebaseItemImageUrls = {
  'big-root': 'https://i.pokebase.app/pokemon-champions/fBfnq_uLOvzwak-LJSeFh.png',
  'damp-rock': 'https://i.pokebase.app/pokemon-champions/Cc5ME08Akgglf2Pt-4zpw.png',
  'expert-belt': 'https://i.pokebase.app/pokemon-champions/2RFmJIw985pMZlhzX_z-3.png',
  'heat-rock': 'https://i.pokebase.app/pokemon-champions/uGLul9SSah0LKF2mhIQ0X.png',
  'icy-rock': 'https://i.pokebase.app/pokemon-champions/GhVLfmiV6rZGo0WXWFlTD.png',
  'iron-ball': 'https://i.pokebase.app/pokemon-champions/37JyzaCR8PVKbq-sJJgRw.png',
  'life-orb': 'https://i.pokebase.app/pokemon-champions/9tFi_05WvpAuBmasNQ9MH.png',
  'light-clay': 'https://i.pokebase.app/pokemon-champions/Zdq2GSAkVyQ0t3ZL-LO_p.png',
  'metronome': 'https://i.pokebase.app/pokemon-champions/ULlogkcBo5A19T6qkzxvi.png',
  'muscle-band': 'https://i.pokebase.app/pokemon-champions/ZSDQOehVls-daNsV8ql46.png',
  'shed-shell': 'https://i.pokebase.app/pokemon-champions/r5_-WQanKu_ldQNObtNuA.png',
  'smooth-rock': 'https://i.pokebase.app/pokemon-champions/SYh9Q8rJXP65UwEPSxFtr.png',
  'wide-lens': 'https://i.pokebase.app/pokemon-champions/vo4Fcqb1KBlYPzQ1OpUK9.png',
  'wise-glasses': 'https://i.pokebase.app/pokemon-champions/FoLnEnWamO_II-B9a4YrQ.png',
  'zoom-lens': 'https://i.pokebase.app/pokemon-champions/A9Npk8iOwsOLQg6WgAmto.png',
  'barbaracite': 'https://i.pokebase.app/pokemon-champions/EU613QbWI1vyDA4MdwRQp.png',
  'dragalgite': 'https://i.pokebase.app/pokemon-champions/DyEIqa6xU-WPWtkUmGDYn.png',
  'falinksite': 'https://i.pokebase.app/pokemon-champions/4u4k99MbyH5kThVWNSN_B.png',
  'malamarite': 'https://i.pokebase.app/pokemon-champions/50IljnfEAfIFOHzayrd27.png',
  'raichunite': 'https://i.pokebase.app/pokemon-champions/Jj8sr642siWQNgwUQTilR.png',
  'raichunite-x': 'https://i.pokebase.app/pokemon-champions/9Wa1jATqM367hsgWL0Acx.png',
  'scolipite': 'https://i.pokebase.app/pokemon-champions/5MP374N6pblGrMsdz0hjB.png',
  'scraftinite': 'https://i.pokebase.app/pokemon-champions/XBPoG_u0Nvi2NZkEVz_6N.png',
  'staraptite': 'https://i.pokebase.app/pokemon-champions/Ot6Pna1hVnVdeRTyiuBQV.png',
};

const pokeApiItemIds = new Set([
  'blazikenite',
  'mawilite',
  'metagrossite',
  'sceptilite',
  'swampertite',
]);

const serebiiZaItemUrls = {
  'eelektrossite': 'https://www.serebii.net/itemdex/sprites/za/eelektrossite.png',
  'pyroarite': 'https://www.serebii.net/itemdex/sprites/za/pyroarite.png',
};

const itemIds = [
  'big-root',
  'damp-rock',
  'expert-belt',
  'heat-rock',
  'icy-rock',
  'iron-ball',
  'life-orb',
  'light-clay',
  'metronome',
  'muscle-band',
  'shed-shell',
  'smooth-rock',
  'wide-lens',
  'wise-glasses',
  'zoom-lens',
  'barbaracite',
  'blazikenite',
  'dragalgite',
  'eelektrossite',
  'falinksite',
  'malamarite',
  'mawilite',
  'metagrossite',
  'pyroarite',
  'raichunite',
  'raichunite-x',
  'scolipite',
  'scraftinite',
  'sceptilite',
  'staraptite',
  'swampertite',
];

const ensureDir = (path) => mkdir(dirname(path), { recursive: true });

function requireOk(response, url) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
}

async function fetchBuffer(url) {
  if (url.startsWith('https://i.pokebase.app/')) {
    return fetchBufferWithCurl(url);
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const signal = AbortSignal.timeout(30000);
      const response = await fetch(url, {
        signal,
        headers: {
          'User-Agent': UA,
          Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
        },
      });
      requireOk(response, url);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1000));
    }
  }
  return fetchBufferWithCurl(url, lastError);
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

async function fetchText(url) {
  const signal = AbortSignal.timeout(20000);
  const response = await fetch(url, {
    signal,
    headers: {
      'User-Agent': UA,
      Accept: 'text/html',
    },
  });
  requireOk(response, url);
  return response.text();
}

async function writePng(path, buffer, options = {}) {
  await ensureDir(path);
  const image = sharp(buffer);
  const pipeline = options.resize
    ? image.resize(options.resize.width, options.resize.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : image;
  await pipeline.png().toFile(path);
}

async function writeBasePokemonAssets() {
  for (const [dexNo, id] of basePokemon) {
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

function extractPokebaseMegaIconUrl(listHtml, slug) {
  const slugIndex = listHtml.indexOf(`\\"slug\\":\\"${slug}\\"`);
  if (slugIndex < 0) throw new Error(`PokéBase pokemon list is missing slug ${slug}`);
  const chunk = listHtml.slice(slugIndex, slugIndex + 25000);
  const match = chunk.match(/\\"icon\\":\{\\"url\\":\\"(https:\/\/i\.pokebase\.app\/pokemon-champions\/[^\\"]+)\\"/);
  if (!match) throw new Error(`PokéBase pokemon list has no Champions icon URL for ${slug}`);
  return match[1].replaceAll('\\/', '/');
}

async function fetchMegaBuffer(id, pokebasePokemonListHtml) {
  const pokeApiId = pokeApiMegaArtworkIds[id];
  if (pokeApiId) {
    const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokeApiId}.png`;
    return { buffer: await fetchBuffer(url), source: url };
  }

  const slug = pokebaseMegaSlugs[id];
  if (!slug) throw new Error(`No verified source configured for ${id}`);
  const url = extractPokebaseMegaIconUrl(pokebasePokemonListHtml, slug);
  return { buffer: await fetchBuffer(url), source: url };
}

async function writeMegaAssets() {
  const pokebasePokemonListHtml = await fetchText('https://pokebase.app/pokemon-champions/pokemon');

  for (const id of mbMegaIds) {
    const thumbPath = resolve(ROOT, `public/assets/pokemon/thumbs/${id}.png`);
    const artworkPath = resolve(ROOT, `public/assets/pokemon/artwork/${id}.png`);
    const { buffer, source } = await fetchMegaBuffer(id, pokebasePokemonListHtml);
    await writePng(artworkPath, buffer);
    await writePng(thumbPath, buffer, { resize: { width: 256, height: 256 } });
    console.log(`mega ${id} <- ${source}`);
  }
}

function itemSourceUrl(id) {
  if (pokebaseItemImageUrls[id]) return pokebaseItemImageUrls[id];
  if (pokeApiItemIds.has(id)) return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${id}.png`;
  if (serebiiZaItemUrls[id]) return serebiiZaItemUrls[id];
  throw new Error(`No verified source configured for item ${id}`);
}

async function writeItemAssets() {
  for (const id of itemIds) {
    const itemPath = resolve(ROOT, `public/assets/items/${id}.png`);
    const source = itemSourceUrl(id);
    const buffer = await fetchBuffer(source);
    await writePng(itemPath, buffer);
    console.log(`item ${id} <- ${source}`);
  }
}

await writeBasePokemonAssets();
await writeMegaAssets();
await writeItemAssets();
