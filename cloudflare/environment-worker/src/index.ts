import { pokedbItemNameToId } from '../../../src/data/external/pokedbItemNameMap';
import { pokedbAbilityKeyToId, pokedbMoveKeyToId } from '../../../src/data/external/pokedbResourceKeyMap';
import { regMaPokemonAllowlist } from '../../../src/data/seed/regMA/allowlist';
import { pokemon } from '../../../src/data/seed/regMA/catalog';
import {
  parsePokeDbPokemonDetailPage,
  parsePokeDbPokemonListPage,
  parsePokeDbTrainerListPage,
  type PokeDbPokemonStatisticsPayload,
  type PokeDbTrainerListPayload,
  type PokeDbTrainerTeam,
} from '../../../src/lib/pokedbEnvironment';
import type { EnvironmentPokemonUsage, EnvironmentTeamSample } from '../../../src/lib/environmentDataset';

type BattleType = 'singles' | 'doubles';

type EnvironmentSnapshot = {
  retrievedAt: string;
  battles: Partial<Record<BattleType, PokeDbPokemonStatisticsPayload>>;
  teamSamples?: Partial<Record<BattleType, EnvironmentTeamSample[]>>;
  dataFreshness?: {
    source: 'pokedb-pokemon-statistics';
    selectedSeason: number;
    completeness: 'rankings-complete-details-top-n';
    detailLimit: number;
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
  failedAt?: string;
  selectedSeason?: number;
  selectedSeasonLabel?: string;
  teamCounts?: Partial<Record<BattleType, number>>;
  error?: string;
};

type AppEnv = Env & {
  ADMIN_REFRESH_TOKEN?: string;
  POKEDB_DETAIL_LIMIT?: string;
};

const SNAPSHOT_KEY = 'environment:latest';
const STATUS_KEY = 'environment:status';
const TEAM_INDEX_KEY = 'environment:team-index';
const DEFAULT_POKEDB_BASE_URL = 'https://champs.pokedb.tokyo';
const DEFAULT_MAX_CACHE_AGE_SECONDS = 6 * 60 * 60;
const DEFAULT_TEAM_LIMIT = 24;
const MAX_TEAM_LIMIT = 50;
const DEFAULT_DETAIL_LIMIT = 60;
const MAX_DETAIL_LIMIT = 80;
const PAGE_REQUEST_DELAY_MS = 250;
const POKEDB_USER_AGENT = 'LuxrayKitEnvironmentWorker/0.2 (+https://luxraykit.com)';

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
const pokemonKeyById = new Map([...pokemonKeyToId.entries()].map(([key, id]) => [id, key]));
const pokeDbItemNameById = new Map(Object.entries(pokedbItemNameToId).map(([name, id]) => [id, name]));

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

const isFresh = (refreshedAt: string | undefined, maxAgeSeconds: number) => {
  if (!refreshedAt) return false;
  const ageMs = Date.now() - Date.parse(refreshedAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeSeconds * 1000;
};

const pokeDbRuleParamByBattleType = {
  doubles: 1,
  singles: 0,
} satisfies Record<BattleType, number>;

const pokeDbNatureNameToId: Record<string, string> = {
  さみしがり: '怕寂寞',
  いじっぱり: '固执',
  やんちゃ: '顽皮',
  ゆうかん: '勇敢',
  ずぶとい: '大胆',
  わんぱく: '淘气',
  のうてんき: '乐天',
  のんき: '悠闲',
  ひかえめ: '内敛',
  おっとり: '慢吞吞',
  うっかりや: '马虎',
  れいせい: '冷静',
  おだやか: '温和',
  おとなしい: '温顺',
  しんちょう: '慎重',
  なまいき: '自大',
  おくびょう: '胆小',
  せっかち: '急躁',
  ようき: '爽朗',
  むじゃき: '天真',
  てれや: '害羞',
  がんばりや: '勤奋',
  すなお: '坦率',
  きまぐれ: '浮躁',
  まじめ: '认真',
};

const trainerListUrl = (baseUrl: string, season: number, battleType: BattleType, page = 1) => {
  const url = new URL('/trainer/list', `${baseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('season', String(season));
  url.searchParams.set('rule', String(pokeDbRuleParamByBattleType[battleType]));
  url.searchParams.set('with_team', '1');
  url.searchParams.set('page', String(page));
  return url.toString();
};

const pokemonListUrl = (baseUrl: string, season: number, battleType: BattleType) => {
  const url = new URL('/pokemon/list', `${baseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('season', String(season));
  url.searchParams.set('rule', String(pokeDbRuleParamByBattleType[battleType]));
  return url.toString();
};

const pokemonDetailUrl = (baseUrl: string, season: number, battleType: BattleType, pokeDbKey: string) => {
  const url = new URL(`/pokemon/show/${pokeDbKey}`, `${baseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('season', String(season));
  url.searchParams.set('rule', String(pokeDbRuleParamByBattleType[battleType]));
  return url.toString();
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const fetchPokeDbHtml = async (url: string, fetcher: Fetcher) => {
  const response = await fetcher(url, {
    headers: {
      accept: 'text/html',
      'user-agent': POKEDB_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.text();
};

export async function detectLatestPokeDbSeason(baseUrl: string, fetcher: Fetcher = fetch): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, '')}/pokemon/list?rule=${pokeDbRuleParamByBattleType.singles}`;
  const html = await fetchPokeDbHtml(url, fetcher);
  const seasons = [...html.matchAll(/<option\s+value="(\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((season) => Number.isInteger(season) && season > 0);
  if (seasons.length === 0) {
    throw new Error('PokeDB Pokemon list did not expose any season options');
  }
  return Math.max(...seasons);
}

const mergeAuditValues = (payloads: PokeDbTrainerListPayload[], key: keyof PokeDbTrainerListPayload['audit']) =>
  [...new Set(payloads.flatMap((payload) => payload.audit[key]))].sort();

export async function fetchTrainerBattlePages(options: {
  baseUrl: string;
  season: number;
  battleType: BattleType;
  fetcher?: Fetcher;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<PokeDbTrainerListPayload> {
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const firstUrl = trainerListUrl(options.baseUrl, options.season, options.battleType, 1);
  const firstHtml = await fetchPokeDbHtml(firstUrl, fetcher);
  const firstPage = parsePokeDbTrainerListPage(firstHtml, {
    battleType: options.battleType,
    sourceUrl: firstUrl,
    pokemonKeyToId: pokemonKeyToIdRecord,
    itemNameToId: pokedbItemNameToId,
  });
  const pages = [firstPage];

  for (let page = 2; page <= firstPage.pageCount; page += 1) {
    await wait(PAGE_REQUEST_DELAY_MS);
    const pageUrl = trainerListUrl(options.baseUrl, options.season, options.battleType, page);
    const response = await fetcher(pageUrl, {
      headers: {
        accept: 'text/html',
        'user-agent': POKEDB_USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`${options.battleType} season ${options.season} page ${page} returned ${response.status}`);
    }
    const html = await response.text();
    pages.push(
      parsePokeDbTrainerListPage(html, {
        battleType: options.battleType,
        sourceUrl: pageUrl,
        pokemonKeyToId: pokemonKeyToIdRecord,
        itemNameToId: pokedbItemNameToId,
      }),
    );
  }

  const teamsByRank = new Map<number, PokeDbTrainerTeam>();
  pages.flatMap((page) => page.teams).forEach((team) => teamsByRank.set(team.rank, team));
  const teams = [...teamsByRank.values()].sort((a, b) => a.rank - b.rank);
  if (teams.length === 0) {
    throw new Error(`${options.battleType} season ${options.season} has no public trainer teams`);
  }

  return {
    ...firstPage,
    sourceUrl: trainerListUrl(options.baseUrl, options.season, options.battleType),
    teams,
    audit: {
      unknownPokemonKeys: mergeAuditValues(pages, 'unknownPokemonKeys'),
      unknownItemNames: mergeAuditValues(pages, 'unknownItemNames'),
    },
  };
}

const mergeUnique = <T extends string | number>(values: T[][]) => [...new Set(values.flat())].sort();

export async function fetchPokemonStatisticsBattle(options: {
  baseUrl: string;
  season: number;
  battleType: BattleType;
  detailLimit?: number;
  fetcher?: Fetcher;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<PokeDbPokemonStatisticsPayload> {
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const detailLimit = Math.min(Math.max(options.detailLimit ?? DEFAULT_DETAIL_LIMIT, 1), MAX_DETAIL_LIMIT);
  const listUrl = pokemonListUrl(options.baseUrl, options.season, options.battleType);
  const listHtml = await fetchPokeDbHtml(listUrl, fetcher);
  const list = parsePokeDbPokemonListPage(listHtml, {
    battleType: options.battleType,
    sourceUrl: listUrl,
    pokemonKeyToId: pokemonKeyToIdRecord,
  });
  const topRankings = list.rankings.slice(0, detailLimit);
  const detailByPokemonId = new Map<string, ReturnType<typeof parsePokeDbPokemonDetailPage>>();

  for (const [index, ranking] of topRankings.entries()) {
    if (index > 0) await wait(PAGE_REQUEST_DELAY_MS);
    const detailUrl = pokemonDetailUrl(options.baseUrl, options.season, options.battleType, ranking.pokeDbKey);
    const html = await fetchPokeDbHtml(detailUrl, fetcher);
    detailByPokemonId.set(
      ranking.pokemonId,
      parsePokeDbPokemonDetailPage(html, {
        teamCount: Math.max(list.resultCount - ranking.rank + 1, 1),
        pokemonKeyToId: pokemonKeyToIdRecord,
        itemNameToId: pokedbItemNameToId,
        moveKeyToId: pokedbMoveKeyToId,
        abilityKeyToId: pokedbAbilityKeyToId,
        natureNameToId: pokeDbNatureNameToId,
      }),
    );
  }

  const pokemonUsage: EnvironmentPokemonUsage[] = list.rankings.map((ranking) => {
    const teamCount = Math.max(list.resultCount - ranking.rank + 1, 1);
    const detail = detailByPokemonId.get(ranking.pokemonId);
    return {
      pokemonId: ranking.pokemonId,
      usageRate: Math.round(((teamCount / Math.max(list.resultCount, 1)) * 100) * 10) / 10,
      teamCount,
      moveIds: detail?.moveStats.map((stat) => stat.id) ?? [],
      itemIds: detail?.itemStats.map((stat) => stat.id) ?? [],
      teammateIds: detail?.teammateStats.map((stat) => stat.id) ?? [],
      abilityIds: detail?.abilityStats.map((stat) => stat.id) ?? [],
      natureIds: detail?.natureStats.map((stat) => stat.id) ?? [],
      moveStats: detail?.moveStats ?? [],
      itemStats: detail?.itemStats ?? [],
      teammateStats: detail?.teammateStats ?? [],
      abilityStats: detail?.abilityStats ?? [],
      natureStats: detail?.natureStats ?? [],
    };
  });
  const details = [...detailByPokemonId.values()];

  return {
    season: list.season,
    seasonNumber: list.seasonNumber,
    rule: options.battleType,
    updatedAt: list.updatedAt,
    sourceUrl: list.sourceUrl,
    resultCount: list.resultCount,
    detailCount: details.length,
    pokemonUsage,
    audit: {
      unknownPokemonKeys: list.audit.unknownPokemonKeys,
      unknownItemNames: mergeUnique(details.map((detail) => detail.audit.unknownItemNames)),
      unknownMoveKeys: mergeUnique(details.map((detail) => detail.audit.unknownMoveKeys)),
      unknownAbilityKeys: mergeUnique(details.map((detail) => detail.audit.unknownAbilityKeys)),
      unknownNatureNames: mergeUnique(details.map((detail) => detail.audit.unknownNatureNames)),
      failedDetailKeys: [],
    },
  };
}

async function fetchPreviousSeasonSamples(options: {
  baseUrl: string;
  season: number;
  battleType: BattleType;
}): Promise<EnvironmentTeamSample[]> {
  if (options.season <= 1) return [];
  const sourceUrl = trainerListUrl(options.baseUrl, options.season - 1, options.battleType, 1);
  try {
    const html = await fetchPokeDbHtml(sourceUrl, fetch);
    const payload = parsePokeDbTrainerListPage(html, {
      battleType: options.battleType,
      sourceUrl,
      pokemonKeyToId: pokemonKeyToIdRecord,
      itemNameToId: pokedbItemNameToId,
    });
    return payload.teams
      .filter((team): team is PokeDbTrainerTeam & { reportUrl: string } => Boolean(team.reportUrl))
      .slice(0, DEFAULT_TEAM_LIMIT)
      .map((team) => ({
        id: `pokedb-${options.battleType}-rank-${team.rank}`,
        dataKind: 'external-snapshot',
        author: team.author,
        season: payload.season,
        score: Math.floor(team.ratingValue ?? 0),
        rank: team.rank,
        title: `${payload.season} · 最高第 ${team.rank} 名 · ${Math.floor(team.ratingValue ?? 0)} 分`,
        battleType: options.battleType,
        reportUrl: team.reportUrl,
        slots: team.slots,
      }));
  } catch (error) {
    console.log(JSON.stringify({
      event: 'environment_sample_refresh_failure',
      battleType: options.battleType,
      error: error instanceof Error ? error.message : String(error),
    }));
    return [];
  }
}

async function buildLatestSnapshot(env: AppEnv): Promise<EnvironmentSnapshot> {
  const baseUrl = env.POKEDB_BASE_URL || DEFAULT_POKEDB_BASE_URL;
  const season = await detectLatestPokeDbSeason(baseUrl);
  const configuredDetailLimit = Number(env.POKEDB_DETAIL_LIMIT ?? DEFAULT_DETAIL_LIMIT);
  const detailLimit = Number.isInteger(configuredDetailLimit)
    ? Math.min(Math.max(configuredDetailLimit, 1), MAX_DETAIL_LIMIT)
    : DEFAULT_DETAIL_LIMIT;
  const [singles, doubles] = await Promise.all([
    fetchPokemonStatisticsBattle({ baseUrl, season, battleType: 'singles', detailLimit }),
    fetchPokemonStatisticsBattle({ baseUrl, season, battleType: 'doubles', detailLimit }),
  ]);
  const [singlesSamples, doublesSamples] = await Promise.all([
    fetchPreviousSeasonSamples({ baseUrl, season, battleType: 'singles' }),
    fetchPreviousSeasonSamples({ baseUrl, season, battleType: 'doubles' }),
  ]);
  const unknownPokemonKeys = mergeUnique([singles.audit.unknownPokemonKeys, doubles.audit.unknownPokemonKeys]);
  const unknownItemNames = mergeUnique([singles.audit.unknownItemNames, doubles.audit.unknownItemNames]);
  const unknownMoveKeys = mergeUnique([singles.audit.unknownMoveKeys, doubles.audit.unknownMoveKeys]);
  const unknownAbilityKeys = mergeUnique([singles.audit.unknownAbilityKeys, doubles.audit.unknownAbilityKeys]);
  const unknownNatureNames = mergeUnique([singles.audit.unknownNatureNames, doubles.audit.unknownNatureNames]);

  return {
    retrievedAt: new Date().toISOString(),
    battles: { singles, doubles },
    teamSamples: { singles: singlesSamples, doubles: doublesSamples },
    dataFreshness: {
      source: 'pokedb-pokemon-statistics',
      selectedSeason: season,
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
    },
  };
}

export async function refreshSnapshot(
  env: AppEnv,
  snapshotBuilder: (env: AppEnv) => Promise<EnvironmentSnapshot> = buildLatestSnapshot,
  now: () => Date = () => new Date(),
): Promise<CacheStatus> {
  const previousStatusText = await env.ENVIRONMENT_CACHE.get(STATUS_KEY);
  const previousStatus = previousStatusText ? (JSON.parse(previousStatusText) as CacheStatus) : undefined;

  try {
    const snapshot = await snapshotBuilder(env);
    const teamIndex = buildTeamIndex(snapshot);
    const refreshedAt = now().toISOString();
    const status: CacheStatus = {
      ok: true,
      refreshedAt,
      selectedSeason: snapshot.dataFreshness?.selectedSeason,
      selectedSeasonLabel: snapshot.battles.singles?.season ?? snapshot.battles.doubles?.season,
      teamCounts: {
        singles: snapshot.battles.singles?.resultCount,
        doubles: snapshot.battles.doubles?.resultCount,
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
      ...previousStatus,
      ok: false,
      failedAt: now().toISOString(),
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

function toTeamSummary(team: Pick<PokeDbTrainerTeam, 'rank' | 'ratingValue' | 'slots'>): TeamSummary {
  return {
    rank: team.rank,
    ratingValue: team.ratingValue,
    slots: team.slots.map((slot) => ({
      pokeDbKey: pokemonKeyById.get(slot.pokemonId) ?? slot.pokemonId,
      pokemonId: slot.pokemonId,
      pokemonName: pokemonNameById.get(slot.pokemonId) ?? slot.pokemonId,
      ...(slot.itemId ? { itemId: slot.itemId, itemName: pokeDbItemNameById.get(slot.itemId) ?? slot.itemId } : {}),
    })),
  };
}

function buildTeamIndex(snapshot: EnvironmentSnapshot): TeamIndex {
  const index: TeamIndex = { singles: {}, doubles: {} };

  (['singles', 'doubles'] as const).forEach((battleType) => {
    (snapshot.teamSamples?.[battleType] ?? []).forEach((sample) => {
      const summary = toTeamSummary({
        rank: sample.rank ?? 0,
        ratingValue: sample.score,
        slots: sample.slots,
      });
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
  const cacheState = status?.ok && isFresh(
    status.refreshedAt,
    Number.isFinite(maxAgeSeconds) ? maxAgeSeconds : DEFAULT_MAX_CACHE_AGE_SECONDS,
  )
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
        updatedAt: payload?.updatedAt,
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
