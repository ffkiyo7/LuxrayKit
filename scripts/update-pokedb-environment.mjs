import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const skipTeamSamples = process.argv.includes('--skip-team-samples') || process.env.POKEDB_SKIP_TEAM_SAMPLES === '1';
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

function configuredPositiveInteger(name, fallback) {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredNonNegativeInteger(name) {
  if (process.env[name] === undefined) return undefined;
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function createPageWait() {
  const overrideDelayMs = configuredNonNegativeInteger('POKEDB_PAGE_DELAY_MS');
  return (milliseconds) => wait(overrideDelayMs ?? milliseconds);
}

const fetchInputLabel = (input) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const shouldRetryResponse = (response) => [429, 500, 502, 503, 504].includes(response.status);

function createRetryingFetcher() {
  const attempts = configuredPositiveInteger('POKEDB_FETCH_ATTEMPTS', 5);
  const retryDelayMs = configuredPositiveInteger('POKEDB_FETCH_RETRY_DELAY_MS', 2000);
  const timeoutMs = configuredPositiveInteger('POKEDB_FETCH_TIMEOUT_MS', 20000);

  return async (input, init) => {
    const url = fetchInputLabel(input);
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
        const response = await fetch(input, { ...init, signal });
        if (!shouldRetryResponse(response) || attempt === attempts) return response;

        lastError = new Error(`${url} returned ${response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt === attempts) throw error;
      }

      const causeCode = lastError?.cause?.code ? ` (${lastError.cause.code})` : '';
      const message = `${lastError instanceof Error ? lastError.message : String(lastError)}${causeCode}`;
      const delayMs = retryDelayMs * attempt;
      console.warn(`Fetch attempt ${attempt}/${attempts} failed for ${url}: ${message}. Retrying in ${delayMs}ms.`);
      await wait(delayMs);
    }

    throw lastError;
  };
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

async function buildCurrentSeasonSnapshot(tools, detailLimit, fetcher, pageWait, options = {}) {
  const selectedSeason = await tools.detectLatestPokeDbSeason(POKEDB_BASE_URL, fetcher);
  console.log(`Detected latest PokeDB season: M-${selectedSeason}`);
  console.log(`Fetching Pokemon statistics with detail limit ${detailLimit}...`);

  const battleEntries = [];
  for (const battleType of battleTypes) {
    const payload = await tools.fetchPokemonStatisticsBattle({
      baseUrl: POKEDB_BASE_URL,
      season: selectedSeason,
      battleType,
      detailLimit,
      fetcher,
      wait: pageWait,
    });
    console.log(`Fetched ${battleType}: ${payload.resultCount} rankings, ${payload.detailCount} detail pages.`);
    battleEntries.push([battleType, payload]);
  }

  // High-score team samples default to the previous (completed) season for stable final
  // rankings. POKEDB_SAMPLE_SEASON pins a specific season for deterministic backfills
  // (e.g. force M-3 while the site's latest is M-4).
  const sampleSeasonOverride = configuredNonNegativeInteger('POKEDB_SAMPLE_SEASON');
  const sampleSeason = sampleSeasonOverride && sampleSeasonOverride >= 1
    ? sampleSeasonOverride
    : Math.max(selectedSeason - 1, 1);
  if (sampleSeasonOverride && sampleSeasonOverride >= 1) {
    console.log(`Using POKEDB_SAMPLE_SEASON override: fetching team samples from season M-${sampleSeason}.`);
  }
  const teamSampleEntries = [];
  if (options.skipTeamSamples) {
    console.log('Skipping team sample refresh.');
    battleTypes.forEach((battleType) => teamSampleEntries.push([battleType, []]));
  } else {
    for (const battleType of battleTypes) {
      try {
        const payload = await tools.fetchTrainerBattlePages({
          baseUrl: POKEDB_BASE_URL,
          season: sampleSeason,
          battleType,
          fetcher,
          wait: pageWait,
        });
        const samples = buildTeamSamples(payload, battleType);
        console.log(`Fetched ${battleType} team samples from ${payload.season}: ${samples.length}.`);
        teamSampleEntries.push([battleType, samples]);
      } catch (error) {
        console.warn(`Team sample refresh failed for ${battleType}: ${error instanceof Error ? error.message : String(error)}`);
        teamSampleEntries.push([battleType, []]);
      }
    }
  }

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
const snapshot = await buildCurrentSeasonSnapshot(
  tools,
  detailLimit,
  createRetryingFetcher(),
  createPageWait(),
  { skipTeamSamples },
);
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
