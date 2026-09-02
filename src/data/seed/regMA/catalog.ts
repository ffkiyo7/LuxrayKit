import type { Ability, Item, Move, Pokemon, PokemonForm } from '../../../types';
import { pokemonBatch006, abilitiesBatch006 } from './catalog-batch-006';
import { pokemonBatch005, abilitiesBatch005 } from './catalog-batch-005';
import { pokemonBatch004, abilitiesBatch004 } from './catalog-batch-004';
import { pokemonBatch003, abilitiesBatch003 } from './catalog-batch-003';
import { pokemonBatch002, abilitiesBatch002 } from './catalog-batch-002';
import { pokemonBatch001, abilitiesBatch001 } from './catalog-batch-001';
import { megaFormsByParentId, megaStoneParentMap, megaCapableBaseIds } from './mega-catalog';
import { mbMegaFormsByParentId, mbMegaStoneParentMap, mbMegaCapableBaseIds } from './mega-catalog-mb';
import { itemIconMapping } from './item-icon-mapping';
import { pokemonForms032 } from './catalog-forms';
import { championsMoves } from './move-catalog';

const catalogRefs = ['reg-mb-official-eligible-pokemon', 'pokeapi-pokemon-data', 'pokeapi-official-artwork', 'manual-seed-review'];
const abilityRefs = ['pokemon-zhwiki-ability-text', 'pokeapi-pokemon-data'];
const championsAbilityRefs = ['pokebase-champions-mega-data', 'manual-seed-review'];
const megaRefs = ['reg-mb-official-mega-list', 'pokeapi-pokemon-data', 'pokeapi-official-artwork', 'manual-seed-review'];
const heldItemRefs = ['pokebase-champions-item-icons', 'pokeapi-item-data', 'manual-seed-review'];
const berryItemRefs = ['pokebase-champions-item-icons', 'pokeapi-item-data', 'pokeapi-item-sprites', 'manual-seed-review'];
const megaItemRefs = ['reg-mb-official-mega-list', 'pokebase-champions-item-icons', 'manual-seed-review'];
/**
 * Merge the per-regulation Mega tables by *concatenating* each parent's form array.
 *
 * Object spread would be wrong here: the key is the parent `pokemonId`, so a parent that gains a
 * second Mega in a later regulation (e.g. the Z Megas of Absol / Garchomp / Lucario, whose
 * parents already carry a plain Mega in the M-A table) would have its earlier forms silently
 * replaced — with no type error and no test failure. Duplicate `form.id`s are a real authoring
 * mistake, so they throw instead of one quietly winning.
 */
export const mergeMegaFormsByParentId = (
  tables: Array<Record<string, PokemonForm[]>>,
): Record<string, PokemonForm[]> => {
  const merged: Record<string, PokemonForm[]> = {};
  const formOwner = new Map<string, string>();

  for (const table of tables) {
    for (const [parentId, forms] of Object.entries(table)) {
      const bucket = (merged[parentId] ??= []);
      for (const form of forms) {
        const owner = formOwner.get(form.id);
        if (owner !== undefined) {
          throw new Error(
            `Duplicate Mega form id "${form.id}" (already registered under parent "${owner}", now under "${parentId}").`,
          );
        }
        formOwner.set(form.id, parentId);
        bucket.push(form);
      }
    }
  }

  return merged;
};

/**
 * Mega stone -> parent Pokemon. Keys are stone item ids, which are unique per Mega form, so a
 * repeated key with a *different* parent is a conflict rather than an override.
 */
export const mergeMegaStoneParentMap = (
  tables: Array<Record<string, string>>,
): Record<string, string> => {
  const merged: Record<string, string> = {};

  for (const table of tables) {
    for (const [stoneId, parentId] of Object.entries(table)) {
      const existing = merged[stoneId];
      if (existing !== undefined && existing !== parentId) {
        throw new Error(
          `Mega stone "${stoneId}" maps to conflicting parents "${existing}" and "${parentId}".`,
        );
      }
      merged[stoneId] = parentId;
    }
  }

  return merged;
};

const combinedMegaFormsByParentId = mergeMegaFormsByParentId([megaFormsByParentId, mbMegaFormsByParentId]);
const combinedMegaStoneParentMap = mergeMegaStoneParentMap([megaStoneParentMap, mbMegaStoneParentMap]);
// Set union — membership only, so there is no override semantics to guard here (unlike the two
// keyed tables above).
const combinedMegaCapableBaseIds = new Set([...megaCapableBaseIds, ...mbMegaCapableBaseIds]);

const artwork = (nationalDexNo: number) => `/assets/pokemon/thumbs/${nationalDexNo}.png`;
const formArtwork = (formSpriteId: number) => artwork(formSpriteId);

const abilityRows: Ability[] = [
  ...abilitiesBatch006,
  ...abilitiesBatch005,
  ...abilitiesBatch004,
  ...abilitiesBatch003,
  ...abilitiesBatch002,
  ...abilitiesBatch001,
  {
    id: 'piercing-drill',
    chineseName: 'Piercing Drill',
    englishName: 'Piercing Drill',
    effectSummary: '使用接触类招式时，即使目标正在保护自己也能命中，但只造成原本 1/4 的伤害；保护以外的效果仍会触发。',
    pokemonIds: [],
    calculationImpact: 'none',
    legalInCurrentRule: true,
    sourceRefs: championsAbilityRefs,
  },
  {
    id: 'unseen-fist',
    chineseName: '无形拳',
    englishName: 'Unseen Fist',
    effectSummary: '使用接触类招式时，可以无视对手的守住等保护效果造成伤害。',
    pokemonIds: [],
    calculationImpact: 'none',
    legalInCurrentRule: true,
    sourceRefs: championsAbilityRefs,
  },
  {
    id: 'fairy-aura',
    chineseName: '妖精气场',
    englishName: 'Fairy Aura',
    effectSummary: '场上所有宝可梦的妖精属性招式威力提高 33%。',
    pokemonIds: [],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: championsAbilityRefs,
  },
  {
    id: 'spicy-spray',
    chineseName: 'Spicy Spray',
    englishName: 'Spicy Spray',
    effectSummary: '受到招式伤害时，会让攻击方陷入灼伤状态。',
    pokemonIds: [],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: championsAbilityRefs,
  },
  {
    id: 'innards-out',
    chineseName: '飞出的内在物',
    englishName: 'Innards Out',
    effectSummary: '被攻击打倒时，会给予攻击方等同于自己最后损失 HP 的伤害。',
    pokemonIds: [],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: championsAbilityRefs,
  },
  {
    id: 'mega-sol',
    chineseName: 'Mega Sol',
    englishName: 'Mega Sol',
    effectSummary: '即使天气不是大晴天，也能像在大晴天下一样使用自身招式。',
    pokemonIds: [],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: championsAbilityRefs,
  },
  {
    id: 'dragonize',
    chineseName: 'Dragonize',
    englishName: 'Dragonize',
    effectSummary: '一般属性招式会变为龙属性，威力提高 20%。',
    pokemonIds: [],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: championsAbilityRefs,
  },
  {
    id: 'overgrow',
    chineseName: '茂盛',
    englishName: 'Overgrow',
    effectSummary: 'ＨＰ减少的时候，草属性的招式威力会提高。',
    pokemonIds: ['venusaur'],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'chlorophyll',
    chineseName: '叶绿素',
    englishName: 'Chlorophyll',
    effectSummary: '晴朗天气时，速度会提高。',
    pokemonIds: ['venusaur'],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'thick-fat',
    chineseName: '厚脂肪',
    englishName: 'Thick Fat',
    effectSummary: '因为被厚厚的脂肪保护着，会让火属性和冰属性的招式伤害减半。',
    pokemonIds: ['venusaur'],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'blaze',
    chineseName: '猛火',
    englishName: 'Blaze',
    effectSummary: 'ＨＰ减少的时候，火属性的招式威力会提高。',
    pokemonIds: ['charizard', 'incineroar'],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'solar-power',
    chineseName: '太阳之力',
    englishName: 'Solar Power',
    effectSummary: '晴朗天气时，特攻会提高，而每回合ＨＰ会减少。',
    pokemonIds: ['charizard'],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'tough-claws',
    chineseName: '硬爪',
    englishName: 'Tough Claws',
    effectSummary: '接触到对手的招式威力会提高。',
    pokemonIds: ['charizard'],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'drought',
    chineseName: '日照',
    englishName: 'Drought',
    effectSummary: '出场时，会将天气变为晴朗。',
    pokemonIds: ['charizard', 'torkoal'],
    calculationImpact: 'none',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'water-absorb',
    chineseName: '储水',
    englishName: 'Water Absorb',
    effectSummary: '受到水属性的招式攻击时，不会受到伤害，而是会回复。',
    pokemonIds: ['politoed'],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'damp',
    chineseName: '湿气',
    englishName: 'Damp',
    effectSummary: '通过把周围都弄湿，使谁都无法使用自爆等爆炸类的招式。',
    pokemonIds: ['politoed'],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'drizzle',
    chineseName: '降雨',
    englishName: 'Drizzle',
    effectSummary: '出场时，会将天气变为下雨。',
    pokemonIds: ['politoed'],
    calculationImpact: 'none',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'white-smoke',
    chineseName: '白色烟雾',
    englishName: 'White Smoke',
    effectSummary: '被白色烟雾保护着，不会被对手降低能力。',
    pokemonIds: ['torkoal'],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'shell-armor',
    chineseName: '硬壳盔甲',
    englishName: 'Shell Armor',
    effectSummary: '被坚硬的壳保护着，对手的攻击不会击中要害。',
    pokemonIds: ['torkoal'],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'sand-veil',
    chineseName: '沙隐',
    englishName: 'Sand Veil',
    effectSummary: '在沙暴的时候，闪避率会提高。',
    pokemonIds: ['garchomp'],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'rough-skin',
    chineseName: '粗糙皮肤',
    englishName: 'Rough Skin',
    effectSummary: '受到攻击时，用粗糙的皮肤弄伤接触到自己的对手。',
    pokemonIds: ['garchomp'],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'sand-force',
    chineseName: '沙之力',
    englishName: 'Sand Force',
    effectSummary: '沙暴天气时，岩石属性、地面属性和钢属性的招式威力会提高。',
    pokemonIds: ['garchomp'],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'intimidate',
    chineseName: '威吓',
    englishName: 'Intimidate',
    effectSummary: '出场时威吓对手，让其退缩，降低对手的攻击。',
    pokemonIds: ['incineroar'],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'adaptability',
    chineseName: '适应力',
    englishName: 'Adaptability',
    effectSummary: '与自身同属性的招式威力会提高。',
    pokemonIds: [],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'filter',
    chineseName: '过滤',
    englishName: 'Filter',
    effectSummary: '受到效果绝佳的攻击时，可以减弱其威力。',
    pokemonIds: [],
    calculationImpact: 'confirmed',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'curious-medicine',
    chineseName: '怪药',
    englishName: 'Curious Medicine',
    effectSummary: '出场时会从贝壳撒药，将我方的能力变化复原。',
    pokemonIds: [],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'mimicry',
    chineseName: '拟态',
    englishName: 'Mimicry',
    effectSummary: '宝可梦的属性会根据场地的状态而变化。',
    pokemonIds: [],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'quick-draw',
    chineseName: '速击',
    englishName: 'Quick Draw',
    effectSummary: '有时能比对手先一步行动。',
    pokemonIds: [],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'surge-surfer',
    chineseName: '冲浪之尾',
    englishName: 'Surge Surfer',
    effectSummary: '电气场地时，速度会变为2倍。',
    pokemonIds: [],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
  {
    id: 'vital-spirit',
    chineseName: '干劲',
    englishName: 'Vital Spirit',
    effectSummary: '通过激发出干劲，不会变为睡眠状态。',
    pokemonIds: [],
    calculationImpact: 'pending',
    legalInCurrentRule: true,
    sourceRefs: abilityRefs,
  },
];

const duplicateItemRestriction = '同队不得重复携带同名道具。';
const megaRestriction = '每场战斗只能 Mega Evolution 一次。';

const heldItemRows = [
  ['big-root', '大根茎', 'Big Root', '吸取类招式及其他回复 HP 效果的回复量提高 30%。'],
  ['black-belt', '黑带', 'Black Belt', '格斗属性招式的威力提高 20%。'],
  ['black-glasses', '黑色眼镜', 'Black Glasses', '恶属性招式的威力提高 20%。'],
  ['bright-powder', '光粉', 'Bright Powder', '以携带者为目标的招式命中率降低 10%。'],
  ['charcoal', '木炭', 'Charcoal', '火属性招式的威力提高 20%。'],
  ['choice-scarf', '讲究围巾', 'Choice Scarf', '速度提高 50%，但换下前只能使用首次选定的招式。'],
  ['damp-rock', '潮湿岩石', 'Damp Rock', '携带者召唤的雨天气延长 3 回合（共 8 回合）。'],
  ['dragon-fang', '龙之牙', 'Dragon Fang', '龙属性招式的威力提高 20%。'],
  ['expert-belt', '达人带', 'Expert Belt', '效果绝佳的招式威力提高 20%。'],
  ['fairy-feather', '妖精之羽', 'Fairy Feather', '妖精属性招式的威力提高 20%。'],
  ['focus-band', '气势头带', 'Focus Band', '受到本应致命的招式伤害时，有 10% 概率保留 1 HP。'],
  ['focus-sash', '气势披带', 'Focus Sash', '满 HP 时受到本应致命的招式伤害会保留 1 HP，使用后消耗。'],
  ['hard-stone', '硬石头', 'Hard Stone', '岩石属性招式的威力提高 20%。'],
  ['heat-rock', '炽热岩石', 'Heat Rock', '携带者召唤的晴朗天气延长 3 回合（共 8 回合）。'],
  ['icy-rock', '冰冷岩石', 'Icy Rock', '携带者召唤的雪天气延长 3 回合（共 8 回合）。'],
  ['iron-ball', '黑色铁球', 'Iron Ball', '速度减半；若携带者原本不接地，则会变为接地并受到地面属性招式及场地陷阱影响。'],
  ['kings-rock', '王者之证', "King's Rock", '造成伤害的招式有 10% 概率使目标畏缩。'],
  ['leftovers', '吃剩的东西', 'Leftovers', '每回合结束时回复最大 HP 的 1/16。'],
  ['life-orb', '生命宝珠', 'Life Orb', '招式威力提高 30%；使出造成伤害的招式后损失最大 HP 的 10%。'],
  ['light-clay', '光之黏土', 'Light Clay', '光墙、反射壁和极光幕延长 3 回合（共 8 回合）。'],
  ['light-ball', '电气球', 'Light Ball', '皮卡丘携带时，攻击和特攻变为 2 倍。'],
  ['magnet', '磁铁', 'Magnet', '电属性招式的威力提高 20%。'],
  ['mental-herb', '心灵香草', 'Mental Herb', '解除着迷、挑衅、无理取闹、定身法、回复封锁和再来一次，使用后消耗。'],
  ['metal-coat', '金属膜', 'Metal Coat', '钢属性招式的威力提高 20%。'],
  ['metronome', '节拍器', 'Metronome', '连续使用同一招式时，威力加成每次增加 20%，最高 100%；改用其他招式时重置。'],
  ['miracle-seed', '奇迹种子', 'Miracle Seed', '草属性招式的威力提高 20%。'],
  ['muscle-band', '力量头带', 'Muscle Band', '物理招式的威力提高 10%。'],
  ['mystic-water', '神秘水滴', 'Mystic Water', '水属性招式的威力提高 20%。'],
  ['never-melt-ice', '不融冰', 'Never-Melt Ice', '冰属性招式的威力提高 20%。'],
  ['poison-barb', '毒针', 'Poison Barb', '毒属性招式的威力提高 20%。'],
  ['quick-claw', '先制之爪', 'Quick Claw', '有 20% 概率在同优先度招式中率先行动。'],
  ['scope-lens', '焦点镜', 'Scope Lens', '击中要害等级提高 1 级。'],
  ['sharp-beak', '锐利鸟嘴', 'Sharp Beak', '飞行属性招式的威力提高 20%。'],
  ['shell-bell', '贝壳之铃', 'Shell Bell', '造成伤害后，回复所造成伤害的 1/8 HP。'],
  ['shed-shell', '美丽空壳', 'Shed Shell', '即使受到招式或特性限制，携带者也能换下。'],
  ['silk-scarf', '丝绸围巾', 'Silk Scarf', '一般属性招式的威力提高 20%。'],
  ['silver-powder', '银粉', 'Silver Powder', '虫属性招式的威力提高 20%。'],
  ['smooth-rock', '沙沙岩石', 'Smooth Rock', '携带者召唤的沙暴天气延长 3 回合（共 8 回合）。'],
  ['soft-sand', '柔软沙子', 'Soft Sand', '地面属性招式的威力提高 20%。'],
  ['spell-tag', '诅咒之符', 'Spell Tag', '幽灵属性招式的威力提高 20%。'],
  ['twisted-spoon', '弯曲的汤匙', 'Twisted Spoon', '超能力属性招式的威力提高 20%。'],
  ['wide-lens', '广角镜', 'Wide Lens', '招式命中率提高 10%。'],
  ['white-herb', '白色香草', 'White Herb', '将被降低的能力变化复原，使用后消耗。'],
  ['wise-glasses', '博识眼镜', 'Wise Glasses', '特殊招式的威力提高 10%。'],
  ['zoom-lens', '对焦镜', 'Zoom Lens', '携带者晚于目标行动时，招式命中率提高 20%。'],
] as const;

const berryRows = [
  ['aspear-berry', '利木果', 'Aspear Berry', '携带者陷入冰冻时解除冰冻，使用后消耗。'],
  ['babiri-berry', '霹霹果', 'Babiri Berry', '首次受到效果绝佳的钢属性招式攻击时，伤害减半，使用后消耗。'],
  ['charti-berry', '草蚕果', 'Charti Berry', '首次受到效果绝佳的岩石属性招式攻击时，伤害减半，使用后消耗。'],
  ['cheri-berry', '樱子果', 'Cheri Berry', '携带者陷入麻痹时解除麻痹，使用后消耗。'],
  ['chesto-berry', '零余果', 'Chesto Berry', '携带者陷入睡眠时解除睡眠，使用后消耗。'],
  ['chilan-berry', '灯浆果', 'Chilan Berry', '首次受到一般属性招式攻击时，伤害减半，使用后消耗。'],
  ['chople-berry', '莲蒲果', 'Chople Berry', '首次受到效果绝佳的格斗属性招式攻击时，伤害减半，使用后消耗。'],
  ['coba-berry', '棱瓜果', 'Coba Berry', '首次受到效果绝佳的飞行属性招式攻击时，伤害减半，使用后消耗。'],
  ['colbur-berry', '刺耳果', 'Colbur Berry', '首次受到效果绝佳的恶属性招式攻击时，伤害减半，使用后消耗。'],
  ['haban-berry', '莓榴果', 'Haban Berry', '首次受到效果绝佳的龙属性招式攻击时，伤害减半，使用后消耗。'],
  ['kasib-berry', '佛柑果', 'Kasib Berry', '首次受到效果绝佳的幽灵属性招式攻击时，伤害减半，使用后消耗。'],
  ['kebia-berry', '通通果', 'Kebia Berry', '首次受到效果绝佳的毒属性招式攻击时，伤害减半，使用后消耗。'],
  ['leppa-berry', '苹野果', 'Leppa Berry', '招式的 PP 降至 0 时回复该招式 10 PP，使用后消耗。'],
  ['lum-berry', '木子果', 'Lum Berry', '解除携带者的异常状态或混乱，使用后消耗。'],
  ['occa-berry', '巧可果', 'Occa Berry', '首次受到效果绝佳的火属性招式攻击时，伤害减半，使用后消耗。'],
  ['oran-berry', '橙橙果', 'Oran Berry', 'HP 降至一半或以下时回复 10 HP，使用后消耗。'],
  ['passho-berry', '千香果', 'Passho Berry', '首次受到效果绝佳的水属性招式攻击时，伤害减半，使用后消耗。'],
  ['payapa-berry', '福禄果', 'Payapa Berry', '首次受到效果绝佳的超能力属性招式攻击时，伤害减半，使用后消耗。'],
  ['pecha-berry', '桃桃果', 'Pecha Berry', '携带者陷入中毒时解除中毒，使用后消耗。'],
  ['persim-berry', '柿仔果', 'Persim Berry', '携带者陷入混乱时解除混乱，使用后消耗。'],
  ['rawst-berry', '莓莓果', 'Rawst Berry', '携带者陷入灼伤时解除灼伤，使用后消耗。'],
  ['rindo-berry', '罗子果', 'Rindo Berry', '首次受到效果绝佳的草属性招式攻击时，伤害减半，使用后消耗。'],
  ['roseli-berry', '洛玫果', 'Roseli Berry', '首次受到效果绝佳的妖精属性招式攻击时，伤害减半，使用后消耗。'],
  ['shuca-berry', '腰木果', 'Shuca Berry', '首次受到效果绝佳的地面属性招式攻击时，伤害减半，使用后消耗。'],
  ['sitrus-berry', '文柚果', 'Sitrus Berry', 'HP 降至一半或以下时回复最大 HP 的 1/4，使用后消耗。'],
  ['tanga-berry', '扁樱果', 'Tanga Berry', '首次受到效果绝佳的虫属性招式攻击时，伤害减半，使用后消耗。'],
  ['wacan-berry', '烛木果', 'Wacan Berry', '首次受到效果绝佳的电属性招式攻击时，伤害减半，使用后消耗。'],
  ['yache-berry', '番荔果', 'Yache Berry', '首次受到效果绝佳的冰属性招式攻击时，伤害减半，使用后消耗。'],
] as const;

type MegaStoneRow = readonly [string, string, string] | readonly [string, string, string, readonly string[]];

const megaStoneRows: ReadonlyArray<MegaStoneRow> = [
  ['abomasite', '暴雪王进化石', 'Abomasite'],
  ['absolite', '阿勃梭鲁进化石', 'Absolite'],
  ['aerodactylite', '化石翼龙进化石', 'Aerodactylite'],
  ['aggronite', '波士可多拉进化石', 'Aggronite'],
  ['alakazite', '胡地进化石', 'Alakazite'],
  ['altarianite', '七夕青鸟进化石', 'Altarianite'],
  ['ampharosite', '电龙进化石', 'Ampharosite'],
  ['audinite', '差不多娃娃进化石', 'Audinite'],
  ['barbaracite', '龟足巨铠进化石', 'Barbaracite'],
  ['banettite', '诅咒娃娃进化石', 'Banettite'],
  ['beedrillite', '大针蜂进化石', 'Beedrillite'],
  ['blazikenite', '火焰鸡进化石', 'Blazikenite'],
  ['blastoisinite', '水箭龟进化石', 'Blastoisinite'],
  ['cameruptite', '喷火驼进化石', 'Cameruptite'],
  ['chandelurite', '水晶灯火灵进化石', 'Chandelurite'],
  ['charizardite-x', '喷火龙进化石X', 'Charizardite X', ['charizard']],
  ['charizardite-y', '喷火龙进化石Y', 'Charizardite Y', ['charizard']],
  ['chesnaughtite', '布里卡隆进化石', 'Chesnaughtite'],
  ['chimechite', '风铃铃进化石', 'Chimechite'],
  ['clefablite', '皮可西进化石', 'Clefablite'],
  ['crabominite', '好胜毛蟹进化石', 'Crabominite'],
  ['delphoxite', '妖火红狐进化石', 'Delphoxite'],
  ['dragalgite', '毒藻龙进化石', 'Dragalgite'],
  ['dragoninite', '快龙进化石', 'Dragoninite'],
  ['drampanite', '老翁龙进化石', 'Drampanite'],
  ['eelektrossite', '麻麻鳗鱼王进化石', 'Eelektrossite'],
  ['emboarite', '炎武王进化石', 'Emboarite'],
  ['excadrite', '龙头地鼠进化石', 'Excadrite'],
  ['falinksite', '列阵兵进化石', 'Falinksite'],
  ['feraligite', '大力鳄进化石', 'Feraligite'],
  ['floettite', '花叶蒂进化石', 'Floettite'],
  ['froslassite', '雪妖女进化石', 'Froslassite'],
  ['galladite', '艾路雷朵进化石', 'Galladite'],
  ['garchompite', '烈咬陆鲨进化石', 'Garchompite', ['garchomp']],
  ['gardevoirite', '沙奈朵进化石', 'Gardevoirite'],
  ['gengarite', '耿鬼进化石', 'Gengarite'],
  ['glalitite', '冰鬼护进化石', 'Glalitite'],
  ['glimmoranite', '晶光花进化石', 'Glimmoranite'],
  ['golurkite', '泥偶巨人进化石', 'Golurkite'],
  ['greninjite', '甲贺忍蛙进化石', 'Greninjite'],
  ['gyaradosite', '暴鲤龙进化石', 'Gyaradosite'],
  ['hawluchanite', '摔角鹰人进化石', 'Hawluchanite'],
  ['heracronite', '赫拉克罗斯进化石', 'Heracronite'],
  ['houndoominite', '黑鲁加进化石', 'Houndoominite'],
  ['kangaskhanite', '袋兽进化石', 'Kangaskhanite'],
  ['lopunnite', '长耳兔进化石', 'Lopunnite'],
  ['lucarionite', '路卡利欧进化石', 'Lucarionite'],
  ['malamarite', '乌贼王进化石', 'Malamarite'],
  ['manectite', '雷电兽进化石', 'Manectite'],
  ['mawilite', '大嘴娃进化石', 'Mawilite'],
  ['medichamite', '恰雷姆进化石', 'Medichamite'],
  ['meganiumite', '大竺葵进化石', 'Meganiumite'],
  ['meowsticite', '超能妙喵进化石', 'Meowsticite'],
  ['metagrossite', '巨金怪进化石', 'Metagrossite'],
  ['pidgeotite', '大比鸟进化石', 'Pidgeotite'],
  ['pinsirite', '凯罗斯进化石', 'Pinsirite'],
  ['pyroarite', '火炎狮进化石', 'Pyroarite'],
  ['raichunite', '雷丘进化石Y', 'Raichunite Y'],
  ['raichunite-x', '雷丘进化石X', 'Raichunite X'],
  ['sablenite', '勾魂眼进化石', 'Sablenite'],
  ['scizorite', '巨钳螳螂进化石', 'Scizorite'],
  ['scolipite', '蜈蚣王进化石', 'Scolipite'],
  ['scovillainite', '狠辣椒进化石', 'Scovillainite'],
  ['scraftinite', '头巾混混进化石', 'Scraftinite'],
  ['sceptilite', '蜥蜴王进化石', 'Sceptilite'],
  ['sharpedonite', '巨牙鲨进化石', 'Sharpedonite'],
  ['skarmorite', '盔甲鸟进化石', 'Skarmorite'],
  ['slowbronite', '呆壳兽进化石', 'Slowbronite'],
  ['staraptite', '姆克鹰进化石', 'Staraptite'],
  ['starminite', '宝石海星进化石', 'Starminite'],
  ['steelixite', '大钢蛇进化石', 'Steelixite'],
  ['swampertite', '巨沼怪进化石', 'Swampertite'],
  ['tyranitarite', '班基拉斯进化石', 'Tyranitarite'],
  ['venusaurite', '妙蛙花进化石', 'Venusaurite', ['venusaur']],
  ['victreebelite', '大食花进化石', 'Victreebelite'],
] as const;

const heldItem = ([id, chineseName, englishName, effectSummary]: (typeof heldItemRows)[number] | (typeof berryRows)[number]): Item => ({
  id,
  chineseName,
  englishName,
  effectSummary,
  category: 'held-item',
  legalInCurrentRule: true,
  isMegaStone: false,
  applicablePokemonIds: [],
  teamRestrictionNotes: duplicateItemRestriction,
  sourceRefs: heldItemRefs,
  iconRef: itemIconMapping[id],
});

const berryItem = (row: (typeof berryRows)[number]): Item => ({
  ...heldItem(row),
  category: 'berry',
  sourceRefs: berryItemRefs,
});

const megaStone = ([id, chineseName, englishName, applicablePokemonIds = []]: MegaStoneRow): Item => ({
  id,
  chineseName,
  englishName,
  effectSummary: '让对应的宝可梦在战斗中进行 Mega Evolution。',
  category: 'mega-evolution',
  legalInCurrentRule: true,
  isMegaStone: true,
  applicablePokemonIds: [...applicablePokemonIds],
  teamRestrictionNotes: megaRestriction,
  sourceRefs: megaItemRefs,
  iconRef: itemIconMapping[id],
});

const unavailableItem = (id: string, chineseName: string, englishName: string, effectSummary: string): Item => ({
  id,
  chineseName,
  englishName,
  effectSummary,
  category: 'held-item',
  legalInCurrentRule: false,
  isMegaStone: false,
  applicablePokemonIds: [],
  teamRestrictionNotes: '当前 Reg M-B 道具池未确认，暂不进入前端可选池。',
  sourceRefs: ['manual-seed-review'],
  iconRef: itemIconMapping[id],
});

export const items: Item[] = [
  ...heldItemRows.map(heldItem),
  ...megaStoneRows.map((row) => ({
    ...megaStone(row),
    applicablePokemonIds: (combinedMegaStoneParentMap[row[0]] ? [combinedMegaStoneParentMap[row[0]]] : [...(row[3] ?? [])]) as string[],
  })),
  ...berryRows.map(berryItem),
  unavailableItem('clear-amulet', '清净坠饰', 'Clear Amulet', '防止能力被其他宝可梦的招式或特性降低。'),
  unavailableItem('assault-vest', '突击背心', 'Assault Vest', '特防提高 50%，但只能使用造成伤害的招式。'),
];

export const moves: Move[] = championsMoves;

export const pokemon: Pokemon[] = [
  ...pokemonBatch006,
  ...pokemonBatch005,
  ...pokemonBatch004,
  ...pokemonBatch003,
  ...pokemonBatch002,
  ...pokemonBatch001,
  ...pokemonForms032,
  {
    id: 'venusaur',
    nationalDexNo: 3,
    chineseName: '妙蛙花',
    englishName: 'Venusaur',
    japaneseName: 'フシギバナ',
    iconRef: artwork(3),
    types: ['Grass', 'Poison'],
    baseStats: { hp: 80, attack: 82, defense: 83, specialAttack: 100, specialDefense: 100, speed: 80 },
    legalInCurrentRule: true,
    forms: [],
    abilities: ['overgrow', 'chlorophyll'],
    learnableMoves: ['giga-drain', 'sludge-bomb', 'protect'],
    canMega: true,
    megaForms: [
      {
        id: 'mega-venusaur',
        pokemonId: 'venusaur',
        name: 'Mega Venusaur',
        chineseName: '超级妙蛙花',
        englishName: 'Mega Venusaur',
        japaneseName: 'メガフシギバナ',
        iconRef: formArtwork(10033),
        isMega: true,
        requiredItemId: 'venusaurite',
        types: ['Grass', 'Poison'],
        baseStats: { hp: 80, attack: 100, defense: 123, specialAttack: 122, specialDefense: 120, speed: 80 },
        abilities: ['thick-fat'],
        legalInCurrentRule: true,
        sourceRefs: megaRefs,
      },
    ],
    notes: 'Real first-pass catalog row joined with current-rule source refs and PokeAPI structured data. Manual review still required.',
    sourceRefs: catalogRefs,
  },
  {
    id: 'charizard',
    nationalDexNo: 6,
    chineseName: '喷火龙',
    englishName: 'Charizard',
    japaneseName: 'リザードン',
    iconRef: artwork(6),
    types: ['Fire', 'Flying'],
    baseStats: { hp: 78, attack: 84, defense: 78, specialAttack: 109, specialDefense: 85, speed: 100 },
    legalInCurrentRule: true,
    forms: [],
    abilities: ['blaze', 'solar-power'],
    learnableMoves: ['heat-wave', 'air-slash', 'dragon-claw', 'protect'],
    canMega: true,
    megaForms: [
      {
        id: 'mega-charizard-x',
        pokemonId: 'charizard',
        name: 'Mega Charizard X',
        chineseName: '超级喷火龙X',
        englishName: 'Mega Charizard X',
        japaneseName: 'メガリザードンX',
        iconRef: formArtwork(10034),
        isMega: true,
        requiredItemId: 'charizardite-x',
        types: ['Fire', 'Dragon'],
        baseStats: { hp: 78, attack: 130, defense: 111, specialAttack: 130, specialDefense: 85, speed: 100 },
        abilities: ['tough-claws'],
        legalInCurrentRule: true,
        sourceRefs: megaRefs,
      },
      {
        id: 'mega-charizard-y',
        pokemonId: 'charizard',
        name: 'Mega Charizard Y',
        chineseName: '超级喷火龙Y',
        englishName: 'Mega Charizard Y',
        japaneseName: 'メガリザードンY',
        iconRef: formArtwork(10035),
        isMega: true,
        requiredItemId: 'charizardite-y',
        types: ['Fire', 'Flying'],
        baseStats: { hp: 78, attack: 104, defense: 78, specialAttack: 159, specialDefense: 115, speed: 100 },
        abilities: ['drought'],
        legalInCurrentRule: true,
        sourceRefs: megaRefs,
      },
    ],
    notes: 'Real first-pass catalog row joined with current-rule source refs and PokeAPI structured data. Manual review still required.',
    sourceRefs: catalogRefs,
  },
  {
    id: 'politoed',
    nationalDexNo: 186,
    chineseName: '蚊香蛙皇',
    englishName: 'Politoed',
    japaneseName: 'ニョロトノ',
    iconRef: artwork(186),
    types: ['Water'],
    baseStats: { hp: 90, attack: 75, defense: 75, specialAttack: 90, specialDefense: 100, speed: 70 },
    legalInCurrentRule: true,
    forms: [],
    abilities: ['water-absorb', 'damp', 'drizzle'],
    learnableMoves: ['hydro-pump', 'icy-wind', 'protect'],
    canMega: false,
    megaForms: [],
    notes: 'Real first-pass catalog row joined with current-rule source refs and PokeAPI structured data. Manual review still required.',
    sourceRefs: catalogRefs,
  },
  {
    id: 'torkoal',
    nationalDexNo: 324,
    chineseName: '煤炭龟',
    englishName: 'Torkoal',
    japaneseName: 'コータス',
    iconRef: artwork(324),
    types: ['Fire'],
    baseStats: { hp: 70, attack: 85, defense: 140, specialAttack: 85, specialDefense: 70, speed: 20 },
    legalInCurrentRule: true,
    forms: [],
    abilities: ['white-smoke', 'drought', 'shell-armor'],
    learnableMoves: ['heat-wave', 'flamethrower', 'protect'],
    canMega: false,
    megaForms: [],
    notes: 'Real first-pass catalog row joined with current-rule source refs and PokeAPI structured data. Manual review still required.',
    sourceRefs: catalogRefs,
  },
  {
    id: 'garchomp',
    nationalDexNo: 445,
    chineseName: '烈咬陆鲨',
    englishName: 'Garchomp',
    japaneseName: 'ガブリアス',
    iconRef: artwork(445),
    types: ['Dragon', 'Ground'],
    baseStats: { hp: 108, attack: 130, defense: 95, specialAttack: 80, specialDefense: 85, speed: 102 },
    legalInCurrentRule: true,
    forms: [],
    abilities: ['sand-veil', 'rough-skin'],
    learnableMoves: ['earthquake', 'dragon-claw', 'protect'],
    canMega: true,
    megaForms: [
      {
        id: 'mega-garchomp',
        pokemonId: 'garchomp',
        name: 'Mega Garchomp',
        chineseName: '超级烈咬陆鲨',
        englishName: 'Mega Garchomp',
        japaneseName: 'メガガブリアス',
        iconRef: formArtwork(10058),
        isMega: true,
        requiredItemId: 'garchompite',
        types: ['Dragon', 'Ground'],
        baseStats: { hp: 108, attack: 170, defense: 115, specialAttack: 120, specialDefense: 95, speed: 92 },
        abilities: ['sand-force'],
        legalInCurrentRule: true,
        sourceRefs: megaRefs,
      },
    ],
    notes: 'Real first-pass catalog row joined with current-rule source refs and PokeAPI structured data. Manual review still required.',
    sourceRefs: catalogRefs,
  },
  {
    id: 'incineroar',
    nationalDexNo: 727,
    chineseName: '炽焰咆哮虎',
    englishName: 'Incineroar',
    japaneseName: 'ガオガエン',
    iconRef: artwork(727),
    types: ['Fire', 'Dark'],
    baseStats: { hp: 95, attack: 115, defense: 90, specialAttack: 80, specialDefense: 90, speed: 60 },
    legalInCurrentRule: true,
    forms: [],
    abilities: ['blaze', 'intimidate'],
    learnableMoves: ['flare-blitz', 'darkest-lariat', 'protect'],
    canMega: false,
    megaForms: [],
    notes: 'Real first-pass catalog row joined with current-rule source refs and PokeAPI structured data. Manual review still required.',
    sourceRefs: catalogRefs,
  },
];

// ── Merge mega forms from mega-catalog into parent Pokemon ──
for (let i = 0; i < pokemon.length; i++) {
  const entry = pokemon[i];
  if (combinedMegaCapableBaseIds.has(entry.id) && entry.megaForms.length === 0) {
    pokemon[i] = {
      ...entry,
      canMega: true,
      megaForms: combinedMegaFormsByParentId[entry.id] ?? [],
    };
  }
}

// ── Derive artworkRef from iconRef (thumbs → artwork) ──
for (let i = 0; i < pokemon.length; i++) {
  const entry = pokemon[i];
  pokemon[i] = {
    ...entry,
    artworkRef: entry.iconRef.replace('/thumbs/', '/artwork/'),
    megaForms: entry.megaForms.map((f) => ({ ...f, artworkRef: f.iconRef.replace('/thumbs/', '/artwork/') })),
  };
}

const abilityPokemonIdsById = pokemon.reduce<Record<string, string[]>>((index, entry) => {
  const abilityIds = new Set([...entry.abilities, ...entry.megaForms.flatMap((form) => form.abilities)]);
  abilityIds.forEach((abilityId) => {
    index[abilityId] = [...(index[abilityId] ?? []), entry.id];
  });
  return index;
}, {});

export const abilities: Ability[] = abilityRows.map((ability) => ({
  ...ability,
  pokemonIds: abilityPokemonIdsById[ability.id] ?? [],
}));
