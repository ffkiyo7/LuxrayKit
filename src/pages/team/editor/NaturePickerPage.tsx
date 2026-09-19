import { Check } from 'lucide-react';
import { Fragment } from 'react';
import { currentRuleNatureOptions } from '../../../data';
import { calculateBattleStats } from '../../../lib/calculations';
import type { EnvironmentReferenceUsage } from '../../../lib/environmentDataset';
import type { BaseStats, StatPoints } from '../../../types';
import { PickerPage } from './PickerPage';

/**
 * 03-11 — 環境常用 on top, then the 5×5 grid the series itself uses: a row is the stat the
 * nature raises, a column the one it lowers, and the diagonal is the five neutral natures.
 */

type NatureOption = (typeof currentRuleNatureOptions)[number];

const gridStats: Array<{ label: string; short: string; key: keyof BaseStats }> = [
  { label: '攻击', short: '攻', key: 'attack' },
  { label: '防御', short: '防', key: 'defense' },
  { label: '特攻', short: '特攻', key: 'specialAttack' },
  { label: '特防', short: '特防', key: 'specialDefense' },
  { label: '速度', short: '速', key: 'speed' },
];

const neutralNatures = currentRuleNatureOptions.filter((option) => option.neutral);

// The catalog pins the option list with `as const`, so read the two labels through a widening
// accessor rather than indexing a readonly tuple that is empty for the neutral natures.
const raised = (option: NatureOption) => (option.up as readonly string[])[0];
const lowered = (option: NatureOption) => (option.down as readonly string[])[0];

const natureAt = (up: string, down: string): NatureOption | undefined =>
  currentRuleNatureOptions.find((option) => !option.neutral && raised(option) === up && lowered(option) === down);

export function NatureEffect({ option, muted }: { option?: NatureOption; muted?: boolean }) {
  if (!option || option.neutral) return <span className={muted ? 'text-textSecondary' : 'text-textLabel'}>无能力修正</span>;
  return (
    <>
      {raised(option)}
      <span className="text-data">↑</span> {lowered(option)}
      <span className="text-textSecondary">↓</span>
    </>
  );
}

export function NaturePickerPage({
  nature,
  baseStats,
  statPoints,
  environmentStats,
  onPick,
  onBack,
}: {
  nature: string;
  baseStats: BaseStats;
  statPoints: StatPoints;
  environmentStats?: EnvironmentReferenceUsage[];
  onPick: (nature: string) => void;
  onBack: () => void;
}) {
  const current = currentRuleNatureOptions.find((option) => nature.includes(option.id));
  const stats = calculateBattleStats(baseStats, statPoints, 50, nature);
  const usageRates = new Map((environmentStats ?? []).map((stat) => [stat.id, stat.usageRate]));
  const common = currentRuleNatureOptions
    .filter((option) => usageRates.has(option.id))
    .sort((a, b) => (usageRates.get(b.id) ?? 0) - (usageRates.get(a.id) ?? 0));

  const movedStats = current && !current.neutral ? [raised(current), lowered(current)] : [];

  return (
    <PickerPage
      backLabel="返回编辑配置"
      subtitle={
        current && !current.neutral
          ? `当前 ${current.id} · ${raised(current)}提升 / ${lowered(current)}下降`
          : `当前 ${nature} · 无能力修正`
      }
      title="性格"
      onBack={onBack}
    >
      {movedStats.length > 0 && (
        <div className="flex gap-2.5 px-6 pt-3.5">
          {movedStats.map((label, index) => {
            const entry = gridStats.find((candidate) => candidate.label === label);
            if (!entry) return null;
            return (
              <div key={label} className="flex h-[60px] min-w-0 flex-1 flex-col justify-center rounded-[14px] bg-surface px-3.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-textSecondary">{label}</span>
                <span
                  className={`mt-[3px] text-[17px] font-extrabold tracking-[-0.01em] tabular-nums ${
                    index === 0 ? 'text-data' : 'text-textSecondary'
                  }`}
                >
                  {stats[entry.key]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {common.length > 0 && (
        <section className="px-6 pt-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">环境常用</p>
          <div className="mt-1.5">
            {common.map((option, index) => {
              const selected = option.id === current?.id;
              return (
                <button
                  key={option.id}
                  className={`flex h-[60px] items-center gap-3 ${selected ? 'lk-row-active -mx-6 w-[calc(100%+3rem)] px-6' : 'w-full'} ${
                    index < common.length - 1 ? 'border-b border-[var(--hairline)]' : ''
                  }`}
                  type="button"
                  onClick={() => onPick(option.id)}
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-[9px] text-left">
                    <span className={`text-[17px] tracking-[-0.01em] ${selected ? 'font-extrabold text-textPrimary' : 'font-bold'}`}>
                      {option.id}
                    </span>
                    <span className={`text-xs font-bold ${selected ? 'text-textLabel' : 'text-textSecondary'}`}>
                      <NatureEffect muted={!selected} option={option} />
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs font-bold tabular-nums ${selected ? 'text-textLabel' : 'text-textSecondary'}`}>
                    {(usageRates.get(option.id) ?? 0).toFixed(1)}%
                  </span>
                  {selected && <Check className="shrink-0 text-textPrimary" size={18} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="px-6 pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">
            全部 {currentRuleNatureOptions.length} 项
          </p>
          <span className="shrink-0 text-xs font-semibold text-textSecondary">
            行 <span className="text-data">↑</span> 提升 · 列 <span className="text-textLabel">↓</span> 下降
          </span>
        </div>
        <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: '34px repeat(5, minmax(0, 1fr))' }}>
          <span />
          {gridStats.map((stat) => (
            <span key={`head-${stat.key}`} className="grid h-[22px] place-items-center text-[10px] font-bold text-textSecondary">
              {stat.short}
            </span>
          ))}
          {gridStats.map((up, rowIndex) => (
            <Fragment key={`row-${up.key}`}>
              <span
                className={`grid place-items-center text-[10px] font-bold ${
                  current && !current.neutral && raised(current) === up.label ? 'text-data' : 'text-textSecondary'
                }`}
              >
                {up.short}
              </span>
              {gridStats.map((down, columnIndex) => {
                const neutral = rowIndex === columnIndex;
                const option = neutral ? neutralNatures[rowIndex] : natureAt(up.label, down.label);
                if (!option) return <span key={`${up.key}-${down.key}`} />;
                const selected = option.id === current?.id;
                return (
                  <button
                    key={`${up.key}-${down.key}`}
                    className={`grid h-[46px] place-items-center rounded-[10px] text-[13px] ${
                      selected
                        ? 'lk-nature-cell-on font-extrabold tracking-[-0.01em] text-textPrimary'
                        : neutral
                          ? 'bg-sunken font-semibold text-textSecondary'
                          : 'bg-surface font-semibold text-textLabel'
                    }`}
                    type="button"
                    onClick={() => onPick(option.id)}
                  >
                    {option.id}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </section>
    </PickerPage>
  );
}
