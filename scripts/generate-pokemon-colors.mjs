import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Regenerates src/data/seed/regMA/pokemonColors.ts — two "body colours" per Pokemon sprite, read
// straight off the 192x192 thumbnail. Purely offline: the thumbs are already in the repo, nothing
// is fetched.
//
//   node scripts/generate-pokemon-colors.mjs [--check]
//
// Rows are keyed on the **sprite id**, i.e. the thumbnail's basename, which is exactly the segment
// `iconRef` carries: `/assets/pokemon/thumbs/<spriteId>.png`. Every catalog row and every Mega form
// hands out an `iconRef` next to the `types` that `auraStyle` consumes today, so a caller that has
// the types also has this key. A dex number is not enough (regional forms and Megas share one) and
// a catalog id is not enough either (several ids legitimately point at the same artwork file, e.g.
// Flabebe's colour variants), so the sprite is the honest unit here.
//
// This file is **data only**. Nothing reads it yet; `src/components/kit/aura.ts` still paints the
// halo from the two type colours.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const THUMB_DIR = resolve(ROOT, 'public/assets/pokemon/thumbs');
const OUTPUT_PATH = resolve(ROOT, 'src/data/seed/regMA/pokemonColors.ts');

const check = process.argv.slice(2).includes('--check');

/**
 * Hand-written last word, for sprites the sampler reads badly. Keyed like the table itself
 * (sprite id → [c1, c2], lowercase 6-digit hex). A hit skips sampling entirely.
 */
const overrides = {};

// ── Sampling parameters ───────────────────────────────────────────────────────
// Every threshold the sampler uses, in one place.
const MIN_ALPHA = 128; // below this a pixel is background / antialiasing fringe
const MIN_SATURATION = 0.18; // below this the pixel is grey, not a colour
const MIN_LIGHTNESS = 0.12; // below this it is the black outline
const MAX_LIGHTNESS = 0.9; // above this it is a specular highlight
const HUE_BUCKETS = 24; // 15° per bucket
const BUCKET_DEG = 360 / HUE_BUCKETS;
const WINDOW = 1; // a peak is a bucket plus this many neighbours on each side (±15°)
const MIN_HUE_DISTANCE = 35; // c2 must sit at least this far from c1 on the hue wheel
const LOW_CONFIDENCE_RATIO = 0.15; // colourful pixels / opaque pixels below this ⇒ flagged
const SECONDARY_MIN_SHARE = 0.08; // a rival peak under this share of the winner is noise
const CLAMP_SATURATION = [0.45, 0.9]; // matches the spread of `typeColors` (0.19–0.97, bulk 0.45–0.93)
const CLAMP_LIGHTNESS = [0.45, 0.7]; // matches the spread of `typeColors` (0.36–0.76, bulk 0.44–0.72)
const FALLBACK_LIGHTNESS_STEP = 0.12; // how far the c1 variant moves when there is no real c2

function rgbToHsl(r8, g8, b8) {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector];
  const byte = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Shortest distance between two hues, in degrees (0–180). */
function hueDistance(a, b) {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Pull the colourful pixels out of one RGBA buffer and pile them into fixed hue buckets.
 * Hue is averaged as a unit vector weighted by saturation, so a bucket's washed-out pixels cannot
 * drag its hue around.
 */
function bucketPixels(data) {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ n: 0, sumS: 0, sumL: 0, sin: 0, cos: 0 }));
  let opaque = 0;
  let colourful = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue;
    opaque += 1;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue;
    colourful += 1;
    const bucket = buckets[Math.min(HUE_BUCKETS - 1, Math.floor(h / BUCKET_DEG))];
    bucket.n += 1;
    bucket.sumS += s;
    bucket.sumL += l;
    bucket.sin += s * Math.sin((h * Math.PI) / 180);
    bucket.cos += s * Math.cos((h * Math.PI) / 180);
  }
  return { buckets, opaque, colourful };
}

/**
 * The strongest remaining peak: a bucket plus its immediate neighbours, scored by total saturation
 * mass (pixel count weighted by how colourful each pixel is). `blocked` holds hues already taken.
 * Ties break on the lower bucket index, so the result never depends on iteration luck.
 */
function peak(buckets, blocked) {
  let best;
  for (let centre = 0; centre < HUE_BUCKETS; centre += 1) {
    const window = [];
    for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
      window.push((centre + offset + HUE_BUCKETS) % HUE_BUCKETS);
    }
    const agg = window.reduce(
      (acc, index) => {
        const b = buckets[index];
        return { n: acc.n + b.n, sumS: acc.sumS + b.sumS, sumL: acc.sumL + b.sumL, sin: acc.sin + b.sin, cos: acc.cos + b.cos };
      },
      { n: 0, sumS: 0, sumL: 0, sin: 0, cos: 0 },
    );
    if (agg.n === 0) continue;
    const hue = (((Math.atan2(agg.sin, agg.cos) * 180) / Math.PI) % 360 + 360) % 360;
    if (blocked.some((taken) => hueDistance(hue, taken) < MIN_HUE_DISTANCE)) continue;
    const score = agg.sumS;
    if (!best || score > best.score) {
      best = { score, hue, saturation: agg.sumS / agg.n, lightness: agg.sumL / agg.n, pixels: agg.n };
    }
  }
  return best;
}

/** Push a sampled colour into the band the type palette lives in, so 12–22% washes still read. */
const normalise = (colour) => hslToHex(colour.hue, clamp(colour.saturation, CLAMP_SATURATION), clamp(colour.lightness, CLAMP_LIGHTNESS));

async function sample(path) {
  const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { buckets, opaque, colourful } = bucketPixels(data);

  const primary = peak(buckets, []);
  // Nothing colourful at all (a pure white / black / grey sprite): the caller decides what to do.
  if (!primary) return undefined;

  const secondary = peak(buckets, [primary.hue]);
  const c1 = normalise(primary);
  // No hue far enough away — or only a scrap of one. Rather than invent a hue, move the winner one
  // step in lightness: same colour, readable as a second stop.
  const useSecondary = secondary && secondary.score >= primary.score * SECONDARY_MIN_SHARE;
  const c2 = useSecondary
    ? normalise(secondary)
    : hslToHex(
        primary.hue,
        clamp(primary.saturation, CLAMP_SATURATION),
        clamp(
          clamp(primary.lightness, CLAMP_LIGHTNESS) +
            (clamp(primary.lightness, CLAMP_LIGHTNESS) > (CLAMP_LIGHTNESS[0] + CLAMP_LIGHTNESS[1]) / 2 ? -FALLBACK_LIGHTNESS_STEP : FALLBACK_LIGHTNESS_STEP),
          CLAMP_LIGHTNESS,
        ),
      );

  return { c1, c2, lowConfidence: opaque === 0 || colourful / opaque < LOW_CONFIDENCE_RATIO };
}

/** Numeric sprite ids first, in numeric order; named ones (`mega-starmie`) after, alphabetically. */
function compareIds(a, b) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a.localeCompare(b, 'en-US');
}

const spriteIds = (await readdir(THUMB_DIR))
  .filter((file) => file.endsWith('.png'))
  .map((file) => file.slice(0, -'.png'.length))
  .sort(compareIds);
console.log(`Sampling ${spriteIds.length} thumbnails from ${THUMB_DIR}`);

const rows = [];
const lowConfidence = [];
const colourless = [];
for (const spriteId of spriteIds) {
  const override = overrides[spriteId];
  if (override) {
    rows.push({ spriteId, c1: override[0], c2: override[1] });
    continue;
  }
  const result = await sample(resolve(THUMB_DIR, `${spriteId}.png`));
  if (!result) {
    colourless.push(spriteId);
    continue;
  }
  rows.push({ spriteId, c1: result.c1, c2: result.c2 });
  if (result.lowConfidence) lowConfidence.push(spriteId);
}

if (colourless.length > 0) {
  console.log(`No colourful pixel at all (left out, add an override): ${colourless.join(', ')}`);
}
console.log(`${rows.length} rows, ${lowConfidence.length} flagged low confidence.`);

const lines = [
  '// Auto-generated by scripts/generate-pokemon-colors.mjs from public/assets/pokemon/thumbs/*.png.',
  "// Do not hand-edit: add an entry to that script's `overrides` table instead, then regenerate.",
  '//',
  "// Two body colours sampled off each Pokemon's own thumbnail, keyed on the **sprite id** — the",
  '// basename in `iconRef` (`/assets/pokemon/thumbs/<spriteId>.png`). Megas and regional forms carry',
  '// their own thumbnail, so they get their own row. Saturation and lightness are clamped into the',
  '// band `typeColors` occupies, so either colour still reads as a 12–22% wash over both themes.',
  '//',
  '// Data only — nothing consumes this yet; the aura still paints from the two type colours.',
  '',
  'export const pokemonColorsById: Record<string, readonly [string, string]> = {',
  ...rows.map((row) => `  '${row.spriteId}': ['${row.c1}', '${row.c2}'],`),
  '};',
  '',
  '/** Sprites that are mostly white / black / grey: the colours above come from a thin minority of',
  ' * pixels and are the first candidates for a hand-written override. */',
  'export const lowConfidencePokemonColorIds: readonly string[] = [',
  ...lowConfidence.map((id) => `  '${id}',`),
  '];',
  '',
];
const output = lines.join('\n');

if (check) {
  const current = existsSync(OUTPUT_PATH) ? await readFile(OUTPUT_PATH, 'utf8') : '';
  if (current === output) {
    console.log(`OK: ${OUTPUT_PATH} is up to date (${rows.length} rows).`);
    process.exit(0);
  }
  console.error(`STALE: ${OUTPUT_PATH} differs from the regenerated output (${rows.length} rows).`);
  process.exit(1);
}

await writeFile(OUTPUT_PATH, output, 'utf8');
console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
