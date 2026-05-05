import {
  calculate,
  Field,
  Generations,
  Move,
  Pokemon,
  Side,
  toID,
} from '@smogon/calc';
import {
  abilities,
  currentDataVersion,
  currentRuleNatureOptions,
  currentRuleSet,
  items,
  moves,
  pokemon,
} from '../data';
import { calculateBattleStats } from './calculations';
import { findBattleForm, type BattleFormView } from './pokemonForms';
import type { Move as AppMove, PokemonType, TeamMember } from '../types';
import type { StatPoints } from '../types';
import { clampStatPointValue } from './statPoints';

// ── Calc Config types ──

export type CalcConfigSource = 'team-member' | 'temporary';

export type CalcSideConfig = {
  source: CalcConfigSource;
  sourceMemberId?: string;
  pokemonId?: string;
  formId?: string;
  abilityId?: string;
  itemId?: string;
  moveIds: string[];
  selectedMoveId?: string;
  nature: string;
  statPoints: StatPoints;
  level: 50;
  notes?: string;
};

export type BattleTypeOption = 'singles' | 'doubles';

export type DamageAdapterInput = {
  attacker: CalcSideConfig;
  defender: CalcSideConfig;
  battleType: BattleTypeOption;
  weather: string;
  terrain: string;
  attackStage: number;
  defenseStage?: number;
  specialAttackStage?: number;
  specialDefenseStage?: number;
};

export type DamageAdapterStatus = 'invalid-input' | 'blocked' | 'experimental-success';

export type AccuracyLevel = 'experimental-mainline-approximation';

export type DamageAdapterResult = {
  status: DamageAdapterStatus;
  accuracyLevel?: AccuracyLevel;
  warnings: string[];
  assumptions: string[];
  blockedReasons: string[];
  attacker?: BattleFormView;
  defender?: BattleFormView;
  attackerBattleForm?: BattleFormView;
  defenderBattleForm?: BattleFormView;
  attackerConfig?: CalcSideConfig;
  defenderConfig?: CalcSideConfig;
  move?: AppMove;
  derivedSpreadDamage: boolean;
  damageRolls?: number[];
  minDamage?: number;
  maxDamage?: number;
  minPercent?: number;
  maxPercent?: number;
  possibleHkoText?: string;
  defenderHp?: number;
  dataVersionId: string;
  ruleSetId: string;
};

// ── Hard block list ──

const BLOCKED_MEGA_FORMS = new Set<string>([
  'mega-emboar', 'mega-excadrill', 'mega-audino', 'mega-chandelure',
  'mega-golurk', 'mega-chesnaught', 'mega-delphox', 'mega-greninja',
  'mega-floette', 'mega-meowstic', 'mega-hawlucha', 'mega-crabominable',
  'mega-drampa', 'mega-scovillain', 'mega-glimmora', 'mega-skarmory',
  'mega-froslass', 'mega-chimecho', 'mega-clefable', 'mega-victreebel',
  'mega-starmie', 'mega-dragonite', 'mega-meganium', 'mega-feraligatr',
]);

// ── SP validation ──

export const MAX_SP_PER_STAT = 32;
export const MAX_SP_TOTAL = 66;
export const ENABLE_EXPERIMENTAL_MAINLINE_DAMAGE = true;

export function validateStatPoints(sp: StatPoints): string[] {
  const issues: string[] = [];
  let total = 0;
  for (const [key, value] of Object.entries(sp)) {
    const raw = value ?? 0;
    if (raw > MAX_SP_PER_STAT) issues.push(`${key} SP ${raw} 超过单项上限 ${MAX_SP_PER_STAT}。`);
    total += raw;
  }
  if (total > MAX_SP_TOTAL) issues.push(`SP 总量 ${total} 超过上限 ${MAX_SP_TOTAL}。`);
  return issues;
}

export function totalStatPoints(sp: StatPoints): number {
  return Object.values(sp).reduce((sum, v) => sum + clampStatPointValue(v ?? 0), 0);
}

// ── Name mapping ──

const SPECIES_ID_MAP: Record<string, string> = {
  'raichu-alola': 'raichualola', 'ninetales-alola': 'ninetealesalola',
  'arcanine-hisui': 'arcaninehisui', 'slowbro-galar': 'slowbrogalar',
  'tauros-paldea-combat-breed': 'taurospaldeacombat',
  'tauros-paldea-blaze-breed': 'taurospaldeablaze',
  'tauros-paldea-aqua-breed': 'taurospaldeaaqua',
  'typhlosion-hisui': 'typhlosionhisui', 'slowking-galar': 'slowkinggalar',
  'rotom-heat': 'rotomheat', 'rotom-wash': 'rotomwash',
  'rotom-frost': 'rotomfrost', 'rotom-fan': 'rotomfan', 'rotom-mow': 'rotommow',
  'samurott-hisui': 'samurotthisui', 'zoroark-hisui': 'zoroarkhisui',
  'stunfisk-galar': 'stunfiskgalar', 'meowstic-male': 'meowstic',
  'meowstic-female': 'meowsticfemale', 'goodra-hisui': 'goodrahisui',
  'gourgeist-average': 'gourgeistaverage', 'gourgeist-small': 'gourgeistsmall',
  'gourgeist-large': 'gourgeistlarge', 'gourgeist-super': 'gourgeistsuper',
  'avalugg-hisui': 'avalugghisui', 'decidueye-hisui': 'decidueyehisui',
  'lycanroc-midday': 'lycanrocmidday', 'lycanroc-midnight': 'lycanrocmidnight',
  'lycanroc-dusk': 'lycanrocdusk',
  'basculegion-male': 'basculegion', 'basculegion-female': 'basculegionfemale',
  'mega-venusaur': 'venusaurmega', 'mega-charizard-x': 'charizardmegax',
  'mega-charizard-y': 'charizardmegay', 'mega-blastoise': 'blastoisemega',
  'mega-beedrill': 'beedrillmega', 'mega-pidgeot': 'pidgeotmega',
  'mega-alakazam': 'alakazammega', 'mega-slowbro': 'slowbromega',
  'mega-gengar': 'gengarmega', 'mega-kangaskhan': 'kangaskhanmega',
  'mega-pinsir': 'pinsirmega', 'mega-gyarados': 'gyaradosmega',
  'mega-aerodactyl': 'aerodactylmega', 'mega-ampharos': 'ampharosmega',
  'mega-steelix': 'steelixmega', 'mega-scizor': 'scizormega',
  'mega-heracross': 'heracrossmega', 'mega-houndoom': 'houndoommega',
  'mega-tyranitar': 'tyranitarmega', 'mega-gardevoir': 'gardevoirmega',
  'mega-sableye': 'sableyemega', 'mega-aggron': 'aggronmega',
  'mega-medicham': 'medichammega', 'mega-manectric': 'manectricmega',
  'mega-sharpedo': 'sharpedomega', 'mega-camerupt': 'cameruptmega',
  'mega-altaria': 'altariamega', 'mega-banette': 'banettemega',
  'mega-absol': 'absolmega', 'mega-glalie': 'glaliemega',
  'mega-lopunny': 'lopunnymega', 'mega-garchomp': 'garchompmega',
  'mega-lucario': 'lucariomega', 'mega-abomasnow': 'abomasnowmega',
  'mega-gallade': 'gallademega',
};

function calcSpeciesId(projectId: string): ReturnType<typeof toID> {
  return toID(SPECIES_ID_MAP[projectId] ?? projectId);
}
function calcMoveId(id: string): ReturnType<typeof toID> { return toID(id); }
function calcAbilityId(id: string): ReturnType<typeof toID> { return toID(id); }
function calcItemId(id: string): ReturnType<typeof toID> { return toID(id); }

const WEATHER_MAP: Record<string, string | undefined> = {
  '无天气': undefined, '晴天': 'Sun', '雨天': 'Rain', '沙暴': 'Sand', '雪天': 'Snow',
};
const TERRAIN_MAP: Record<string, string | undefined> = {
  '无场地': undefined, '青草场地': 'Grassy', '电气场地': 'Electric',
  '精神场地': 'Psychic', '薄雾场地': 'Misty',
};

const SPREAD_TARGET_SCOPES = ['对手全体', '全体邻近目标', '全体'];
function deriveSpreadDamage(move: AppMove, battleType: BattleTypeOption): boolean {
  if (battleType !== 'doubles') return false;
  return SPREAD_TARGET_SCOPES.some((scope) => move.targetScope.includes(scope));
}

function calcMoveTarget(move: AppMove): 'allAdjacentFoes' | 'allAdjacent' | undefined {
  if (move.targetScope.includes('对手全体')) return 'allAdjacentFoes';
  if (move.targetScope.includes('全体邻近') || move.targetScope.includes('全体') || move.targetScope.includes('全场')) return 'allAdjacent';
  return undefined;
}

const BASE_STATS_DECLARATION = {
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
};

// ── Config builders ──

/** Build a calc config by copying all relevant fields from a team member. */
export function buildCalcConfigFromTeamMember(member: TeamMember): CalcSideConfig {
  return {
    source: 'team-member',
    sourceMemberId: member.id,
    pokemonId: member.pokemonId,
    formId: member.formId,
    abilityId: member.abilityId,
    itemId: member.itemId,
    moveIds: [...member.moveIds],
    selectedMoveId: member.moveIds[0],
    nature: member.nature,
    statPoints: { ...member.statPoints },
    level: 50,
  };
}

export type CalcRole = 'attacker' | 'defender';
export type MoveCategoryHint = 'Physical' | 'Special' | 'Status' | 'unknown';

/**
 * Build a temporary calc config with a role-based default SP preset.
 * All presets are SP-total 66 and respect single-stat cap 32.
 */
export function buildTemporaryCalcConfig(params: {
  pokemonId: string;
  role: CalcRole;
  moveCategory?: MoveCategoryHint;
}): CalcSideConfig {
  const entry = pokemon.find((p) => p.id === params.pokemonId);
  const abilityId = entry?.abilities[0];
  const moveIds = entry ? [entry.learnableMoves[0] ?? 'protect'].filter(Boolean) : [];

  let statPoints: StatPoints;
  let nature: string;

  if (params.role === 'attacker') {
    if (params.moveCategory === 'Physical') {
      statPoints = { attack: 32, speed: 32, hp: 2 };
      nature = '爽朗';
    } else if (params.moveCategory === 'Special') {
      statPoints = { specialAttack: 32, speed: 32, hp: 2 };
      nature = '胆小';
    } else {
      statPoints = { speed: 32, attack: 16, specialAttack: 16, hp: 2 };
      nature = '爽朗';
    }
  } else {
    // defender
    statPoints = { hp: 32, defense: 17, specialDefense: 17 };
    nature = '慎重';
  }

  return {
    source: 'temporary',
    pokemonId: params.pokemonId,
    formId: undefined,
    abilityId,
    itemId: undefined,
    moveIds,
    selectedMoveId: moveIds[0],
    nature,
    statPoints,
    level: 50,
  };
}

// ── Main adapter ──

const gen = Generations.get(9);

export function computeDamage(input: DamageAdapterInput): DamageAdapterResult {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const blockedReasons: string[] = [];
  const makeBase = (): DamageAdapterResult => ({
    status: 'invalid-input', warnings, assumptions, blockedReasons,
    derivedSpreadDamage: false,
    dataVersionId: currentDataVersion.id, ruleSetId: currentRuleSet.id,
  });

  const attackerConfig = input.attacker;
  const defenderConfig = input.defender;

  // ── Validate SP ──
  const attackerSpIssues = validateStatPoints(attackerConfig.statPoints);
  const defenderSpIssues = validateStatPoints(defenderConfig.statPoints);
  if (attackerSpIssues.length > 0) {
    attackerSpIssues.forEach((r) => blockedReasons.push(`进攻方: ${r}`));
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig };
  }
  if (defenderSpIssues.length > 0) {
    defenderSpIssues.forEach((r) => blockedReasons.push(`防守方: ${r}`));
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig };
  }

  // ── Required fields ──
  if (!attackerConfig.pokemonId || !defenderConfig.pokemonId) {
    blockedReasons.push('未选择进攻方或防守方。');
    return { ...makeBase(), status: 'invalid-input', attackerConfig, defenderConfig };
  }
  if (!attackerConfig.selectedMoveId) {
    blockedReasons.push('未选择招式。');
    return { ...makeBase(), status: 'invalid-input', attackerConfig, defenderConfig };
  }

  // ── Resolve Pokémon ──
  const attackerEntry = pokemon.find((p) => p.id === attackerConfig.pokemonId);
  const defenderEntry = pokemon.find((p) => p.id === defenderConfig.pokemonId);
  if (!attackerEntry) {
    blockedReasons.push(`攻击方 Pokémon "${attackerConfig.pokemonId}" 不在图鉴中。`);
    return { ...makeBase(), status: 'invalid-input', attackerConfig, defenderConfig };
  }
  if (!defenderEntry) {
    blockedReasons.push(`防守方 Pokémon "${defenderConfig.pokemonId}" 不在图鉴中。`);
    return { ...makeBase(), status: 'invalid-input', attackerConfig, defenderConfig };
  }

  // ── Mega form data check ──
  if (attackerConfig.formId && BLOCKED_MEGA_FORMS.has(attackerConfig.formId)) {
    blockedReasons.push(`Mega 形态 "${attackerConfig.formId}" 缺少战斗数据（Champions 新 Mega）。`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig };
  }
  if (defenderConfig.formId && BLOCKED_MEGA_FORMS.has(defenderConfig.formId)) {
    blockedReasons.push(`Mega 形态 "${defenderConfig.formId}" 缺少战斗数据（Champions 新 Mega）。`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig };
  }

  const attackerForm = findBattleForm(attackerEntry.id, attackerConfig.formId) ?? findBattleForm(attackerEntry.id, attackerEntry.id);
  const defenderForm = findBattleForm(defenderEntry.id, defenderConfig.formId) ?? findBattleForm(defenderEntry.id, defenderEntry.id);
  if (!attackerForm || !defenderForm) {
    blockedReasons.push('无法解析战斗形态。');
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig };
  }

  // ── Resolve move ──
  const projectMove = moves.find((m) => m.id === attackerConfig.selectedMoveId);
  if (!projectMove) {
    blockedReasons.push(`招式 "${attackerConfig.selectedMoveId}" 不在目录中。`);
    return { ...makeBase(), status: 'invalid-input', attackerConfig, defenderConfig };
  }
  if (!projectMove.learnableByPokemonIds.includes(attackerEntry.id)) {
    blockedReasons.push(`招式 "${projectMove.chineseName}" 不在 ${attackerForm.chineseName} 的当前规则可学会招式列表中。`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig, move: projectMove };
  }
  if (projectMove.category === 'Status') {
    blockedReasons.push(`"${projectMove.chineseName}" 是变化招式，不适用伤害计算。`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig, move: projectMove };
  }

  const spread = deriveSpreadDamage(projectMove, input.battleType);

  // ── Species lookup ──
  const attackerCalcName = calcSpeciesId(attackerForm.id);
  const defenderCalcName = calcSpeciesId(defenderForm.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calcAttackerSpecies = (gen.species as any).get(attackerCalcName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calcDefenderSpecies = (gen.species as any).get(defenderCalcName);
  if (!calcAttackerSpecies) {
    blockedReasons.push(`计算引擎暂不识别攻击方 "${attackerForm.chineseName}"。`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig, attacker: attackerForm, attackerBattleForm: attackerForm };
  }
  if (!calcDefenderSpecies) {
    blockedReasons.push(`计算引擎暂不识别防守方 "${defenderForm.chineseName}"。`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig, defender: defenderForm, defenderBattleForm: defenderForm };
  }

  const calcMoveName = calcMoveId(projectMove.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calcMove = (gen.moves as any).get(calcMoveName);
  if (!calcMove) {
    blockedReasons.push(`计算引擎暂不识别招式 "${projectMove.chineseName}"。`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig, move: projectMove };
  }

  // ── Battle stats ──
  const attackerStats = calculateBattleStats(attackerForm.baseStats, attackerConfig.statPoints, 50, attackerConfig.nature);
  const defenderStats = calculateBattleStats(defenderForm.baseStats, defenderConfig.statPoints, 50, defenderConfig.nature);

  try {
    const attackerPoke = new Pokemon(9, calcAttackerSpecies.name, {
      level: 50,
      ability: attackerConfig.abilityId ? calcAbilityId(attackerConfig.abilityId) : undefined,
      item: attackerConfig.itemId ? calcItemId(attackerConfig.itemId) : undefined,
      nature: calcNatureName(attackerConfig.nature),
      ivs: BASE_STATS_DECLARATION.ivs,
      evs: BASE_STATS_DECLARATION.evs,
      boosts: {
        atk: input.attackStage, spa: input.specialAttackStage ?? input.attackStage,
        def: input.defenseStage ?? 0, spd: input.specialDefenseStage ?? 0,
      },
    });
    const defenderPoke = new Pokemon(9, calcDefenderSpecies.name, {
      level: 50,
      ability: defenderConfig.abilityId ? calcAbilityId(defenderConfig.abilityId) : undefined,
      item: defenderConfig.itemId ? calcItemId(defenderConfig.itemId) : undefined,
      nature: calcNatureName(defenderConfig.nature),
      ivs: BASE_STATS_DECLARATION.ivs,
      evs: BASE_STATS_DECLARATION.evs,
      boosts: { def: input.defenseStage ?? 0, spd: input.specialDefenseStage ?? input.defenseStage ?? 0 },
    });

    overrideCalcStats(attackerPoke, attackerStats);
    overrideCalcStats(defenderPoke, defenderStats);
    overrideCalcTypes(attackerPoke, attackerForm.types);
    overrideCalcTypes(defenderPoke, defenderForm.types);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const field = new (Field as any)({
      gameType: input.battleType === 'doubles' ? 'Doubles' : 'Singles',
      weather: WEATHER_MAP[input.weather],
      terrain: TERRAIN_MAP[input.terrain],
      attackerSide: new Side(), defenderSide: new Side(),
    });

    const calcMoveObj = new Move(9, calcMove.name, {
      overrides: {
        basePower: projectMove.power,
        type: projectMove.type,
        category: projectMove.category,
        target: calcMoveTarget(projectMove),
      },
    });

    const calcResult = calculate(gen, attackerPoke, defenderPoke, calcMoveObj, field);
    const damageData = (calcResult as unknown as Record<string, unknown>)?.damage;
    const damages: number[] = Array.isArray(damageData) ? (damageData as unknown[]).flat().map(Number) : [];
    const hp = defenderStats.hp;

    const minDmg = damages.length > 0 ? Math.min(...damages) : 0;
    const maxDmg = damages.length > 0 ? Math.max(...damages) : 0;
    const minPct = hp > 0 ? Math.round((minDmg / hp) * 1000) / 10 : 0;
    const maxPct = hp > 0 ? Math.round((maxDmg / hp) * 1000) / 10 : 0;

    let possibleHkoText: string | undefined;
    if (maxPct >= 100) possibleHkoText = maxPct >= 190 ? '一确（满足过量击杀条件）' : '可能一确';
    else if (minPct >= 50) possibleHkoText = '二确';
    else if (maxPct >= 50) possibleHkoText = '乱数二确';
    else if (minPct >= 33) possibleHkoText = '三确';
    else possibleHkoText = '多击击杀';

    warnings.push('使用 @smogon/calc Gen9 伤害公式，并代入本项目采集的 Champions 招式参数与 SP 能力值。');
    assumptions.push(
      'Damage formula: @smogon/calc Gen9.',
      'Move parameters: project Champions move catalog power/type/category/targetScope.',
      'Stats: project Champions SP v1 stat formula at Lv.50.',
      `进攻方能力值: ${attackerStats.attack} Atk / ${attackerStats.specialAttack} SpA / ${attackerStats.speed} Spe`,
      `防守方 HP: ${defenderStats.hp}, Def: ${defenderStats.defense}, SpD: ${defenderStats.specialDefense}`,
    );

    return {
      ...makeBase(),
      status: 'experimental-success',
      accuracyLevel: 'experimental-mainline-approximation',
      attacker: attackerForm, defender: defenderForm,
      attackerBattleForm: attackerForm, defenderBattleForm: defenderForm,
      attackerConfig, defenderConfig,
      move: projectMove, derivedSpreadDamage: spread,
      damageRolls: damages, minDamage: minDmg, maxDamage: maxDmg,
      minPercent: minPct, maxPercent: maxPct, possibleHkoText,
      defenderHp: defenderStats.hp,
    };
  } catch (error) {
    blockedReasons.push(`计算引擎内部错误: ${error instanceof Error ? error.message : String(error)}`);
    return { ...makeBase(), status: 'blocked', attackerConfig, defenderConfig, move: projectMove };
  }
}

// ── Helpers ──

function calcNatureName(uiNature: string): string {
  const option = currentRuleNatureOptions.find((candidate) => candidate.id === uiNature);
  if (!option) return 'Serious';
  return `${option.enName.slice(0, 1).toUpperCase()}${option.enName.slice(1)}`;
}

function overrideCalcStats(poke: unknown, stats: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number }): void {
  const s = poke as Record<string, unknown>;
  if (s.rawStats) {
    const rs = s.rawStats as Record<string, number>;
    rs.hp = stats.hp; rs.atk = stats.attack; rs.def = stats.defense;
    rs.spa = stats.specialAttack; rs.spd = stats.specialDefense; rs.spe = stats.speed;
  }
  if (s.stats) {
    const st = s.stats as Record<string, number>;
    st.hp = stats.hp; st.atk = stats.attack; st.def = stats.defense;
    st.spa = stats.specialAttack; st.spd = stats.specialDefense; st.spe = stats.speed;
  }
}

function overrideCalcTypes(poke: unknown, types: PokemonType[]): void {
  const s = poke as Record<string, unknown>;
  s.types = types.slice(0, 2);
}
