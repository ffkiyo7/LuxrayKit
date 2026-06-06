import { describe, expect, it } from 'vitest';
import {
  currentDataVersion,
  currentRuleSet,
  pokemon,
} from '../data';
import { currentRuleMovesForPokemon } from './currentRuleCatalog';
import {
  buildCalcConfigFromTeamMember,
  buildTemporaryCalcConfig,
  computeDamage,
  totalStatPoints,
  validateStatPoints,
  type CalcSideConfig,
  type DamageAdapterInput,
} from './damageAdapter';

function makeConfig(overrides: Partial<CalcSideConfig> = {}): CalcSideConfig {
  return {
    source: 'temporary',
    pokemonId: 'garchomp',
    nature: '爽朗',
    statPoints: { attack: 32, speed: 32, hp: 2 },
    moveIds: ['dragon-claw'],
    selectedMoveId: 'dragon-claw',
    level: 50,
    ...overrides,
  };
}

const defaults: DamageAdapterInput = {
  attacker: makeConfig({ selectedMoveId: 'dragon-claw' }),
  defender: makeConfig({ pokemonId: 'torkoal', statPoints: { hp: 32, defense: 17, specialDefense: 17 }, nature: '慎重' }),
  battleType: 'doubles',
  weather: '无天气',
  terrain: '无场地',
  attackStage: 0,
};

type ManualReviewFixture = {
  name: string;
  input: DamageAdapterInput;
  expected: {
    rolls: number[];
    defenderHp: number;
    minPercent: number;
    maxPercent: number;
    offensiveStatValue: number;
    defensiveStatValue: number;
    possibleHkoText: string;
    stabMultiplier: number;
    typeEffectiveness: number;
    weatherMultiplier: number;
    spreadMultiplier: number;
    abilityEffects?: Array<{
      side: 'attacker' | 'defender';
      abilityId: string;
      direction: 'boost' | 'reduction' | 'immunity' | 'changed';
      text: string;
    }>;
  };
};

const manualReviewFixtures: ManualReviewFixture[] = [
  {
    name: 'Garchomp Dragon Claw vs bulky Torkoal, doubles single-target baseline',
    input: {
      attacker: makeConfig({
        pokemonId: 'garchomp',
        nature: '爽朗',
        statPoints: { attack: 32, speed: 32, hp: 2 },
        moveIds: ['dragon-claw'],
        selectedMoveId: 'dragon-claw',
      }),
      defender: makeConfig({
        pokemonId: 'torkoal',
        nature: '慎重',
        statPoints: { hp: 32, defense: 17, specialDefense: 17 },
      }),
      battleType: 'doubles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    },
    expected: {
      rolls: [48, 48, 49, 49, 49, 51, 51, 51, 52, 52, 54, 54, 54, 55, 55, 57],
      defenderHp: 177,
      minPercent: 27.1,
      maxPercent: 32.2,
      offensiveStatValue: 182,
      defensiveStatValue: 177,
      possibleHkoText: '通常需要三次以上攻击',
      stabMultiplier: 1.5,
      typeEffectiveness: 1,
      weatherMultiplier: 1,
      spreadMultiplier: 1,
    },
  },
  {
    name: 'Rain Hydro Pump Blastoise vs specially bulky Torkoal',
    input: {
      attacker: makeConfig({
        pokemonId: 'blastoise',
        nature: '内敛',
        statPoints: { specialAttack: 32, hp: 2 },
        moveIds: ['hydro-pump'],
        selectedMoveId: 'hydro-pump',
      }),
      defender: makeConfig({
        pokemonId: 'torkoal',
        nature: '慎重',
        statPoints: { hp: 32, specialDefense: 32, defense: 2 },
      }),
      battleType: 'singles',
      weather: '雨天',
      terrain: '无场地',
      attackStage: 0,
    },
    expected: {
      rolls: [212, 216, 218, 218, 222, 224, 228, 230, 234, 234, 236, 240, 242, 246, 248, 252],
      defenderHp: 177,
      minPercent: 119.8,
      maxPercent: 142.4,
      offensiveStatValue: 150,
      defensiveStatValue: 134,
      possibleHkoText: '确定一击击杀',
      stabMultiplier: 1.5,
      typeEffectiveness: 2,
      weatherMultiplier: 1.5,
      spreadMultiplier: 1,
    },
  },
  {
    name: 'Choice Scarf Garchomp Earthquake vs Houndoom confirms speed item does not alter damage',
    input: {
      attacker: makeConfig({
        pokemonId: 'garchomp',
        itemId: 'choice-scarf',
        nature: '固执',
        statPoints: { attack: 32, speed: 32, hp: 2 },
        moveIds: ['earthquake'],
        selectedMoveId: 'earthquake',
      }),
      defender: makeConfig({ pokemonId: 'houndoom', nature: '认真', statPoints: {} }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    },
    expected: {
      rolls: [320, 326, 330, 332, 338, 342, 344, 348, 354, 356, 360, 362, 368, 372, 374, 380],
      defenderHp: 150,
      minPercent: 213.3,
      maxPercent: 253.3,
      offensiveStatValue: 200,
      defensiveStatValue: 70,
      possibleHkoText: '确定一击击杀',
      stabMultiplier: 1.5,
      typeEffectiveness: 2,
      weatherMultiplier: 1,
      spreadMultiplier: 1,
    },
  },
  {
    name: 'Flash Fire Arcanine immunity vs Houndoom Flare Blitz',
    input: {
      attacker: makeConfig({
        pokemonId: 'houndoom',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['flare-blitz'],
        selectedMoveId: 'flare-blitz',
      }),
      defender: makeConfig({
        pokemonId: 'arcanine',
        abilityId: 'flash-fire',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    },
    expected: {
      rolls: [0],
      defenderHp: 165,
      minPercent: 0,
      maxPercent: 0,
      offensiveStatValue: 156,
      defensiveStatValue: 100,
      possibleHkoText: '无法造成伤害',
      stabMultiplier: 1.5,
      typeEffectiveness: 0.5,
      weatherMultiplier: 1,
      spreadMultiplier: 1,
      abilityEffects: [{ side: 'defender', abilityId: 'flash-fire', direction: 'immunity', text: '火属性招式无效' }],
    },
  },
  {
    name: 'Technician Scizor Bullet Punch vs Houndoom',
    input: {
      attacker: makeConfig({
        pokemonId: 'scizor',
        abilityId: 'technician',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['bullet-punch'],
        selectedMoveId: 'bullet-punch',
      }),
      defender: makeConfig({ pokemonId: 'houndoom', nature: '认真', statPoints: {} }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    },
    expected: {
      rolls: [48, 49, 49, 50, 51, 51, 52, 52, 53, 54, 54, 54, 55, 56, 57, 57],
      defenderHp: 150,
      minPercent: 32,
      maxPercent: 38,
      offensiveStatValue: 200,
      defensiveStatValue: 70,
      possibleHkoText: '通常需要三次以上攻击',
      stabMultiplier: 1.5,
      typeEffectiveness: 0.5,
      weatherMultiplier: 1,
      spreadMultiplier: 1,
      abilityEffects: [{ side: 'attacker', abilityId: 'technician', direction: 'boost', text: '低威力招式增强' }],
    },
  },
];

describe('damageAdapter', () => {
  it('returns Gen9-based damage for valid input with Champions move params and SP stats', () => {
    const result = computeDamage(defaults);
    expect(result.status).toBe('experimental-success');
    expect(result.accuracyLevel).toBe('experimental-mainline-approximation');
    expect(result.damageRolls!.length).toBeGreaterThan(0);
    expect(result.minDamage).toBeGreaterThan(0);
    expect(result.defenderHp).toBeGreaterThan((pokemon.find((p) => p.id === 'torkoal')?.baseStats.hp ?? 0));
    expect(result.dataVersionId).toBe(currentDataVersion.id);
    expect(result.ruleSetId).toBe(currentRuleSet.id);
    expect(result.attackerConfig).toBeTruthy();
    expect(result.defenderConfig).toBeTruthy();
  });

  it('matches the Gen9 roll range for Houndoom Flare Blitz into max HP/Defense Garganacl', () => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: 'houndoom',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['flare-blitz'],
        selectedMoveId: 'flare-blitz',
      }),
      defender: makeConfig({
        pokemonId: 'garganacl',
        nature: '慎重',
        statPoints: { hp: 32, defense: 32 },
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.damageRolls).toEqual([29, 30, 30, 30, 30, 31, 31, 32, 32, 33, 33, 33, 33, 34, 34, 35]);
    expect(result.offensiveStatValue).toBe(156);
    expect(result.defensiveStatValue).toBe(182);
    expect(result.typeEffectiveness).toBe(0.5);
    expect(result.stabMultiplier).toBe(1.5);
    expect(result.oneHitKoChance).toBe(0);
    expect(result.twoHitKoChance).toBe(0);
    expect(result.possibleHkoText).toBe('通常需要三次以上攻击');
  });

  it.each(manualReviewFixtures)('matches manual review fixture: $name', ({ input, expected }) => {
    const result = computeDamage(input);

    expect(result.status).toBe('experimental-success');
    expect(result.accuracyLevel).toBe('experimental-mainline-approximation');
    expect(result.damageRolls).toEqual(expected.rolls);
    expect(result.minDamage).toBe(Math.min(...expected.rolls));
    expect(result.maxDamage).toBe(Math.max(...expected.rolls));
    expect(result.defenderHp).toBe(expected.defenderHp);
    expect(result.minPercent).toBe(expected.minPercent);
    expect(result.maxPercent).toBe(expected.maxPercent);
    expect(result.offensiveStatValue).toBe(expected.offensiveStatValue);
    expect(result.defensiveStatValue).toBe(expected.defensiveStatValue);
    expect(result.possibleHkoText).toBe(expected.possibleHkoText);
    expect(result.stabMultiplier).toBe(expected.stabMultiplier);
    expect(result.typeEffectiveness).toBe(expected.typeEffectiveness);
    expect(result.weatherMultiplier).toBe(expected.weatherMultiplier);
    expect(result.spreadMultiplier).toBe(expected.spreadMultiplier);
    expect(result.abilityEffects).toEqual(
      (expected.abilityEffects ?? []).map((effect) => expect.objectContaining(effect)),
    );
    expect(result.itemEffects).toEqual([]);
  });

  it('reports probabilistic one-hit and two-hit KO conclusions from damage rolls', () => {
    const oneHit = computeDamage({
      attacker: makeConfig({
        pokemonId: 'garchomp',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['earthquake'],
        selectedMoveId: 'earthquake',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    expect(oneHit.status).toBe('experimental-success');
    expect(oneHit.oneHitKoChance).toBeGreaterThanOrEqual(0);
    expect(oneHit.oneHitKoChance).toBeLessThanOrEqual(100);
    expect(oneHit.possibleHkoText).toMatch(/一击击杀概率|确定一击击杀|两击击杀概率|确定两击击杀|三次以上/);
  });

  it('applies attacker abilities such as Huge Power and reports an ability chip', () => {
    const withHugePower = computeDamage({
      attacker: makeConfig({
        pokemonId: 'azumarill',
        abilityId: 'huge-power',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['waterfall'],
        selectedMoveId: 'waterfall',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const withoutHugePower = computeDamage({
      attacker: makeConfig({
        pokemonId: 'azumarill',
        abilityId: 'thick-fat',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['waterfall'],
        selectedMoveId: 'waterfall',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(withHugePower.status).toBe('experimental-success');
    expect(withoutHugePower.status).toBe('experimental-success');
    expect(withHugePower.maxDamage).toBeGreaterThan(withoutHugePower.maxDamage ?? 0);
    expect(withHugePower.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'huge-power', direction: 'boost', label: '进攻特性：大力士' }),
    ]);
  });

  it('applies defensive immunities such as Flash Fire and reports an ability chip', () => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: 'houndoom',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['flare-blitz'],
        selectedMoveId: 'flare-blitz',
      }),
      defender: makeConfig({
        pokemonId: 'arcanine',
        abilityId: 'flash-fire',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.damageRolls).toEqual([0]);
    expect(result.possibleHkoText).toBe('无法造成伤害');
    expect(result.abilityEffects).toEqual([
      expect.objectContaining({
        side: 'defender',
        abilityId: 'flash-fire',
        direction: 'immunity',
        label: '防守特性：引火',
        text: '火属性招式无效',
      }),
    ]);
  });

  it.each([
    ['water-absorb', '储水', 'Water', '水属性招式无效', 'blastoise', 'hydro-pump', 'politoed'],
    ['volt-absorb', '蓄电', 'Electric', '电属性招式无效', 'pikachu', 'thunderbolt', 'jolteon'],
    ['lightning-rod', '避雷针', 'Electric', '电属性招式无效', 'pikachu', 'thunderbolt', 'raichu'],
    ['sap-sipper', '食草', 'Grass', '草属性招式无效', 'venusaur', 'energy-ball', 'azumarill'],
    ['earth-eater', '食土', 'Ground', '地面属性招式无效', 'garchomp', 'earthquake', 'orthworm'],
    ['levitate', '飘浮', 'Ground', '地面属性招式无效', 'garchomp', 'earthquake', 'rotom'],
  ])('reports type-immunity ability chips for %s', (abilityId, abilityName, _type, text, attackerId, moveId, defenderId) => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: attackerId,
        moveIds: [moveId],
        selectedMoveId: moveId,
      }),
      defender: makeConfig({
        pokemonId: defenderId,
        abilityId,
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.damageRolls).toEqual([0]);
    expect(result.possibleHkoText).toBe('无法造成伤害');
    expect(result.abilityEffects).toEqual([
      expect.objectContaining({
        side: 'defender',
        abilityId,
        direction: 'immunity',
        label: `防守特性：${abilityName}`,
        text,
      }),
    ]);
  });

  it('does not create false ability chips when the defender has no damage modifier', () => {
    const result = computeDamage({
      attacker: makeConfig({
        pokemonId: 'blastoise',
        moveIds: ['hydro-pump'],
        selectedMoveId: 'hydro-pump',
      }),
      defender: makeConfig({
        pokemonId: 'politoed',
        abilityId: 'damp',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.maxDamage).toBeGreaterThan(0);
    expect(result.abilityEffects).toEqual([]);
  });

  it('reports attacker item chips only when the item changes damage', () => {
    const withBlackBelt = computeDamage({
      attacker: makeConfig({
        pokemonId: 'arcanine',
        itemId: 'black-belt',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['close-combat'],
        selectedMoveId: 'close-combat',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const withChoiceScarf = computeDamage({
      attacker: makeConfig({
        pokemonId: 'arcanine',
        itemId: 'choice-scarf',
        nature: '固执',
        statPoints: { attack: 32 },
        moveIds: ['close-combat'],
        selectedMoveId: 'close-combat',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(withBlackBelt.status).toBe('experimental-success');
    expect(withChoiceScarf.status).toBe('experimental-success');
    expect(withBlackBelt.maxDamage).toBeGreaterThan(withChoiceScarf.maxDamage ?? 0);
    expect(withBlackBelt.itemEffects).toEqual([
      expect.objectContaining({
        side: 'attacker',
        itemId: 'black-belt',
        direction: 'boost',
        label: '进攻道具：黑带',
        text: '提升格斗属性招式威力。',
      }),
    ]);
    expect(withChoiceScarf.itemEffects).toEqual([]);
  });

  it('uses ability-changed move types for displayed type, STAB, weather, and chips', () => {
    const pixilate = computeDamage({
      attacker: makeConfig({
        pokemonId: 'gardevoir',
        formId: 'mega-gardevoir',
        abilityId: 'pixilate',
        nature: '内敛',
        statPoints: { specialAttack: 32 },
        moveIds: ['hyper-voice'],
        selectedMoveId: 'hyper-voice',
      }),
      defender: makeConfig({
        pokemonId: 'garchomp',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const liquidVoiceRain = computeDamage({
      attacker: makeConfig({
        pokemonId: 'primarina',
        abilityId: 'liquid-voice',
        nature: '内敛',
        statPoints: { specialAttack: 32 },
        moveIds: ['hyper-voice'],
        selectedMoveId: 'hyper-voice',
      }),
      defender: makeConfig({
        pokemonId: 'torkoal',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '雨天',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(pixilate.status).toBe('experimental-success');
    expect(pixilate.effectiveMoveType).toBe('Fairy');
    expect(pixilate.typeEffectiveness).toBe(2);
    expect(pixilate.stabMultiplier).toBe(1.5);
    expect(pixilate.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'pixilate', text: '一般招式变为妖精属性' }),
    ]);

    expect(liquidVoiceRain.status).toBe('experimental-success');
    expect(liquidVoiceRain.effectiveMoveType).toBe('Water');
    expect(liquidVoiceRain.typeEffectiveness).toBe(2);
    expect(liquidVoiceRain.stabMultiplier).toBe(1.5);
    expect(liquidVoiceRain.weatherMultiplier).toBe(1.5);
    expect(liquidVoiceRain.weatherText).toBe('雨天增强水属性');
    expect(liquidVoiceRain.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'liquid-voice', text: '声音招式变为水属性' }),
    ]);
  });

  it('applies Dragonize to Normal moves for Champions Mega Feraligatr', () => {
    const dragonize = computeDamage({
      attacker: makeConfig({
        pokemonId: 'feraligatr',
        formId: 'mega-feraligatr',
        abilityId: 'dragonize',
        itemId: 'feraligite',
        nature: '固执',
        statPoints: { attack: 32, speed: 32, hp: 2 },
        moveIds: ['body-slam'],
        selectedMoveId: 'body-slam',
      }),
      defender: makeConfig({
        pokemonId: 'garchomp',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const withoutAbility = computeDamage({
      attacker: {
        ...dragonize.attackerConfig!,
        abilityId: undefined,
      },
      defender: dragonize.defenderConfig!,
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(dragonize.status).toBe('experimental-success');
    expect(withoutAbility.status).toBe('experimental-success');
    expect(dragonize.effectiveMoveType).toBe('Dragon');
    expect(dragonize.stabMultiplier).toBe(1.5);
    expect(dragonize.typeEffectiveness).toBe(2);
    expect(dragonize.maxDamage).toBeGreaterThan(withoutAbility.maxDamage!);
    expect(dragonize.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'dragonize', direction: 'boost', text: '一般招式变为龙属性，威力提高 20%' }),
    ]);
  });

  it('uses calc Fairy Aura support for Champions Mega Floette Fairy moves', () => {
    const fairyAura = computeDamage({
      attacker: makeConfig({
        pokemonId: 'floette',
        formId: 'mega-floette',
        abilityId: 'fairy-aura',
        itemId: 'floettite',
        nature: '内敛',
        statPoints: { specialAttack: 32, speed: 32, hp: 2 },
        moveIds: ['moonblast'],
        selectedMoveId: 'moonblast',
      }),
      defender: makeConfig({
        pokemonId: 'garchomp',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const withoutAbility = computeDamage({
      attacker: {
        ...fairyAura.attackerConfig!,
        abilityId: undefined,
      },
      defender: fairyAura.defenderConfig!,
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(fairyAura.status).toBe('experimental-success');
    expect(withoutAbility.status).toBe('experimental-success');
    expect(fairyAura.effectiveMoveType).toBe('Fairy');
    expect(fairyAura.typeEffectiveness).toBe(2);
    expect(fairyAura.maxDamage).toBeGreaterThan(withoutAbility.maxDamage!);
    expect(fairyAura.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'fairy-aura', direction: 'boost', text: '妖精属性招式增强' }),
    ]);
  });

  it('treats Mega Sol Weather Ball as sunny Fire damage for Champions Mega Meganium', () => {
    const megaSol = computeDamage({
      attacker: makeConfig({
        pokemonId: 'meganium',
        formId: 'mega-meganium',
        abilityId: 'mega-sol',
        itemId: 'meganiumite',
        nature: '内敛',
        statPoints: { specialAttack: 32, speed: 32, hp: 2 },
        moveIds: ['weather-ball'],
        selectedMoveId: 'weather-ball',
      }),
      defender: makeConfig({
        pokemonId: 'scizor',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const withoutAbility = computeDamage({
      attacker: {
        ...megaSol.attackerConfig!,
        abilityId: undefined,
      },
      defender: megaSol.defenderConfig!,
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(megaSol.status).toBe('experimental-success');
    expect(withoutAbility.status).toBe('experimental-success');
    expect(megaSol.effectiveMoveType).toBe('Fire');
    expect(megaSol.typeEffectiveness).toBe(4);
    expect(megaSol.weatherMultiplier).toBe(1.5);
    expect(megaSol.weatherText).toBe('晴天增强火属性');
    expect(megaSol.maxDamage).toBeGreaterThan(withoutAbility.maxDamage!);
    expect(megaSol.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'mega-sol', direction: 'boost', text: '自身招式按晴天处理' }),
    ]);
  });

  it('blocks protectable moves when the defender is protected', () => {
    const result = computeDamage({
      ...defaults,
      battleType: 'singles',
      defenderProtected: true,
    });

    expect(result.status).toBe('experimental-success');
    expect(result.damageRolls).toEqual([0]);
    expect(result.minDamage).toBe(0);
    expect(result.maxDamage).toBe(0);
    expect(result.protectionMultiplier).toBe(0);
    expect(result.protectionText).toBe('防守方守住，招式被挡下');
    expect(result.possibleHkoText).toBe('无法造成伤害');
  });

  it('lets Unseen Fist contact moves ignore defender protection', () => {
    const unseenFist = computeDamage({
      attacker: makeConfig({
        pokemonId: 'golurk',
        formId: 'mega-golurk',
        abilityId: 'unseen-fist',
        itemId: 'golurkite',
        nature: '固执',
        statPoints: { attack: 32, hp: 32, speed: 2 },
        moveIds: ['shadow-punch'],
        selectedMoveId: 'shadow-punch',
      }),
      defender: makeConfig({
        pokemonId: 'garchomp',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      defenderProtected: true,
      attackStage: 0,
    });
    const withoutAbility = computeDamage({
      attacker: {
        ...unseenFist.attackerConfig!,
        abilityId: undefined,
      },
      defender: unseenFist.defenderConfig!,
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      defenderProtected: true,
      attackStage: 0,
    });

    expect(unseenFist.status).toBe('experimental-success');
    expect(withoutAbility.status).toBe('experimental-success');
    expect(unseenFist.maxDamage).toBeGreaterThan(0);
    expect(withoutAbility.maxDamage).toBe(0);
    expect(unseenFist.protectionMultiplier).toBe(1);
    expect(unseenFist.protectionText).toBe('无形拳无视守住');
    expect(unseenFist.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'unseen-fist', direction: 'boost', text: '接触招式无视守住' }),
    ]);
  });

  it('lets Piercing Drill contact moves hit protected targets for quarter damage', () => {
    const piercingDrill = computeDamage({
      attacker: makeConfig({
        pokemonId: 'excadrill',
        formId: 'mega-excadrill',
        abilityId: 'piercing-drill',
        itemId: 'excadrite',
        nature: '固执',
        statPoints: { attack: 32, speed: 32, hp: 2 },
        moveIds: ['stomping-tantrum'],
        selectedMoveId: 'stomping-tantrum',
      }),
      defender: makeConfig({
        pokemonId: 'torkoal',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      defenderProtected: true,
      attackStage: 0,
    });
    const unprotected = computeDamage({
      attacker: piercingDrill.attackerConfig!,
      defender: piercingDrill.defenderConfig!,
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      defenderProtected: false,
      attackStage: 0,
    });
    const withoutAbility = computeDamage({
      attacker: {
        ...piercingDrill.attackerConfig!,
        abilityId: undefined,
      },
      defender: piercingDrill.defenderConfig!,
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      defenderProtected: true,
      attackStage: 0,
    });

    expect(piercingDrill.status).toBe('experimental-success');
    expect(unprotected.status).toBe('experimental-success');
    expect(withoutAbility.status).toBe('experimental-success');
    expect(piercingDrill.minDamage).toBeGreaterThan(0);
    expect(piercingDrill.maxDamage).toBe(Math.floor(unprotected.maxDamage! * 0.25));
    expect(withoutAbility.maxDamage).toBe(0);
    expect(piercingDrill.protectionMultiplier).toBe(0.25);
    expect(piercingDrill.protectionText).toBe('Piercing Drill 穿透守住，伤害变为 1/4');
    expect(piercingDrill.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'piercing-drill', direction: 'boost', text: '守住中接触招式命中，伤害变为 1/4' }),
    ]);
  });

  it('reports direct boost and reduction ability chips with specific reasons', () => {
    const thickFat = computeDamage({
      attacker: makeConfig({
        pokemonId: 'houndoom',
        moveIds: ['flare-blitz'],
        selectedMoveId: 'flare-blitz',
      }),
      defender: makeConfig({
        pokemonId: 'venusaur',
        abilityId: 'thick-fat',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });
    const technician = computeDamage({
      attacker: makeConfig({
        pokemonId: 'scizor',
        abilityId: 'technician',
        moveIds: ['bullet-punch'],
        selectedMoveId: 'bullet-punch',
      }),
      defender: makeConfig({
        pokemonId: 'houndoom',
        nature: '认真',
        statPoints: {},
      }),
      battleType: 'singles',
      weather: '无天气',
      terrain: '无场地',
      attackStage: 0,
    });

    expect(thickFat.abilityEffects).toEqual([
      expect.objectContaining({ side: 'defender', abilityId: 'thick-fat', direction: 'reduction', text: '火属性伤害减半' }),
    ]);
    expect(technician.abilityEffects).toEqual([
      expect.objectContaining({ side: 'attacker', abilityId: 'technician', direction: 'boost', text: '低威力招式增强' }),
    ]);
  });

  it('returns blocked for Status moves', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: 'protect' }),
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReasons.some((r) => r.includes('变化'))).toBe(true);
  });

  it('returns invalid-input when selectedMoveId is missing', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: undefined }),
    });
    expect(result.status).toBe('invalid-input');
  });

  it('returns blocked when move is not in attacker learnset', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: 'hydro-pump', pokemonId: 'garchomp' }),
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReasons.some((r) => r.includes('可学会') || r.includes('learn'))).toBe(true);
  });

  it('derives spread damage in doubles from Champions targetScope', () => {
    // Earthquake is 对手全体 in doubles
    const garchompMoves = currentRuleMovesForPokemon('garchomp');
    const eq = garchompMoves.find((m) => m.id === 'earthquake');
    if (eq) {
      const result = computeDamage({
        ...defaults,
        attacker: makeConfig({ selectedMoveId: 'earthquake' }),
        battleType: 'doubles',
      });
      expect(result.status).toBe('experimental-success');
      expect(result.derivedSpreadDamage).toBe(true);
    }
  });

  it('does not derive spread damage in singles', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ selectedMoveId: 'earthquake' }),
      battleType: 'singles',
    });
    expect(result.status).toBe('experimental-success');
    expect(result.derivedSpreadDamage).toBe(false);
  });

  it('resolves known Mega form damage', () => {
    const gEntry = pokemon.find((p) => p.id === 'garchomp');
    if (gEntry?.megaForms.length) {
      const result = computeDamage({
        ...defaults,
        attacker: makeConfig({ formId: 'mega-garchomp', selectedMoveId: 'dragon-claw' }),
      });
      expect(result.status).toBe('experimental-success');
      expect(result.attackerBattleForm?.isMega).toBe(true);
    }
  });

  // ── Config builder tests ──

  it('buildCalcConfigFromTeamMember preserves member stats', () => {
    const member = {
      id: 'test-member-id',
      pokemonId: 'garchomp',
      abilityId: 'sand-veil',
      itemId: 'garchompite',
      moveIds: ['dragon-claw', 'earthquake'],
      nature: '固执',
      statPoints: { attack: 32, speed: 16, hp: 18 },
      level: 50 as const,
      notes: '',
      legalityStatus: 'needs-review' as const,
    };
    const cfg = buildCalcConfigFromTeamMember(member);
    expect(cfg.source).toBe('team-member');
    expect(cfg.sourceMemberId).toBe('test-member-id');
    expect(cfg.pokemonId).toBe('garchomp');
    expect(cfg.abilityId).toBe('sand-veil');
    expect(cfg.itemId).toBe('garchompite');
    expect(cfg.moveIds).toEqual(['dragon-claw', 'earthquake']);
    expect(cfg.nature).toBe('固执');
    expect(cfg.statPoints).toEqual({ attack: 32, speed: 16, hp: 18 });
    expect(cfg.level).toBe(50);
  });

  it('buildTemporaryCalcConfig starts temporary Pokemon at 0 SP', () => {
    const cfg = buildTemporaryCalcConfig({ pokemonId: 'garchomp', role: 'attacker', moveCategory: 'Physical' });
    expect(totalStatPoints(cfg.statPoints)).toBe(0);
    expect(cfg.statPoints).toEqual({});
    expect(cfg.statStages).toEqual({});
  });

  // ── SP validation ──

  it('rejects hp=32 + defense=32 + specialDefense=32 (total 96) as illegal', () => {
    const issues = validateStatPoints({ hp: 32, defense: 32, specialDefense: 32 });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.includes('96'))).toBe(true);
  });

  it('blocks when SP total exceeds 66', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ statPoints: { hp: 32, attack: 32, speed: 32 } }),
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReasons.some((r) => r.includes('99') || r.includes('总量'))).toBe(true);
  });

  it('blocks when single SP exceeds 32', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({ statPoints: { attack: 33, speed: 32, hp: 1 } }),
    });
    expect(result.status).toBe('blocked');
  });

  // ── Warnings ──

  it('documents the Gen9 formula and Champions parameter assumptions', () => {
    const result = computeDamage(defaults);
    expect(result.status).toBe('experimental-success');
    expect(result.warnings.some((w) => /Gen9/.test(w))).toBe(true);
    expect(result.assumptions.some((a) => /Champions move catalog|Champions 招式/.test(a))).toBe(true);
  });

  // ── Team member config is not overwritten by temporary preset ──

  it('team-member config keeps original SP/nature (not overwritten by preset)', () => {
    const member = {
      id: 'test-member-2',
      pokemonId: 'garchomp',
      abilityId: 'sand-veil',
      itemId: undefined,
      moveIds: ['dragon-claw'],
      nature: '固执',
      statPoints: { attack: 20, speed: 10, hp: 0 },
      level: 50 as const,
      notes: '',
      legalityStatus: 'needs-review' as const,
    };
    const cfg = buildCalcConfigFromTeamMember(member);
    expect(cfg.nature).toBe('固执');
    expect(cfg.statPoints.attack).toBe(20);
    expect(cfg.statPoints.speed).toBe(10);
  });

  // ── Result includes configs ──

  it('result includes attacker and defender configs', () => {
    const result = computeDamage(defaults);
    expect(result.attackerConfig?.pokemonId).toBe('garchomp');
    expect(result.defenderConfig?.pokemonId).toBe('torkoal');
    expect(result.attackerConfig?.nature).toBe('爽朗');
  });

  it('resolves Champions-added Mega form damage', () => {
    const result = computeDamage({
      ...defaults,
      attacker: makeConfig({
        pokemonId: 'starmie',
        formId: 'mega-starmie',
        abilityId: 'huge-power',
        itemId: 'starminite',
        moveIds: ['hydro-pump'],
        selectedMoveId: 'hydro-pump',
        statPoints: { specialAttack: 32, speed: 32, hp: 2 },
      }),
    });

    expect(result.status).toBe('experimental-success');
    expect(result.attackerBattleForm?.id).toBe('mega-starmie');
    expect(result.attackerBattleForm?.baseStats.attack).toBe(100);
  });
});
