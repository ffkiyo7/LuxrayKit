import type { BaseStats, PokemonType, SpeedBenchmark, Team, TeamMember } from '../types';
import { currentRuleNatureOptions, items } from '../data';
import { findPokemon, getMemberBattleForm, type BattleFormView } from './pokemonForms';
import { clampStatPointValue } from './statPoints';

const natureStatMap: Record<string, keyof BaseStats> = {
  HP: 'hp',
  攻击: 'attack',
  防御: 'defense',
  特攻: 'specialAttack',
  特防: 'specialDefense',
  速度: 'speed',
  攻: 'attack',
  防: 'defense',
  速: 'speed',
};

export const calculateSpeed = (baseSpeed: number, statPoints = 0, level = 50, nature = '爽朗', tailwind = false) => {
  const stat = baseSpeed + clampStatPointValue(statPoints) + 20;
  const withNature = Math.floor(stat * natureMultiplier(nature, 'speed'));
  return tailwind ? withNature * 2 : withNature;
};

export type SpeedMechanismStatus = 'confirmed' | 'pending';

export type SpeedCalculationResult =
  | {
      status: 'confirmed';
      finalSpeed: number;
      explanation: string;
    }
  | {
      status: 'blocked';
      finalSpeed?: undefined;
      explanation: string;
    };

export const calculateSpeedWithMechanismGate = ({
  baseSpeed,
  statPoints = 0,
  level = 50,
  nature = '爽朗',
  tailwind = false,
  mechanismStatus,
}: {
  baseSpeed: number;
  statPoints?: number;
  level?: number;
  nature?: string;
  tailwind?: boolean;
  mechanismStatus: SpeedMechanismStatus;
}): SpeedCalculationResult => {
  if (mechanismStatus !== 'confirmed') {
    return {
      status: 'blocked',
      explanation: 'Champions Stat Points / speed modifiers are not confirmed for formal calculation.',
    };
  }

  return {
    status: 'confirmed',
    finalSpeed: calculateSpeed(baseSpeed, statPoints, level, nature, tailwind),
    explanation: 'Computed with confirmed Champions Lv.50 base speed, Stat Points, nature, and tailwind modifiers.',
  };
};

export const statRows = (stats: BaseStats) => [
  ['HP', stats.hp],
  ['攻', stats.attack],
  ['防', stats.defense],
  ['特攻', stats.specialAttack],
  ['特防', stats.specialDefense],
  ['速', stats.speed],
] as const;

const natureMultiplier = (nature: string, stat: keyof BaseStats) => {
  const option = currentRuleNatureOptions.find((candidate) => nature.includes(candidate.id));
  if (option) {
    if (option.neutral) return 1;
    if (option.up.some((label) => natureStatMap[label] === stat)) return 1.1;
    if (option.down.some((label) => natureStatMap[label] === stat)) return 0.9;
    return 1;
  }

  const legacyUp = /\+([^)）/]+)/.exec(nature)?.[1]?.trim();
  const legacyDown = /-([^)）/]+)/.exec(nature)?.[1]?.trim();
  if (legacyUp && natureStatMap[legacyUp] === stat) return 1.1;
  if (legacyDown && natureStatMap[legacyDown] === stat) return 0.9;
  return 1;
};

const calculateNonHpStat = (base: number, statPoints = 0, level = 50, nature = '爽朗', stat: keyof BaseStats) => {
  const raw = base + clampStatPointValue(statPoints) + 20;
  return Math.floor(raw * natureMultiplier(nature, stat));
};

export const calculateBattleStats = (baseStats: BaseStats, statPoints: TeamMember['statPoints'], level = 50, nature = '爽朗'): BaseStats => ({
  hp: baseStats.hp + clampStatPointValue(statPoints.hp ?? 0) + 75,
  attack: calculateNonHpStat(baseStats.attack, statPoints.attack ?? 0, level, nature, 'attack'),
  defense: calculateNonHpStat(baseStats.defense, statPoints.defense ?? 0, level, nature, 'defense'),
  specialAttack: calculateNonHpStat(baseStats.specialAttack, statPoints.specialAttack ?? 0, level, nature, 'specialAttack'),
  specialDefense: calculateNonHpStat(baseStats.specialDefense, statPoints.specialDefense ?? 0, level, nature, 'specialDefense'),
  speed: calculateNonHpStat(baseStats.speed, statPoints.speed ?? 0, level, nature, 'speed'),
});

export const getPokemon = findPokemon;

export const memberLabel = (member: TeamMember) => {
  const found = getPokemon(member.pokemonId);
  return found ? found.chineseName : '未选择 Pokémon';
};

export const memberSpeed = (member: TeamMember) => {
  const found = getMemberBattleForm(member);
  const result = calculateSpeedWithMechanismGate({
    baseSpeed: found?.baseStats.speed ?? 50,
    statPoints: member.statPoints.speed ?? 0,
    level: member.level,
    nature: member.nature,
    mechanismStatus: 'confirmed',
  });
  return result.status === 'confirmed' ? result.finalSpeed : 0;
};

export const memberBattleStats = (member: TeamMember) => {
  const found = getMemberBattleForm(member);
  return calculateBattleStats(found?.baseStats ?? { hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50 }, member.statPoints, member.level, member.nature);
};

export const buildTeamBenchmarks = (team: Team): SpeedBenchmark[] =>
  team.members
    .filter((member) => member.pokemonId)
    .map((member) => {
      const found = getPokemon(member.pokemonId);
      const form = getMemberBattleForm(member);
      return {
        id: `team-${team.id}-${member.id}`,
        name: form ? `${form.chineseName} 队内` : '队内成员',
        pokemonId: member.pokemonId ?? 'unknown',
        formId: form?.isMega ? form.id : undefined,
        nature: member.nature,
        speedStatPoints: member.statPoints.speed ?? 0,
        itemOrStatus: items.find((item) => item.id === member.itemId)?.chineseName ?? '无',
        isMega: Boolean(form?.isMega),
        finalSpeed: memberSpeed(member),
        tags: ['当前队伍'],
        source: team.name,
        notes: '由当前队伍配置生成的 benchmark。',
        benchmarkType: 'team',
        dataVersionId: team.dataVersionId,
      };
    });

type AnalysisStatus = 'ok' | 'review' | 'warning';

export type TeamAnalysisSection = {
  title: string;
  status: AnalysisStatus;
  items: string[];
};

export type TeamAnalysisDetails = {
  chips: string[];
  sections: TeamAnalysisSection[];
};

export const attackingTypes: PokemonType[] = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
];

const typeMatchups: Record<PokemonType, { strong?: PokemonType[]; resisted?: PokemonType[]; immune?: PokemonType[] }> = {
  Normal: { resisted: ['Rock', 'Steel'], immune: ['Ghost'] },
  Fire: { strong: ['Grass', 'Ice', 'Bug', 'Steel'], resisted: ['Fire', 'Water', 'Rock', 'Dragon'] },
  Water: { strong: ['Fire', 'Ground', 'Rock'], resisted: ['Water', 'Grass', 'Dragon'] },
  Electric: { strong: ['Water', 'Flying'], resisted: ['Electric', 'Grass', 'Dragon'], immune: ['Ground'] },
  Grass: { strong: ['Water', 'Ground', 'Rock'], resisted: ['Fire', 'Grass', 'Poison', 'Flying', 'Bug', 'Dragon', 'Steel'] },
  Ice: { strong: ['Grass', 'Ground', 'Flying', 'Dragon'], resisted: ['Fire', 'Water', 'Ice', 'Steel'] },
  Fighting: { strong: ['Normal', 'Ice', 'Rock', 'Dark', 'Steel'], resisted: ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy'], immune: ['Ghost'] },
  Poison: { strong: ['Grass', 'Fairy'], resisted: ['Poison', 'Ground', 'Rock', 'Ghost'], immune: ['Steel'] },
  Ground: { strong: ['Fire', 'Electric', 'Poison', 'Rock', 'Steel'], resisted: ['Grass', 'Bug'], immune: ['Flying'] },
  Flying: { strong: ['Grass', 'Fighting', 'Bug'], resisted: ['Electric', 'Rock', 'Steel'] },
  Psychic: { strong: ['Fighting', 'Poison'], resisted: ['Psychic', 'Steel'], immune: ['Dark'] },
  Bug: { strong: ['Grass', 'Psychic', 'Dark'], resisted: ['Fire', 'Fighting', 'Poison', 'Flying', 'Ghost', 'Steel', 'Fairy'] },
  Rock: { strong: ['Fire', 'Ice', 'Flying', 'Bug'], resisted: ['Fighting', 'Ground', 'Steel'] },
  Ghost: { strong: ['Psychic', 'Ghost'], resisted: ['Dark'], immune: ['Normal'] },
  Dragon: { strong: ['Dragon'], resisted: ['Steel'], immune: ['Fairy'] },
  Dark: { strong: ['Psychic', 'Ghost'], resisted: ['Fighting', 'Dark', 'Fairy'] },
  Steel: { strong: ['Ice', 'Rock', 'Fairy'], resisted: ['Fire', 'Water', 'Electric', 'Steel'] },
  Fairy: { strong: ['Fighting', 'Dragon', 'Dark'], resisted: ['Fire', 'Poison', 'Steel'] },
};

export const defensiveMatchupMultiplier = (attackType: PokemonType, defenderTypes: PokemonType[]) =>
  defenderTypes.reduce((multiplier, defenderType) => {
    const matchup = typeMatchups[attackType];
    if (matchup?.immune?.includes(defenderType)) return 0;
    if (matchup?.strong?.includes(defenderType)) return multiplier * 2;
    if (matchup?.resisted?.includes(defenderType)) return multiplier * 0.5;
    return multiplier;
  }, 1);

const matchupMultiplier = (attackType: PokemonType, defender: { types: PokemonType[] }) => defensiveMatchupMultiplier(attackType, defender.types);

export const buildTeamAnalysisDetails = (team: Team): TeamAnalysisDetails => {
  const members = team.members.map((member) => getMemberBattleForm(member)).filter((entry): entry is BattleFormView => Boolean(entry));
  const typeCounts = members.flatMap((entry) => entry.types).reduce<Record<string, number>>((acc, type) => {
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  const physicalBias = members.filter((entry) => entry.baseStats.attack >= entry.baseStats.specialAttack).length;
  const speedCoverage = members.filter((entry) => entry.baseStats.speed >= 90).length;
  const membersWithSpeed = team.members
    .map((member) => ({ member, pokemon: getMemberBattleForm(member), speed: memberSpeed(member) }))
    .filter((entry): entry is { member: TeamMember; pokemon: NonNullable<ReturnType<typeof getMemberBattleForm>>; speed: number } => Boolean(entry.pokemon));

  const weaknessCounts = attackingTypes
    .map((attackType) => ({
      attackType,
      weakCount: members.filter((member) => matchupMultiplier(attackType, member) > 1).length,
      resistCount: members.filter((member) => matchupMultiplier(attackType, member) > 0 && matchupMultiplier(attackType, member) < 1).length,
      immuneCount: members.filter((member) => matchupMultiplier(attackType, member) === 0).length,
    }))
    .sort((a, b) => b.weakCount - a.weakCount);

  const topWeaknesses = weaknessCounts.filter((entry) => entry.weakCount > 0).slice(0, 4);
  const topDefenses = weaknessCounts
    .filter((entry) => entry.resistCount + entry.immuneCount > 0)
    .sort((a, b) => b.resistCount + b.immuneCount - (a.resistCount + a.immuneCount))
    .slice(0, 4);
  const sortedSpeed = [...membersWithSpeed].sort((a, b) => b.speed - a.speed);
  const duplicateTypes = Object.entries(typeCounts).filter(([, count]) => count >= 3);
  const weatherSetters = team.members
    .filter((member) => ['drought', 'drizzle'].includes(member.abilityId ?? ''))
    .map((member) => memberLabel(member));
  const itemDuplicates = Object.entries(
    team.members.reduce<Record<string, number>>((acc, member) => {
      if (member.itemId) acc[member.itemId] = (acc[member.itemId] ?? 0) + 1;
      return acc;
    }, {}),
  ).filter(([, count]) => count > 1);

  const chips = [
    members.length < 6 ? `缺少配置 ${6 - members.length}` : '6 位齐整',
    physicalBias > members.length / 2 ? '物攻倾向' : '攻防较均衡',
    speedCoverage >= 2 ? '速度覆盖' : '速度偏慢',
    duplicateTypes.length > 0 ? '属性重复需复核' : '属性分布可读',
  ];

  return {
    chips,
    sections: [
      {
        title: '属性弱点',
        status: topWeaknesses.some((entry) => entry.weakCount >= 2) ? 'warning' : 'ok',
        items:
          topWeaknesses.length > 0
            ? topWeaknesses.map((entry) => `${entry.attackType} 打点命中 ${entry.weakCount} 名成员弱点`)
            : ['当前 seed 队伍未识别到集中弱点。'],
      },
      {
        title: '抗性 / 免疫',
        status: topDefenses.length > 0 ? 'ok' : 'review',
        items:
          topDefenses.length > 0
            ? topDefenses.map((entry) => `${entry.attackType}：${entry.resistCount} 个抗性，${entry.immuneCount} 个免疫`)
            : ['暂无明确抗性或免疫覆盖，需要更多成员数据。'],
      },
      {
        title: '攻防倾向',
        status: Math.abs(physicalBias - (members.length - physicalBias)) >= 3 ? 'review' : 'ok',
        items: [
          `物攻倾向成员 ${physicalBias} 名，特攻倾向成员 ${Math.max(0, members.length - physicalBias)} 名`,
          physicalBias > members.length / 2 ? '当前更依赖物理输出，需留意威吓和物理墙。' : '当前输出倾向相对均衡。',
        ],
      },
      {
        title: '速度覆盖',
        status: speedCoverage >= 2 ? 'ok' : 'review',
        items:
          sortedSpeed.length > 0
            ? sortedSpeed.map((entry) => `${entry.pokemon.chineseName}：最终速度 ${entry.speed}`)
            : ['暂无可计算速度的队伍成员。'],
      },
      {
        title: '功能位 / 重复定位',
        status: itemDuplicates.length > 0 || duplicateTypes.length > 0 ? 'warning' : 'review',
        items: [
          weatherSetters.length > 0 ? `天气来源：${weatherSetters.join('、')}` : '暂未识别明确天气来源。',
          itemDuplicates.length > 0 ? `重复道具：${itemDuplicates.map(([itemId]) => items.find((item) => item.id === itemId)?.chineseName ?? itemId).join('、')}` : '未发现重复道具。',
          duplicateTypes.length > 0 ? `重复属性：${duplicateTypes.map(([type, count]) => `${type}×${count}`).join('、')}` : '未发现 3 个以上成员共享同一属性。',
        ],
      },
    ],
  };
};

export const teamAnalysis = (team: Team) => buildTeamAnalysisDetails(team).chips;
