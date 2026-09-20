import { Pencil } from 'lucide-react';
import { abilities as allAbilities, pokemon } from '../../data';
import type { CalcSideConfig } from '../../lib/damageAdapter';
import { findBattleForm } from '../../lib/pokemonForms';
import { SpriteDisc } from '../../components/kit';
import { sideLabelText, type CalcSide } from './calcSummary';

/**
 * 05-01's side card. Picking a Pokémon and editing its build are two different actions, so the
 * sprite/name is the picker and the corner pencil is the editor. SP is off the card (owner call):
 * it never fit on one line here.
 *
 * Owner call 2026-09: the half-card is ~115px wide inside its padding at 390, and a 48px sprite
 * beside the name left 57px for it — three characters of a five-character name. The sprite moved
 * onto 04-01's coin at 30px and the name dropped to 13px, which buys the name back 20px; the
 * 「编辑」 foot and its hairline became a corner icon, which buys back a 46px-tall row. Names past
 * ~6 characters (every 「（…的样子）」 form) still truncate — that needs a base-name-plus-badge
 * treatment, not more width.
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
    <section className="relative min-w-0 flex-1 rounded-2xl bg-surface p-3.5" data-calc-side={side}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-textSecondary">{label}</p>
      {!name ? (
        <button aria-label={`选择${label}`} className="mt-2 block w-full text-left text-[15px] font-extrabold tracking-[-0.01em] text-chevron" type="button" onClick={onPick}>
          未选
        </button>
      ) : (
        <>
          {/* Absolute so it keeps a 36px target without pushing the label row down, and a sibling
              of the picker rather than a child of it — a button inside a button never fires. */}
          <button
            aria-label={`编辑${label}配置`}
            className="absolute right-[5px] top-[5px] grid h-9 w-9 place-items-center rounded-full text-chevron"
            type="button"
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
          <button aria-label={`选择${label} ${name}`} className="mt-[15px] flex w-full items-center gap-2 text-left" type="button" onClick={onPick}>
            <SpriteDisc iconRef={battleForm?.iconRef ?? entry?.iconRef} label={name} size={30} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold tracking-[-0.01em]">{name}</span>
          </button>
          <div className="mt-3 flex flex-col gap-1">
            <span className="flex gap-2 text-[11px] font-semibold text-textSecondary">
              <span className="w-6 shrink-0">性格</span>
              <span className="min-w-0 flex-1 truncate text-textLabel">{config.nature}</span>
            </span>
            <span className="flex gap-2 text-[11px] font-semibold text-textSecondary">
              <span className="w-6 shrink-0">特性</span>
              <span className="min-w-0 flex-1 truncate text-textLabel">{ability?.chineseName ?? '未选'}</span>
            </span>
          </div>
        </>
      )}
    </section>
  );
}
