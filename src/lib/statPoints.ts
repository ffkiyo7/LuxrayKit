import type { BaseStats, StatPoints } from '../types';

export const MAX_STAT_POINTS_PER_STAT = 32;
export const MAX_TOTAL_STAT_POINTS = 66;

export const statPointKeys: Array<keyof BaseStats> = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'];

/** The six stat names as every screen prints them, in `statPointKeys` order. */
export const statPointLabels: Record<(typeof statPointKeys)[number], string> = {
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  specialAttack: '特攻',
  specialDefense: '特防',
  speed: '速度',
};

export const statPointTotal = (statPoints: StatPoints) =>
  statPointKeys.reduce((total, key) => total + Math.max(0, Number(statPoints[key] ?? 0)), 0);

export const clampStatPointValue = (value: number) => Math.max(0, Math.min(MAX_STAT_POINTS_PER_STAT, Math.round(value || 0)));

export const clampStatPoints = (statPoints: StatPoints): StatPoints =>
  Object.fromEntries(statPointKeys.map((key) => [key, clampStatPointValue(statPoints[key] ?? 0)])) as StatPoints;

export const looksLikeLegacyEvStatPoints = (statPoints: StatPoints) =>
  statPointKeys.some((key) => Number(statPoints[key] ?? 0) > MAX_STAT_POINTS_PER_STAT);

export const migrateLegacyEvStatPoints = (statPoints: StatPoints): StatPoints => {
  if (!looksLikeLegacyEvStatPoints(statPoints)) return clampStatPoints(statPoints);

  return Object.fromEntries(
    statPointKeys.map((key) => {
      const value = Number(statPoints[key] ?? 0);
      return [key, clampStatPointValue(value / 8)];
    }),
  ) as StatPoints;
};
