import { ChevronLeft, ChevronRight, Gauge, Info, MoreHorizontal, Swords, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { abilities, currentRuleNatureOptions, currentRuleSet, items, moves, pokemon } from '../../data';
import type { EnvironmentState } from '../../data/environment';
import { currentRuleMovesForPokemon, currentRuleSelectableItemsForPokemon } from '../../lib/currentRuleCatalog';
import { evaluateMemberLegality } from '../../lib/legality';
import { findBattleForm, toBaseFormView, toMegaFormView } from '../../lib/pokemonForms';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointTotal } from '../../lib/statPoints';
import { rosterSpeciesIds } from '../../lib/teamComposition';
import type { Team, TeamMember } from '../../types';
import { PokemonPicker } from '../../components/PokemonPicker';
import { useHistoryLayer } from '../../hooks/useHistoryLayer';
import { auraStyle, PageHeader, Sprite, TypeDot } from '../../components/kit';
import { typeLabels } from '../../components/ui';
import { AbilityPickerPage } from './editor/AbilityPickerPage';
import { ConfirmRemoveMemberSheet, DiscardChangesSheet } from './editor/EditorSheets';
import { FormPickerPage } from './editor/FormPickerPage';
import { ItemPickerPage } from './editor/ItemPickerPage';
import { NatureEffect, NaturePickerPage } from './editor/NaturePickerPage';
import { MovePickerPage } from './editor/MovePickerPage';
import { RoundIconButton } from './editor/PickerPage';
import { StatWheel, type StatKey } from './editor/StatWheel';
import { applyMemberEdit, draftChanges, memberHoldingItem, NO_ITEM_LABEL, type StagedItemTransfer } from './editor/memberDraft';

/**
 * 03 编辑配置 — a whole page, not an overlay. Everything it touches is staged in `draft`
 * (including an item transfer that reaches a teammate) and written in one go by 保存配置;
 * 返回 is 取消, and asks once when there is something to throw away (N03-12).
 */

type EditorView =
  | { kind: 'editor' }
  | { kind: 'move'; slot: number }
  | { kind: 'item' }
  | { kind: 'ability' }
  | { kind: 'nature' }
  | { kind: 'form' };

/** One row of the ⋯ menu anchored under the editor's top-right button. */
function EditorMenuRow({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-[46px] w-full items-center gap-3 text-left text-[15px] font-bold disabled:opacity-40 ${
        danger ? 'text-danger' : 'text-textPrimary'
      }`}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      <span className="inline-flex shrink-0">{icon}</span>
      {label}
    </button>
  );
}

/** 03-01's 64px labelled row: 「道具 / 妖精之羽 ›」. */
function ConfigRow({
  label,
  icon,
  value,
  hint,
  last,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  value: React.ReactNode;
  hint?: string;
  last?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`选择${label}`}
      className={`flex h-16 w-full items-center gap-3 ${last ? '' : 'border-b border-[var(--hairline)]'}`}
      type="button"
      onClick={onClick}
    >
      <span className="w-[52px] shrink-0 text-left text-[13px] font-semibold text-textSecondary">{label}</span>
      {icon}
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline gap-2 text-base font-bold tracking-[-0.01em]">{value}</span>
        {hint && <span className="mt-[3px] block text-xs font-semibold text-textSecondary">{hint}</span>}
      </span>
      <span className="shrink-0 text-chevron">
        <ChevronRight size={18} />
      </span>
    </button>
  );
}

export function MemberEditor({
  team,
  member,
  memberIndex,
  environment,
  lostItem,
  onUndoTransfer,
  onClose,
  onSave,
  onDelete,
  onOpenSpeed,
  onOpenCalculator,
}: {
  team: Team;
  member: TeamMember;
  /** 0-based position in the roster — 03-01's 「…的第 N 位成员」. */
  memberIndex: number;
  environment: EnvironmentState | null;
  /** N03-13: an item a teammate took from this member earlier in the session. */
  lostItem?: { itemName: string; toMemberName: string };
  onUndoTransfer?: () => void;
  onClose: () => void;
  /** The whole roster, because a staged item transfer also rewrites the teammate it came from. */
  onSave: (members: TeamMember[], transfer: StagedItemTransfer | null) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Both tools read the saved member, so the editor saves a dirty draft before leaving. */
  onOpenSpeed: () => void;
  onOpenCalculator: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<TeamMember>(member);
  const [transfer, setTransfer] = useState<StagedItemTransfer | null>(null);
  const [view, setViewState] = useState<EditorView>({ kind: 'editor' });
  // Each picker is its own history layer, so the hardware back button closes the picker and
  // keeps the draft instead of leaving the editor.
  const pickerLayer = useHistoryLayer(() => setViewState({ kind: 'editor' }));
  const setView = (next: EditorView) => {
    if (next.kind === 'editor') pickerLayer.close();
    else pickerLayer.open();
    setViewState(next);
  };
  const [changingPokemon, setChangingPokemonState] = useState(false);
  const speciesLayer = useHistoryLayer(() => setChangingPokemonState(false));
  const setChangingPokemon = (open: boolean) => {
    if (open) speciesLayer.open();
    else speciesLayer.close();
    setChangingPokemonState(open);
  };
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const entry = pokemon.find((candidate) => candidate.id === draft.pokemonId) ?? pokemon[0];
  const form = findBattleForm(entry.id, draft.formId);
  const name = form?.chineseName ?? entry.chineseName;
  const types = form?.types ?? entry.types;
  const baseStats = form?.baseStats ?? entry.baseStats;
  const availableMoves = useMemo(() => currentRuleMovesForPokemon(entry.id), [entry.id]);
  const availableItems = useMemo(() => currentRuleSelectableItemsForPokemon(entry.id), [entry.id]);
  const availableAbilities = useMemo(() => {
    const ids = new Set([...entry.abilities, ...(form?.abilities ?? [])]);
    return abilities.filter((ability) => ids.has(ability.id));
  }, [entry, form]);
  const forms = useMemo(() => [toBaseFormView(entry), ...entry.megaForms.map(toMegaFormView)], [entry]);

  const usage = environment?.pokemonUsage[currentRuleSet.battleType]?.find((row) => row.pokemonId === entry.id);
  const selectedItem = draft.itemId ? items.find((item) => item.id === draft.itemId) : undefined;
  const natureOption = currentRuleNatureOptions.find((option) => draft.nature.includes(option.id));

  const changes = draftChanges(member, draft);
  const total = statPointTotal(draft.statPoints);
  const overStat = Object.values(draft.statPoints).some((value) => Number(value ?? 0) > MAX_STAT_POINTS_PER_STAT);
  const saveDisabled = overStat || total > MAX_TOTAL_STAT_POINTS;

  const natureMarker = (key: StatKey): 'up' | 'down' | null => {
    if (!natureOption || natureOption.neutral) return null;
    const label = { hp: 'HP', attack: '攻击', defense: '防御', specialAttack: '特攻', specialDefense: '特防', speed: '速度' }[key];
    if ((natureOption.up as readonly string[]).includes(label)) return 'up';
    if ((natureOption.down as readonly string[]).includes(label)) return 'down';
    return null;
  };

  const patch = (next: Partial<TeamMember>) => setDraft((current) => ({ ...current, ...next }));

  const chooseItem = (itemId: string, staged?: StagedItemTransfer) => {
    setTransfer(staged ?? null);
    patch({ itemId });
    setView({ kind: 'editor' });
  };

  const chooseForm = (formId: string) => {
    const nextForm = findBattleForm(entry.id, formId);
    // N03-14: the stone is the item, so switching form swaps it rather than leaving a Mega
    // that cannot legally happen.
    const wasStone = draft.itemId ? items.find((item) => item.id === draft.itemId)?.isMegaStone : false;
    setTransfer(null);
    patch({
      formId,
      abilityId: nextForm?.abilities[0] ?? entry.abilities[0],
      itemId: nextForm?.requiredItemId ?? (wasStone ? undefined : draft.itemId),
    });
    setView({ kind: 'editor' });
  };

  const setMove = (slot: number, moveId: string) => {
    const next = [...draft.moveIds];
    next[slot] = moveId;
    patch({ moveIds: next.filter(Boolean).slice(0, 4) });
    setView({ kind: 'editor' });
  };

  const setStatPoint = (key: StatKey, value: number) =>
    setDraft((current) => ({
      ...current,
      statPoints: { ...current.statPoints, [key]: Math.max(0, Math.min(MAX_STAT_POINTS_PER_STAT, Math.round(value || 0))) },
    }));

  const cancel = () => {
    if (changes.length > 0) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const persistDraft = async () => {
    const legality = evaluateMemberLegality(draft, team);
    await onSave(applyMemberEdit(team, { ...draft, legalityStatus: legality.status }, transfer), transfer);
  };

  const save = async () => {
    if (saveDisabled) return;
    await persistDraft();
    onClose();
  };

  // A tool opened from here should show the build on screen, not the one last saved — and a
  // draft that cannot be saved (SP over the cap) has nothing valid to hand over.
  const dirty = changes.length > 0;
  const toolsDisabled = dirty && saveDisabled;
  const openTool = async (open: () => void) => {
    setMenuOpen(false);
    if (toolsDisabled) return;
    if (dirty) await persistDraft();
    open();
  };

  if (view.kind === 'move') {
    const taken = new Map<string, number>();
    draft.moveIds.forEach((moveId, index) => {
      if (moveId && index !== view.slot) taken.set(moveId, index + 1);
    });
    return (
      <MovePickerPage
        availableMoves={availableMoves}
        environmentStats={usage?.moveStats}
        pokemonName={name}
        selectedMoveId={draft.moveIds[view.slot]}
        slot={view.slot}
        takenSlots={taken}
        onBack={() => setView({ kind: 'editor' })}
        onPick={(moveId) => setMove(view.slot, moveId)}
      />
    );
  }

  if (view.kind === 'item') {
    return (
      <ItemPickerPage
        availableItems={availableItems}
        environmentStats={usage?.itemStats}
        holderOf={(itemId) => {
          const holder = memberHoldingItem(team, itemId, draft.id);
          if (!holder) return undefined;
          const holderEntry = pokemon.find((candidate) => candidate.id === holder.pokemonId);
          return { id: holder.id, name: holderEntry?.chineseName ?? '队友' };
        }}
        pokemonName={name}
        selectedItemId={draft.itemId}
        onBack={() => setView({ kind: 'editor' })}
        onClear={() => {
          setTransfer(null);
          patch({ itemId: undefined });
          setView({ kind: 'editor' });
        }}
        onPick={chooseItem}
      />
    );
  }

  if (view.kind === 'ability') {
    return (
      <AbilityPickerPage
        environmentStats={usage?.abilityStats}
        options={availableAbilities}
        pokemonName={name}
        selectedAbilityId={draft.abilityId}
        onBack={() => setView({ kind: 'editor' })}
        onPick={(abilityId) => {
          patch({ abilityId });
          setView({ kind: 'editor' });
        }}
      />
    );
  }

  if (view.kind === 'nature') {
    return (
      <NaturePickerPage
        baseStats={baseStats}
        environmentStats={usage?.natureStats}
        nature={draft.nature}
        statPoints={draft.statPoints}
        onBack={() => setView({ kind: 'editor' })}
        onPick={(nature) => {
          patch({ nature });
          setView({ kind: 'editor' });
        }}
      />
    );
  }

  if (view.kind === 'form') {
    return (
      <FormPickerPage
        baseEnglishName={entry.englishName}
        baseName={entry.chineseName}
        forms={forms}
        selectedFormId={form?.id ?? entry.id}
        onBack={() => setView({ kind: 'editor' })}
        onPick={chooseForm}
      />
    );
  }

  return (
    <div className="pb-[120px]">
      <div className="flex items-center justify-between px-6 pt-5">
        <RoundIconButton label="返回队伍详情" onClick={cancel}>
          <ChevronLeft size={20} />
        </RoundIconButton>
        <div className="relative">
          <RoundIconButton label="更多操作" onClick={() => setMenuOpen((open) => !open)}>
            <MoreHorizontal size={18} />
          </RoundIconButton>
          {menuOpen && (
            <>
              <button aria-label="关闭菜单" className="fixed inset-0 z-30 cursor-default" type="button" onClick={() => setMenuOpen(false)} />
              <div
                className="lk-editor-menu absolute right-0 top-[44px] z-40 w-[214px] rounded-[20px] px-[18px] py-1.5"
                role="menu"
              >
                <EditorMenuRow disabled={toolsDisabled} icon={<Gauge size={17} />} label="速度线" onClick={() => openTool(onOpenSpeed)} />
                <EditorMenuRow disabled={toolsDisabled} icon={<Swords size={17} />} label="伤害计算" onClick={() => openTool(onOpenCalculator)} />
                <div className="my-1.5 border-t border-[var(--hairline-strong)]" />
                <EditorMenuRow
                  danger
                  icon={<Trash2 size={17} />}
                  label="删除这个成员"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmRemove(true);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-6 pt-[14px]">
        <PageHeader subtitle={`${team.name} 的第 ${memberIndex + 1} 位成员`} title="编辑配置" />
      </div>

      {lostItem && (
        <div className="px-6 pt-5">
          <div className="lk-notice flex gap-2.5 rounded-[14px] p-[14px]">
            <span className="mt-px shrink-0 text-textLabel">
              <Info size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold tracking-[-0.01em]">
                「{lostItem.itemName}」已转给{lostItem.toMemberName}
              </span>
              <span className="mt-1 block text-xs font-semibold leading-[18px] text-textSecondary">
                这只现在没有道具，保存前请补一个。
              </span>
              {onUndoTransfer && (
                <button
                  className="mt-3 inline-flex h-11 items-center gap-[7px] rounded-[14px] bg-surface px-4 text-sm font-bold text-textLabel"
                  type="button"
                  onClick={onUndoTransfer}
                >
                  撤销转移
                </button>
              )}
            </span>
          </div>
        </div>
      )}

      <div
        className="lk-editor-aura mx-6 mt-5 flex items-center gap-[14px] rounded-[20px] p-4"
        style={auraStyle(types, form?.iconRef ?? entry.iconRef)}
      >
        <Sprite iconRef={form?.iconRef ?? entry.iconRef} label={name} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-[7px]">
            <h2 className="text-[20px] font-extrabold leading-[25px] tracking-[-0.01em]">{name}</h2>
            <span className="text-[11px] font-semibold text-textSecondary">{entry.japaneseName}</span>
          </div>
          <p className="mt-1.5 flex items-center gap-3 text-xs font-bold tracking-[0.04em] text-textSecondary">
            {types.map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <TypeDot type={type} />
                {typeLabels[type]}
              </span>
            ))}
          </p>
        </div>
        <button
          className="inline-flex h-8 shrink-0 items-center rounded-full bg-textPrimary/[0.07] px-3 text-xs font-bold text-textLabel"
          type="button"
          onClick={() => setChangingPokemon(true)}
        >
          换宝可梦
        </button>
      </div>

      <section className="px-6 pt-7">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">配置</h2>
        <div className="mt-2">
          {forms.length > 1 && (
            <ConfigRow
              label="形态"
              value={form?.chineseName ?? entry.chineseName}
              onClick={() => setView({ kind: 'form' })}
            />
          )}
          <ConfigRow
            hint={!selectedItem && lostItem ? '因道具冲突被移除' : undefined}
            icon={selectedItem?.iconRef ? <Sprite iconRef={selectedItem.iconRef} label={selectedItem.chineseName} size={26} /> : undefined}
            label="道具"
            value={selectedItem ? selectedItem.chineseName : <span className="text-textLabel">{NO_ITEM_LABEL}</span>}
            onClick={() => setView({ kind: 'item' })}
          />
          <ConfigRow
            label="特性"
            value={
              draft.abilityId ? (
                abilities.find((ability) => ability.id === draft.abilityId)?.chineseName ?? draft.abilityId
              ) : (
                <span className="text-textLabel">未选</span>
              )
            }
            onClick={() => setView({ kind: 'ability' })}
          />
          <ConfigRow
            last
            label="性格"
            value={
              <>
                {natureOption?.id ?? draft.nature}
                <span className="text-xs font-bold text-textSecondary">
                  <NatureEffect option={natureOption} />
                </span>
              </>
            }
            onClick={() => setView({ kind: 'nature' })}
          />
        </div>
      </section>

      <StatWheel
        baseStats={baseStats}
        nature={draft.nature}
        natureMarker={natureMarker}
        statPoints={draft.statPoints}
        onChange={setStatPoint}
      />

      <section className="px-6 pt-7">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">招式</h2>
        <div className="mt-2">
          {[0, 1, 2, 3].map((slot) => {
            const move = draft.moveIds[slot] ? moves.find((candidate) => candidate.id === draft.moveIds[slot]) : undefined;
            return (
              <button
                key={slot}
                aria-label={`招式 ${slot + 1}${move ? ` ${move.chineseName}` : ''}`}
                className={`flex h-[60px] w-full items-center gap-3 ${slot < 3 ? 'border-b border-[var(--hairline)]' : ''}`}
                type="button"
                onClick={() => setView({ kind: 'move', slot })}
              >
                {move ? <TypeDot type={move.type} /> : <span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-btn1" />}
                <span className={`min-w-0 flex-1 truncate text-left text-base font-bold tracking-[-0.01em] ${move ? '' : 'text-textLabel'}`}>
                  {move?.chineseName ?? `招式 ${slot + 1}`}
                </span>
                <span className="shrink-0 text-chevron">
                  <ChevronRight size={18} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="lk-editor-bar fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[430px] gap-2.5 px-6 pb-[22px] pt-3.5">
        <button className="h-[50px] w-[72px] shrink-0 text-[15px] font-bold text-textSecondary" type="button" onClick={cancel}>
          取消
        </button>
        <button
          className={`lk-slab inline-flex h-[50px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-extrabold tracking-[-0.01em] ${
            saveDisabled ? 'bg-btn1 text-btnDisabledInk shadow-none' : 'bg-accent text-page'
          }`}
          disabled={saveDisabled}
          type="button"
          onClick={() => void save()}
        >
          保存配置{changes.length > 0 ? ` · ${changes.length} 项改动` : ''}
        </button>
      </div>

      <PokemonPicker
        open={changingPokemon}
        takenSpeciesIds={rosterSpeciesIds(team, draft.id)}
        onClose={() => setChangingPokemon(false)}
        onPick={(picked) => {
          setTransfer(null);
          patch({ pokemonId: picked.id, formId: picked.id, abilityId: picked.abilities[0], itemId: undefined, moveIds: [] });
          setChangingPokemon(false);
        }}
      />

      {confirmDiscard && (
        <DiscardChangesSheet changes={changes} onDiscard={onClose} onKeepEditing={() => setConfirmDiscard(false)} />
      )}
      {confirmRemove && (
        <ConfirmRemoveMemberSheet
          iconRef={form?.iconRef ?? entry.iconRef}
          member={member}
          memberName={name}
          team={team}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            void onDelete();
          }}
        />
      )}
    </div>
  );
}
