const ignoredItemNames = new Set(['', '持ち物なし', '持ち物不明']);

const countByKey = (map, key, update) => {
  const current = map.get(key) ?? { count: 0 };
  const next = update ? update(current) : current;
  next.count += 1;
  map.set(key, next);
};

const toSortedRecords = (map) =>
  [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

const normalizeItemName = (value) => String(value ?? '').trim();

const decodeHtmlAttribute = (value) =>
  String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const toAbsoluteHttpUrl = (value, baseUrl) => {
  try {
    const url = new URL(decodeHtmlAttribute(value), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};

export const pokeDbRuleParamByBattleType = Object.freeze({
  doubles: 1,
  singles: 2,
});

export function getPokeDbRuleParam(battleType) {
  const rule = pokeDbRuleParamByBattleType[battleType];
  if (!rule) throw new Error(`Unsupported PokeDB battle type: ${battleType}`);
  return rule;
}

export function validatePokeDbRankedTeamsPayload(payload, label = 'payload') {
  const issues = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [`${label} must be an object.`];
  }

  if (typeof payload.season !== 'string' || !payload.season) issues.push(`${label}.season must be a non-empty string.`);
  if (!Number.isInteger(payload.season_number)) issues.push(`${label}.season_number must be an integer.`);
  if (typeof payload.rule !== 'string' || !payload.rule) issues.push(`${label}.rule must be a non-empty string.`);
  if (typeof payload.updated_at !== 'string' || !payload.updated_at) issues.push(`${label}.updated_at must be a non-empty string.`);
  if (!Array.isArray(payload.teams) || payload.teams.length === 0) {
    issues.push(`${label}.teams must be a non-empty array.`);
    return issues;
  }

  payload.teams.forEach((team, teamIndex) => {
    const path = `${label}.teams[${teamIndex}]`;
    if (!Number.isInteger(team?.rank)) issues.push(`${path}.rank must be an integer.`);
    if (team?.rating_value !== null && !Number.isFinite(team?.rating_value)) issues.push(`${path}.rating_value must be a number or null.`);
    if (!Array.isArray(team?.team) || team.team.length === 0) {
      issues.push(`${path}.team must be a non-empty array.`);
      return;
    }
    team.team.forEach((slot, slotIndex) => {
      const slotPath = `${path}.team[${slotIndex}]`;
      const isEmptySlot = !slot?.id && !slot?.pokemon && !slot?.item;
      if (isEmptySlot) return;
      if (typeof slot?.id !== 'string' || !slot.id) issues.push(`${slotPath}.id must be a non-empty string.`);
      if (typeof slot?.pokemon !== 'string') issues.push(`${slotPath}.pokemon must be a string.`);
      if (typeof slot?.item !== 'string') issues.push(`${slotPath}.item must be a string.`);
    });
  });

  return issues;
}

export function createPokeDbOpenDataUpdateReport({ battles, pokemonKeyToId, itemNameToId, itemIds }) {
  const itemIdSet = new Set(itemIds ?? []);
  const unknownPokemon = new Map();
  const unmappedItems = new Map();
  const missingItemIds = new Map();

  const battleSummaries = Object.entries(battles ?? {}).map(([battleType, payload]) => {
    payload.teams.forEach((team) => {
      team.team.forEach((slot) => {
        if (!slot.id && !slot.pokemon && !slot.item) return;
        if (!pokemonKeyToId[slot.id]) {
          countByKey(unknownPokemon, slot.id, (current) => ({
            ...current,
            names: [...new Set([...(current.names ?? []), slot.pokemon].filter(Boolean))],
          }));
        }

        const itemName = normalizeItemName(slot.item);
        if (ignoredItemNames.has(itemName)) return;

        const itemId = itemNameToId[itemName];
        if (!itemId) {
          countByKey(unmappedItems, itemName);
          return;
        }
        if (itemIdSet.size > 0 && !itemIdSet.has(itemId)) {
          countByKey(missingItemIds, itemId, (current) => ({
            ...current,
            names: [...new Set([...(current.names ?? []), itemName])],
          }));
        }
      });
    });

    return {
      battleType,
      season: payload.season,
      rule: payload.rule,
      updatedAt: payload.updated_at,
      teamCount: payload.teams.length,
    };
  });

  return {
    battles: battleSummaries,
    unknownPokemonKeys: toSortedRecords(unknownPokemon).map(({ key, names, count }) => ({ key, names: names ?? [], count })),
    unmappedItemNames: toSortedRecords(unmappedItems).map(({ key, count }) => ({ name: key, count })),
    itemIdsMissingFromCatalog: toSortedRecords(missingItemIds).map(({ key, names, count }) => ({ id: key, names: names ?? [], count })),
  };
}

export function hasBlockingPokeDbOpenDataIssues(report) {
  return report.unknownPokemonKeys.length > 0 || report.unmappedItemNames.length > 0 || report.itemIdsMissingFromCatalog.length > 0;
}

export function formatPokeDbOpenDataUpdateReport(report) {
  const lines = ['PokeDB Open Data report'];
  report.battles.forEach((battle) => {
    lines.push(`- ${battle.battleType}: ${battle.season} / ${battle.rule} / ${battle.teamCount} teams / updated ${battle.updatedAt}`);
  });

  const appendGroup = (title, rows, formatRow) => {
    lines.push(`- ${title}: ${rows.length ? `${rows.length} issue(s)` : 'none'}`);
    rows.forEach((row) => lines.push(`  - ${formatRow(row)}`));
  };

  appendGroup('unknown Pokemon keys', report.unknownPokemonKeys, (row) => `${row.key} (${row.count}) ${row.names.join(', ')}`);
  appendGroup('unmapped item names', report.unmappedItemNames, (row) => `${row.name} (${row.count})`);
  appendGroup('item ids missing from catalog', report.itemIdsMissingFromCatalog, (row) => `${row.id} (${row.count}) ${row.names.join(', ')}`);

  return lines.join('\n');
}

export function parsePokeDbMoveStatsFromHtml(html, { moveKeyToId, teamCount, maxMoves = 10 }) {
  const unknownMoveKeys = new Map();
  const stats = [];

  for (const match of html.matchAll(/data-move-detail="([^"]+)"/g)) {
    const detail = JSON.parse(decodeHtmlAttribute(match[1]));
    const key = Number(detail.move_key);
    const moveId = moveKeyToId[key];
    if (!moveId) {
      countByKey(unknownMoveKeys, key, (current) => ({
        ...current,
        name: current.name ?? String(detail.name ?? ''),
      }));
      continue;
    }

    const usageRate = Number(detail.rate);
    if (!Number.isFinite(usageRate)) continue;
    const approximateTeamCount = Math.round((usageRate / 100) * teamCount);
    stats.push({
      id: moveId,
      usageRate,
      teamCount: usageRate > 0 ? Math.max(1, approximateTeamCount) : 0,
    });
    if (stats.length >= maxMoves) break;
  }

  return {
    stats,
    unknownMoveKeys: toSortedRecords(unknownMoveKeys).map(({ key, name, count }) => ({ key: Number(key), name: name ?? '', count })),
  };
}

export function parsePokeDbTrainerSamplesFromHtml(
  html,
  { battleType, sourceUrl, pokemonKeyToId, pokemonNameById = {}, itemNameToId, maxSamples = 8, minSlots = 1 },
) {
  const articles = html.match(/<article class="trainer-card">[\s\S]*?<\/article>/g) ?? [];

  return articles
    .map((article) => {
      const reportUrl = toAbsoluteHttpUrl(article.match(/trainer-card-team__article[\s\S]*?<a[^>]+href="([^"]+)"/)?.[1] ?? '', sourceUrl);
      if (!reportUrl) return undefined;

      const rank = Number(article.match(/data-rank="(\d+)"/)?.[1] ?? 0);
      const ratingInteger = article.match(/rating-integer">([^<]*)/)?.[1] ?? '0';
      const ratingDecimal = article.match(/rating-decimal">([^<]*)/)?.[1] ?? '';
      const score = Math.floor(Number(`${ratingInteger}${ratingDecimal}`));
      const author = decodeHtmlAttribute(article.match(/trainer-card-name">([^<]*)/)?.[1] ?? 'PokeDB').trim();
      const slotBlocks = article.match(/<div class="trainer-card-team__pokemon">[\s\S]*?(?=<div class="trainer-card-team__pokemon">|<div class="trainer-card-team__article"|<\/article>)/g) ?? [];
      const slots = slotBlocks
        .map((block) => {
          const pokemonKey = block.match(/\/pokemon\/show\/([^"?]+)/)?.[1] ?? '';
          const pokemonId = pokemonKeyToId[pokemonKey];
          if (!pokemonId) return undefined;
          const itemName = decodeHtmlAttribute(block.match(/trainer-card-team__pokemon-item">([^<]*)/)?.[1] ?? '').trim();
          const itemId = itemNameToId[itemName];
          return {
            pokemonId,
            ...(itemId ? { itemId } : {}),
            moveIds: [],
          };
        })
        .filter(Boolean);

      if (!rank || !Number.isFinite(score) || slots.length < minSlots) return undefined;

      const coreName = pokemonNameById[slots[0].pokemonId] ?? slots[0].pokemonId;

      return {
        id: `pokedb-${battleType}-rank-${rank}`,
        dataKind: 'external-snapshot',
        author,
        score,
        rank,
        title: `${author} · 最高第 ${rank} 名 · ${score} 分 · ${coreName}`,
        battleType,
        reportUrl,
        slots,
      };
    })
    .filter(Boolean)
    .slice(0, maxSamples);
}
