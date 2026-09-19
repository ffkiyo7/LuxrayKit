import { ChevronRight } from 'lucide-react';
import { abilities as allAbilities, pokemon } from '../../data';
import type { CalcSideConfig } from '../../lib/damageAdapter';
import { findBattleForm } from '../../lib/pokemonForms';
import { Sprite } from '../../components/kit';
import { sideLabelText, type CalcSide } from './calcSummary';

/**
 * 05-01's side card. Picking a Pokémon and editing its build are two different actions, so the
 * sprite/name is the picker and the 「编辑」 foot — 02's 「编辑配置 ›」 entry, shrunk to the card —
 * is the editor. SP is off the card (owner call): it never fit on one line here.
 */
export function SideCard({
  config,
  side,
  onPick,
  onEdit,
}: {
  config: CalcSideConfig;
  side: CalcSide;
  onPick: () => void;
  onEdit: () => void;
}) {
  const entry = pokemon.find((candidate) => candidate.id === config.pokemonId);
  const battleForm = findBattleForm(entry?.id ?? '', config.formId) ?? (entry ? findBattleForm(entry.id, entry.id) : undefined);
  const ability = allAbilities.find((candidate) => candidate.id === config.abilityId);
  const name = battleForm?.chineseName ?? entry?.chineseName;
  const label = sideLabelText(side);

  return (
    <section className="min-w-0 flex-1 rounded-2xl bg-surface p-3.5" data-calc-side={side}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-textSecondary">{label}</p>
      {!name ? (
        <button aria-label={`选择${label}`} className="mt-2 block w-full text-left text-[15px] font-extrabold tracking-[-0.01em] text-chevron" type="button" onClick={onPick}>
          未选
        </button>
      ) : (
        <>
          <button aria-label={`选择${label} ${name}`} className="mt-2 flex w-full items-center gap-2.5 text-left" type="button" onClick={onPick}>
            <Sprite iconRef={battleForm?.iconRef ?? entry?.iconRef} label={name} size={48} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold tracking-[-0.01em]">{name}</span>
          </button>
          <div className="mt-2.5 flex flex-col gap-1">
            <span className="flex gap-2 text-[11px] font-semibold text-textSecondary">
              <span className="w-6 shrink-0">性格</span>
              <span className="min-w-0 flex-1 truncate text-textLabel">{config.nature}</span>
            </span>
            <span className="flex gap-2 text-[11px] font-semibold text-textSecondary">
              <span className="w-6 shrink-0">特性</span>
              <span className="min-w-0 flex-1 truncate text-textLabel">{ability?.chineseName ?? '未选'}</span>
            </span>
          </div>
          <button
            aria-label={`编辑${label}配置`}
            className="mt-2.5 flex h-9 w-full items-center justify-center gap-1 border-t border-[var(--hairline)] text-xs font-bold text-fnBlue"
            type="button"
            onClick={onEdit}
          >
            编辑
            <ChevronRight size={14} />
          </button>
        </>
      )}
    </section>
  );
}
