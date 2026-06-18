import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const POKEDB_BASE_URL = process.env.POKEDB_BASE_URL ?? 'https://champs.pokedb.tokyo';
const DEFAULT_DETAIL_LIMIT = 60;
const TEAM_SAMPLE_LIMIT = 24;
const battleTypes = ['singles', 'doubles'];
const environmentSnapshotOutputPath = resolve(ROOT, 'src/data/external/pokedb/current_environment_snapshot.json');
const publicEnvironmentSnapshotOutputPath = resolve(ROOT, 'public/data/pokedb/reg-ma-environment.json');
const bundledToolsPath = resolve(ROOT, '.npm-cache/pokedb-environment-worker-tools.mjs');

const stableJson = (payload) => `${JSON.stringify(payload)}\n`;
const normalizeGeneratedText = (text) => text.replace(/\r\n/g, '\n');
const withoutRetrievedAt = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const { retrievedAt: _retrievedAt, ...rest } = payload;
  return rest;
};

function configuredDetailLimit() {
  const fromArg = process.argv.find((arg) => arg.startsWith('--detail-limit='))?.split('=')[1];
  const parsed = Number(fromArg ?? process.env.POKEDB_DETAIL_LIMIT ?? DEFAULT_DETAIL_LIMIT);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_DETAIL_LIMIT;
  return Math.min(parsed, 80);
}

async function loadWorkerEnvironmentTools() {
  await mkdir(dirname(bundledToolsPath), { recursive: true });
  await esbuild.build({
    entryPoints: [resolve(ROOT, 'cloudflare/environment-worker/src/index.ts')],
    outfile: bundledToolsPath,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(bundledToolsPath).href}?t=${Date.now()}`);
}

const mergeUnique = (values) => [...new Set(values.flat())].sort();

function buildDataFreshness(snapshot, selectedSeason, detailLimit) {
  const payloads = battleTypes.map((battleType) => snapshot.battles[battleType]).filter(Boolean);
  const unknownPokemonKeys = mergeUnique(payloads.map((payload) => payload.audit?.unknownPokemonKeys ?? []));
  const unknownItemNames = mergeUnique(payloads.map((payload) => payload.audit?.unknownItemNames ?? []));
  const unknownMoveKeys = mergeUnique(payloads.map((payload) => payload.audit?.unknownMoveKeys ?? []));
  const unknownAbilityKeys = mergeUnique(payloads.map((payload) => payload.audit?.unknownAbilityKeys ?? []));
  const unknownNatureNames = mergeUnique(payloads.map((payload) => payload.audit?.unknownNatureNames ?? []));

  return {
    source: 'pokedb-pokemon-statistics',
    selectedSeason,
    completeness: 'rankings-complete-details-top-n',
    detailLimit,
    notes: [
      `Complete Pokemon rankings with detail statistics for the top ${detailLimit}.`,
      'Overall and teammate percentages are rank-relative because PokeDB does not publish absolute values for those fields.',
      unknownPokemonKeys.length > 0 ? `Unknown Pokemon keys: ${unknownPokemonKeys.join(', ')}.` : '',
      unknownItemNames.length > 0 ? `Unknown item names: ${unknownItemNames.join(', ')}.` : '',
      unknownMoveKeys.length > 0 ? `Unknown move keys: ${unknownMoveKeys.join(', ')}.` : '',
      unknownAbilityKeys.length > 0 ? `Unknown ability keys: ${unknownAbilityKeys.join(', ')}.` : '',
      unknownNatureNames.length > 0 ? `Unknown nature names: ${unknownNatureNames.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function buildTeamSamples(payload, battleType) {
  return payload.teams
    .filter((team) => team.reportUrl)
    .slice(0, TEAM_SAMPLE_LIMIT)
    .map((team) => ({
      id: `pokedb-${battleType}-rank-${team.rank}`,
      dataKind: 'external-snapshot',
      author: team.author,
      season: payload.season,
      score: Math.floor(team.ratingValue ?? 0),
      rank: team.rank,
      title: '',
      battleType,
      reportUrl: team.reportUrl,
      slots: team.slots,
    }));
}

async function buildCurrentSeasonSnapshot(tools, detailLimit) {
  const selectedSeason = await tools.detectLatestPokeDbSeason(POKEDB_BASE_URL);
  console.log(`Detected latest PokeDB season: M-${selectedSeason}`);
  console.log(`Fetching Pokemon statistics with detail limit ${detailLimit}...`);

  const battleEntries = await Promise.all(
    battleTypes.map(async (battleType) => {
      const payload = await tools.fetchPokemonStatisticsBattle({
        baseUrl: POKEDB_BASE_URL,
        season: selectedSeason,
        battleType,
        detailLimit,
      });
      console.log(`Fetched ${battleType}: ${payload.resultCount} rankings, ${payload.detailCount} detail pages.`);
      return [battleType, payload];
    }),
  );

  const sampleSeason = Math.max(selectedSeason - 1, 1);
  const teamSampleEntries = await Promise.all(
    battleTypes.map(async (battleType) => {
      try {
        const payload = await tools.fetchTrainerBattlePages({
          baseUrl: POKEDB_BASE_URL,
          season: sampleSeason,
          battleType,
        });
        const samples = buildTeamSamples(payload, battleType);
        console.log(`Fetched ${battleType} team samples from ${payload.season}: ${samples.length}.`);
        return [battleType, samples];
      } catch (error) {
        console.warn(`Team sample refresh failed for ${battleType}: ${error instanceof Error ? error.message : String(error)}`);
        return [battleType, []];
      }
    }),
  );

  const snapshot = {
    retrievedAt: new Date().toISOString(),
    battles: Object.fromEntries(battleEntries),
    teamSamples: Object.fromEntries(teamSampleEntries),
  };

  return {
    ...snapshot,
    dataFreshness: buildDataFreshness(snapshot, selectedSeason, detailLimit),
  };
}

function printSnapshotReport(snapshot) {
  console.log('PokeDB environment snapshot report');
  battleTypes.forEach((battleType) => {
    const payload = snapshot.battles[battleType];
    if (!payload) return;
    console.log(`- ${battleType}: ${payload.season} / ${payload.resultCount} rankings / ${payload.detailCount} details / updated ${payload.updatedAt}`);
    const audit = payload.audit ?? {};
    console.log(`  - unknown Pokemon: ${(audit.unknownPokemonKeys ?? []).length}${audit.unknownPokemonKeys?.length ? ` (${audit.unknownPokemonKeys.join(', ')})` : ''}`);
    console.log(`  - unknown items: ${(audit.unknownItemNames ?? []).length}${audit.unknownItemNames?.length ? ` (${audit.unknownItemNames.join(', ')})` : ''}`);
    console.log(`  - unknown moves: ${(audit.unknownMoveKeys ?? []).length}${audit.unknownMoveKeys?.length ? ` (${audit.unknownMoveKeys.join(', ')})` : ''}`);
    console.log(`  - unknown abilities: ${(audit.unknownAbilityKeys ?? []).length}${audit.unknownAbilityKeys?.length ? ` (${audit.unknownAbilityKeys.join(', ')})` : ''}`);
    console.log(`  - unknown natures: ${(audit.unknownNatureNames ?? []).length}${audit.unknownNatureNames?.length ? ` (${audit.unknownNatureNames.join(', ')})` : ''}`);
  });
}

const tools = await loadWorkerEnvironmentTools();
const detailLimit = configuredDetailLimit();
const snapshot = await buildCurrentSeasonSnapshot(tools, detailLimit);
printSnapshotReport(snapshot);

const currentSourceSnapshotText = await readFile(environmentSnapshotOutputPath, 'utf8').catch(() => '');
const currentSourceSnapshot = currentSourceSnapshotText ? JSON.parse(normalizeGeneratedText(currentSourceSnapshotText)) : undefined;
if (
  currentSourceSnapshot?.retrievedAt &&
  stableJson(withoutRetrievedAt(currentSourceSnapshot)) === stableJson(withoutRetrievedAt(snapshot))
) {
  snapshot.retrievedAt = currentSourceSnapshot.retrievedAt;
}

const nextSnapshotText = stableJson(snapshot);
const outputs = [
  { label: 'source environment snapshot', outputPath: environmentSnapshotOutputPath, nextText: nextSnapshotText },
  { label: 'public environment snapshot', outputPath: publicEnvironmentSnapshotOutputPath, nextText: nextSnapshotText },
];

const changedOutputs = [];
for (const output of outputs) {
  const currentText = await readFile(output.outputPath, 'utf8').catch(() => '');
  if (normalizeGeneratedText(currentText) !== output.nextText) changedOutputs.push(output);
}

if (checkOnly) {
  if (changedOutputs.length > 0) {
    console.error(`\nPokeDB snapshots are stale: ${changedOutputs.map((output) => output.label).join(', ')}`);
    process.exit(1);
  }
  console.log('\nPokeDB snapshots are up to date.');
  process.exit(0);
}

for (const output of changedOutputs) {
  await mkdir(dirname(output.outputPath), { recursive: true });
  await writeFile(output.outputPath, output.nextText, 'utf8');
  console.log(`Wrote ${output.label} to ${output.outputPath}`);
}

if (changedOutputs.length === 0) {
  console.log('\nPokeDB snapshots already match remote data.');
}
