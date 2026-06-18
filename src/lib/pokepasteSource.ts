import type { Ability, Item, Move, Pokemon, StatPoints } from '../types';
import type { EnvironmentTeamSlot } from './environmentDataset';

export type PokepasteSet = {
  speciesName: string;
  itemName?: string;
  abilityName?: string;
  natureName?: string;
  evs: Partial<Record<ShowdownStatKey, number>>;
  moves: string[];
};

export type ShowdownStatKey = 'HP' | 'Atk' | 'Def' | 'SpA' | 'SpD' | 'Spe';

export type PokepasteNameMaps = {
  pokemon: Map<string, { pokemonId: string; formId?: string }>;
  items: Map<string, string>;
  abilities: Map<string, string>;
  moves: Map<string, string>;
  natures: Map<string, string>;
};

export type PokepasteMappingIssue = {
  code:
    | 'unknown-pokemon'
    | 'unknown-item'
    | 'unknown-ability'
    | 'unknown-move'
    | 'unknown-nature'
    | 'invalid-spread';
  value: string;
  message: string;
};

export type MappedPokepasteSlot = {
  slot?: EnvironmentTeamSlot;
  issues: PokepasteMappingIssue[];
};

const statKeyToStatPointKey: Record<ShowdownStatKey, keyof StatPoints> = {
  HP: 'hp',
  Atk: 'attack',
  Def: 'defense',
  SpA: 'specialAttack',
  SpD: 'specialDefense',
  Spe: 'speed',
};

export const normalizeShowdownName = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const addAlias = <T>(map: Map<string, T>, alias: string | undefined, value: T) => {
  if (!alias) return;
  map.set(normalizeShowdownName(alias), value);
};

const pokemonAliases: Record<string, string[]> = {
  'aegislash-shield': ['Aegislash'],
  'basculegion-male': ['Basculegion', 'Basculegion-M'],
  'basculegion-female': ['Basculegion-F'],
  floette: ['Floette-Eternal'],
  'indeedee-male': ['Indeedee', 'Indeedee-M'],
  'indeedee-female': ['Indeedee-F'],
  'maushold-family-of-four': ['Maushold', 'Maushold-Four'],
  'meowstic-male': ['Meowstic', 'Meowstic-M'],
  'meowstic-female': ['Meowstic-F'],
  'mimikyu-disguised': ['Mimikyu'],
  'ninetales-alola': ['Ninetales-Alola', 'Alolan Ninetales'],
  'tauros-paldea-combat-breed': ['Tauros-Paldea-Combat', 'Tauros-Paldea'],
  'tauros-paldea-blaze-breed': ['Tauros-Paldea-Blaze'],
  'tauros-paldea-aqua-breed': ['Tauros-Paldea-Aqua'],
  sinistcha: ['Sinistcha-Masterpiece'],
  vivillon: ['Vivillon-Fancy'],
};

const megaShowdownAliases = (englishName: string) => {
  if (!englishName.startsWith('Mega ')) return [];
  const rest = englishName.slice('Mega '.length);
  return [`${rest}-Mega`, `${rest.replace(/ X$/, '')}-Mega-X`, `${rest.replace(/ Y$/, '')}-Mega-Y`];
};

export function createPokepasteNameMaps(catalog: {
  pokemon: Pokemon[];
  items: Item[];
  abilities: Ability[];
  moves: Move[];
  natures: Array<{ id: string; enName: string }>;
}): PokepasteNameMaps {
  const pokemonMap = new Map<string, { pokemonId: string; formId?: string }>();
  for (const entry of catalog.pokemon) {
    addAlias(pokemonMap, entry.englishName, { pokemonId: entry.id });
    addAlias(pokemonMap, entry.id, { pokemonId: entry.id });
    for (const alias of pokemonAliases[entry.id] ?? []) addAlias(pokemonMap, alias, { pokemonId: entry.id });
    for (const form of entry.megaForms) {
      const value = { pokemonId: entry.id, formId: form.id };
      addAlias(pokemonMap, form.englishName, value);
      addAlias(pokemonMap, form.id, value);
      for (const alias of megaShowdownAliases(form.englishName)) addAlias(pokemonMap, alias, value);
    }
  }

  const itemsMap = new Map<string, string>();
  catalog.items.forEach((item) => {
    addAlias(itemsMap, item.englishName, item.id);
    addAlias(itemsMap, item.id, item.id);
  });

  const abilitiesMap = new Map<string, string>();
  catalog.abilities.forEach((ability) => {
    addAlias(abilitiesMap, ability.englishName, ability.id);
    addAlias(abilitiesMap, ability.id, ability.id);
  });

  const movesMap = new Map<string, string>();
  catalog.moves.forEach((move) => {
    addAlias(movesMap, move.englishName, move.id);
    addAlias(movesMap, move.id, move.id);
  });

  const naturesMap = new Map<string, string>();
  catalog.natures.forEach((nature) => {
    addAlias(naturesMap, nature.enName, nature.id);
    addAlias(naturesMap, nature.id, nature.id);
  });

  return {
    pokemon: pokemonMap,
    items: itemsMap,
    abilities: abilitiesMap,
    moves: movesMap,
    natures: naturesMap,
  };
}

const parseSetHeader = (line: string) => {
  const [left, itemName] = line.split(/\s+@\s+/, 2);
  const withoutGender = left.replace(/\s+\([MF]\)$/i, '').trim();
  const nicknameMatch = withoutGender.match(/\(([^()]+)\)$/);
  const speciesName = (nicknameMatch?.[1] ?? withoutGender).trim();
  return {
    speciesName,
    itemName: itemName?.trim(),
  };
};

const parseEvs = (line: string): Partial<Record<ShowdownStatKey, number>> => {
  const evText = line.replace(/^EVs:\s*/i, '');
  const evs: Partial<Record<ShowdownStatKey, number>> = {};
  for (const part of evText.split('/')) {
    const match = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
    if (!match) continue;
    evs[match[2] as ShowdownStatKey] = Number(match[1]);
  }
  return evs;
};

export function parsePokepasteText(raw: string): PokepasteSet[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const header = parseSetHeader(lines[0]);
      const set: PokepasteSet = {
        ...header,
        evs: {},
        moves: [],
      };

      for (const line of lines.slice(1)) {
        if (/^Ability:\s*/i.test(line)) {
          set.abilityName = line.replace(/^Ability:\s*/i, '').trim();
        } else if (/^EVs:\s*/i.test(line)) {
          set.evs = parseEvs(line);
        } else if (/^[A-Za-z]+\s+Nature$/i.test(line)) {
          set.natureName = line.replace(/\s+Nature$/i, '').trim();
        } else if (line.startsWith('- ')) {
          set.moves.push(line.slice(2).trim());
        }
      }

      return set;
    });
}

// VGCPastes "Champions M-A" pastes express the spread directly in Champions
// stat points (each stat <= 32, total <= 66) under the "EVs:" label — they are
// NOT Scarlet/Violet 0-252 EVs. Use the values verbatim; do not divide. Any paste
// that does use SV-style EVs will exceed the SP caps and get rejected by
// validateStatPointsForImport, which is the behaviour we want.
export function statPointsFromSpread(spread: Partial<Record<ShowdownStatKey, number>>): StatPoints {
  const statPoints: StatPoints = {};
  for (const [showdownKey, statPointKey] of Object.entries(statKeyToStatPointKey) as Array<[ShowdownStatKey, keyof StatPoints]>) {
    const value = spread[showdownKey] ?? 0;
    if (value <= 0) continue;
    statPoints[statPointKey] = value;
  }
  return statPoints;
}

export function validateStatPointsForImport(statPoints: StatPoints): PokepasteMappingIssue[] {
  const values = Object.values(statPoints).map((value) => value ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const invalidSingle = values.some((value) => value > 32 || value < 0);
  if (!invalidSingle && total <= 66) return [];
  return [
    {
      code: 'invalid-spread',
      value: JSON.stringify(statPoints),
      message: `Converted SP spread must keep every stat <= 32 and total <= 66; got total ${total}.`,
    },
  ];
}

export function mapPokepasteSetToEnvironmentSlot(set: PokepasteSet, maps: PokepasteNameMaps): MappedPokepasteSlot {
  const issues: PokepasteMappingIssue[] = [];
  const pokemonMatch = maps.pokemon.get(normalizeShowdownName(set.speciesName));
  if (!pokemonMatch) {
    issues.push({ code: 'unknown-pokemon', value: set.speciesName, message: `Unknown Pokemon: ${set.speciesName}` });
  }

  const itemId = set.itemName ? maps.items.get(normalizeShowdownName(set.itemName)) : undefined;
  if (set.itemName && !itemId) {
    issues.push({ code: 'unknown-item', value: set.itemName, message: `Unknown item: ${set.itemName}` });
  }

  const abilityId = set.abilityName ? maps.abilities.get(normalizeShowdownName(set.abilityName)) : undefined;
  if (set.abilityName && !abilityId) {
    issues.push({ code: 'unknown-ability', value: set.abilityName, message: `Unknown ability: ${set.abilityName}` });
  }

  const nature = set.natureName ? maps.natures.get(normalizeShowdownName(set.natureName)) : undefined;
  if (set.natureName && !nature) {
    issues.push({ code: 'unknown-nature', value: set.natureName, message: `Unknown nature: ${set.natureName}` });
  }

  const moveIds = set.moves.flatMap((moveName) => {
    const moveId = maps.moves.get(normalizeShowdownName(moveName));
    if (!moveId) {
      issues.push({ code: 'unknown-move', value: moveName, message: `Unknown move: ${moveName}` });
      return [];
    }
    return [moveId];
  });

  const statPoints = statPointsFromSpread(set.evs);
  issues.push(...validateStatPointsForImport(statPoints));
  if (!pokemonMatch || issues.length > 0) return { issues };

  return {
    issues,
    slot: {
      pokemonId: pokemonMatch.pokemonId,
      ...(pokemonMatch.formId ? { formId: pokemonMatch.formId } : {}),
      ...(abilityId ? { abilityId } : {}),
      ...(itemId ? { itemId } : {}),
      ...(nature ? { nature } : {}),
      statPoints,
      moveIds: moveIds.slice(0, 4),
    },
  };
}

export function extractPokepasteText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  for (const key of ['paste', 'raw', 'text', 'content']) {
    if (typeof record[key] === 'string') return record[key] as string;
  }
  if (Array.isArray(record.pokemon)) {
    return record.pokemon
      .map((entry) => (typeof entry === 'string' ? entry : typeof entry === 'object' && entry ? JSON.stringify(entry) : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}
