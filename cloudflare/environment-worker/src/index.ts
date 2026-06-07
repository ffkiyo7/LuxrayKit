import { pokedbItemNameToId } from '../../../src/data/external/pokedbItemNameMap';
import { regMaPokemonAllowlist } from '../../../src/data/seed/regMA/allowlist';
import { pokemon } from '../../../src/data/seed/regMA/catalog';
import { parsePokeDbTrainerSamples } from '../../../src/lib/pokedbEnvironment';
import type { EnvironmentTeamSample } from '../../../src/lib/environmentDataset';

type BattleType = 'singles' | 'doubles';

type PokeDbRankedTeamSlot = {
  id: string;
  pokemon: string;
  form: string;
  type1: string;
  type2: string;
  category: string;
  terastal: string;
  item: string;
};

type PokeDbRankedTeam = {
  rank: number;
  rating_value: number | null;
  team: PokeDbRankedTeamSlot[];
};

type PokeDbRankedTeamsPayload = {
  season: string;
  season_number: number;
  rule: string;
  updated_at: string;
  teams: PokeDbRankedTeam[];
};

type EnvironmentSnapshot = {
  retrievedAt: string;
  battles: Partial<Record<BattleType, PokeDbRankedTeamsPayload>>;
  teamSamples?: Partial<Record<BattleType, EnvironmentTeamSample[]>>;
  dataFreshness?: {
    source: 'pokedb-opendata';
    requestedSeasons: number[];
    selectedSeason: number;
    completeness: 'ranked-teams-with-team-samples' | 'ranked-teams-only';
    notes: string;
  };
};

type TeamSummarySlot = {
  pokeDbKey: string;
  pokemonId?: string;
  pokemonName: string;
  form?: string;
  itemId?: string;
  itemName?: string;
};

type TeamSummary = {
  rank: number;
  ratingValue: number | null;
  slots: TeamSummarySlot[];
};

type TeamIndex = Record<BattleType, Record<string, TeamSummary[]>>;

type CacheStatus = {
  ok: boolean;
  refreshedAt?: string;
  selectedSeason?: number;
  selectedSeasonLabel?: string;
  teamCounts?: Partial<Record<BattleType, number>>;
  error?: string;
};

type AppEnv = Env & {
  ADMIN_REFRESH_TOKEN?: string;
};

const SNAPSHOT_KEY = 'environment:latest';
const STATUS_KEY = 'environment:status';
const TEAM_INDEX_KEY = 'environment:team-index';
const DEFAULT_POKEDB_BASE_URL = 'https://champs.pokedb.tokyo';
const DEFAULT_SEASON_CANDIDATES = [2, 1];
const DEFAULT_MAX_CACHE_AGE_SECONDS = 6 * 60 * 60;
const DEFAULT_TEAM_LIMIT = 24;
const MAX_TEAM_LIMIT = 50;
const TEAM_SAMPLE_LIMIT = 24;

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[♀]/g, 'female')
    .replace(/[♂]/g, 'male')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const toPokeDbPokemonKey = (championsFormId: string) => {
  const [dexNo, formNo = '000'] = championsFormId.split('-');
  return `${dexNo}-${String(Number(formNo)).padStart(2, '0')}`;
};

const pokemonIdByEnglishName = new Map(pokemon.map((entry) => [normalizeName(entry.englishName), entry.id]));
const pokemonNameById = new Map(pokemon.map((entry) => [entry.id, entry.chineseName]));
const pokemonKeyToId = new Map(
  regMaPokemonAllowlist.flatMap((entry) => {
    const pokemonId = entry.pokemonId ?? pokemonIdByEnglishName.get(normalizeName(entry.englishName));
    return pokemonId ? [[toPokeDbPokemonKey(entry.championsFormId), pokemonId] as const] : [];
  }),
);
const pokemonKeyToIdRecord = Object.fromEntries(pokemonKeyToId);

const jsonHeaders = (env: AppEnv, extra: HeadersInit = {}) => ({
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': env.ALLOWED_ORIGINS || '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  ...extra,
});

const jsonResponse = (env: AppEnv, payload: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: jsonHeaders(env, init.headers),
  });

const parseSeasonCandidates = (value: string | undefined) => {
  const parsed = (value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((season) => Number.isInteger(season) && season > 0);
  return parsed.length > 0 ? parsed : DEFAULT_SEASON_CANDIDATES;
};

const isFresh = (refreshedAt: string | undefined, maxAgeSeconds: number) => {
  if (!refreshedAt) return false;
  const ageMs = Date.now() - Date.parse(refreshedAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeSeconds * 1000;
};

const rankedTeamsUrl = (baseUrl: string, season: number, battleType: BattleType) => {
  const battleSlug = battleType === 'singles' ? 'single' : 'double';
  return `${baseUrl.replace(/\/$/, '')}/opendata/s${season}_${battleSlug}_ranked_teams.json`;
};

const pokeDbRuleParamByBattleType = {
  doubles: 1,
  singles: 2,
} satisfies Record<BattleType, number>;

const trainerListUrl = (baseUrl: string, season: number, battleType: BattleType) =>
  `${baseUrl.replace(/\/$/, '')}/trainer/list?season=${season}&rule=${pokeDbRuleParamByBattleType[battleType]}`;

const validatePokeDbPayload = (payload: unknown): payload is PokeDbRankedTeamsPayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const candidate = payload as Partial<PokeDbRankedTeamsPayload>;
  return (
    typeof candidate.season === 'string' &&
    Number.isInteger(candidate.season_number) &&
    typeof candidate.rule === 'string' &&
    typeof candidate.updated_at === 'string' &&
    Array.isArray(candidate.teams) &&
    candidate.teams.length > 0
  );
};

async function fetchRankedTeams(baseUrl: string, season: number, battleType: BattleType) {
  const response = await fetch(rankedTeamsUrl(baseUrl, season, battleType), {
    headers: {
      accept: 'application/json',
      'user-agent': 'LuxrayKitEnvironmentWorker/0.1 (+https://luxraykit.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`${battleType} season ${season} returned ${response.status}`);
  }

  const payload = await response.json();
  if (!validatePokeDbPayload(payload)) {
    throw new Error(`${battleType} season ${season} returned an invalid ranked-teams payload`);
  }

  return payload;
}

async function fetchTrainerSamples(baseUrl: string, season: number, battleType: BattleType) {
  const sourceUrl = trainerListUrl(baseUrl, season, battleType);
  const response = await fetch(sourceUrl, {
    headers: {
      accept: 'text/html',
      'user-agent': 'LuxrayKitEnvironmentWorker/0.1 (+https://luxraykit.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`${battleType} trainer list season ${season} returned ${response.status}`);
  }

  const html = await response.text();
  return parsePokeDbTrainerSamples(html, {
    battleType,
    sourceUrl,
    pokemonKeyToId: pokemonKeyToIdRecord,
    itemNameToId: pokedbItemNameToId,
    maxSamples: TEAM_SAMPLE_LIMIT,
  });
}

async function buildLatestSnapshot(env: AppEnv): Promise<EnvironmentSnapshot> {
  const baseUrl = env.POKEDB_BASE_URL || DEFAULT_POKEDB_BASE_URL;
  const seasons = parseSeasonCandidates(env.SEASON_CANDIDATES);
  const failures: string[] = [];

  for (const season of seasons) {
    try {
      const [singles, doubles] = await Promise.all([
        fetchRankedTeams(baseUrl, season, 'singles'),
        fetchRankedTeams(baseUrl, season, 'doubles'),
      ]);
      const sampleResults = await Promise.allSettled([
        fetchTrainerSamples(baseUrl, season, 'singles'),
        fetchTrainerSamples(baseUrl, season, 'doubles'),
      ]);
      const [singlesSamplesResult, doublesSamplesResult] = sampleResults;
      const teamSamples = {
        singles: singlesSamplesResult.status === 'fulfilled' ? singlesSamplesResult.value : [],
        doubles: doublesSamplesResult.status === 'fulfilled' ? doublesSamplesResult.value : [],
      } satisfies Record<BattleType, EnvironmentTeamSample[]>;
      const sampleFailures = sampleResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
      const hasTeamSamples = teamSamples.singles.length > 0 || teamSamples.doubles.length > 0;

      return {
        retrievedAt: new Date().toISOString(),
        battles: { singles, doubles },
        teamSamples,
        dataFreshness: {
          source: 'pokedb-opendata',
          requestedSeasons: seasons,
          selectedSeason: season,
          completeness: hasTeamSamples ? 'ranked-teams-with-team-samples' : 'ranked-teams-only',
          notes: hasTeamSamples
            ? `This Worker caches PokeDB ranked-team open data and report-linked team samples.${sampleFailures.length > 0 ? ` Sample fetch warnings: ${sampleFailures.join('; ')}` : ''}`
            : `This Worker caches PokeDB ranked-team open data. Team sample fetch failed: ${sampleFailures.join('; ') || 'no linked samples found'}.`,
        },
      };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`No complete PokeDB season snapshot was available. ${failures.join('; ')}`);
}

async function refreshSnapshot(env: AppEnv): Promise<CacheStatus> {
  try {
    const snapshot = await buildLatestSnapshot(env);
    const teamIndex = buildTeamIndex(snapshot);
    const refreshedAt = new Date().toISOString();
    const status: CacheStatus = {
      ok: true,
      refreshedAt,
      selectedSeason: snapshot.dataFreshness?.selectedSeason,
      selectedSeasonLabel: snapshot.battles.singles?.season ?? snapshot.battles.doubles?.season,
      teamCounts: {
        singles: snapshot.battles.singles?.teams.length,
        doubles: snapshot.battles.doubles?.teams.length,
      },
    };

    await Promise.all([
      env.ENVIRONMENT_CACHE.put(SNAPSHOT_KEY, JSON.stringify(snapshot)),
      env.ENVIRONMENT_CACHE.put(STATUS_KEY, JSON.stringify(status)),
      env.ENVIRONMENT_CACHE.put(TEAM_INDEX_KEY, JSON.stringify(teamIndex)),
    ]);

    console.log(JSON.stringify({ event: 'environment_refresh_success', ...status }));
    return status;
  } catch (error) {
    const status: CacheStatus = {
      ok: false,
      refreshedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    await env.ENVIRONMENT_CACHE.put(STATUS_KEY, JSON.stringify(status));
    console.log(JSON.stringify({ event: 'environment_refresh_failure', ...status }));
    throw error;
  }
}

function normalizeBattleType(value: string | null): BattleType {
  return value === 'doubles' ? 'doubles' : 'singles';
}

function normalizeLimit(value: string | null) {
  const parsed = Number(value ?? DEFAULT_TEAM_LIMIT);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_TEAM_LIMIT;
  return Math.min(parsed, MAX_TEAM_LIMIT);
}

function toTeamSummary(team: PokeDbRankedTeam): TeamSummary {
  return {
    rank: team.rank,
    ratingValue: team.rating_value,
    slots: team.team
      .filter((slot) => Boolean(slot.id))
      .map((slot) => {
        const pokemonId = pokemonKeyToId.get(slot.id);
        const itemId = pokedbItemNameToId[slot.item];
        return {
          pokeDbKey: slot.id,
          ...(pokemonId ? { pokemonId } : {}),
          pokemonName: pokemonId ? pokemonNameById.get(pokemonId) ?? slot.pokemon : slot.pokemon,
          ...(slot.form ? { form: slot.form } : {}),
          ...(itemId ? { itemId } : {}),
          ...(slot.item ? { itemName: slot.item } : {}),
        };
      }),
  };
}

function buildTeamIndex(snapshot: EnvironmentSnapshot): TeamIndex {
  const index: TeamIndex = { singles: {}, doubles: {} };

  (['singles', 'doubles'] as const).forEach((battleType) => {
    const payload = snapshot.battles[battleType];
    if (!payload) return;

    payload.teams.forEach((team) => {
      const summary = toTeamSummary(team);
      const uniquePokemonIds = new Set(summary.slots.map((slot) => slot.pokemonId).filter((id): id is string => Boolean(id)));

      uniquePokemonIds.forEach((pokemonId) => {
        const current = index[battleType][pokemonId] ?? [];
        if (current.length < MAX_TEAM_LIMIT) current.push(summary);
        index[battleType][pokemonId] = current;
      });
    });
  });

  return index;
}

async function getTeamIndex(env: AppEnv, snapshot: EnvironmentSnapshot): Promise<TeamIndex> {
  const indexText = await env.ENVIRONMENT_CACHE.get(TEAM_INDEX_KEY);
  if (indexText) return JSON.parse(indexText) as TeamIndex;
  return buildTeamIndex(snapshot);
}

const constantTimeEqual = async (left: string, right: string) => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  const leftDigest = await crypto.subtle.digest('SHA-256', leftBytes);
  const rightDigest = await crypto.subtle.digest('SHA-256', rightBytes);
  const leftView = new Uint8Array(leftDigest);
  const rightView = new Uint8Array(rightDigest);
  let diff = 0;
  for (let index = 0; index < leftView.length; index += 1) {
    diff |= leftView[index] ^ rightView[index];
  }
  return diff === 0;
};

async function isAuthorizedRefresh(request: Request, env: AppEnv) {
  if (!env.ADMIN_REFRESH_TOKEN) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  return constantTimeEqual(token, env.ADMIN_REFRESH_TOKEN);
}

async function handleLatest(request: Request, env: AppEnv) {
  const [snapshotText, statusText] = await Promise.all([
    env.ENVIRONMENT_CACHE.get(SNAPSHOT_KEY),
    env.ENVIRONMENT_CACHE.get(STATUS_KEY),
  ]);
  const status = statusText ? (JSON.parse(statusText) as CacheStatus) : undefined;

  if (!snapshotText) {
    return jsonResponse(
      env,
      {
        error: 'environment_snapshot_not_ready',
        status,
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const maxAgeSeconds = Number(env.MAX_CACHE_AGE_SECONDS ?? DEFAULT_MAX_CACHE_AGE_SECONDS);
  const cacheState = isFresh(status?.refreshedAt, Number.isFinite(maxAgeSeconds) ? maxAgeSeconds : DEFAULT_MAX_CACHE_AGE_SECONDS)
    ? 'fresh'
    : 'stale';

  return new Response(snapshotText, {
    headers: jsonHeaders(env, {
      'cache-control': cacheState === 'fresh' ? 'public, max-age=300' : 'public, max-age=60',
      'x-luxray-cache-state': cacheState,
      'x-luxray-worker-status': status?.ok ? 'ok' : 'degraded',
    }),
  });
}

async function handleStatus(env: AppEnv) {
  const statusText = await env.ENVIRONMENT_CACHE.get(STATUS_KEY);
  return jsonResponse(
    env,
    statusText ? JSON.parse(statusText) : { ok: false, error: 'environment_status_not_ready' },
    { status: statusText ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}

async function handlePokemonTeams(url: URL, env: AppEnv, pokemonId: string) {
  const battleType = normalizeBattleType(url.searchParams.get('battleType'));
  const limit = normalizeLimit(url.searchParams.get('limit'));
  const snapshotText = await env.ENVIRONMENT_CACHE.get(SNAPSHOT_KEY);

  if (!snapshotText) {
    return jsonResponse(
      env,
      {
        error: 'environment_snapshot_not_ready',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const snapshot = JSON.parse(snapshotText) as EnvironmentSnapshot;
  const teamIndex = await getTeamIndex(env, snapshot);
  const teams = teamIndex[battleType][pokemonId]?.slice(0, limit) ?? [];
  const payload = snapshot.battles[battleType];

  return jsonResponse(
    env,
    {
      pokemonId,
      pokemonName: pokemonNameById.get(pokemonId) ?? pokemonId,
      battleType,
      count: teams.length,
      source: {
        season: payload?.season,
        updatedAt: payload?.updated_at,
        retrievedAt: snapshot.retrievedAt,
        cacheCompleteness: snapshot.dataFreshness?.completeness ?? 'unknown',
      },
      teams,
    },
    {
      headers: {
        'cache-control': 'public, max-age=300',
      },
    },
  );
}

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: jsonHeaders(env) });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(env, { ok: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/environment/latest') {
      return handleLatest(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/environment/status') {
      return handleStatus(env);
    }

    const pokemonTeamsMatch = url.pathname.match(/^\/api\/pokemon\/([^/]+)\/teams$/);
    if (request.method === 'GET' && pokemonTeamsMatch) {
      return handlePokemonTeams(url, env, decodeURIComponent(pokemonTeamsMatch[1]));
    }

    if (request.method === 'POST' && url.pathname === '/api/environment/refresh') {
      if (!(await isAuthorizedRefresh(request, env))) {
        return jsonResponse(env, { error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
      }
      const status = await refreshSnapshot(env);
      return jsonResponse(env, status, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse(env, { error: 'not_found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: AppEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshSnapshot(env));
  },
};
