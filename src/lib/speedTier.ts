import { pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import type { SpeedTierSnapshot } from '../data/speedTiers';
import type { EnvironmentBattleType } from './environmentDataset';
import { calculateSpeed } from './calculations';
import { clampStatPointValue, MAX_STAT_POINTS_PER_STAT } from './statPoints';

export const CHOICE_SCARF_ID = 'choice-scarf';
export const SCARF_SUGGESTION_USAGE_THRESHOLD = 15;

type RawSpeedTier = SpeedTierSnapshot['tiers'][number];
type RawTierPokemon = RawSpeedTier['pokemon'][number];

export type ResolvedTierPokemon = {
  key: string;
  id?: string;
  pokemonId?: string;
  displayName: string;
  iconRef?: string;
  matched: boolean;
};

export type SpeedTierVariant = {
  label: string;
  displayLabel: string;
  code: string;
  color: string;
  pokemon: ResolvedTierPokemon[];
};

// Match longest nature prefix first so 极限0速 wins over 0速 / 极速.
const NATURE_PREFIXES = ['极限0速', '极速', '满速', '0速'];

// PokeDB label "极速110族 讲究围巾" -> "种族110·极速 围巾"; folds 讲究围巾→围巾 and
// the speed-stage shorthand S+1/S+2 → Spd+1/Spd+2 so it reads unambiguously.
export const formatTierLabel = (rawLabel: string, code: string) => {
  const nature = NATURE_PREFIXES.find((prefix) => rawLabel.startsWith(prefix)) ?? '';
  const modifier = rawLabel
    .slice(nature.length)
    .replace(/^\d+族\s*/, '')
    .replace(/讲究围巾/g, '围巾')
    .replace(/S\+(\d)/g, 'Spd+$1')
    .trim();
  const base = `种族${code}·${nature}`;
  return modifier ? `${base} ${modifier}` : base;
};

export type SpeedTierGroup = {
  speed: number;
  variants: SpeedTierVariant[];
  pokemonCount: number;
};

// PokeDB uses full-width latin (e.g. メガライチュウＸ) while our catalog uses
// half-width (メガライチュウX); NFKC folds them together so the name keys match.
const normalizeJapaneseName = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').trim();

// `pokemonId` is the base species id (forms point at their parent) so environment
// usage — which is keyed by species — can be looked up for any form.
type CatalogMatch = { id: string; pokemonId: string; chineseName: string; iconRef?: string };

let nameIndex: Map<string, CatalogMatch> | undefined;
let dexIndex: Map<number, CatalogMatch> | undefined;

// These PokeDB form codes are intentionally represented by the base catalog row
// in LuxrayKit. Keep the list explicit so unknown future forms never become
// misleading base-species avatars by accident.
const CATALOG_BACKED_FORM_FALLBACKS = new Set(['670-05']); // Floette-Eternal

const buildIndices = () => {
  const byName = new Map<string, CatalogMatch>();
  const byDex = new Map<number, CatalogMatch>();
  for (const entry of pokemon) {
    const base: CatalogMatch = { id: entry.id, pokemonId: entry.id, chineseName: entry.chineseName, iconRef: entry.iconRef };
    if (!byDex.has(entry.nationalDexNo)) byDex.set(entry.nationalDexNo, base);
    const key = normalizeJapaneseName(entry.japaneseName);
    if (key && !byName.has(key)) byName.set(key, base);
    for (const form of [...entry.forms, ...entry.megaForms]) {
      const formKey = normalizeJapaneseName(form.japaneseName);
      if (formKey && !byName.has(formKey)) {
        byName.set(formKey, { id: form.id, pokemonId: entry.id, chineseName: form.chineseName, iconRef: form.iconRef });
      }
    }
  }
  nameIndex = byName;
  dexIndex = byDex;
};

export const resolveTierPokemon = (ref: RawTierPokemon): ResolvedTierPokemon => {
  if (!nameIndex || !dexIndex) buildIndices();
  const key = `${ref.dexNo}-${ref.form}`;
  const nameMatch = nameIndex?.get(normalizeJapaneseName(ref.japaneseName));
  const canUseDexFallback = ref.form === '00' || CATALOG_BACKED_FORM_FALLBACKS.has(key);
  const match = nameMatch ?? (canUseDexFallback ? dexIndex?.get(ref.dexNo) : undefined);
  if (match) return { key, id: match.id, pokemonId: match.pokemonId, displayName: match.chineseName, iconRef: match.iconRef, matched: true };
  return { key, displayName: ref.japaneseName, matched: false };
};

// Collapse chips that resolve to the same catalog entry (e.g. Aegislash shield &
// blade are both 坚盾剑怪 at the same tier) so a variant never lists one mon twice.
const dedupeResolved = (list: ResolvedTierPokemon[]) => {
  const seen = new Set<string>();
  return list.filter((entry) => {
    const dedupeKey = entry.id ?? entry.key;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
};

// Same speed value can hold several base-tier × nature variants (e.g. 178 =
// 极速110族 and 满速126族). PokeDB shows each variant separately, so we keep them
// distinct instead of collapsing to one label.
export const groupTiersBySpeed = (tiers: RawSpeedTier[]): SpeedTierGroup[] => {
  const groups = new Map<number, SpeedTierGroup>();
  for (const tier of tiers) {
    const pokemon = dedupeResolved(tier.pokemon.map(resolveTierPokemon).filter((entry) => entry.matched));
    if (pokemon.length === 0) continue;
    const variant: SpeedTierVariant = {
      label: tier.label,
      displayLabel: formatTierLabel(tier.label, tier.code),
      code: tier.code,
      color: tier.color,
      pokemon,
    };
    const existing = groups.get(tier.speed);
    if (existing) {
      existing.variants.push(variant);
      existing.pokemonCount += variant.pokemon.length;
    } else {
      groups.set(tier.speed, { speed: tier.speed, variants: [variant], pokemonCount: variant.pokemon.length });
    }
  }
  return [...groups.values()].sort((left, right) => right.speed - left.speed);
};

// When one speed value holds several variants, surface the variant whose pokemon
// is most used in the current environment first (axis label/avatars + sheet order).
// Variants with no usage data score 0, so absent data degrades to original order.
export const sortVariantsByUsage = (
  groups: SpeedTierGroup[],
  usageOf: (pokemonId: string) => number,
): SpeedTierGroup[] => {
  const variantScore = (variant: SpeedTierVariant) =>
    variant.pokemon.reduce((max, entry) => Math.max(max, entry.pokemonId ? usageOf(entry.pokemonId) : 0), 0);
  return groups.map((group) => {
    if (group.variants.length < 2) return group;
    const scored = group.variants.map((variant, index) => ({ variant, index, score: variantScore(variant) }));
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return { ...group, variants: scored.map((entry) => entry.variant) };
  });
};

// Rows are ordered fastest -> slowest; the user marker takes its own slot right
// below every strictly-faster group so it never overlaps a tier's text.
export const markerInsertIndex = (groups: Array<{ speed: number }>, finalSpeed: number) =>
  groups.filter((group) => group.speed > finalSpeed).length;

export type SpeedNature = 'decreased' | 'neutral' | 'increased';

export type SpeedAbilityProfile = {
  id: 'swift-swim' | 'chlorophyll' | 'slush-rush' | 'sand-rush' | 'unburden';
  label: string;
  requirement: string;
  weatherDependent: boolean;
};

const SPEED_ABILITY_PROFILES: Record<SpeedAbilityProfile['id'], SpeedAbilityProfile> = {
  'swift-swim': { id: 'swift-swim', label: '悠游自如', requirement: '需雨天', weatherDependent: true },
  chlorophyll: { id: 'chlorophyll', label: '叶绿素', requirement: '需晴天', weatherDependent: true },
  'slush-rush': { id: 'slush-rush', label: '拨雪', requirement: '需下雪', weatherDependent: true },
  'sand-rush': { id: 'sand-rush', label: '拨沙', requirement: '需沙暴', weatherDependent: true },
  unburden: { id: 'unburden', label: '轻装', requirement: '需失去道具', weatherDependent: false },
};

export type SpeedBuild = {
  baseSpeed: number;
  statPoints: number;
  nature: SpeedNature;
  scarf: boolean;
  speedAbility: boolean;
  tailwind: boolean;
};

export type OutspeedPlanOption = {
  rung: 'investment' | 'scarf' | 'ability' | 'scarf-tailwind' | 'all';
  title: string;
  build: SpeedBuild;
  finalSpeed: number;
  margin: number;
  deltas: string[];
};

export type OutspeedPlan =
  | { status: 'already'; gap: number; currentFinal: number }
  | { status: 'infeasible'; bestFinal: number; currentFinal: number }
  | {
      status: 'suggestions';
      currentFinal: number;
      primary: OutspeedPlanOption;
      safer?: OutspeedPlanOption;
    };

const natureCalculationLabel: Record<SpeedNature, string> = {
  decreased: '减速(-速)',
  neutral: '无修正',
  increased: '加速(+速)',
};

export const speedNatureLabel: Record<SpeedNature, string> = {
  decreased: '减速',
  neutral: '无修正',
  increased: '加速',
};

export const calculateSpeedForBuild = (build: SpeedBuild) =>
  calculateSpeed(build.baseSpeed, build.statPoints, 50, natureCalculationLabel[build.nature], {
    scarf: build.scarf,
    speedAbility: build.speedAbility,
    tailwind: build.tailwind,
  });

export const getSpeedAbilityProfile = (abilityId?: string) =>
  abilityId && abilityId in SPEED_ABILITY_PROFILES
    ? SPEED_ABILITY_PROFILES[abilityId as SpeedAbilityProfile['id']]
    : undefined;

export const getPokemonSpeedAbility = (abilityIds: string[]) =>
  abilityIds.map((abilityId) => getSpeedAbilityProfile(abilityId)).find((profile): profile is SpeedAbilityProfile => Boolean(profile));

export const getScarfUsageRate = (
  environment: EnvironmentState,
  pokemonId: string,
  battleType: EnvironmentBattleType,
) =>
  environment.pokemonUsage[battleType]
    .find((usage) => usage.pokemonId === pokemonId)
    ?.itemStats?.find((item) => item.id === CHOICE_SCARF_ID)?.usageRate ?? 0;

export const getPokemonUsageRate = (
  environment: EnvironmentState,
  pokemonId: string,
  battleType: EnvironmentBattleType,
) => environment.pokemonUsage[battleType].find((usage) => usage.pokemonId === pokemonId)?.usageRate ?? 0;

const deltasFromCurrent = (
  current: SpeedBuild,
  next: SpeedBuild,
  ability?: SpeedAbilityProfile,
) => {
  const tokens: string[] = [];
  if (next.nature !== current.nature || next.statPoints !== current.statPoints) {
    const spread: string[] = [];
    if (next.nature !== current.nature) {
      const natureKind = next.nature === 'increased' ? '加速' : next.nature === 'neutral' ? '无修正' : '减速';
      spread.push(`修改性格为${natureKind}类`);
    }
    if (next.statPoints !== current.statPoints) spread.push(`SP${next.statPoints}`);
    tokens.push(spread.join(' '));
  }
  if (next.scarf && !current.scarf) tokens.push('围巾');
  if (next.speedAbility && !current.speedAbility) tokens.push(ability?.label ?? '速度特性');
  if (next.tailwind && !current.tailwind) tokens.push('顺风');
  return tokens.length ? tokens : ['保持当前配置'];
};

type Rung = Pick<OutspeedPlanOption, 'rung' | 'title'> & {
  scarf?: boolean;
  speedAbility?: boolean;
  tailwind?: boolean;
};

const uniqueNatureOrder = (current: SpeedNature) =>
  [current, 'neutral', 'increased'].filter(
    (nature, index, values): nature is SpeedNature => values.indexOf(nature) === index,
  );

const sameBuild = (left: SpeedBuild, right: SpeedBuild) =>
  left.statPoints === right.statPoints &&
  left.nature === right.nature &&
  left.scarf === right.scarf &&
  left.speedAbility === right.speedAbility &&
  left.tailwind === right.tailwind;

export const buildOutspeedPlan = ({
  target,
  current,
  scarfEligible,
  speedAbility,
}: {
  target: number;
  current: SpeedBuild;
  scarfEligible: boolean;
  speedAbility?: SpeedAbilityProfile;
}): OutspeedPlan => {
  const normalizedCurrent = { ...current, statPoints: clampStatPointValue(current.statPoints) };
  const currentFinal = calculateSpeedForBuild(normalizedCurrent);
  if (currentFinal > target) return { status: 'already', gap: currentFinal - target, currentFinal };

  const canSuggestScarf = scarfEligible || normalizedCurrent.scarf;
  const canUseAbility = Boolean(speedAbility || normalizedCurrent.speedAbility);
  const rungs: Rung[] = [
    { rung: 'investment', title: '仅调整 SP / 性格' },
    ...(canSuggestScarf ? [{ rung: 'scarf', title: '加围巾', scarf: true } as const] : []),
    ...(canUseAbility ? [{ rung: 'ability', title: '触发速度特性', speedAbility: true } as const] : []),
    ...(canSuggestScarf ? [{ rung: 'scarf-tailwind', title: '围巾 + 顺风', scarf: true, tailwind: true } as const] : []),
    {
      rung: 'all',
      title: '全部可用手段',
      scarf: canSuggestScarf,
      speedAbility: canUseAbility,
      tailwind: true,
    },
  ];

  const seenBuilds: SpeedBuild[] = [];
  let primary: OutspeedPlanOption | undefined;

  for (const rung of rungs) {
    for (const nature of uniqueNatureOrder(normalizedCurrent.nature)) {
      for (let statPoints = normalizedCurrent.statPoints; statPoints <= MAX_STAT_POINTS_PER_STAT; statPoints += 1) {
        const build: SpeedBuild = {
          ...normalizedCurrent,
          statPoints,
          nature,
          scarf: normalizedCurrent.scarf || Boolean(rung.scarf),
          speedAbility: normalizedCurrent.speedAbility || Boolean(rung.speedAbility),
          tailwind: normalizedCurrent.tailwind || Boolean(rung.tailwind),
        };
        if (seenBuilds.some((seen) => sameBuild(seen, build))) continue;
        const finalSpeed = calculateSpeedForBuild(build);
        if (finalSpeed <= target) continue;
        primary = {
          rung: rung.rung,
          title: rung.title,
          build,
          finalSpeed,
          margin: finalSpeed - target,
          deltas: deltasFromCurrent(normalizedCurrent, build, speedAbility),
        };
        break;
      }
      if (primary) break;
    }
    if (primary) break;
    seenBuilds.push({
      ...normalizedCurrent,
      statPoints: MAX_STAT_POINTS_PER_STAT,
      nature: 'increased',
      scarf: normalizedCurrent.scarf || Boolean(rung.scarf),
      speedAbility: normalizedCurrent.speedAbility || Boolean(rung.speedAbility),
      tailwind: normalizedCurrent.tailwind || Boolean(rung.tailwind),
    });
  }

  if (!primary) {
    const bestBuild: SpeedBuild = {
      ...normalizedCurrent,
      statPoints: MAX_STAT_POINTS_PER_STAT,
      nature: 'increased',
      scarf: normalizedCurrent.scarf || canSuggestScarf,
      speedAbility: normalizedCurrent.speedAbility || canUseAbility,
      tailwind: true,
    };
    return { status: 'infeasible', bestFinal: calculateSpeedForBuild(bestBuild), currentFinal };
  }

  const saferBuild: SpeedBuild = {
    ...primary.build,
    statPoints: MAX_STAT_POINTS_PER_STAT,
    nature: primary.build.nature === 'decreased' ? 'neutral' : primary.build.nature,
  };
  const saferFinal = calculateSpeedForBuild(saferBuild);
  const safer =
    saferFinal - primary.finalSpeed >= 3
      ? {
          ...primary,
          title: primary.build.nature === 'increased' ? '极速兜底' : '满速兜底',
          build: saferBuild,
          finalSpeed: saferFinal,
          margin: saferFinal - target,
          deltas: deltasFromCurrent(normalizedCurrent, saferBuild, speedAbility),
        }
      : undefined;

  return { status: 'suggestions', currentFinal, primary, safer };
};
