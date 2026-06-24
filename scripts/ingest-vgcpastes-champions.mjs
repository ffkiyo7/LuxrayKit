import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const regArg = (process.argv.find((arg) => arg.startsWith('--reg=')) ?? '').split('=')[1] ?? 'ma';
const SHEET_ID = '1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw';

function eventOf(row) {
  return (row['Tournament / Event'] ?? '').trim();
}

// --- Regulation M-A curation: prestige allowlist + capped large fields + recency. ---
// Keep only the highest-prestige Regulation M-A events (official live national
// championships + CP Regionals/Specials). Lower-tier online/community tournaments and
// ladder shares are dropped. PJCS is the largest field, so it is capped to its top
// placements to keep the bundled set under ~100 teams.
const MA_FULL_EVENTS = new Set([
  'Indianapolis Regional 2026',
  'Turin SPE 2026',
  'Korea PTC 2026',
  'Singapore MBL 2026',
  'Thailand MBL 2026',
]);
const MA_CAPPED_EVENTS = { 'PJCS 2026': 14 };
// Recency window (30 days before the 2026-06-19 curation date). Fixed for deterministic
// output; raise when refreshing the curated set.
const MA_MIN_SHARED_DATE = new Date('2026-05-20T00:00:00Z');

function curateChampionsMa(rows) {
  const candidateRows = rows.filter((row) => {
    if (!extractPokepasteId(row.Pokepaste ?? '')) return false;
    if (!MA_FULL_EVENTS.has(eventOf(row)) && !(eventOf(row) in MA_CAPPED_EVENTS)) return false;
    const sharedAt = parseDateShared(row['Date Shared'] ?? '');
    return sharedAt && sharedAt >= MA_MIN_SHARED_DATE;
  });
  // For capped events keep only the best-placing teams (lowest numeric rank first;
  // unranked rows sort last and are dropped once the cap is reached).
  const cappedKeep = new Set();
  for (const [event, limit] of Object.entries(MA_CAPPED_EVENTS)) {
    candidateRows
      .filter((row) => eventOf(row) === event)
      .map((row) => ({ row, rank: rankNumber(row.Rank ?? '') ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .forEach(({ row }) => cappedKeep.add(row));
  }
  return candidateRows.filter((row) => MA_FULL_EVENTS.has(eventOf(row)) || cappedKeep.has(row));
}

// --- Regulation M-B curation. M-B opened 2026-06-17 with no offline majors yet, so the
// M-A prestige allowlist would match nothing. Instead keep every team tied to a named
// competitive event — dropping eventless ladder/casual shares and pure content rows
// (video/report/ladder) — capped per event so no single tournament dominates. Loosen or
// switch to a Featured-only tab once the format matures and offline results appear. ---
const MB_EXCLUDED_EVENTS = new Set(['', '-', 'Video', 'Team Report', 'Showdown Ladder']);
const MB_PER_EVENT_CAP = 20;
const MB_MIN_SHARED_DATE = new Date('2026-06-17T00:00:00Z');

function curateChampionsMb(rows) {
  const candidateRows = rows.filter((row) => {
    if (!extractPokepasteId(row.Pokepaste ?? '')) return false;
    if (MB_EXCLUDED_EVENTS.has(eventOf(row))) return false;
    const sharedAt = parseDateShared(row['Date Shared'] ?? '');
    return sharedAt && sharedAt >= MB_MIN_SHARED_DATE;
  });
  const eventGroups = new Map();
  for (const row of candidateRows) {
    const event = eventOf(row);
    if (!eventGroups.has(event)) eventGroups.set(event, []);
    eventGroups.get(event).push(row);
  }
  const keep = new Set();
  for (const group of eventGroups.values()) {
    group
      .map((row) => ({ row, rank: rankNumber(row.Rank ?? '') ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MB_PER_EVENT_CAP)
      .forEach(({ row }) => keep.add(row));
  }
  return candidateRows.filter((row) => keep.has(row));
}

// Per-regulation ingestion config. The Champions workbook keeps one master tab per
// regulation, all sharing the same column layout, so only the curation policy, sheet
// gid, source identity, season tag, and output paths differ between regulations.
const REGULATIONS = {
  ma: {
    regulation: 'M-A',
    sheetGid: '791705272',
    sourceId: 'vgcpastes-champions-ma',
    sourceLabel: 'VGCPastes Champions M-A',
    season: 'reg-ma',
    csvEnvVar: 'VGCPASTES_CHAMPIONS_MA_CSV_URL',
    sampleFile: 'reg_ma_champions_ma_team_samples.json',
    auditFile: 'reg_ma_champions_ma_audit.json',
    curate: curateChampionsMa,
  },
  mb: {
    regulation: 'M-B',
    sheetGid: '1458357160',
    sourceId: 'vgcpastes-champions-mb',
    sourceLabel: 'VGCPastes Champions M-B',
    season: 'reg-mb',
    csvEnvVar: 'VGCPASTES_CHAMPIONS_MB_CSV_URL',
    sampleFile: 'reg_mb_champions_mb_team_samples.json',
    auditFile: 'reg_mb_champions_mb_audit.json',
    curate: curateChampionsMb,
  },
};

const REG = REGULATIONS[regArg];
if (!REG) {
  console.error(`Unknown --reg=${regArg}. Use --reg=ma or --reg=mb.`);
  process.exit(1);
}

const DEFAULT_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${REG.sheetGid}`;
const FALLBACK_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${REG.sheetGid}`;
const CSV_URL = process.env[REG.csvEnvVar] ?? DEFAULT_CSV_URL;
const sampleOutputPath = resolve(ROOT, `src/data/external/vgcpastes/${REG.sampleFile}`);
const auditOutputPath = resolve(ROOT, `src/data/external/vgcpastes/${REG.auditFile}`);
const bundledToolsPath = resolve(ROOT, '.npm-cache/vgcpastes-tools.mjs');
const execFileAsync = promisify(execFile);

const stableJson = (payload) => `${JSON.stringify(payload, null, 2)}\n`;
const normalizeGeneratedText = (text) => text.replace(/\r\n/g, '\n');
const withoutRetrievedAt = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const { retrievedAt: _retrievedAt, ...rest } = payload;
  return rest;
};

async function loadTools() {
  await mkdir(dirname(bundledToolsPath), { recursive: true });
  await esbuild.build({
    stdin: {
      contents: `
        export { abilities, currentRuleNatureOptions, items, moves, pokemon } from '../src/data';
        export {
          createPokepasteNameMaps,
          extractPokepasteText,
          mapPokepasteSetToEnvironmentSlot,
          parsePokepasteText,
        } from '../src/lib/pokepasteSource';
      `,
      resolveDir: __dirname,
      sourcefile: 'vgcpastes-tools-entry.ts',
      loader: 'ts',
    },
    outfile: bundledToolsPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(bundledToolsPath).href}?t=${Date.now()}`);
}

function requestText(url, options = {}, redirectCount = 0) {
  return new Promise((resolveRequest, rejectRequest) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'http:' ? http : https;
    const request = client.request(
      parsedUrl,
      {
        method: 'GET',
        timeout: options.timeoutMs ?? 45000,
        headers: {
          'user-agent': 'LuxrayKit VGCPastes importer',
          accept: options.accept ?? 'text/plain,*/*',
        },
      },
      (response) => {
        const location = response.headers.location;
        if (location && response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          response.resume();
          if (redirectCount >= 5) {
            rejectRequest(new Error(`Too many redirects while fetching ${url}`));
            return;
          }
          resolveRequest(requestText(new URL(location, url).href, options, redirectCount + 1));
          return;
        }

        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            rejectRequest(new Error(`HTTP ${response.statusCode}: ${text.slice(0, 120)}`));
            return;
          }
          resolveRequest(text);
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error(`Request timed out after ${options.timeoutMs ?? 45000}ms`)));
    request.on('error', rejectRequest);
    request.end();
  });
}

async function fetchText(url, options = {}) {
  const attempts = options.attempts ?? 3;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestText(url, options);
    } catch (error) {
      lastError = error;
      try {
        const { stdout } = await execFileAsync('curl.exe', [
          '-L',
          '--silent',
          '--show-error',
          '--connect-timeout',
          '30',
          '--max-time',
          String(Math.ceil((options.timeoutMs ?? 45000) / 1000)),
          '-A',
          'LuxrayKit VGCPastes importer',
          url,
        ], { maxBuffer: 64 * 1024 * 1024 });
        return stdout;
      } catch (curlError) {
        lastError = curlError;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 750 * attempt));
    }
  }
  throw lastError;
}

async function fetchCsv() {
  if (!/^https?:\/\//i.test(CSV_URL)) {
    return { url: CSV_URL, text: await readFile(resolve(ROOT, CSV_URL), 'utf8') };
  }
  try {
    return { url: CSV_URL, text: await fetchText(CSV_URL, { accept: 'text/csv,*/*', attempts: 2, timeoutMs: 60000 }) };
  } catch (primaryError) {
    if (CSV_URL !== DEFAULT_CSV_URL) throw primaryError;
    return { url: FALLBACK_CSV_URL, text: await fetchText(FALLBACK_CSV_URL, { accept: 'text/csv,*/*', attempts: 2, timeoutMs: 60000 }) };
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const requiredHeaderNames = ['Team ID', 'Team Description', 'Pokepaste'];
  const headerIndex = rows.findIndex((candidate) => {
    const headerSet = new Set(candidate.map((header) => header.trim()));
    return requiredHeaderNames.every((header) => headerSet.has(header));
  });
  const rawHeaders = rows[headerIndex]?.map((header) => header.trim()) ?? [];
  const headers = rawHeaders.map((header, index) => {
    if (header) return header;
    if (/^Replica Code/i.test(rawHeaders[index - 1] ?? '')) return 'Date Shared';
    return `__blank_${index}`;
  });
  return rows
    .slice(headerIndex + 1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
}

function parseDateShared(value) {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return undefined;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[2].toLowerCase());
  if (month < 0) return undefined;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}

function extractUrl(value) {
  return value.match(/https?:\/\/[^\s,)]+/i)?.[0]?.trim();
}

function extractPokepasteId(value) {
  return extractUrl(value)?.match(/pokepast\.es\/([A-Za-z0-9]+)/i)?.[1];
}

function extractReplicaCode(value) {
  const compact = value.replace(/click text for image/gi, ' ').replace(/[^A-Za-z0-9]/g, ' ').trim();
  const candidates = compact.match(/\b[A-Za-z0-9]{8,12}\b/g) ?? [];
  return candidates.find((candidate) => /[A-Za-z]/.test(candidate) && /\d/.test(candidate))?.toUpperCase();
}

function firstPresent(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function columnValue(row, exactName, prefixPattern) {
  if (row[exactName]) return row[exactName];
  const key = Object.keys(row).find((candidate) => prefixPattern.test(candidate));
  return key ? row[key] : '';
}

function rankNumber(value) {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function fetchPokepasteText(pokepasteId, tools) {
  const jsonUrl = `https://pokepast.es/${pokepasteId}/json`;
  try {
    const jsonText = await fetchText(jsonUrl, { accept: 'application/json,*/*' });
    const payload = JSON.parse(jsonText);
    const extracted = tools.extractPokepasteText(payload);
    if (extracted) return extracted;
  } catch {
    // Older or private pastes may not serve JSON; raw is the canonical fallback.
  }
  return fetchText(`https://pokepast.es/${pokepasteId}/raw`);
}

function requiredColumnsPresent(rows) {
  const required = ['Team ID', 'Team Description', 'Pokepaste', 'Date Shared'];
  const keys = new Set(Object.keys(rows[0] ?? {}));
  return required.filter((key) => !keys.has(key));
}

async function buildSamples() {
  const tools = await loadTools();
  const maps = tools.createPokepasteNameMaps({
    pokemon: tools.pokemon,
    items: tools.items,
    abilities: tools.abilities,
    moves: tools.moves,
    natures: tools.currentRuleNatureOptions,
  });
  const fetchedCsv = await fetchCsv();
  const rows = parseCsv(fetchedCsv.text);
  const missingColumns = requiredColumnsPresent(rows);
  if (missingColumns.length > 0) {
    throw new Error(`VGCPastes CSV missing required columns: ${missingColumns.join(', ')}`);
  }

  const filteredRows = REG.curate(rows);
  const issues = [];
  const samples = [];

  for (const [index, row] of filteredRows.entries()) {
    const pokepasteId = extractPokepasteId(row.Pokepaste ?? '');
    const teamId = row['Team ID'] || pokepasteId || String(index + 1);
    const issuePath = `row ${index + 1} team ${teamId}`;
    try {
      const rawPaste = await fetchPokepasteText(pokepasteId, tools);
      const sets = tools.parsePokepasteText(rawPaste);
      const mapped = sets.map((set) => tools.mapPokepasteSetToEnvironmentSlot(set, maps));
      const mappingIssues = mapped.flatMap((entry, slotIndex) =>
        entry.issues.map((issue) => ({ ...issue, path: `${issuePath} slot ${slotIndex + 1}` })),
      );
      if (sets.length !== 6) {
        mappingIssues.push({
          code: 'invalid-team-size',
          value: String(sets.length),
          message: `Expected 6 Pokemon, parsed ${sets.length}.`,
          path: issuePath,
        });
      }
      if (mappingIssues.length > 0) {
        issues.push(...mappingIssues);
        continue;
      }
      const slots = mapped.map((entry) => entry.slot).filter(Boolean);
      // Not every paste publishes the spread/moves — the value of these flags is
      // telling users exactly what config a sample can actually import (Task 3).
      const hasSpread = slots.some((slot) => Object.keys(slot.statPoints ?? {}).length > 0);
      const hasMoves = slots.some((slot) => (slot.moveIds ?? []).length > 0);
      const rank = rankNumber(row.Rank ?? '');
      const sharedAtIso = parseDateShared(row['Date Shared'] ?? '')?.toISOString().slice(0, 10);
      const reportUrl = firstPresent(extractUrl(row['Link to Source'] ?? ''), extractUrl(row['Report / Video'] ?? ''), extractUrl(row.Pokepaste ?? ''));
      const title = firstPresent(row['Team Description'], row['Tournament / Event'], `VGCPastes ${teamId}`);
      samples.push({
        id: `${REG.sourceId}-${slug(teamId || pokepasteId || String(index + 1)) || index + 1}`,
        dataKind: 'external-snapshot',
        sourceId: REG.sourceId,
        sourceLabel: REG.sourceLabel,
        author: firstPresent(row['Full Name'], row.Owner, 'VGCPastes'),
        season: REG.season,
        score: rank ?? 0,
        ...(rank ? { rank } : {}),
        // M-A is the implicit default (older samples carry no regulation), so only stamp
        // non-default regulations to keep the existing M-A output byte-identical.
        ...(REG.regulation !== 'M-A' ? { regulation: REG.regulation } : {}),
        title,
        battleType: 'doubles',
        reportUrl,
        ...(row['Tournament / Event'] ? { tournament: row['Tournament / Event'] } : {}),
        ...(row.Rank ? { eventRank: row.Rank } : {}),
        ...(sharedAtIso ? { dateShared: sharedAtIso } : {}),
        ...(extractReplicaCode(columnValue(row, 'Replica Code', /^Replica Code/i)) ? { replicaCode: extractReplicaCode(columnValue(row, 'Replica Code', /^Replica Code/i)) } : {}),
        hasMoves,
        hasSpread,
        slots,
      });
    } catch (error) {
      issues.push({
        code: 'fetch-or-parse-failed',
        value: pokepasteId,
        message: error instanceof Error ? error.message : String(error),
        path: issuePath,
      });
    }
  }

  return {
    csvUrl: fetchedCsv.url,
    inputRows: rows.length,
    filteredRows: filteredRows.length,
    samples,
    audit: {
      retrievedAt: new Date().toISOString(),
      sourceUrl: fetchedCsv.url,
      inputRows: rows.length,
      filteredRows: filteredRows.length,
      importedTeams: samples.length,
      issues,
    },
  };
}

let result;
try {
  result = await buildSamples();
} catch (error) {
  console.error(`VGCPastes Champions ${REG.regulation} import failed.`);
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`If Google Sheets is temporarily unreachable, set ${REG.csvEnvVar} to a local CSV path or mirror URL and rerun.`);
  process.exit(1);
}
const currentAuditText = await readFile(auditOutputPath, 'utf8').catch(() => '');
const currentAudit = currentAuditText ? JSON.parse(normalizeGeneratedText(currentAuditText)) : undefined;
if (
  currentAudit?.retrievedAt
  && stableJson(withoutRetrievedAt(currentAudit)) === stableJson(withoutRetrievedAt(result.audit))
) {
  result.audit.retrievedAt = currentAudit.retrievedAt;
}
const nextSamplesText = stableJson(result.samples);
const nextAuditText = stableJson(result.audit);
const outputs = [
  { label: 'VGCPastes team samples', outputPath: sampleOutputPath, nextText: nextSamplesText },
  { label: 'VGCPastes audit', outputPath: auditOutputPath, nextText: nextAuditText },
];

const changedOutputs = [];
for (const output of outputs) {
  const currentText = await readFile(output.outputPath, 'utf8').catch(() => '');
  if (normalizeGeneratedText(currentText) !== output.nextText) changedOutputs.push(output);
}

console.log(`VGCPastes Champions ${REG.regulation} import report`);
console.log(`- CSV source: ${result.csvUrl}`);
console.log(`- rows: ${result.inputRows}, filtered: ${result.filteredRows}, imported: ${result.samples.length}`);
console.log(`- audit issues: ${result.audit.issues.length}`);
if (result.audit.issues.length > 0) {
  for (const issue of result.audit.issues.slice(0, 20)) {
    console.log(`  - ${issue.path}: ${issue.code} ${issue.value} (${issue.message})`);
  }
}

if (checkOnly) {
  if (changedOutputs.length > 0) {
    console.error(`\nVGCPastes outputs are stale: ${changedOutputs.map((output) => output.label).join(', ')}`);
    process.exit(1);
  }
  console.log('\nVGCPastes outputs are up to date.');
  process.exit(0);
}

for (const output of changedOutputs) {
  await mkdir(dirname(output.outputPath), { recursive: true });
  await writeFile(output.outputPath, output.nextText, 'utf8');
  console.log(`Wrote ${output.label} to ${output.outputPath}`);
}

if (changedOutputs.length === 0) {
  console.log('\nVGCPastes outputs already match remote data.');
}
