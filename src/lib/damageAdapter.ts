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
import { calculateBattleStats, defensiveMatchupMultiplier } from './calculations';
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
  statStages?: Partial<Record<keyof StatPoints, number>>;
  level: 50;
  notes?: string;
};

export type BattleTypeOption = 'singles' | 'doubles';
export type CalcStatusOption = 'none' | 'brn' | 'psn' | 'tox' | 'par' | 'slp' | 'frz';

export type DamageAdapterInput = {
  attacker: CalcSideConfig;
  defender: CalcSideConfig;
  battleType: BattleTypeOption;
  weather: string;
  terrain: string;
  defenderProtected?: boolean;
  attackerHpPercent?: number;
  defenderHpPercent?: number;
  attackerStatus?: CalcStatusOption;
  defenderStatus?: CalcStatusOption;
  isCritical?: boolean;
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
  oneHitKoChance?: number;
  twoHitKoChance?: number;
  abilityEffects?: DamageAbilityEffect[];
  itemEffects?: DamageItemEffect[];
  eventEffects?: DamageEventEffect[];
  defenderHp?: number;
  attackerStats?: ReturnType<typeof calculateBattleStats>;
  defenderStats?: ReturnType<typeof calculateBattleStats>;
  offensiveStatLabel?: string;
  offensiveStatValue?: number;
  defensiveStatLabel?: string;
  defensiveStatValue?: number;
  effectiveMoveType?: PokemonType;
  stabMultiplier?: number;
  typeEffectiveness?: number;
  typeEffectivenessText?: string;
  weatherMultiplier?: number;
  weatherText?: string;
  spreadMultiplier?: number;
  protectionMultiplier?: number;
  protectionText?: string;
  dataVersionId: string;
  ruleSetId: string;
};

export type DamageAbilityEffect = {
  side: 'attacker' | 'defender';
  abilityId: string;
  label: string;
  text: string;
  direction: 'boost' | 'reduction' | 'immunity' | 'changed';
};

export type DamageItemEffect = {
  side: 'attacker' | 'defender';
  itemId: string;
  label: string;
  text: string;
  direction: 'boost' | 'reduction';
};

export type DamageEventEffect = {
  side: 'attacker' | 'defender';
  abilityId: string;
  label: string;
  text: string;
  kind: 'status' | 'damage';
  chance?: number;
  damage?: number;
};

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
  'mega-skarmory': 'skarmory', 'mega-froslass': 'froslass',
  'mega-chimecho': 'chimecho', 'mega-emboar': 'emboar',
  'mega-excadrill': 'excadrill', 'mega-audino': 'audino',
  'mega-chandelure': 'chandelure', 'mega-golurk': 'golurk',
  'mega-chesnaught': 'chesnaught', 'mega-delphox': 'delphox',
  'mega-greninja': 'greninja', 'mega-floette': 'floette',
  'mega-meowstic': 'meowstic', 'mega-hawlucha': 'hawlucha',
  'mega-crabominable': 'crabominable', 'mega-drampa': 'drampa',
  'mega-scovillain': 'scovillain', 'mega-glimmora': 'glimmora',
  'mega-clefable': 'clefable', 'mega-victreebel': 'victreebel',
  'mega-starmie': 'starmie', 'mega-dragonite': 'dragonite',
  'mega-meganium': 'meganium', 'mega-feraligatr': 'feraligatr',
};

function calcSpeciesId(projectId: string): ReturnType<typeof toID> {
  return toID(SPECIES_ID_MAP[projectId] ?? projectId);
}
function calcMoveId(id: string): ReturnType<typeof toID> { return toID(id); }
function calcAbilityName(id: string): string {
  return abilities.find((ability) => ability.id === id)?.englishName ?? id;
}
function calcItemName(id: string): string {
  return items.find((item) => item.id === id)?.englishName ?? id;
}

const WEATHER_MAP: Record<string, string | undefined> = {
  '无天气': undefined, '晴天': 'Sun', '雨天': 'Rain', '沙暴': 'Sand', '雪天': 'Snow',
};
const TERRAIN_MAP: Record<string, string | undefined> = {
  '无场地': undefined, '青草场地': 'Grassy', '电气场地': 'Electric',
  '精神场地': 'Psychic', '薄雾场地': 'Misty',
};
const NO_ABILITY = 'No Ability';
const TYPE_LABELS: Record<PokemonType, string> = {
  Normal: '一般',
  Fire: '火',
  Water: '水',
  Electric: '电',
  Grass: '草',
  Ice: '冰',
  Fighting: '格斗',
  Poison: '毒',
  Ground: '地面',
  Flying: '飞行',
  Psychic: '超能力',
  Bug: '虫',
  Rock: '岩石',
  Ghost: '幽灵',
  Dragon: '龙',
  Dark: '恶',
  Steel: '钢',
  Fairy: '妖精',
};
const STATUS_LABELS: Record<Exclude<CalcStatusOption, 'none'>, string> = {
  brn: '灼伤',
  psn: '中毒',
  tox: '剧毒',
  par: '麻痹',
  slp: '睡眠',
  frz: '冰冻',
};

const MOLD_BREAKER_ABILITIES = new Set(['mold-breaker', 'teravolt', 'turboblaze']);

const TYPE_IMMUNITY_ABILITY_TEXT: Record<string, Partial<Record<PokemonType, string>>> = {
  'flash-fire': { Fire: '火属性招式无效' },
  'water-absorb': { Water: '水属性招式无效' },
  'storm-drain': { Water: '水属性招式无效' },
  'dry-skin': { Water: '水属性招式无效' },
  'volt-absorb': { Electric: '电属性招式无效' },
  'lightning-rod': { Electric: '电属性招式无效' },
  'motor-drive': { Electric: '电属性招式无效' },
  'sap-sipper': { Grass: '草属性招式无效' },
  levitate: { Ground: '地面属性招式无效' },
  'earth-eater': { Ground: '地面属性招式无效' },
  'well-baked-body': { Fire: '火属性招式无效' },
};

const SOUND_MOVE_IDS = new Set([
  'boomburst', 'bug-buzz', 'chatter', 'clangorous-soulblaze', 'clanging-scales',
  'disarming-voice', 'echoed-voice', 'hyper-voice', 'overdrive', 'round',
  'snarl', 'sparkling-aria', 'torch-song', 'uproar',
]);

const BULLET_BOMB_MOVE_IDS = new Set([
  'acid-spray', 'aura-sphere', 'barrage', 'beak-blast', 'bullet-seed', 'egg-bomb',
  'electro-ball', 'energy-ball', 'focus-blast', 'gyro-ball', 'ice-ball',
  'magnet-bomb', 'mist-ball', 'mud-bomb', 'octazooka', 'pollen-puff', 'pyro-ball',
  'rock-blast', 'searing-shot', 'seed-bomb', 'shadow-ball', 'sludge-bomb',
  'weather-ball', 'zap-cannon',
]);

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

function statPointsToEvs(statPoints: StatPoints) {
  return {
    hp: Math.min(252, clampStatPointValue(statPoints.hp ?? 0) * 8),
    atk: Math.min(252, clampStatPointValue(statPoints.attack ?? 0) * 8),
    def: Math.min(252, clampStatPointValue(statPoints.defense ?? 0) * 8),
    spa: Math.min(252, clampStatPointValue(statPoints.specialAttack ?? 0) * 8),
    spd: Math.min(252, clampStatPointValue(statPoints.specialDefense ?? 0) * 8),
    spe: Math.min(252, clampStatPointValue(statPoints.speed ?? 0) * 8),
  };
}

function statStagesToBoosts(statStages: CalcSideConfig['statStages'] | undefined) {
  return {
    atk: statStages?.attack ?? 0,
    def: statStages?.defense ?? 0,
    spa: statStages?.specialAttack ?? 0,
    spd: statStages?.specialDefense ?? 0,
    spe: statStages?.speed ?? 0,
  };
}

function speciesOverrides(form: BattleFormView) {
  return {
    baseStats: {
      hp: form.baseStats.hp,
      atk: form.baseStats.attack,
      def: form.baseStats.defense,
      spa: form.baseStats.specialAttack,
      spd: form.baseStats.specialDefense,
      spe: form.baseStats.speed,
    },
    types: form.types.slice(0, 2) as [PokemonType] | [PokemonType, PokemonType],
  };
}

function typeEffectivenessText(multiplier: number): string {
  if (multiplier === 0) return '没有效果';
  if (multiplier <= 0.25) return '效果相当不好';
  if (multiplier < 1) return '效果不好';
  if (multiplier >= 4) return '效果相当好';
  if (multiplier > 1) return '效果绝佳';
  return '效果一般';
}

function weatherImpact(moveType: PokemonType, weather: string): { multiplier: number; text: string } {
  if (weather === '晴天' && moveType === 'Fire') return { multiplier: 1.5, text: '晴天增强火属性' };
  if (weather === '晴天' && moveType === 'Water') return { multiplier: 0.5, text: '晴天削弱水属性' };
  if (weather === '雨天' && moveType === 'Water') return { multiplier: 1.5, text: '雨天增强水属性' };
  if (weather === '雨天' && moveType === 'Fire') return { multiplier: 0.5, text: '雨天削弱火属性' };
  return { multiplier: 1, text: weather === '无天气' ? '无天气影响' : `${weather} 无直接招式修正` };
}

function displayedTypeEffectiveness(
  moveType: PokemonType,
  defenderTypes: PokemonType[],
  attackerAbilityId?: string,
): number {
  if (attackerAbilityId === 'scrappy' && (moveType === 'Normal' || moveType === 'Fighting')) {
    return defensiveMatchupMultiplier(moveType, defenderTypes.filter((type) => type !== 'Ghost'));
  }
  return defensiveMatchupMultiplier(moveType, defenderTypes);
}

function protectionImpact(
  move: AppMove,
  attackerAbilityId: string | undefined,
  defenderProtected: boolean | undefined,
): { multiplier: number; text?: string } {
  if (!defenderProtected) return { multiplier: 1 };
  if (!move.affectedByProtect) return { multiplier: 1, text: '防守方保护不影响该招式' };

  if (move.makesContact && attackerAbilityId === 'unseen-fist') {
    return { multiplier: 1, text: '无形拳无视守住' };
  }
  if (move.makesContact && attackerAbilityId === 'piercing-drill') {
    return { multiplier: 0.25, text: 'Piercing Drill 穿透守住，伤害变为 1/4' };
  }

  return { multiplier: 0, text: '防守方守住，招式被挡下' };
}

function applyDamageRollMultiplier(damages: number[], multiplier: number): number[] {
  if (multiplier === 1) return damages;
  if (multiplier === 0) return [0];
  return damages.map((damage) => (damage <= 0 ? 0 : Math.max(1, Math.floor(damage * multiplier))));
}

function hpPercentToCurrentHp(maxHp: number, percent: number | undefined): number {
  const safePercent = Math.min(100, Math.max(1, percent ?? 100));
  return Math.max(1, Math.floor((maxHp * safePercent) / 100));
}

function calcStatusValue(status: CalcStatusOption | undefined) {
  return status && status !== 'none' ? status : undefined;
}

function effectiveWeatherForMove(weather: string, attackerAbilityId?: string): string {
  if (attackerAbilityId === 'mega-sol') return '晴天';
  return weather;
}

function weatherBallType(weather: string): PokemonType | undefined {
  if (weather === '晴天') return 'Fire';
  if (weather === '雨天') return 'Water';
  if (weather === '沙暴') return 'Rock';
  if (weather === '雪天') return 'Ice';
  return undefined;
}

function effectiveMoveType(move: AppMove, attackerAbilityId?: string, weather = '无天气'): PokemonType {
  if (move.id === 'weather-ball') {
    const type = weatherBallType(weather);
    if (type) return type;
  }

  if (move.type === 'Normal') {
    if (attackerAbilityId === 'dragonize') return 'Dragon';
    if (attackerAbilityId === 'pixilate') return 'Fairy';
    if (attackerAbilityId === 'refrigerate') return 'Ice';
    if (attackerAbilityId === 'aerilate') return 'Flying';
    if (attackerAbilityId === 'galvanize') return 'Electric';
  }
  if (attackerAbilityId === 'liquid-voice' && SOUND_MOVE_IDS.has(move.id)) return 'Water';
  return move.type;
}

function projectMoveOverrides(move: AppMove, attackerAbilityId?: string, weather = '无天气') {
  let type = move.type;
  let basePower = move.power;

  if (move.id === 'weather-ball') {
    const weatherType = weatherBallType(weather);
    if (weatherType) {
      type = weatherType;
      basePower = 100;
    }
  }

  if (type === 'Normal' && attackerAbilityId === 'dragonize') {
    type = 'Dragon';
    basePower = Math.max(1, Math.round((basePower ?? 1) * 1.2));
  }

  return {
    basePower,
    type,
    category: move.category,
    target: calcMoveTarget(move),
  };
}

function attackerTypesForStab(attackerTypes: PokemonType[], moveType: PokemonType, attackerAbilityId?: string): PokemonType[] {
  if (attackerAbilityId === 'protean' || attackerAbilityId === 'libero') return [moveType];
  return attackerTypes;
}

function percentText(chance: number): string {
  if (chance <= 0) return '0%';
  if (chance >= 100) return '100%';
  const rounded = Math.round(chance * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function sameDamageRolls(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeDamageRolls(damageData: unknown): number[] {
  if (Array.isArray(damageData)) return damageData.flat().map(Number);
  if (typeof damageData === 'number') return [damageData];
  return [];
}

function specificAbilityEffectText(abilityId: string, direction: DamageAbilityEffect['direction'], move: AppMove): string | undefined {
  const typeText = TYPE_IMMUNITY_ABILITY_TEXT[abilityId]?.[move.type];
  if (direction === 'immunity' && typeText) return typeText;
  if (direction === 'immunity' && abilityId === 'soundproof' && SOUND_MOVE_IDS.has(move.id)) return '声音招式无效';
  if (direction === 'immunity' && abilityId === 'bulletproof' && BULLET_BOMB_MOVE_IDS.has(move.id)) return '球和弹类招式无效';

  if (move.type === 'Normal' && abilityId === 'pixilate') return '一般招式变为妖精属性';
  if (move.type === 'Normal' && abilityId === 'refrigerate') return '一般招式变为冰属性';
  if (move.type === 'Normal' && abilityId === 'aerilate') return '一般招式变为飞行属性';
  if (move.type === 'Normal' && abilityId === 'galvanize') return '一般招式变为电属性';
  if (move.type === 'Normal' && abilityId === 'dragonize') return '一般招式变为龙属性，威力提高 20%';
  if (abilityId === 'liquid-voice' && SOUND_MOVE_IDS.has(move.id)) return '声音招式变为水属性';
  if (abilityId === 'protean' || abilityId === 'libero') return '属性随招式变化';
  if (abilityId === 'unaware' && direction !== 'immunity') return '无视能力阶级';

  if (direction === 'reduction') {
    if (abilityId === 'thick-fat' && (move.type === 'Fire' || move.type === 'Ice')) return `${TYPE_LABELS[move.type]}属性伤害减半`;
    if (abilityId === 'heatproof' && move.type === 'Fire') return '火属性伤害减半';
    if (abilityId === 'water-bubble' && move.type === 'Fire') return '火属性伤害减半';
    if (abilityId === 'purifying-salt' && move.type === 'Ghost') return '幽灵属性伤害减半';
    if (abilityId === 'solid-rock' || abilityId === 'filter' || abilityId === 'prism-armor') return '效果绝佳伤害减弱';
    if (abilityId === 'fur-coat' && move.category === 'Physical') return '物理招式伤害减半';
    if (abilityId === 'ice-scales' && move.category === 'Special') return '特殊招式伤害减半';
    if (abilityId === 'multiscale') return '满 HP 伤害减弱';
  }

  if (direction === 'boost') {
    if (abilityId === 'dry-skin' && move.type === 'Fire') return '火属性伤害增加';
    if (abilityId === 'huge-power' || abilityId === 'pure-power') return '物理攻击提高';
    if (abilityId === 'water-bubble' && move.type === 'Water') return '水属性招式增强';
    if (abilityId === 'adaptability') return '本系招式增强';
    if (abilityId === 'technician') return '低威力招式增强';
    if (abilityId === 'fairy-aura') return '妖精属性招式增强';
    if (abilityId === 'mega-sol') return '自身招式按晴天处理';
    if (abilityId === 'unseen-fist') return '接触招式无视守住';
    if (abilityId === 'piercing-drill') return '守住中接触招式命中，伤害变为 1/4';
    if (abilityId === 'tough-claws') return '接触招式增强';
    if (abilityId === 'iron-fist') return '拳类招式增强';
    if (abilityId === 'strong-jaw') return '啃咬类招式增强';
    if (abilityId === 'mega-launcher') return '波动类招式增强';
    if (abilityId === 'sharpness') return '切割类招式增强';
    if (abilityId === 'reckless') return '反作用力招式增强';
    if (abilityId === 'mold-breaker') return '无视防守特性影响';
    if (abilityId === 'sand-force') return '沙暴中招式增强';
    if (abilityId === 'solar-power') return '晴天特攻增强';
    if (abilityId === 'hustle') return '物理招式增强';
    if (abilityId === 'sheer-force') return '追加效果招式增强';
    if (abilityId === 'scrappy') return '一般和格斗招式可命中幽灵属性';
    if (abilityId === 'blaze') return '低 HP 火属性招式增强';
    if (abilityId === 'torrent') return '低 HP 水属性招式增强';
    if (abilityId === 'overgrow') return '低 HP 草属性招式增强';
    if (abilityId === 'swarm') return '低 HP 虫属性招式增强';
    if (abilityId === 'guts') return '异常状态物理招式增强';
    if (abilityId === 'analytic') return '后手招式增强';
    if (abilityId === 'sniper') return '会心伤害增强';
  }

  if (direction === 'reduction') {
    if (abilityId === 'marvel-scale') return '异常状态防御提高';
  }

  return undefined;
}

function abilityEffectChip({
  side,
  abilityId,
  actual,
  without,
  move,
}: {
  side: 'attacker' | 'defender';
  abilityId?: string;
  actual: number[];
  without: number[];
  move: AppMove;
}): DamageAbilityEffect | undefined {
  if (!abilityId || sameDamageRolls(actual, without)) return undefined;
  const ability = abilities.find((candidate) => candidate.id === abilityId);
  if (!ability) return undefined;

  const actualMax = actual.length > 0 ? Math.max(...actual) : 0;
  const withoutMax = without.length > 0 ? Math.max(...without) : 0;
  const direction: DamageAbilityEffect['direction'] =
    actualMax === 0 && withoutMax > 0
      ? 'immunity'
      : actualMax > withoutMax
        ? 'boost'
        : actualMax < withoutMax
          ? 'reduction'
          : 'changed';
  const sideLabel = side === 'attacker' ? '进攻特性' : '防守特性';
  const text =
    specificAbilityEffectText(abilityId, direction, move)
      ?? (direction === 'immunity'
      ? '免疫'
      : direction === 'boost'
        ? '增强'
        : direction === 'reduction'
          ? '减伤'
          : '修正');

  return {
    side,
    abilityId,
    label: `${sideLabel}：${ability.chineseName}`,
    text,
    direction,
  };
}

function knownAbilityEffectChip({
  side,
  abilityId,
  move,
  actual,
  opposingAbilityId,
  typeEffectiveness,
}: {
  side: 'attacker' | 'defender';
  abilityId?: string;
  move: AppMove;
  actual: number[];
  opposingAbilityId?: string;
  typeEffectiveness?: number;
}): DamageAbilityEffect | undefined {
  if (!abilityId) return undefined;
  const ability = abilities.find((candidate) => candidate.id === abilityId);
  if (!ability) return undefined;
  const actualMax = actual.length > 0 ? Math.max(...actual) : 0;
  const sideLabel = side === 'attacker' ? '进攻特性' : '防守特性';

  if (side === 'defender' && MOLD_BREAKER_ABILITIES.has(opposingAbilityId ?? '')) return undefined;

  const typeImmunityText = TYPE_IMMUNITY_ABILITY_TEXT[abilityId]?.[move.type];
  if (side === 'defender' && typeImmunityText && actualMax === 0 && (typeEffectiveness ?? 1) > 0) {
    return {
      side,
      abilityId,
      label: `${sideLabel}：${ability.chineseName}`,
      text: typeImmunityText,
      direction: 'immunity',
    };
  }

  if (side === 'defender' && abilityId === 'soundproof' && SOUND_MOVE_IDS.has(move.id) && actualMax === 0) {
    return {
      side,
      abilityId,
      label: `${sideLabel}：${ability.chineseName}`,
      text: '声音招式无效',
      direction: 'immunity',
    };
  }

  if (side === 'defender' && abilityId === 'bulletproof' && BULLET_BOMB_MOVE_IDS.has(move.id) && actualMax === 0) {
    return {
      side,
      abilityId,
      label: `${sideLabel}：${ability.chineseName}`,
      text: '球和弹类招式无效',
      direction: 'immunity',
    };
  }

  return undefined;
}

function uniqueAbilityEffects(effects: Array<DamageAbilityEffect | undefined>): DamageAbilityEffect[] {
  const seen = new Set<string>();
  return effects.filter((effect): effect is DamageAbilityEffect => {
    if (!effect) return false;
    const key = `${effect.side}|${effect.abilityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function damageEventEffects({
  defenderAbilityId,
  damages,
  defenderHp,
  attackerTypes,
}: {
  defenderAbilityId?: string;
  damages: number[];
  defenderHp: number;
  attackerTypes: PokemonType[];
}): DamageEventEffect[] {
  if (!defenderAbilityId) return [];
  const ability = abilities.find((candidate) => candidate.id === defenderAbilityId);
  if (!ability) return [];

  const label = `防守特性：${ability.chineseName}`;
  const maxDamage = damages.length > 0 ? Math.max(...damages) : 0;

  if (defenderAbilityId === 'spicy-spray' && maxDamage > 0 && !attackerTypes.includes('Fire')) {
    return [{
      side: 'attacker',
      abilityId: defenderAbilityId,
      label,
      text: '攻击方会陷入灼伤',
      kind: 'status',
    }];
  }

  if (defenderAbilityId === 'innards-out' && defenderHp > 0 && maxDamage >= defenderHp) {
    const koRolls = damages.filter((damage) => damage >= defenderHp).length;
    const chance = damages.length > 0 ? (koRolls / damages.length) * 100 : 0;
    return [{
      side: 'attacker',
      abilityId: defenderAbilityId,
      label,
      text: chance >= 100
        ? `防守方被击倒时，攻击方受到 ${defenderHp} 反伤`
        : `击倒防守方时，攻击方受到 ${defenderHp} 反伤（触发概率 ${percentText(chance)}）`,
      kind: 'damage',
      chance,
      damage: defenderHp,
    }];
  }

  return [];
}

function itemEffectChip({
  side,
  itemId,
  actual,
  without,
}: {
  side: 'attacker' | 'defender';
  itemId?: string;
  actual: number[];
  without: number[];
}): DamageItemEffect | undefined {
  if (!itemId || sameDamageRolls(actual, without)) return undefined;
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return undefined;

  const actualMax = actual.length > 0 ? Math.max(...actual) : 0;
  const withoutMax = without.length > 0 ? Math.max(...without) : 0;
  if (actualMax === withoutMax) return undefined;

  return {
    side,
    itemId,
    label: `${side === 'attacker' ? '进攻道具' : '防守道具'}：${item.chineseName}`,
    text: item.effectSummary,
    direction: actualMax > withoutMax ? 'boost' : 'reduction',
  };
}

function uniqueItemEffects(effects: Array<DamageItemEffect | undefined>): DamageItemEffect[] {
  const seen = new Set<string>();
  return effects.filter((effect): effect is DamageItemEffect => {
    if (!effect) return false;
    const key = `${effect.side}|${effect.itemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const BASE_STATS_DECLARATION = {
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
};

const STAT_STAGE_KEYS = ['attack', 'defense', 'specialAttack', 'specialDefense', 'speed'] as const;

// ── Config builders ──

/** Build a calc config by copying all relevant fields from a team member. */
export function buildCalcConfigFromTeamMember(member: TeamMember): CalcSideConfig {
  const selectedMoveId =
    member.moveIds
      .map((moveId) => moves.find((move) => move.id === moveId))
      .find((move) => move?.category !== 'Status')?.id ?? member.moveIds[0];
  return {
    source: 'team-member',
    sourceMemberId: member.id,
    pokemonId: member.pokemonId,
    formId: member.formId,
    abilityId: member.abilityId,
    itemId: member.itemId,
    moveIds: [...member.moveIds],
    selectedMoveId,
    nature: member.nature,
    statPoints: { ...member.statPoints },
    statStages: {},
    level: 50,
  };
}

export type CalcRole = 'attacker' | 'defender';
export type MoveCategoryHint = 'Physical' | 'Special' | 'Status' | 'unknown';

/** Build a temporary calc config without copying team SP or other persisted member tuning. */
export function buildTemporaryCalcConfig(params: {
  pokemonId: string;
  role: CalcRole;
  moveCategory?: MoveCategoryHint;
}): CalcSideConfig {
  const entry = pokemon.find((p) => p.id === params.pokemonId);
  const abilityId = entry?.abilities[0];
  const moveIds = entry ? [entry.learnableMoves[0] ?? 'protect'].filter(Boolean) : [];

  const statPoints: StatPoints = {};
  let nature: string = currentRuleNatureOptions.find((option) => option.neutral)?.id ?? '认真';
  if (!currentRuleNatureOptions.some((option) => option.id === nature)) nature = currentRuleNatureOptions[0]?.id ?? '爽朗';

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
    statStages: {},
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
  const attackerBoosts = statStagesToBoosts(attackerConfig.statStages);
  const defenderBoosts = statStagesToBoosts(defenderConfig.statStages);
  const legacyAttackerBoosts = {
    ...attackerBoosts,
    atk: attackerBoosts.atk || input.attackStage || 0,
    spa: attackerBoosts.spa || input.specialAttackStage || input.attackStage || 0,
  };
  const legacyDefenderBoosts = {
    ...defenderBoosts,
    def: defenderBoosts.def || input.defenseStage || 0,
    spd: defenderBoosts.spd || input.specialDefenseStage || input.defenseStage || 0,
  };

  try {
    const runCalculation = (mode: 'actual' | 'without-attacker-ability' | 'without-defender-ability' | 'without-attacker-item' | 'without-defender-item') => {
      const activeAttackerAbilityId = mode === 'without-attacker-ability' ? undefined : attackerConfig.abilityId;
      const activeDefenderAbilityId = mode === 'without-defender-ability' ? undefined : defenderConfig.abilityId;
      const calcWeather = effectiveWeatherForMove(input.weather, activeAttackerAbilityId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const field = new (Field as any)({
        gameType: input.battleType === 'doubles' ? 'Doubles' : 'Singles',
        weather: WEATHER_MAP[calcWeather],
        terrain: TERRAIN_MAP[input.terrain],
        attackerSide: new Side(), defenderSide: new Side(),
      });
      const calcMoveObj = new Move(9, calcMove.name, {
        isCrit: input.isCritical,
        overrides: projectMoveOverrides(projectMove, activeAttackerAbilityId, calcWeather),
      });
      const attackerPoke = new Pokemon(9, calcAttackerSpecies.name, {
        level: 50,
        ability: activeAttackerAbilityId ? calcAbilityName(activeAttackerAbilityId) : NO_ABILITY,
        item: mode === 'without-attacker-item' ? undefined : attackerConfig.itemId ? calcItemName(attackerConfig.itemId) : undefined,
        nature: calcNatureName(attackerConfig.nature),
        curHP: hpPercentToCurrentHp(attackerStats.hp, input.attackerHpPercent),
        status: calcStatusValue(input.attackerStatus),
        ivs: BASE_STATS_DECLARATION.ivs,
        evs: statPointsToEvs(attackerConfig.statPoints),
        boosts: legacyAttackerBoosts,
        overrides: speciesOverrides(attackerForm),
      });
      const defenderPoke = new Pokemon(9, calcDefenderSpecies.name, {
        level: 50,
        ability: activeDefenderAbilityId ? calcAbilityName(activeDefenderAbilityId) : NO_ABILITY,
        item: mode === 'without-defender-item' ? undefined : defenderConfig.itemId ? calcItemName(defenderConfig.itemId) : undefined,
        nature: calcNatureName(defenderConfig.nature),
        curHP: hpPercentToCurrentHp(defenderStats.hp, input.defenderHpPercent),
        status: calcStatusValue(input.defenderStatus),
        ivs: BASE_STATS_DECLARATION.ivs,
        evs: statPointsToEvs(defenderConfig.statPoints),
        boosts: legacyDefenderBoosts,
        overrides: speciesOverrides(defenderForm),
      });
      const calcResult = calculate(gen, attackerPoke, defenderPoke, calcMoveObj, field);
      const damageData = (calcResult as unknown as Record<string, unknown>)?.damage;
      const protection = protectionImpact(projectMove, activeAttackerAbilityId, input.defenderProtected);
      const damages = applyDamageRollMultiplier(normalizeDamageRolls(damageData), protection.multiplier);
      return { attackerPoke, defenderPoke, damages, protection };
    };

    const actualCalc = runCalculation('actual');
    const damages = actualCalc.damages;
    const hp = defenderStats.hp;

    const minDmg = damages.length > 0 ? Math.min(...damages) : 0;
    const maxDmg = damages.length > 0 ? Math.max(...damages) : 0;
    const minPct = hp > 0 ? Math.round((minDmg / hp) * 1000) / 10 : 0;
    const maxPct = hp > 0 ? Math.round((maxDmg / hp) * 1000) / 10 : 0;

    const oneHitKoChance = damages.length > 0 ? (damages.filter((damage) => damage >= hp).length / damages.length) * 100 : 0;
    const twoHitKoCombos = damages.flatMap((first) => damages.map((second) => first + second));
    const twoHitKoChance = twoHitKoCombos.length > 0 ? (twoHitKoCombos.filter((damage) => damage >= hp).length / twoHitKoCombos.length) * 100 : 0;

    let possibleHkoText: string | undefined;
    if (maxDmg <= 0) possibleHkoText = '无法造成伤害';
    else if (oneHitKoChance >= 100) possibleHkoText = '确定一击击杀';
    else if (oneHitKoChance > 0) possibleHkoText = `一击击杀概率 ${percentText(oneHitKoChance)}`;
    else if (twoHitKoChance >= 100) possibleHkoText = '确定两击击杀';
    else if (twoHitKoChance > 0) possibleHkoText = `两击击杀概率 ${percentText(twoHitKoChance)}`;
    else possibleHkoText = '通常需要三次以上攻击';

    const offensiveStatLabel = projectMove.category === 'Physical' ? '攻击' : '特攻';
    const defensiveStatLabel = projectMove.category === 'Physical' ? '防御' : '特防';
    const offensiveStatValue = projectMove.category === 'Physical' ? actualCalc.attackerPoke.rawStats.atk : actualCalc.attackerPoke.rawStats.spa;
    const defensiveStatValue = projectMove.category === 'Physical' ? actualCalc.defenderPoke.rawStats.def : actualCalc.defenderPoke.rawStats.spd;
    const displayedWeather = effectiveWeatherForMove(input.weather, attackerConfig.abilityId);
    const displayedMoveType = effectiveMoveType(projectMove, attackerConfig.abilityId, displayedWeather);
    const attackerStabTypes = attackerTypesForStab(attackerForm.types, displayedMoveType, attackerConfig.abilityId);
    const typeEffectiveness = displayedTypeEffectiveness(displayedMoveType, defenderForm.types, attackerConfig.abilityId);
    const weather = weatherImpact(displayedMoveType, displayedWeather);
    const protection = actualCalc.protection;
    const withoutAttackerAbility = runCalculation('without-attacker-ability').damages;
    const withoutDefenderAbility = runCalculation('without-defender-ability').damages;
    const withoutAttackerItem = runCalculation('without-attacker-item').damages;
    const withoutDefenderItem = runCalculation('without-defender-item').damages;
    const abilityEffects = uniqueAbilityEffects([
      knownAbilityEffectChip({
        side: 'attacker',
        abilityId: attackerConfig.abilityId,
        opposingAbilityId: defenderConfig.abilityId,
        move: projectMove,
        actual: damages,
        typeEffectiveness,
      }),
      knownAbilityEffectChip({
        side: 'defender',
        abilityId: defenderConfig.abilityId,
        opposingAbilityId: attackerConfig.abilityId,
        move: projectMove,
        actual: damages,
        typeEffectiveness,
      }),
      abilityEffectChip({ side: 'attacker', abilityId: attackerConfig.abilityId, actual: damages, without: withoutAttackerAbility, move: projectMove }),
      abilityEffectChip({ side: 'defender', abilityId: defenderConfig.abilityId, actual: damages, without: withoutDefenderAbility, move: projectMove }),
    ]);
    const itemEffects = uniqueItemEffects([
      itemEffectChip({ side: 'attacker', itemId: attackerConfig.itemId, actual: damages, without: withoutAttackerItem }),
      itemEffectChip({ side: 'defender', itemId: defenderConfig.itemId, actual: damages, without: withoutDefenderItem }),
    ]);
    const eventEffects = damageEventEffects({
      defenderAbilityId: defenderConfig.abilityId,
      damages,
      defenderHp: hp,
      attackerTypes: attackerForm.types,
    });

    warnings.push('使用 @smogon/calc Gen9 伤害公式，并代入本项目采集的 Champions 招式参数与 SP 能力值。');
    assumptions.push(
      'Damage formula: @smogon/calc Gen9.',
      'Move parameters: project Champions move catalog power/type/category/targetScope.',
      'Stats: project Champions SP v1 stat formula at Lv.50.',
      `进攻方能力值: ${attackerStats.attack} Atk / ${attackerStats.specialAttack} SpA / ${attackerStats.speed} Spe`,
      `防守方 HP: ${defenderStats.hp}, Def: ${defenderStats.defense}, SpD: ${defenderStats.specialDefense}`,
    );
    if (input.attackerHpPercent && input.attackerHpPercent !== 100) assumptions.push(`Battle context: attacker HP is treated as ${input.attackerHpPercent}%.`);
    if (input.defenderHpPercent && input.defenderHpPercent !== 100) assumptions.push(`Battle context: defender HP is treated as ${input.defenderHpPercent}%.`);
    if (input.attackerStatus && input.attackerStatus !== 'none') assumptions.push(`Battle context: attacker status is ${STATUS_LABELS[input.attackerStatus]}.`);
    if (input.defenderStatus && input.defenderStatus !== 'none') assumptions.push(`Battle context: defender status is ${STATUS_LABELS[input.defenderStatus]}.`);
    if (input.isCritical) assumptions.push('Battle context: move is treated as a critical hit.');
    if (defenderConfig.abilityId === 'multiscale' && hpPercentToCurrentHp(defenderStats.hp, input.defenderHpPercent) === defenderStats.hp) {
      assumptions.push('Battle context: defender is treated as full HP for Multiscale.');
    }
    if (input.defenderProtected) assumptions.push('Battle context: defender is protected this turn.');

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
      oneHitKoChance,
      twoHitKoChance,
      abilityEffects,
      itemEffects,
      eventEffects,
      defenderHp: defenderStats.hp,
      attackerStats,
      defenderStats,
      offensiveStatLabel,
      offensiveStatValue,
      defensiveStatLabel,
      defensiveStatValue,
      effectiveMoveType: displayedMoveType,
      stabMultiplier: attackerStabTypes.includes(displayedMoveType) ? 1.5 : 1,
      typeEffectiveness,
      typeEffectivenessText: typeEffectivenessText(typeEffectiveness),
      weatherMultiplier: weather.multiplier,
      weatherText: weather.text,
      spreadMultiplier: spread ? 0.75 : 1,
      protectionMultiplier: protection.text ? protection.multiplier : undefined,
      protectionText: protection.text,
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
