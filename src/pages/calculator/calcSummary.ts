import { totalStatPoints, type CalcSideConfig } from '../../lib/damageAdapter';
import { clampStatPointValue, MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS } from '../../lib/statPoints';
import type { Move as AppMove, StatPoints, TeamMember } from '../../types';

/** Text shared by the calculator page and the parts it split into. */

export type CalcSide = 'attacker' | 'defender';

export const STAT_LABELS: Array<{ key: keyof StatPoints; label: string }> = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'specialAttack', label: '特攻' },
  { key: 'specialDefense', label: '特防' },
  { key: 'speed', label: '速度' },
];

export const STAGE_LABELS: Array<{ key: keyof NonNullable<CalcSideConfig['statStages']>; label: string }> = [
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'specialAttack', label: '特攻' },
  { key: 'specialDefense', label: '特防' },
  { key: 'speed', label: '速度' },
];

const STAT_ABBREVIATIONS: Record<keyof StatPoints, string> = {
  hp: 'HP', attack: 'ATK', defense: 'DEF', specialAttack: 'SPA', specialDefense: 'SPD', speed: 'SPE',
};

/** Invested SP in the series' shorthand, stat order: 「32ATK 32SPE」. */
export const statPointSpreadText = (statPoints: StatPoints) => {
  const parts = STAT_LABELS.map(({ key }) => ({ key, value: clampStatPointValue(statPoints[key] ?? 0) }))
    .filter((entry) => entry.value > 0)
    .map((entry) => `${entry.value}${STAT_ABBREVIATIONS[entry.key]}`);
  return parts.length > 0 ? parts.join(' ') : '0 SP';
};

export const sideLabelText =(side: CalcSide) => (side === 'attacker' ? '进攻方' : '防守方');

const investedStats = (statPoints: StatPoints) =>
  STAT_LABELS.map(({ key, label }) => ({ label, value: clampStatPointValue(statPoints[key] ?? 0) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

/** 05-04's two-column team card carries only the two heaviest stats. */
export const memberPickLine = (member: TeamMember) => {
  const invested = investedStats(member.statPoints).slice(0, 2);
  if (invested.length === 0) return member.nature;
  return invested.map((entry) => `${entry.label} ${entry.value}`).join(' / ');
};

/** `power` overrides the catalog figure when the calculator knows the effective one (扫墓's tier, terrain). */
export const moveMetaLine = (move: AppMove, withAccuracy = false, power = move.power) => {
  const category = move.category === 'Physical' ? '物理' : move.category === 'Special' ? '特殊' : '变化';
  const powerText = power ? `威力 ${power}` : undefined;
  const accuracy = withAccuracy && move.accuracy ? `命中 ${move.accuracy}` : undefined;
  return [move.type, category, powerText, accuracy].filter(Boolean).join(' · ');
};

/** Overflow rows for the result card (N05-12): one per breached limit, per side. */
export const statPointOverflows = (config: CalcSideConfig, side: CalcSide) => {
  const rows: Array<{ label: string; note: string }> = [];
  const total = totalStatPoints(config.statPoints);
  if (total > MAX_TOTAL_STAT_POINTS) {
    rows.push({ label: `${sideLabelText(side)} 总计 ${total}/${MAX_TOTAL_STAT_POINTS}`, note: `超 ${total - MAX_TOTAL_STAT_POINTS} 点` });
  }
  for (const { key, label } of STAT_LABELS) {
    const value = Number(config.statPoints[key] ?? 0);
    if (value > MAX_STAT_POINTS_PER_STAT) {
      rows.push({ label: `${sideLabelText(side)} ${label} ${value}`, note: `单项上限 ${MAX_STAT_POINTS_PER_STAT}` });
    }
  }
  return rows;
};
