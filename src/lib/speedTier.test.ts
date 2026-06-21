import { describe, expect, it } from 'vitest';
import type { EnvironmentState } from '../data/environment';
import { speedTierSnapshots } from '../data/speedTiers';
import {
  buildOutspeedPlan,
  getScarfUsageRate,
  formatTierLabel,
  getSpeedAbilityProfile,
  groupTiersBySpeed,
  markerInsertIndex,
  resolveTierPokemon,
  type SpeedBuild,
} from './speedTier';

const rawTier = (speed: number, label: string, code: string, color: string, pokemon: Array<{ dexNo: number; form: string; japaneseName: string }>) => ({
  speed,
  label,
  code,
  color,
  count: pokemon.length,
  pokemon,
});

const current = (overrides: Partial<SpeedBuild> = {}): SpeedBuild => ({
  baseSpeed: 100,
  statPoints: 0,
  nature: 'neutral',
  scarf: false,
  speedAbility: false,
  tailwind: false,
  ...overrides,
});

describe('speed tier selectors', () => {
  it('returns the minimum sufficient SP for the first viable rung', () => {
    const plan = buildOutspeedPlan({ target: 152, current: current(), scarfEligible: false });

    expect(plan.status).toBe('suggestions');
    if (plan.status === 'suggestions') {
      expect(plan.primary.rung).toBe('investment');
      expect(plan.primary.build.nature).toBe('increased');
      expect(plan.primary.build.statPoints).toBe(20);
      expect(plan.primary.finalSpeed).toBe(154);
      expect(plan.safer?.build.statPoints).toBe(32);
    }
  });

  it('returns already and infeasible states without misleading suggestions', () => {
    expect(buildOutspeedPlan({ target: 150, current: current({ statPoints: 32 }), scarfEligible: false })).toMatchObject({
      status: 'already',
      gap: 2,
    });

    const impossible = buildOutspeedPlan({ target: 999, current: current({ baseSpeed: 20 }), scarfEligible: false });
    expect(impossible.status).toBe('infeasible');
    if (impossible.status === 'infeasible') expect(impossible.bestFinal).toBe(158);
  });

  it('gates scarf rungs at the selector boundary', () => {
    const target = 220;
    const withoutScarf = buildOutspeedPlan({ target, current: current(), scarfEligible: false });
    const withScarf = buildOutspeedPlan({ target, current: current(), scarfEligible: true });

    expect(withoutScarf.status).toBe('suggestions');
    expect(withScarf.status).toBe('suggestions');
    if (withoutScarf.status === 'suggestions' && withScarf.status === 'suggestions') {
      expect(withoutScarf.primary.rung).toBe('all');
      expect(withoutScarf.primary.build.scarf).toBe(false);
      expect(withScarf.primary.rung).toBe('scarf');
      expect(withScarf.primary.build.scarf).toBe(true);
    }
  });

  it('reads live choice scarf usage and recognizes supported abilities', () => {
    const environment = {
      pokemonUsage: {
        singles: [],
        doubles: [
          {
            pokemonId: 'staraptor',
            usageRate: 20,
            teamCount: 20,
            moveIds: [],
            itemIds: ['choice-scarf'],
            teammateIds: [],
            itemStats: [{ id: 'choice-scarf', usageRate: 18.4, teamCount: 10 }],
          },
        ],
      },
    } as EnvironmentState;

    expect(getScarfUsageRate(environment, 'staraptor', 'doubles')).toBe(18.4);
    expect(getScarfUsageRate(environment, 'staraptor', 'singles')).toBe(0);
    expect(getSpeedAbilityProfile('chlorophyll')).toMatchObject({ label: '叶绿素', requirement: '需晴天' });
    expect(getSpeedAbilityProfile('protosynthesis')).toBeUndefined();
  });

  it('uses the dex Chinese names for speed abilities', () => {
    // Must match the catalog: Swift Swim = 悠游自如 (not 急流游泳), Sand Rush = 拨沙.
    expect(getSpeedAbilityProfile('swift-swim')?.label).toBe('悠游自如');
    expect(getSpeedAbilityProfile('sand-rush')?.label).toBe('拨沙');
    expect(getSpeedAbilityProfile('slush-rush')?.label).toBe('拨雪');
    expect(getSpeedAbilityProfile('unburden')?.label).toBe('轻装');
  });
});

describe('speed tier pokemon form resolution', () => {
  it('resolves Rotom appliance forms to distinct icons instead of the base form', () => {
    const wash = resolveTierPokemon({ dexNo: 479, form: '02', japaneseName: 'ウォッシュロトム' });
    const heat = resolveTierPokemon({ dexNo: 479, form: '01', japaneseName: 'ヒートロトム' });
    expect(wash).toMatchObject({ matched: true, displayName: '清洗洛托姆' });
    expect(heat).toMatchObject({ matched: true, displayName: '加热洛托姆' });
    expect(wash.iconRef).not.toBe(heat.iconRef);
  });

  it('resolves every pokemon in the speed snapshots to a catalog asset', () => {
    const unresolved = speedTierSnapshots
      .flatMap((snapshot) => snapshot.tiers)
      .flatMap((tier) => tier.pokemon)
      .map(resolveTierPokemon)
      .filter((entry) => !entry.matched)
      .map((entry) => entry.displayName);
    expect([...new Set(unresolved)]).toEqual([]);
  });
});

describe('speed tier pokemon resolution', () => {
  it('matches by Japanese name, folding full-width latin to half-width', () => {
    const base = resolveTierPokemon({ dexNo: 26, form: '00', japaneseName: 'ライチュウ' });
    expect(base).toMatchObject({ matched: true, displayName: '雷丘' });

    // PokeDB uses full-width Ｘ; catalog uses half-width X.
    const mega = resolveTierPokemon({ dexNo: 26, form: '02', japaneseName: 'メガライチュウＸ' });
    expect(mega.matched).toBe(true);
    expect(mega.id).toBeDefined();
    expect(mega.displayName).toContain('雷丘');
  });

  it('falls back to the base dex number, then to the raw name when unmapped', () => {
    const byDex = resolveTierPokemon({ dexNo: 26, form: '99', japaneseName: '存在しない名前' });
    expect(byDex).toMatchObject({ matched: true, displayName: '雷丘' });

    const unmapped = resolveTierPokemon({ dexNo: 999999, form: '00', japaneseName: 'ナゾノモンスター' });
    expect(unmapped).toMatchObject({ matched: false, displayName: 'ナゾノモンスター' });
    expect(unmapped.id).toBeUndefined();
  });
});

describe('speed tier label formatting', () => {
  it('rewrites PokeDB labels to 种族X·性格 and normalizes modifiers', () => {
    expect(formatTierLabel('满速61族', '61')).toBe('种族61·满速');
    expect(formatTierLabel('极速110族 讲究围巾', '110')).toBe('种族110·极速 围巾');
    expect(formatTierLabel('极速105族 S+2', '105')).toBe('种族105·极速 Spd+2');
    expect(formatTierLabel('极限0速60族', '60')).toBe('种族60·极限0速');
  });
});

describe('speed tier grouping', () => {
  it('keeps same-speed variants distinct instead of collapsing them', () => {
    const groups = groupTiersBySpeed([
      rawTier(178, '极速110族', '110', '#ff6f61', [{ dexNo: 405, form: '00', japaneseName: 'レントラー' }]),
      rawTier(178, '满速126族', '126', '#6c8cff', [{ dexNo: 668, form: '02', japaneseName: 'メガカエンジシ' }]),
      rawTier(152, '满速100族', '100', '#6c8cff', [{ dexNo: 9, form: '00', japaneseName: 'カメックス' }]),
    ]);

    expect(groups.map((group) => group.speed)).toEqual([178, 152]);
    expect(groups[0].variants.map((variant) => variant.label)).toEqual(['极速110族', '满速126族']);
    expect(groups[0].pokemonCount).toBe(2);
  });

  it('places the marker slot right below every strictly-faster group', () => {
    const groups = [{ speed: 167 }, { speed: 156 }, { speed: 152 }, { speed: 145 }];
    expect(markerInsertIndex(groups, 154)).toBe(2);
    expect(markerInsertIndex(groups, 200)).toBe(0);
    expect(markerInsertIndex(groups, 167)).toBe(0);
    expect(markerInsertIndex(groups, 30)).toBe(4);
  });
});
