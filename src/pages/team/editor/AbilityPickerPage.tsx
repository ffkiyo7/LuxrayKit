import { Check } from 'lucide-react';
import type { EnvironmentReferenceUsage } from '../../../lib/environmentDataset';
import type { Ability } from '../../../types';
import { PickerPage } from './PickerPage';

/** 03-10 — abilities come from the species, so the page is a plain list with no search. */
export function AbilityPickerPage({
  pokemonName,
  selectedAbilityId,
  options,
  environmentStats,
  onPick,
  onBack,
}: {
  pokemonName: string;
  selectedAbilityId?: string;
  options: Ability[];
  environmentStats?: EnvironmentReferenceUsage[];
  onPick: (abilityId: string) => void;
  onBack: () => void;
}) {
  const usageRates = new Map((environmentStats ?? []).map((stat) => [stat.id, stat.usageRate]));

  return (
    <PickerPage
      backLabel="返回编辑配置"
      subtitle={`${pokemonName}可选 ${options.length} 个`}
      title="特性"
      onBack={onBack}
    >
      <div className="px-6 pt-[22px]">
        {options.map((ability, index) => {
          const selected = ability.id === selectedAbilityId;
          const usage = usageRates.get(ability.id);
          return (
            <button
              key={ability.id}
              className={`flex w-full items-start gap-3 py-4 text-left ${selected ? 'lk-row-active -mx-6 px-6' : ''} ${
                index < options.length - 1 ? 'border-b border-[var(--hairline)]' : ''
              }`}
              type="button"
              onClick={() => onPick(ability.id)}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`text-[17px] tracking-[-0.01em] ${selected ? 'font-extrabold text-textPrimary' : 'font-bold'}`}>
                    {ability.chineseName}
                  </span>
                  {usage !== undefined && (
                    <span className={`text-[11px] font-bold tabular-nums ${selected ? 'text-textLabel' : 'text-textSecondary'}`}>
                      {usage.toFixed(1)}%
                    </span>
                  )}
                </span>
                <span className={`mt-1.5 block text-[13px] font-semibold leading-[18px] ${selected ? 'text-textLabel' : 'text-textSecondary'}`}>
                  {ability.effectSummary}
                </span>
              </span>
              {selected && <Check className="mt-1 shrink-0 text-textPrimary" size={18} />}
            </button>
          );
        })}
      </div>
    </PickerPage>
  );
}
