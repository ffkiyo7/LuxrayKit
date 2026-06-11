import type { EligiblePokemon, Pokemon } from '../types';
import type {
  EnvironmentBattleDataset,
  EnvironmentBattleType,
  EnvironmentDataset,
  EnvironmentPokemonUsage,
  EnvironmentReferenceUsage,
  EnvironmentTeamSample,
  EnvironmentTeamSlot,
} from './environmentDataset';

export type PokeDbRankedTeamSlot = {
  id: string;
  pokemon: string;
  form: string;
  type1: string;
  type2: string;
  category: string;
  terastal: string;
  item: string;
};

export type PokeDbRankedTeam = {
  rank: number;
  rating_value: number | null;
  team: PokeDbRankedTeamSlot[];
};

export type PokeDbRankedTeamsPayload = {
  season: string;
  season_number: number;
  rule: string;
  updated_at: string;
  teams: PokeDbRankedTeam[];
};

export type PokeDbTrainerTeam = {
  rank: number;
  ratingValue: number | null;
  author: string;
  reportUrl?: string;
  slots: EnvironmentTeamSlot[];
};

export type PokeDbTrainerListPayload = {
  season: string;
  seasonNumber: number;
  rule: EnvironmentBattleType;
  updatedAt: string;
  sourceUrl: string;
  resultCount: number;
  pageCount: number;
  teams: PokeDbTrainerTeam[];
  audit: {
    unknownPokemonKeys: string[];
    unknownItemNames: string[];
  };
};

export type PokeDbPokemonRankingEntry = {
  rank: number;
  pokeDbKey: string;
  pokemonId: string;
  pokemonName: string;
};

export type PokeDbPokemonStatisticsPayload = {
  season: string;
  seasonNumber: number;
  rule: EnvironmentBattleType;
  updatedAt: string;
  sourceUrl: string;
  resultCount: number;
  detailCount: number;
  pokemonUsage: EnvironmentPokemonUsage[];
  audit: {
    unknownPokemonKeys: string[];
    unknownItemNames: string[];
    unknownMoveKeys: number[];
    unknownAbilityKeys: number[];
    unknownNatureNames: string[];
    failedDetailKeys: string[];
  };
};

export type PokeDbPokemonListPayload = Omit<PokeDbPokemonStatisticsPayload, 'detailCount' | 'pokemonUsage' | 'audit'> & {
  rankings: PokeDbPokemonRankingEntry[];
  audit: Pick<PokeDbPokemonStatisticsPayload['audit'], 'unknownPokemonKeys'>;
};

export type PokeDbPokemonDetailPayload = {
  moveStats: EnvironmentReferenceUsage[];
  itemStats: EnvironmentReferenceUsage[];
  teammateStats: EnvironmentReferenceUsage[];
  abilityStats: EnvironmentReferenceUsage[];
  natureStats: EnvironmentReferenceUsage[];
  audit: Omit<PokeDbPokemonStatisticsPayload['audit'], 'unknownPokemonKeys' | 'failedDetailKeys'>;
};

const battleTypes = ['singles', 'doubles'] as const satisfies EnvironmentBattleType[];

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[♀]/g, 'female')
    .replace(/[♂]/g, 'male')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

const toAbsoluteHttpUrl = (value: string, baseUrl: string) => {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const toPokeDbPokemonKey = (championsFormId: string) => {
  const [dexNo, formNo = '000'] = championsFormId.split('-');
  return `${dexNo}-${String(Number(formNo)).padStart(2, '0')}`;
};

export function createPokeDbPokemonKeyMap(allowlist: EligiblePokemon[], pokemon: Pokemon[]): Record<string, string> {
  const pokemonIdByEnglishName = new Map(pokemon.map((entry) => [normalizeName(entry.englishName), entry.id]));

  return allowlist.reduce<Record<string, string>>((acc, entry) => {
    const localPokemonId = entry.pokemonId ?? pokemonIdByEnglishName.get(normalizeName(entry.englishName));
    if (!localPokemonId) return acc;
    acc[toPokeDbPokemonKey(entry.championsFormId)] = localPokemonId;
    return acc;
  }, {});
}

const normalizePokeDbTimestamp = (value: string | undefined) => {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\//g, '-');
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match) return value;
  return `${match[1]}T${match[2]}:${match[3] ?? '00'}.000+09:00`;
};

const parsePokeDbPageMetadata = (html: string, sourceUrl: string) => {
  const titleSeason = decodeHtml(html.match(/<title>[\s\S]*?シーズン(M-\d+)/)?.[1] ?? '');
  const selectedSeason = Number(
    html.match(/<option\s+value="(\d+)"[^>]*selected/)?.[1] ??
      new URL(sourceUrl).searchParams.get('season') ??
      0,
  );
  const rawUpdatedText = decodeHtml(
    html.match(/更新日<\/span>\s*<span class="tag is-light">([^<]+)</)?.[1] ?? '',
  );
  const updatedParts = rawUpdatedText.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{2}:\d{2})$/);
  const updatedText = updatedParts
    ? `${updatedParts[1]}-${updatedParts[2].padStart(2, '0')}-${updatedParts[3].padStart(2, '0')} ${updatedParts[4]}`
    : rawUpdatedText.replace(/\//g, '-');

  return {
    season: titleSeason || (selectedSeason > 0 ? `M-${selectedSeason}` : 'unknown'),
    seasonNumber: selectedSeason,
    updatedAt: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(updatedText) ? `${updatedText}:00` : updatedText,
  };
};

const latestTimestamp = (values: string[]) =>
  values
    .map((value) => normalizePokeDbTimestamp(value))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

const emptyBattleDataset = (): EnvironmentBattleDataset => ({ pokemonUsage: [], teamSamples: [] });

const normalizeItemId = (itemName: string, itemNameToId: Record<string, string>, itemIds?: Set<string>) => {
  const cleaned = decodeHtml(itemName);
  if (!cleaned || cleaned === '持ち物なし' || cleaned === '持ち物不明') return undefined;
  const itemId = itemNameToId[cleaned];
  if (!itemId || (itemIds && !itemIds.has(itemId))) return undefined;
  return itemId;
};

const approximateCount = (usageRate: number, teamCount: number) =>
  usageRate > 0 ? Math.max(1, Math.round((usageRate / 100) * teamCount)) : 0;

const rankPercentile = (rank: number, total: number) =>
  Math.round(((Math.max(total - rank + 1, 1) / Math.max(total, 1)) * 100) * 10) / 10;

const parseUsagePieCharts = (html: string) => {
  const charts: Array<Array<Record<string, unknown>>> = [];
  for (const match of html.matchAll(/usagePieChart\((\[.*?\])\)/g)) {
    try {
      charts.push(JSON.parse(decodeHtml(match[1])) as Array<Record<string, unknown>>);
    } catch {
      // Ignore malformed chart data while preserving the other detail sections.
    }
  }
  return charts;
};

const mappedStats = (
  rows: Array<Record<string, unknown>>,
  keyField: string,
  idByKey: Record<string | number, string>,
  teamCount: number,
  unknownKeys: Set<string | number>,
) =>
  rows.flatMap((row) => {
    const key = row[keyField] as string | number | undefined;
    const usageRate = Number(row.rate);
    const id = key === undefined ? undefined : idByKey[key];
    if (!id) {
      if (key !== undefined) unknownKeys.add(key);
      return [];
    }
    if (!Number.isFinite(usageRate) || usageRate < 0 || usageRate > 100) return [];
    return [{ id, usageRate, teamCount: approximateCount(usageRate, teamCount) }];
  });

const convertSlot = (
  slot: Pick<PokeDbRankedTeamSlot, 'id' | 'item'>,
  pokemonKeyToId: Record<string, string>,
  itemNameToId: Record<string, string>,
  itemIds?: Set<string>,
): EnvironmentTeamSlot | undefined => {
  const pokemonId = pokemonKeyToId[slot.id];
  if (!pokemonId) return undefined;
  const itemId = normalizeItemId(slot.item, itemNameToId, itemIds);
  return {
    pokemonId,
    ...(itemId ? { itemId } : {}),
    moveIds: [],
  };
};

const getRankFromSampleId = (sampleId: string) => {
  const rank = Number(sampleId.match(/rank-(\d+)$/)?.[1] ?? 0);
  return Number.isInteger(rank) && rank > 0 ? rank : undefined;
};

const formatTeamSampleTitle = (
  sample: Pick<EnvironmentTeamSample, 'id' | 'score'> & { rank?: number; season?: string },
) => {
  const rank = sample.rank ?? getRankFromSampleId(sample.id);
  const rankText = rank ? `最高第 ${rank} 名` : undefined;
  const scoreText = Number.isFinite(sample.score) ? `${Math.floor(sample.score)} 分` : undefined;
  return [sample.season, rankText, scoreText].filter(Boolean).join(' · ');
};

const normalizeTeamSampleTitle = (
  sample: EnvironmentTeamSample,
  season?: string,
): EnvironmentTeamSample => {
  const rank = sample.rank ?? getRankFromSampleId(sample.id);
  const normalizedSeason = sample.season ?? season;
  return {
    ...sample,
    ...(normalizedSeason ? { season: normalizedSeason } : {}),
    ...(rank ? { rank } : {}),
    score: Math.floor(sample.score),
    title: formatTeamSampleTitle({ ...sample, rank, season: normalizedSeason }) || sample.title,
  };
};

const buildTrainerTeamSamples = (
  payload: Pick<PokeDbTrainerListPayload, 'season' | 'teams'>,
  battleType: EnvironmentBattleType,
  limit = 24,
): EnvironmentTeamSample[] =>
  payload.teams
    .map((team): EnvironmentTeamSample | undefined => {
      if (!Number.isInteger(team.rank) || team.slots.length === 0 || !team.reportUrl) return undefined;

      const sample = {
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
      } satisfies EnvironmentTeamSample;

      return normalizeTeamSampleTitle(sample, payload.season);
    })
    .filter((sample): sample is EnvironmentTeamSample => Boolean(sample))
    .slice(0, limit);

const sortedCounterKeys = (counter: Map<string, number>, firstSeen: Map<string, number>, limit: number) =>
  [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || (firstSeen.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (firstSeen.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit)
    .map(([id]) => id);

const sortedCounterStats = (
  counter: Map<string, number>,
  firstSeen: Map<string, number>,
  total: number,
  limit: number,
): EnvironmentReferenceUsage[] => {
  const denominator = Math.max(total, 1);
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || (firstSeen.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (firstSeen.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit)
    .map(([id, teamCount]) => ({
      id,
      teamCount,
      usageRate: Math.round((teamCount / denominator) * 1000) / 10,
    }));
};

const buildUsage = (
  teams: Array<Pick<PokeDbTrainerTeam, 'slots'>>,
  moveStatsByPokemonId: Record<string, EnvironmentReferenceUsage[]> = {},
): EnvironmentPokemonUsage[] => {
  const pokemonCounts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const itemCounts = new Map<string, Map<string, number>>();
  const itemFirstSeen = new Map<string, Map<string, number>>();
  const teammateCounts = new Map<string, Map<string, number>>();
  const teammateFirstSeen = new Map<string, Map<string, number>>();
  let seenIndex = 0;

  teams.forEach((team) => {
    const slots = team.slots;
    const uniquePokemonIds = [...new Set(slots.map((slot) => slot.pokemonId))];

    uniquePokemonIds.forEach((pokemonId) => {
      pokemonCounts.set(pokemonId, (pokemonCounts.get(pokemonId) ?? 0) + 1);
      if (!firstSeen.has(pokemonId)) firstSeen.set(pokemonId, seenIndex++);
    });

    slots.forEach((slot) => {
      if (!slot.itemId) return;
      const counters = itemCounts.get(slot.pokemonId) ?? new Map<string, number>();
      const first = itemFirstSeen.get(slot.pokemonId) ?? new Map<string, number>();
      counters.set(slot.itemId, (counters.get(slot.itemId) ?? 0) + 1);
      if (!first.has(slot.itemId)) first.set(slot.itemId, first.size);
      itemCounts.set(slot.pokemonId, counters);
      itemFirstSeen.set(slot.pokemonId, first);
    });

    uniquePokemonIds.forEach((pokemonId) => {
      const counters = teammateCounts.get(pokemonId) ?? new Map<string, number>();
      const first = teammateFirstSeen.get(pokemonId) ?? new Map<string, number>();
      uniquePokemonIds
        .filter((teammateId) => teammateId !== pokemonId)
        .forEach((teammateId) => {
          counters.set(teammateId, (counters.get(teammateId) ?? 0) + 1);
          if (!first.has(teammateId)) first.set(teammateId, first.size);
        });
      teammateCounts.set(pokemonId, counters);
      teammateFirstSeen.set(pokemonId, first);
    });
  });

  const teamTotal = Math.max(teams.length, 1);

  return [...pokemonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0))
    .map(([pokemonId, teamCount]) => {
      const itemStats = sortedCounterStats(itemCounts.get(pokemonId) ?? new Map(), itemFirstSeen.get(pokemonId) ?? new Map(), teamCount, 10);
      const teammateStats = sortedCounterStats(
        teammateCounts.get(pokemonId) ?? new Map(),
        teammateFirstSeen.get(pokemonId) ?? new Map(),
        teamCount,
        7,
      );

      return {
        pokemonId,
        usageRate: Math.round((teamCount / teamTotal) * 1000) / 10,
        teamCount,
        moveIds: moveStatsByPokemonId[pokemonId]?.map((stat) => stat.id) ?? [],
        moveStats: moveStatsByPokemonId[pokemonId] ?? [],
        itemIds: sortedCounterKeys(itemCounts.get(pokemonId) ?? new Map(), itemFirstSeen.get(pokemonId) ?? new Map(), 10),
        itemStats,
        teammateIds: sortedCounterKeys(teammateCounts.get(pokemonId) ?? new Map(), teammateFirstSeen.get(pokemonId) ?? new Map(), 7),
        teammateStats,
      };
    });
};

const convertRankedPayload = (
  payload: PokeDbRankedTeamsPayload,
  battleType: EnvironmentBattleType,
  pokemonKeyToId: Record<string, string>,
  itemNameToId: Record<string, string>,
  itemIds: Set<string>,
): PokeDbTrainerListPayload => ({
  season: payload.season,
  seasonNumber: payload.season_number,
  rule: battleType,
  updatedAt: payload.updated_at,
  sourceUrl: 'https://champs.pokedb.tokyo/guide/opendata',
  resultCount: payload.teams.length,
  pageCount: 1,
  teams: payload.teams
    .map((team): PokeDbTrainerTeam | undefined => {
      const slots = team.team
        .map((slot) => convertSlot(slot, pokemonKeyToId, itemNameToId, itemIds))
        .filter((slot): slot is EnvironmentTeamSlot => Boolean(slot));
      if (!Number.isInteger(team.rank) || slots.length === 0) return undefined;
      return {
        rank: team.rank,
        ratingValue: team.rating_value,
        author: 'PokeDB Open Data',
        reportUrl: 'https://champs.pokedb.tokyo/guide/opendata',
        slots,
      };
    })
    .filter((team): team is PokeDbTrainerTeam => Boolean(team)),
  audit: { unknownPokemonKeys: [], unknownItemNames: [] },
});

function buildEnvironmentDatasetFromTrainerPayloads(options: {
  id: string;
  ruleSetId: string;
  dataVersionId: string;
  retrievedAt: string;
  battles: Partial<Record<EnvironmentBattleType, PokeDbTrainerListPayload>>;
  moveStats?: Partial<Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>>;
  teamSamples?: Partial<Record<EnvironmentBattleType, EnvironmentTeamSample[]>>;
  source?: {
    name: string;
    url: string;
    notes: string;
  };
}): EnvironmentDataset {
  const firstPayload = battleTypes.map((battleType) => options.battles[battleType]).find(Boolean);
  const updatedAt =
    latestTimestamp(battleTypes.map((battleType) => options.battles[battleType]?.updatedAt ?? '')) ?? options.retrievedAt;

  const battles = battleTypes.reduce((acc, battleType) => {
    const payload = options.battles[battleType];
    const providedTeamSamples = (options.teamSamples?.[battleType] ?? []).map((sample) =>
      normalizeTeamSampleTitle(sample, payload?.season),
    );
    acc[battleType] = payload
      ? {
          pokemonUsage: buildUsage(payload.teams, options.moveStats?.[battleType]),
          sampleCount: payload.teams.length,
          teamSamples:
            providedTeamSamples.length > 0 ? providedTeamSamples : buildTrainerTeamSamples(payload, battleType),
        }
      : { ...emptyBattleDataset(), teamSamples: providedTeamSamples };
    return acc;
  }, {} as Record<EnvironmentBattleType, EnvironmentBattleDataset>);

  return {
    id: options.id,
    ruleSetId: options.ruleSetId,
    dataVersionId: options.dataVersionId,
    overallUsageBasis: 'absolute',
    sourceLabel: `PokeDB · ${firstPayload?.season ?? 'unknown season'} · 上位构筑快照`,
    statusLabel: '上位构筑快照',
    updatedAt,
    source: {
      kind: 'community-snapshot',
      name: options.source?.name ?? 'PokeDB public trainer reports',
      url: options.source?.url ?? firstPayload?.sourceUrl ?? 'https://champs.pokedb.tokyo/trainer/list',
      retrievedAt: options.retrievedAt,
      notes:
        options.source?.notes ??
        'Snapshot aggregated server-side from public PokeDB trainer-list team reports. End-user devices never scrape PokeDB.',
    },
    battles,
  };
}

export function buildEnvironmentDatasetFromPokeDbOpenData(options: {
  id: string;
  ruleSetId: string;
  dataVersionId: string;
  retrievedAt: string;
  pokemonKeyToId: Record<string, string>;
  itemNameToId: Record<string, string>;
  itemIds: string[];
  battles: Partial<Record<EnvironmentBattleType, PokeDbRankedTeamsPayload>>;
  moveStats?: Partial<Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>>;
  teamSamples?: Partial<Record<EnvironmentBattleType, EnvironmentTeamSample[]>>;
}): EnvironmentDataset {
  const itemIds = new Set(options.itemIds);
  const battles = battleTypes.reduce((acc, battleType) => {
    const payload = options.battles[battleType];
    if (payload) {
      acc[battleType] = convertRankedPayload(
        payload,
        battleType,
        options.pokemonKeyToId,
        options.itemNameToId,
        itemIds,
      );
    }
    return acc;
  }, {} as Partial<Record<EnvironmentBattleType, PokeDbTrainerListPayload>>);

  return buildEnvironmentDatasetFromTrainerPayloads({
    id: options.id,
    ruleSetId: options.ruleSetId,
    dataVersionId: options.dataVersionId,
    retrievedAt: options.retrievedAt,
    battles,
    moveStats: options.moveStats,
    teamSamples: options.teamSamples,
    source: {
      name: 'PokeDB public ranked teams',
      url: 'https://champs.pokedb.tokyo/guide/opendata',
      notes:
        'Bundled snapshot derived from PokeDB public open data. It is downloaded server-side during maintenance, not from end-user devices.',
    },
  });
}

export function buildEnvironmentDatasetFromPokeDbTrainerLists(options: {
  id: string;
  ruleSetId: string;
  dataVersionId: string;
  retrievedAt: string;
  battles: Partial<Record<EnvironmentBattleType, PokeDbTrainerListPayload>>;
  moveStats?: Partial<Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>>;
}): EnvironmentDataset {
  return buildEnvironmentDatasetFromTrainerPayloads(options);
}

export function buildEnvironmentDatasetFromPokeDbStatistics(options: {
  id: string;
  ruleSetId: string;
  dataVersionId: string;
  retrievedAt: string;
  battles: Partial<Record<EnvironmentBattleType, PokeDbPokemonStatisticsPayload>>;
  teamSamples?: Partial<Record<EnvironmentBattleType, EnvironmentTeamSample[]>>;
}): EnvironmentDataset {
  const firstPayload = battleTypes.map((battleType) => options.battles[battleType]).find(Boolean);
  const updatedAt =
    latestTimestamp(battleTypes.map((battleType) => options.battles[battleType]?.updatedAt ?? '')) ?? options.retrievedAt;
  const battles = battleTypes.reduce((acc, battleType) => {
    const payload = options.battles[battleType];
    acc[battleType] = {
      pokemonUsage: payload?.pokemonUsage ?? [],
      ...(payload ? { sampleCount: payload.resultCount } : {}),
      teamSamples: (options.teamSamples?.[battleType] ?? []).map((sample) =>
        normalizeTeamSampleTitle(sample, payload?.season),
      ),
    };
    return acc;
  }, {} as Record<EnvironmentBattleType, EnvironmentBattleDataset>);

  return {
    id: options.id,
    ruleSetId: options.ruleSetId,
    dataVersionId: options.dataVersionId,
    overallUsageBasis: 'rank-relative',
    sourceLabel: `PokeDB · ${firstPayload?.season ?? 'unknown season'} · 宝可梦使用率统计`,
    statusLabel: '当季聚合统计',
    updatedAt,
    source: {
      kind: 'community-snapshot',
      name: 'PokeDB Pokemon statistics',
      url: firstPayload?.sourceUrl ?? 'https://champs.pokedb.tokyo/pokemon/list',
      retrievedAt: options.retrievedAt,
      notes:
        'Server-side snapshot of PokeDB Pokemon ranking and detail statistics. Rank percentiles are used where PokeDB does not publish an absolute usage percentage.',
    },
    battles,
  };
}

export function parsePokeDbPokemonListPage(
  html: string,
  options: {
    battleType: EnvironmentBattleType;
    sourceUrl: string;
    pokemonKeyToId: Record<string, string>;
  },
): PokeDbPokemonListPayload {
  const metadata = parsePokeDbPageMetadata(html, options.sourceUrl);
  const unknownPokemonKeys = new Set<string>();
  const rankingMatches = [...html.matchAll(
    /<a[^>]+href="\/pokemon\/show\/([^"?]+)\?[^"]*"[^>]*class="[^"]*\blist-pokemon\b[^"]*"[^>]*>[\s\S]*?<div class="pokemon-rank[^"]*">\s*(\d+)\s*<\/div>[\s\S]*?<div class="pokemon-name">\s*([^<]+?)\s*<\/div>[\s\S]*?<\/a>/g,
  )];
  const rankings = rankingMatches.flatMap((match) => {
    const pokeDbKey = match[1];
    const pokemonId = options.pokemonKeyToId[pokeDbKey];
    if (!pokemonId) {
      unknownPokemonKeys.add(pokeDbKey);
      return [];
    }
    return [{
      rank: Number(match[2]),
      pokeDbKey,
      pokemonId,
      pokemonName: decodeHtml(match[3]),
    }];
  });

  if (rankings.length === 0) {
    throw new Error(`${options.battleType} Pokemon ranking page contained no mapped Pokemon`);
  }

  return {
    ...metadata,
    rule: options.battleType,
    sourceUrl: options.sourceUrl,
    resultCount: Math.max(rankingMatches.length, ...rankingMatches.map((match) => Number(match[2]))),
    rankings,
    audit: { unknownPokemonKeys: [...unknownPokemonKeys].sort() },
  };
}

export function parsePokeDbPokemonDetailPage(
  html: string,
  options: {
    teamCount: number;
    pokemonKeyToId: Record<string, string>;
    itemNameToId: Record<string, string>;
    moveKeyToId: Record<number, string>;
    abilityKeyToId: Record<number, string>;
    natureNameToId: Record<string, string>;
  },
): PokeDbPokemonDetailPayload {
  const unknownMoveKeys = new Set<number>();
  const unknownItemNames = new Set<string>();
  const unknownAbilityKeys = new Set<number>();
  const unknownNatureNames = new Set<string>();
  const charts = parseUsagePieCharts(html);
  const abilityRows = charts.find((rows) => rows.some((row) => 'ability_key' in row)) ?? [];
  const natureRows = charts.find((rows) => rows.some((row) => 'personality_key' in row)) ?? [];
  const itemRows = charts.find((rows) => rows.some((row) => 'item_key' in row)) ?? [];
  const abilityStats = mappedStats(
    abilityRows,
    'ability_key',
    options.abilityKeyToId,
    options.teamCount,
    unknownAbilityKeys,
  );
  const natureStats = natureRows.flatMap((row) => {
    const name = String(row.name ?? '');
    const id = options.natureNameToId[name];
    const usageRate = Number(row.rate);
    if (!id) {
      if (name) unknownNatureNames.add(name);
      return [];
    }
    if (!Number.isFinite(usageRate) || usageRate < 0 || usageRate > 100) return [];
    return [{ id, usageRate, teamCount: approximateCount(usageRate, options.teamCount) }];
  });
  const itemStats = itemRows.flatMap((row) => {
    const name = String(row.name ?? '');
    const id = options.itemNameToId[name];
    const usageRate = Number(row.rate);
    if (!id) {
      if (name) unknownItemNames.add(name);
      return [];
    }
    if (!Number.isFinite(usageRate) || usageRate < 0 || usageRate > 100) return [];
    return [{ id, usageRate, teamCount: approximateCount(usageRate, options.teamCount) }];
  });
  const moveStats = [...html.matchAll(/data-move-detail="([^"]+)"/g)].flatMap((match) => {
    try {
      const detail = JSON.parse(decodeHtml(match[1])) as { move_key?: number; rate?: number };
      const key = Number(detail.move_key);
      const id = options.moveKeyToId[key];
      const usageRate = Number(detail.rate);
      if (!id) {
        if (Number.isInteger(key)) unknownMoveKeys.add(key);
        return [];
      }
      if (!Number.isFinite(usageRate) || usageRate < 0 || usageRate > 100) return [];
      return [{ id, usageRate, teamCount: approximateCount(usageRate, options.teamCount) }];
    } catch {
      return [];
    }
  }).slice(0, 10);

  const sameTeamSection = html.match(
    /pokemon-trend__column-same_team[\s\S]*?(?=<div class="column[^"]*pokemon-trend__column-|<\/section>)/,
  )?.[0] ?? '';
  const teammateKeys = [...sameTeamSection.matchAll(/class="usage-pokemon-link"[^>]+href="\/pokemon\/show\/([^"?]+)/g)]
    .map((match) => match[1]);
  const teammateStats = teammateKeys.flatMap((key, index) => {
    const id = options.pokemonKeyToId[key];
    if (!id) return [];
    const usageRate = rankPercentile(index + 1, teammateKeys.length);
    return [{ id, usageRate, teamCount: approximateCount(usageRate, options.teamCount) }];
  });

  return {
    moveStats,
    itemStats,
    teammateStats,
    abilityStats,
    natureStats,
    audit: {
      unknownItemNames: [...unknownItemNames].sort(),
      unknownMoveKeys: [...unknownMoveKeys].sort((a, b) => a - b),
      unknownAbilityKeys: [...unknownAbilityKeys].sort((a, b) => a - b),
      unknownNatureNames: [...unknownNatureNames].sort(),
    },
  };
}

export function parsePokeDbTrainerListPage(
  html: string,
  options: {
    battleType: EnvironmentBattleType;
    sourceUrl: string;
    pokemonKeyToId: Record<string, string>;
    itemNameToId: Record<string, string>;
  },
): PokeDbTrainerListPayload {
  const metadata = parsePokeDbPageMetadata(html, options.sourceUrl);
  const resultCount = Number(
    decodeHtml(html.match(/検索結果<\/span>\s*<span class="tag is-light">([^<]+)</)?.[1] ?? '').replace(/\D/g, ''),
  );
  const pageNumbers = [...html.matchAll(/[?&](?:amp;)?page=(\d+)/g)].map((match) => Number(match[1]));
  const pageCount = Math.max(1, ...pageNumbers.filter((page) => Number.isInteger(page) && page > 0));
  const unknownPokemonKeys = new Set<string>();
  const unknownItemNames = new Set<string>();
  const articles = html.match(/<article class="trainer-card">[\s\S]*?<\/article>/g) ?? [];
  const teams = articles
    .map((article): PokeDbTrainerTeam | undefined => {
      const rank = Number(article.match(/data-rank="(\d+)"/)?.[1] ?? 0);
      const ratingInteger = article.match(/rating-integer">([^<]*)/)?.[1] ?? '0';
      const ratingDecimal = article.match(/rating-decimal">([^<]*)/)?.[1] ?? '';
      const ratingValue = Number(`${ratingInteger}${ratingDecimal}`);
      const author = decodeHtml(article.match(/trainer-card-name">([^<]*)/)?.[1] ?? 'PokeDB');
      const reportUrl = toAbsoluteHttpUrl(
        article.match(/trainer-card-team__article[\s\S]*?<a[^>]+href="([^"]+)"/)?.[1] ?? '',
        options.sourceUrl,
      );
      const slotBlocks =
        article.match(
          /<div class="trainer-card-team__pokemon">[\s\S]*?(?=<div class="trainer-card-team__pokemon">|<div class="trainer-card-team__article"|<\/article>)/g,
        ) ?? [];
      const slots = slotBlocks
        .map((block): EnvironmentTeamSlot | undefined => {
          const pokemonKey = block.match(/\/pokemon\/show\/([^"?]+)/)?.[1] ?? '';
          const pokemonId = options.pokemonKeyToId[pokemonKey];
          if (!pokemonId) {
            if (pokemonKey) unknownPokemonKeys.add(pokemonKey);
            return undefined;
          }
          const itemName = decodeHtml(block.match(/trainer-card-team__pokemon-item">([^<]*)/)?.[1] ?? '');
          const itemId = normalizeItemId(itemName, options.itemNameToId);
          if (itemName && itemName !== '持ち物なし' && itemName !== '持ち物不明' && !itemId) {
            unknownItemNames.add(itemName);
          }
          return {
            pokemonId,
            ...(itemId ? { itemId } : {}),
            moveIds: [],
          };
        })
        .filter((slot): slot is EnvironmentTeamSlot => Boolean(slot));

      if (!Number.isInteger(rank) || rank <= 0 || !Number.isFinite(ratingValue) || slots.length === 0) {
        return undefined;
      }
      return {
        rank,
        ratingValue,
        author,
        ...(reportUrl ? { reportUrl } : {}),
        slots,
      };
    })
    .filter((team): team is PokeDbTrainerTeam => Boolean(team));

  return {
    season: metadata.season,
    seasonNumber: metadata.seasonNumber,
    rule: options.battleType,
    updatedAt: metadata.updatedAt,
    sourceUrl: options.sourceUrl,
    resultCount: Number.isInteger(resultCount) ? resultCount : articles.length,
    pageCount,
    teams,
    audit: {
      unknownPokemonKeys: [...unknownPokemonKeys].sort(),
      unknownItemNames: [...unknownItemNames].sort(),
    },
  };
}

export function parsePokeDbTrainerSamples(
  html: string,
  options: {
    battleType: EnvironmentBattleType;
    sourceUrl: string;
    pokemonKeyToId: Record<string, string>;
    itemNameToId: Record<string, string>;
    maxSamples?: number;
  },
): EnvironmentTeamSample[] {
  const maxSamples = options.maxSamples ?? 8;
  const payload = parsePokeDbTrainerListPage(html, options);
  return payload.teams
    .filter((team): team is PokeDbTrainerTeam & { reportUrl: string } => Boolean(team.reportUrl))
    .map((team) =>
      normalizeTeamSampleTitle({
        id: `pokedb-${options.battleType}-rank-${team.rank}`,
        dataKind: 'external-snapshot',
        author: team.author,
        score: Math.floor(team.ratingValue ?? 0),
        rank: team.rank,
        title: '',
        battleType: options.battleType,
        reportUrl: team.reportUrl,
        slots: team.slots,
      }),
    )
    .slice(0, maxSamples);
}
