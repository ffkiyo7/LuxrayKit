// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL SCRIPT — Regulation Set M-A only. DO NOT run to add a new regulation.
//
// This generator *rewrites* allowlist.ts wholesale from the official M-A web-view endpoint,
// which still serves the same 213-row M-A payload. Since M-B, new regulations' rows are
// appended to allowlist.ts BY HAND (M-B added 22 `reg-mb-` rows, and only 28 rows overall
// carry a `pokemonId`, none of which this script's 6-entry name map can reproduce). Running it
// against the current file would delete every non-M-A row, reset
// `regMaPokemonAllowlistExpectedCount` to 213, and revert the header's source ref.
//
// The guard below refuses to run whenever allowlist.ts contains non-`reg-ma-` rows. It has no
// bypass flag on purpose: if you genuinely need to regenerate the M-A base, do it against an
// empty/M-A-only file and re-apply the manual rows afterwards.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const sourceUrl = 'https://web-view.app.pokemonchampions.jp/battle/pages/events/rs177501629259kmzbny/en/pokemon.html';
const outputPath = new URL('../src/data/seed/regMA/allowlist.ts', import.meta.url);

// ── Destructive-rewrite guard ────────────────────────────────────────────────

if (existsSync(outputPath)) {
  const existing = await readFile(outputPath, 'utf8');
  const entryIds = [...existing.matchAll(/^\s*id: '([^']+)',$/gm)].map((match) => match[1]);
  const foreignIds = entryIds.filter((id) => !id.startsWith('reg-ma-'));

  if (foreignIds.length > 0) {
    const sample = foreignIds.slice(0, 5).join(', ');
    throw new Error(
      [
        'Refusing to run: src/data/seed/regMA/allowlist.ts contains hand-authored rows from a',
        `later regulation (${foreignIds.length} non-"reg-ma-" entries, e.g. ${sample}).`,
        '',
        'This script rewrites the whole file from the M-A-era official endpoint and would delete',
        'them, reset regMaPokemonAllowlistExpectedCount, and revert the file header source ref.',
        'Add new-regulation rows by hand instead (see docs/DEVELOPER_GUIDE.md §7).',
      ].join('\n'),
    );
  }
}
const catalogPokemonIdsByEnglishName = new Map([
  ['Venusaur', 'venusaur'],
  ['Charizard', 'charizard'],
  ['Garchomp', 'garchomp'],
  ['Incineroar', 'incineroar'],
  ['Politoed', 'politoed'],
  ['Torkoal', 'torkoal'],
]);

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch ${sourceUrl}: ${response.status} ${response.statusText}`);
}

const html = await response.text();
const match = html.match(/const pokemons = (\[.*?\]);const noPrefix/s);
if (!match) {
  throw new Error('Could not find the Eligible Pokemon payload.');
}

const rows = JSON.parse(match[1]);
if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error('Eligible Pokemon payload was empty or malformed.');
}

const toEntryId = (championsFormId) => `reg-ma-${championsFormId}`;
const toNationalDexNo = (championsFormId) => Number(championsFormId.slice(0, 4));
const toFormName = (englishName) => englishName.match(/\((.+)\)$/)?.[1];

const entries = rows.map(([championsFormId, _availabilityFlag, englishName]) => {
  const pokemonId = catalogPokemonIdsByEnglishName.get(englishName);
  const formName = toFormName(englishName);
  const lines = [
    '  {',
    `    id: '${toEntryId(championsFormId)}',`,
    ...(pokemonId ? [`    pokemonId: '${pokemonId}',`] : []),
    `    championsFormId: '${championsFormId}',`,
    `    nationalDexNo: ${toNationalDexNo(championsFormId)},`,
    `    englishName: '${englishName.replaceAll("'", "\\'")}',`,
    ...(formName ? [`    formName: '${formName.replaceAll("'", "\\'")}',`] : []),
    "    verificationStatus: 'manual-review',",
    '    sourceRefs: officialEligiblePokemonRefs,',
    "    reviewNotes: 'Imported from the official Eligible Pokemon page. This row remains manual-review until row count and normalization receive a second review.',",
    '  },',
  ];

  return lines.join('\n');
});

const content = `import type { EligiblePokemon } from '../../../types';

export const regMaPokemonAllowlistExpectedCount = ${rows.length};

const officialEligiblePokemonRefs = ['reg-ma-official-eligible-pokemon', 'manual-seed-review'];

export const regMaPokemonAllowlist: EligiblePokemon[] = [
${entries.join('\n')}
];
`;

await writeFile(outputPath, content, 'utf8');
console.log(`Wrote ${rows.length} Reg M-A allowlist rows to ${outputPath.pathname}`);
