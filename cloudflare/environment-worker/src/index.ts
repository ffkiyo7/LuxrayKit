import { pokedbItemNameToId } from '../../../src/data/external/pokedbItemNameMap';
import { pokedbAbilityKeyToId, pokedbMoveKeyToId } from '../../../src/data/external/pokedbResourceKeyMap';
import { regMaPokemonAllowlist } from '../../../src/data/seed/regMA/allowlist';
import { pokemon } from '../../../src/data/seed/regMA/catalog';
import {
  parsePokeDbPokemonDetailPage,
  parsePokeDbPokemonListPage,
  parsePokeDbTrainerListPage,
  type PokeDbPokemonDetailPayload,
  type PokeDbPokemonListPayload,
  type PokeDbPokemonRankingEntry,
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
  sourceUpdatedAt?: string;
  failedAt?: string;
  selectedSeason?: number;
  selectedSeasonLabel?: string;
  teamCounts?: Partial<Record<BattleType, number>>;
  error?: string;
};

type RefreshPendingDetail = Pick<PokeDbPokemonRankingEntry, 'pokeDbKey' | 'pokemonId' | 'rank'> & {
  battleType: BattleType;
};

type RefreshJob = {
  jobId: string;
  season: number;
  detailLimit: number;
  startedAt: string;
  updatedAt: string;
  stepCount: number;
  phase: 'collecting' | 'finalizing';
  lists: Record<BattleType, PokeDbPokemonListPayload>;
  pending: RefreshPendingDetail[];
  details: Record<BattleType, Record<string, PokeDbPokemonDetailPayload>>;
};

type RefreshTriggerResult = {
  ok: true;
  state: 'started' | 'in-progress' | 'resumed' | 'skipped';
  jobId: string;
  season: number;
  pendingCount: number;
};

type AppEnv = Env & {
  ADMIN_REFRESH_TOKEN?: string;
  POKEDB_DETAIL_LIMIT?: string;
  POKEDB_DETAIL_CHUNK_SIZE?: string;
  WORKER_SELF_URL?: string;
  SELF?: Fetcher;
};

const SNAPSHOT_KEY = 'environment:latest';
const STATUS_KEY = 'environment:status';
const TEAM_INDEX_KEY = 'environment:team-index';
const REFRESH_JOB_KEY = 'environment:refresh-job';
const DEFAULT_POKEDB_BASE_URL = 'https://champs.pokedb.tokyo';
const DEFAULT_WORKER_SELF_URL = 'https://luxraykit-app.ffkiyo7.workers.dev';
const DEFAULT_MAX_CACHE_AGE_SECONDS = 30 * 60 * 60;
const DEFAULT_TEAM_LIMIT = 24;
const MAX_TEAM_LIMIT = 50;
const DEFAULT_DETAIL_LIMIT = 60;
const MAX_DETAIL_LIMIT = 80;
const DEFAULT_DETAIL_CHUNK_SIZE = 20;
const MAX_DETAIL_CHUNK_SIZE = 20;
const REFRESH_JOB_STALE_MS = 10 * 60 * 1000;
const REFRESH_JOB_ABANDON_MS = 60 * 60 * 1000;
const MAX_REFRESH_JOB_STEPS = 10;
const PAGE_REQUEST_DELAY_MS = 450;
const POKEDB_USER_AGENT = 'LuxrayKitEnvironmentWorker/0.2 (+https://luxraykit.com)';

const latestSourceUpdatedAt = (lists: Record<BattleType, PokeDbPokemonListPayload>) =>
  lists.singles.updatedAt >= lists.doubles.updatedAt
    ? lists.singles.updatedAt
    : lists.doubles.updatedAt;

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
    cache: 'no-store',
    headers: {
      accept: 'text/html',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
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

async function fetchPokemonList(options: {
  baseUrl: string;
  season: number;
  battleType: BattleType;
  fetcher?: Fetcher;
}): Promise<PokeDbPokemonListPayload> {
  const listUrl = pokemonListUrl(options.baseUrl, options.season, options.battleType);
  const listHtml = await fetchPokeDbHtml(listUrl, options.fetcher ?? fetch);
  return parsePokeDbPokemonListPage(listHtml, {
    battleType: options.battleType,
    sourceUrl: listUrl,
    pokemonKeyToId: pokemonKeyToIdRecord,
  });
}

async function fetchPokemonDetail(options: {
  baseUrl: string;
  season: number;
  battleType: BattleType;
  ranking: Pick<PokeDbPokemonRankingEntry, 'pokeDbKey' | 'rank'>;
  resultCount: number;
  fetcher?: Fetcher;
}): Promise<PokeDbPokemonDetailPayload> {
  const detailUrl = pokemonDetailUrl(options.baseUrl, options.season, options.battleType, options.ranking.pokeDbKey);
  const html = await fetchPokeDbHtml(detailUrl, options.fetcher ?? fetch);
  return parsePokeDbPokemonDetailPage(html, {
    teamCount: Math.max(options.resultCount - options.ranking.rank + 1, 1),
    pokemonKeyToId: pokemonKeyToIdRecord,
    itemNameToId: pokedbItemNameToId,
    moveKeyToId: pokedbMoveKeyToId,
    abilityKeyToId: pokedbAbilityKeyToId,
    natureNameToId: pokeDbNatureNameToId,
  });
}

function buildPokemonStatisticsPayload(
  list: PokeDbPokemonListPayload,
  detailsByPokemonId: Record<string, PokeDbPokemonDetailPayload>,
): PokeDbPokemonStatisticsPayload {
  const pokemonUsage: EnvironmentPokemonUsage[] = list.rankings.map((ranking) => {
    const teamCount = Math.max(list.resultCount - ranking.rank + 1, 1);
    const detail = detailsByPokemonId[ranking.pokemonId];
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
  const details = Object.values(detailsByPokemonId);

  return {
    season: list.season,
    seasonNumber: list.seasonNumber,
    rule: list.rule,
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
  const list = await fetchPokemonList({
    baseUrl: options.baseUrl,
    season: options.season,
    battleType: options.battleType,
    fetcher,
  });
  const topRankings = list.rankings.slice(0, detailLimit);
  const detailsByPokemonId: Record<string, PokeDbPokemonDetailPayload> = {};

  for (const [index, ranking] of topRankings.entries()) {
    if (index > 0) await wait(PAGE_REQUEST_DELAY_MS);
    detailsByPokemonId[ranking.pokemonId] = await fetchPokemonDetail({
      baseUrl: options.baseUrl,
      season: options.season,
      battleType: options.battleType,
      ranking,
      resultCount: list.resultCount,
      fetcher,
    });
  }

  return buildPokemonStatisticsPayload(list, detailsByPokemonId);
}

async function fetchPreviousSeasonSamples(options: {
  baseUrl: string;
  season: number;
  battleType: BattleType;
  fetcher?: Fetcher;
}): Promise<EnvironmentTeamSample[]> {
  if (options.season <= 1) return [];
  const sourceUrl = trainerListUrl(options.baseUrl, options.season - 1, options.battleType, 1);
  try {
    const html = await fetchPokeDbHtml(sourceUrl, options.fetcher ?? fetch);
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
    // Importable samples are best-effort: a previous-season fetch failure must
    // never block publishing the current-season rankings/details in FINALIZE.
    console.log(JSON.stringify({
      event: 'environment_sample_refresh_failure',
      battleType: options.battleType,
      error: error instanceof Error ? error.message : String(error),
    }));
    return [];
  }
}

const configuredInteger = (value: string | undefined, fallback: number, maximum: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), maximum) : fallback;
};

function buildSnapshotFromRefreshJob(
  job: RefreshJob,
  teamSamples: Record<BattleType, EnvironmentTeamSample[]>,
  retrievedAt: string,
): EnvironmentSnapshot {
  const singles = buildPokemonStatisticsPayload(job.lists.singles, job.details.singles);
  const doubles = buildPokemonStatisticsPayload(job.lists.doubles, job.details.doubles);
  const unknownPokemonKeys = mergeUnique([singles.audit.unknownPokemonKeys, doubles.audit.unknownPokemonKeys]);
  const unknownItemNames = mergeUnique([singles.audit.unknownItemNames, doubles.audit.unknownItemNames]);
  const unknownMoveKeys = mergeUnique([singles.audit.unknownMoveKeys, doubles.audit.unknownMoveKeys]);
  const unknownAbilityKeys = mergeUnique([singles.audit.unknownAbilityKeys, doubles.audit.unknownAbilityKeys]);
  const unknownNatureNames = mergeUnique([singles.audit.unknownNatureNames, doubles.audit.unknownNatureNames]);

  return {
    retrievedAt,
    battles: { singles, doubles },
    teamSamples,
    dataFreshness: {
      source: 'pokedb-pokemon-statistics',
      selectedSeason: job.season,
      completeness: 'rankings-complete-details-top-n',
      detailLimit: job.detailLimit,
      notes: [
        `Complete Pokemon rankings with detail statistics for the top ${job.detailLimit}.`,
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

async function recordRefreshFailure(env: AppEnv, error: unknown, now: () => Date) {
  const previousStatusText = await env.ENVIRONMENT_CACHE.get(STATUS_KEY);
  const previousStatus = previousStatusText ? (JSON.parse(previousStatusText) as CacheStatus) : undefined;
  const status: CacheStatus = {
    ...previousStatus,
    ok: false,
    failedAt: now().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  await env.ENVIRONMENT_CACHE.put(STATUS_KEY, JSON.stringify(status));
  console.log(JSON.stringify({ event: 'environment_refresh_failure', ...status }));
}

async function publishRefreshJob(
  env: AppEnv,
  job: RefreshJob,
  fetcher: Fetcher,
  now: () => Date,
): Promise<CacheStatus> {
  const baseUrl = env.POKEDB_BASE_URL || DEFAULT_POKEDB_BASE_URL;
  const [singlesSamples, doublesSamples] = await Promise.all([
    fetchPreviousSeasonSamples({ baseUrl, season: job.season, battleType: 'singles', fetcher }),
    fetchPreviousSeasonSamples({ baseUrl, season: job.season, battleType: 'doubles', fetcher }),
  ]);
  const refreshedAt = now().toISOString();
  const snapshot = buildSnapshotFromRefreshJob(
    job,
    { singles: singlesSamples, doubles: doublesSamples },
    refreshedAt,
  );
  const teamIndex = buildTeamIndex(snapshot);
  const status: CacheStatus = {
    ok: true,
    refreshedAt,
    sourceUpdatedAt: latestSourceUpdatedAt(job.lists),
    selectedSeason: job.season,
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
  await env.ENVIRONMENT_CACHE.delete(REFRESH_JOB_KEY);
  console.log(JSON.stringify({ event: 'environment_refresh_success', jobId: job.jobId, ...status }));
  return status;
}

type RefreshJobDependencies = {
  fetcher?: Fetcher;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  createJobId?: () => string;
};

type ScheduleRefreshStep = (jobId: string) => void;

export async function startRefreshJob(
  env: AppEnv,
  scheduleNext: ScheduleRefreshStep,
  dependencies: RefreshJobDependencies = {},
): Promise<RefreshTriggerResult> {
  const now = dependencies.now ?? (() => new Date());
  const currentTime = now();
  const [currentJobText, currentStatusText, currentSnapshotText] = await Promise.all([
    env.ENVIRONMENT_CACHE.get(REFRESH_JOB_KEY),
    env.ENVIRONMENT_CACHE.get(STATUS_KEY),
    env.ENVIRONMENT_CACHE.get(SNAPSHOT_KEY),
  ]);
  if (currentJobText) {
    const currentJob = JSON.parse(currentJobText) as RefreshJob;
    const jobAge = currentTime.getTime() - Date.parse(currentJob.startedAt);
    if (jobAge > REFRESH_JOB_ABANDON_MS) {
      await env.ENVIRONMENT_CACHE.delete(REFRESH_JOB_KEY);
      console.log(JSON.stringify({
        event: 'environment_refresh_abandoned',
        jobId: currentJob.jobId,
        startedAt: currentJob.startedAt,
        stepCount: currentJob.stepCount,
        pendingCount: currentJob.pending.length,
      }));
    } else {
      const currentStatus = currentStatusText ? (JSON.parse(currentStatusText) as CacheStatus) : undefined;
      const isStale = currentTime.getTime() - Date.parse(currentJob.updatedAt) > REFRESH_JOB_STALE_MS;
      const stoppedAfterFailure =
        currentStatus?.ok === false &&
        Boolean(currentStatus.failedAt) &&
        Date.parse(currentStatus.failedAt!) >= Date.parse(currentJob.startedAt);
      if (isStale || stoppedAfterFailure) scheduleNext(currentJob.jobId);
      return {
        ok: true,
        state: isStale || stoppedAfterFailure ? 'resumed' : 'in-progress',
        jobId: currentJob.jobId,
        season: currentJob.season,
        pendingCount: currentJob.pending.length,
      };
    }
  }

  const fetcher = dependencies.fetcher ?? fetch;
  const baseUrl = env.POKEDB_BASE_URL || DEFAULT_POKEDB_BASE_URL;
  try {
    const season = await detectLatestPokeDbSeason(baseUrl, fetcher);
    const [singles, doubles] = await Promise.all([
      fetchPokemonList({ baseUrl, season, battleType: 'singles', fetcher }),
      fetchPokemonList({ baseUrl, season, battleType: 'doubles', fetcher }),
    ]);
    const previousStatus = currentStatusText ? (JSON.parse(currentStatusText) as CacheStatus) : undefined;
    const sourceUpdatedAt = latestSourceUpdatedAt({ singles, doubles });
    if (
      currentSnapshotText &&
      previousStatus?.ok === true &&
      previousStatus.selectedSeason === season &&
      previousStatus.sourceUpdatedAt === sourceUpdatedAt
    ) {
      const refreshedAt = currentTime.toISOString();
      const snapshot = JSON.parse(currentSnapshotText) as EnvironmentSnapshot;
      const status: CacheStatus = {
        ...previousStatus,
        refreshedAt,
      };
      await Promise.all([
        env.ENVIRONMENT_CACHE.put(SNAPSHOT_KEY, JSON.stringify({
          ...snapshot,
          retrievedAt: refreshedAt,
        })),
        env.ENVIRONMENT_CACHE.put(STATUS_KEY, JSON.stringify(status)),
      ]);
      console.log(JSON.stringify({
        event: 'environment_refresh_skipped',
        season,
        sourceUpdatedAt,
        refreshedAt: status.refreshedAt,
      }));
      return {
        ok: true,
        state: 'skipped',
        jobId: '',
        season,
        pendingCount: 0,
      };
    }
    const detailLimit = configuredInteger(env.POKEDB_DETAIL_LIMIT, DEFAULT_DETAIL_LIMIT, MAX_DETAIL_LIMIT);
    const pending = (['singles', 'doubles'] as const).flatMap((battleType) =>
      ({ singles, doubles })[battleType].rankings.slice(0, detailLimit).map((ranking) => ({
        battleType,
        pokeDbKey: ranking.pokeDbKey,
        pokemonId: ranking.pokemonId,
        rank: ranking.rank,
      })),
    );
    const timestamp = currentTime.toISOString();
    const job: RefreshJob = {
      jobId: dependencies.createJobId?.() ?? crypto.randomUUID(),
      season,
      detailLimit,
      startedAt: timestamp,
      updatedAt: timestamp,
      stepCount: 0,
      phase: 'collecting',
      lists: { singles, doubles },
      pending,
      details: { singles: {}, doubles: {} },
    };
    await env.ENVIRONMENT_CACHE.put(REFRESH_JOB_KEY, JSON.stringify(job));
    scheduleNext(job.jobId);
    console.log(JSON.stringify({
      event: 'environment_refresh_started',
      jobId: job.jobId,
      season,
      detailLimit,
      pendingCount: pending.length,
    }));
    return {
      ok: true,
      state: 'started',
      jobId: job.jobId,
      season,
      pendingCount: pending.length,
    };
  } catch (error) {
    await recordRefreshFailure(env, error, now);
    throw error;
  }
}

export async function runRefreshJobStep(
  env: AppEnv,
  jobId: string,
  scheduleNext: ScheduleRefreshStep,
  dependencies: RefreshJobDependencies = {},
): Promise<CacheStatus | { ok: true; state: 'collecting' | 'finalizing'; jobId: string; pendingCount: number }> {
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher ?? fetch;
  const wait = dependencies.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const jobText = await env.ENVIRONMENT_CACHE.get(REFRESH_JOB_KEY);
  if (!jobText) throw new Error('Environment refresh job was not found');
  const job = JSON.parse(jobText) as RefreshJob;
  if (job.jobId !== jobId) throw new Error(`Environment refresh job ${jobId} is no longer active`);
  if (job.stepCount >= MAX_REFRESH_JOB_STEPS) {
    const error = new Error(`Environment refresh job ${jobId} exceeded ${MAX_REFRESH_JOB_STEPS} steps`);
    await recordRefreshFailure(env, error, now);
    throw error;
  }

  try {
    if (job.phase === 'finalizing') {
      return await publishRefreshJob(env, job, fetcher, now);
    }

    const chunkSize = configuredInteger(
      env.POKEDB_DETAIL_CHUNK_SIZE,
      DEFAULT_DETAIL_CHUNK_SIZE,
      MAX_DETAIL_CHUNK_SIZE,
    );
    const chunk = job.pending.slice(0, chunkSize);
    if (chunk.length === 0) {
      const finalizingJob: RefreshJob = {
        ...job,
        phase: 'finalizing',
        stepCount: job.stepCount + 1,
        updatedAt: now().toISOString(),
      };
      await env.ENVIRONMENT_CACHE.put(REFRESH_JOB_KEY, JSON.stringify(finalizingJob));
      scheduleNext(job.jobId);
      return { ok: true, state: 'finalizing', jobId: job.jobId, pendingCount: 0 };
    }

    const chunkDetails: Array<[RefreshPendingDetail, PokeDbPokemonDetailPayload]> = [];
    for (const [index, pending] of chunk.entries()) {
      if (index > 0) await wait(PAGE_REQUEST_DELAY_MS);
      const detail = await fetchPokemonDetail({
        baseUrl: env.POKEDB_BASE_URL || DEFAULT_POKEDB_BASE_URL,
        season: job.season,
        battleType: pending.battleType,
        ranking: pending,
        resultCount: job.lists[pending.battleType].resultCount,
        fetcher,
      });
      chunkDetails.push([pending, detail]);
    }

    chunkDetails.forEach(([pending, detail]) => {
      job.details[pending.battleType][pending.pokemonId] = detail;
    });
    job.pending = job.pending.slice(chunk.length);
    job.phase = job.pending.length > 0 ? 'collecting' : 'finalizing';
    job.stepCount += 1;
    job.updatedAt = now().toISOString();
    await env.ENVIRONMENT_CACHE.put(REFRESH_JOB_KEY, JSON.stringify(job));
    scheduleNext(job.jobId);
    return {
      ok: true,
      state: job.phase,
      jobId: job.jobId,
      pendingCount: job.pending.length,
    };
  } catch (error) {
    await recordRefreshFailure(env, error, now);
    throw error;
  }
}

async function triggerRefreshStep(env: AppEnv, jobId: string, fetcher: Fetcher = fetch) {
  try {
    if (!env.ADMIN_REFRESH_TOKEN) throw new Error('ADMIN_REFRESH_TOKEN is required for chained refresh steps');
    const selfUrl = new URL('/api/environment/refresh', env.WORKER_SELF_URL || DEFAULT_WORKER_SELF_URL);
    selfUrl.searchParams.set('step', '1');
    selfUrl.searchParams.set('jobId', jobId);
    const request = new Request(selfUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.ADMIN_REFRESH_TOKEN}` },
    });
    const response = env.SELF ? await env.SELF.fetch(request) : await fetcher(request);
    if (!response.ok) {
      throw new Error(`Environment refresh self-chain returned ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    await recordRefreshFailure(env, error, () => new Date());
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

  const snapshot = JSON.parse(snapshotText) as EnvironmentSnapshot;
  const maxAgeSeconds = Number(env.MAX_CACHE_AGE_SECONDS ?? DEFAULT_MAX_CACHE_AGE_SECONDS);
  const cacheState = status?.ok && isFresh(
    snapshot.retrievedAt,
    Number.isFinite(maxAgeSeconds) ? maxAgeSeconds : DEFAULT_MAX_CACHE_AGE_SECONDS,
  )
    ? 'fresh'
    : 'stale';

  return new Response(snapshotText, {
    headers: jsonHeaders(env, {
      'cache-control': 'no-store',
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
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
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
      const scheduleNext = (jobId: string) => {
        ctx.waitUntil(triggerRefreshStep(env, jobId));
      };
      try {
        if (url.searchParams.get('step') === '1') {
          const jobId = url.searchParams.get('jobId');
          if (!jobId) {
            return jsonResponse(
              env,
              { ok: false, error: 'missing_refresh_job_id' },
              { status: 400, headers: { 'cache-control': 'no-store' } },
            );
          }
          const result = await runRefreshJobStep(env, jobId, scheduleNext);
          return jsonResponse(
            env,
            result,
            { status: 202, headers: { 'cache-control': 'no-store' } },
          );
        }
        const result = await startRefreshJob(env, scheduleNext);
        return jsonResponse(env, result, { status: 202, headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        return jsonResponse(
          env,
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          { status: 500, headers: { 'cache-control': 'no-store' } },
        );
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse(env, { error: 'not_found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: AppEnv, ctx: ExecutionContext): Promise<void> {
    const scheduleNext = (jobId: string) => {
      ctx.waitUntil(triggerRefreshStep(env, jobId));
    };
    await startRefreshJob(env, scheduleNext);
  },
};
