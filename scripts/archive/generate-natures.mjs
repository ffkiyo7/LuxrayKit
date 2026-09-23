import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT = resolve(ROOT, 'src/data/seed/regMA/currentRuleCatalog.ts');

const POKEAPI = 'https://pokeapi.co/api/v2';

const statLabels = {
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  'special-attack': '特攻',
  'special-defense': '特防',
  speed: '速度',
};

const response = await fetch(`${POKEAPI}/nature/?limit=30`);
if (!response.ok) throw new Error(`Failed to fetch natures: ${response.status}`);
const { results } = await response.json();

const natures = [];
for (const { url } of results) {
  const detailRes = await fetch(url);
  if (!detailRes.ok) {
    console.warn(`  Skipping ${url}: ${detailRes.status}`);
    continue;
  }
  const data = await detailRes.json();
  const zhName = data.names?.find((n) => n.language.name === 'zh-hans')?.name;
  const enName = data.name;
  const upStat = data.increased_stat?.name ?? null;
  const downStat = data.decreased_stat?.name ?? null;
  const up = upStat ? [statLabels[upStat]] : [];
  const down = downStat ? [statLabels[downStat]] : [];
  const neutral = !upStat && !downStat;

  if (!zhName) {
    console.warn(`  No zh-hans name for ${enName}, skipping`);
    continue;
  }

  natures.push({ id: zhName, enName, up, down, neutral });
  console.log(`  ${zhName} (${enName}): +${up.join(',') || '-'}  -${down.join(',') || '-'}${neutral ? ' [neutral]' : ''}`);
}

// Sort: non-neutral first alphabetically, then neutral
natures.sort((a, b) => {
  if (a.neutral !== b.neutral) return a.neutral ? 1 : -1;
  return a.id.localeCompare(b.id, 'zh-CN');
});

const lines = [];
lines.push("import { items } from './catalog';");
lines.push('');
lines.push('export const currentRuleSelectableItemIds = items.filter((item) => item.legalInCurrentRule).map((item) => item.id);');
lines.push('');
lines.push('export const currentRuleNatureOptions = [');
for (const n of natures) {
  lines.push(`  { id: '${n.id}', enName: '${n.enName}', up: [${n.up.map((s) => `'${s}'`).join(', ')}], down: [${n.down.map((s) => `'${s}'`).join(', ')}], neutral: ${n.neutral} },`);
}
lines.push('] as const;');
lines.push('');
lines.push('export const currentRuleCatalogNotes = {');
lines.push("  items: 'Selectable item pool is generated from the joined Reg M-A item catalog. Rows remain manual-review until cross-checked against a primary source.',");
lines.push("  moves: 'Move choices still use local seed learnsets and remain review-grade, not a complete Reg M-A learnset.',");
lines.push("  natures: 'Full 25 main-series natures ingested from PokeAPI. Champions nature compatibility remains manual-review pending official confirmation.',");
lines.push('} as const;');
lines.push('');

const output = lines.join('\n');
await writeFile(OUTPUT, output, 'utf8');
console.log(`\nWrote ${natures.length} natures to ${OUTPUT}`);
