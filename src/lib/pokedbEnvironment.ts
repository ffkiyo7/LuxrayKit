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
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  if (!match) return value;
  return `${match[1]}T${match[2]}.000+09:00`;
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
  sample: Pick<EnvironmentTeamSample, 'id' | 'author' | 'score' | 'slots'> & { rank?: number },
  pokemonNameById?: Record<string, string>,
) => {
  const rank = sample.rank ?? getRankFromSampleId(sample.id);
  const rankText = rank ? `最高第 ${rank} 名` : undefined;
  const scoreText = Number.isFinite(sample.score) ? `${Math.floor(sample.score)} 分` : undefined;
  const coreName = sample.slots[0] ? pokemonNameById?.[sample.slots[0].pokemonId] ?? sample.slots[0].pokemonId : undefined;
  return [sample.author, rankText, scoreText, coreName].filter(Boolean).join(' · ');
};

const normalizeTeamSampleTitle = (
  sample: EnvironmentTeamSample,
  pokemonNameById?: Record<string, string>,
): EnvironmentTeamSample => {
  const rank = sample.rank ?? getRankFromSampleId(sample.id);
  return {
    ...sample,
    ...(rank ? { rank } : {}),
    score: Math.floor(sample.score),
    title: formatTeamSampleTitle({ ...sample, rank }, pokemonNameById),
  };
};

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
  payload: PokeDbRankedTeamsPayload,
  pokemonKeyToId: Record<string, string>,
  itemNameToId: Record<string, string>,
  itemIds: Set<string>,
  moveStatsByPokemonId: Record<string, EnvironmentReferenceUsage[]> = {},
): EnvironmentPokemonUsage[] => {
  const pokemonCounts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const itemCounts = new Map<string, Map<string, number>>();
  const itemFirstSeen = new Map<string, Map<string, number>>();
  const teammateCounts = new Map<string, Map<string, number>>();
  const teammateFirstSeen = new Map<string, Map<string, number>>();
  let seenIndex = 0;

  payload.teams.forEach((team) => {
    const slots = team.team
      .map((slot) => convertSlot(slot, pokemonKeyToId, itemNameToId, itemIds))
      .filter((slot): slot is EnvironmentTeamSlot => Boolean(slot));
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

  const teamTotal = Math.max(payload.teams.length, 1);

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

export function buildEnvironmentDatasetFromPokeDbOpenData(options: {
  id: string;
  ruleSetId: string;
  dataVersionId: string;
  retrievedAt: string;
  pokemonKeyToId: Record<string, string>;
  pokemonNameById?: Record<string, string>;
  itemNameToId: Record<string, string>;
  itemIds: string[];
  battles: Partial<Record<EnvironmentBattleType, PokeDbRankedTeamsPayload>>;
  moveStats?: Partial<Record<EnvironmentBattleType, Record<string, EnvironmentReferenceUsage[]>>>;
  teamSamples?: Partial<Record<EnvironmentBattleType, EnvironmentTeamSample[]>>;
}): EnvironmentDataset {
  const itemIds = new Set(options.itemIds);
  const firstPayload = battleTypes.map((battleType) => options.battles[battleType]).find(Boolean);
  const updatedAt = latestTimestamp(battleTypes.map((battleType) => options.battles[battleType]?.updated_at ?? '')) ?? options.retrievedAt;

  const battles = battleTypes.reduce((acc, battleType) => {
    const payload = options.battles[battleType];
    acc[battleType] = payload
      ? {
          pokemonUsage: buildUsage(payload, options.pokemonKeyToId, options.itemNameToId, itemIds, options.moveStats?.[battleType]),
          teamSamples: (options.teamSamples?.[battleType] ?? []).map((sample) => normalizeTeamSampleTitle(sample, options.pokemonNameById)),
        }
      : { ...emptyBattleDataset(), teamSamples: (options.teamSamples?.[battleType] ?? []).map((sample) => normalizeTeamSampleTitle(sample, options.pokemonNameById)) };
    return acc;
  }, {} as Record<EnvironmentBattleType, EnvironmentBattleDataset>);

  return {
    id: options.id,
    ruleSetId: options.ruleSetId,
    dataVersionId: options.dataVersionId,
    sourceLabel: `PokeDB · ${firstPayload?.season ?? 'M-1'} · 上位构筑快照`,
    statusLabel: 'PokeDB公开数据',
    updatedAt,
    source: {
      kind: 'community-snapshot',
      name: 'PokeDB public ranked teams',
      url: 'https://champs.pokedb.tokyo/guide/opendata',
      retrievedAt: options.retrievedAt,
      notes: 'Bundled snapshot derived from PokeDB public open data. It is downloaded server-side during maintenance, not from end-user devices.',
    },
    battles,
  };
}

export function parsePokeDbTrainerSamples(
  html: string,
  options: {
    battleType: EnvironmentBattleType;
    sourceUrl: string;
    pokemonKeyToId: Record<string, string>;
    pokemonNameById?: Record<string, string>;
    itemNameToId: Record<string, string>;
    maxSamples?: number;
  },
): EnvironmentTeamSample[] {
  const maxSamples = options.maxSamples ?? 8;
  const articles = html.match(/<article class="trainer-card">[\s\S]*?<\/article>/g) ?? [];

  return articles
    .map((article): EnvironmentTeamSample | undefined => {
      const reportUrl = decodeHtml(article.match(/trainer-card-team__article[\s\S]*?<a[^>]+href="([^"]+)"/)?.[1] ?? '');
      if (!/^https?:\/\//.test(reportUrl)) return undefined;

      const rank = Number(article.match(/data-rank="(\d+)"/)?.[1] ?? 0);
      const ratingInteger = article.match(/rating-integer">([^<]*)/)?.[1] ?? '0';
      const ratingDecimal = article.match(/rating-decimal">([^<]*)/)?.[1] ?? '';
      const score = Math.floor(Number(`${ratingInteger}${ratingDecimal}`));
      const author = decodeHtml(article.match(/trainer-card-name">([^<]*)/)?.[1] ?? 'PokeDB');
      const slotBlocks = article.match(/<div class="trainer-card-team__pokemon">[\s\S]*?(?=<div class="trainer-card-team__pokemon">|<div class="trainer-card-team__article"|<\/article>)/g) ?? [];
      const slots = slotBlocks
        .map((block) => {
          const pokemonKey = block.match(/\/pokemon\/show\/([^"?]+)/)?.[1] ?? '';
          const itemName = decodeHtml(block.match(/trainer-card-team__pokemon-item">([^<]*)/)?.[1] ?? '');
          return convertSlot({ id: pokemonKey, item: itemName }, options.pokemonKeyToId, options.itemNameToId);
        })
        .filter((slot): slot is EnvironmentTeamSlot => Boolean(slot));

      if (!rank || !Number.isFinite(score) || slots.length === 0) return undefined;

      const sample = {
        id: `pokedb-${options.battleType}-rank-${rank}`,
        dataKind: 'external-snapshot',
        author,
        score,
        rank,
        title: '',
        battleType: options.battleType,
        reportUrl,
        slots,
      } satisfies EnvironmentTeamSample;

      return normalizeTeamSampleTitle(sample, options.pokemonNameById);
    })
    .filter((sample): sample is EnvironmentTeamSample => Boolean(sample))
    .slice(0, maxSamples);
}
