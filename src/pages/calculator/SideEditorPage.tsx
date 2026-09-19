import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { abilities as allAbilities, currentRuleNatureOptions, items as allItems, moves } from '../../data';
import type { EnvironmentState } from '../../data/environment';
import {
  currentRuleMovesForPokemon,
  currentRuleSelectableItemsForPokemon,
  natureOptionLabel,
} from '../../lib/currentRuleCatalog';
import type { BattleTypeOption, CalcSideConfig } from '../../lib/damageAdapter';
import { validateStatPoints } from '../../lib/damageAdapter';
import { findBattleForm, findPokemon } from '../../lib/pokemonForms';
import { clampStatPointValue, MAX_TOTAL_STAT_POINTS } from '../../lib/statPoints';
import { KitButton, ListRow, PageHeader, Pill, SectionLabel } from '../../components/kit';
import { useScrollResetWhileMounted } from '../../hooks/useScrollReset';
import { AbilityPickerPage } from '../team/editor/AbilityPickerPage';
import { ItemPickerPage } from '../team/editor/ItemPickerPage';
import { MovePickerPage } from '../team/editor/MovePickerPage';
import { NaturePickerPage } from '../team/editor/NaturePickerPage';
import { RoundIconButton } from '../team/editor/PickerPage';
import { StatWheel, type StatKey } from '../team/editor/StatWheel';
import { sideLabelText, STAGE_LABELS, type CalcSide } from './calcSummary';

/**
 * N05-07 / N05-08, rebuilt on 03 编辑配置's information structure (owner call): everything that
 * needs a long list — moves, nature, ability, item — is an entry row that opens the team
 * editor's own picker page, so SP 分配 stays one thumb away instead of below 40 move rows. The
 * SP control is 03-01's wheel, not a calculator-only popup.
 *
 * Nothing here is staged: the calculator's own copy of the build is edited live and never
 * written back to the team.
 */

export type SideEditorView = 'editor' | 'move' | 'item' | 'ability' | 'nature';

export function SideEditorPage({
  config,
  side,
  showMoves,
  environment,
  battleType,
  initialView = 'editor',
  onChange,
  onClose,
}: {
  config: CalcSideConfig;
  side: CalcSide;
  showMoves: boolean;
  environment: EnvironmentState | null;
  battleType: BattleTypeOption;
  initialView?: SideEditorView;
  onChange: (next: CalcSideConfig) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<SideEditorView>(initialView);
  // Swapped in by calculator state, not a route: start at the top, hand the offset back on close.
  useScrollResetWhileMounted();

  const entry = findPokemon(config.pokemonId);
  const battleForm = findBattleForm(entry?.id ?? '', config.formId) ?? (entry ? findBattleForm(entry.id, entry.id) : undefined);
  const name = battleForm?.chineseName ?? entry?.chineseName ?? '未选';
  const baseStats = battleForm?.baseStats ?? entry?.baseStats;
  const ability = allAbilities.find((candidate) => candidate.id === config.abilityId);
  const item = allItems.find((candidate) => candidate.id === config.itemId);
  const selectedMove = config.selectedMoveId ? moves.find((move) => move.id === config.selectedMoveId) : undefined;
  const label = sideLabelText(side);

  // Only damaging moves reach the calculator: a status move has no range to show.
  const availableMoves = useMemo(
    () => (entry ? currentRuleMovesForPokemon(entry.id).filter((move) => move.category !== 'Status') : []),
    [entry],
  );
  const availableItems = useMemo(() => (entry ? currentRuleSelectableItemsForPokemon(entry.id) : []), [entry]);
  const availableAbilities = useMemo(() => {
    if (!entry) return [];
    const ids = new Set([...entry.abilities, ...(battleForm?.abilities ?? [])]);
    return allAbilities.filter((candidate) => ids.has(candidate.id));
  }, [battleForm, entry]);
  const usage = environment?.pokemonUsage[battleType]?.find((row) => row.pokemonId === entry?.id);

  const spIssues = validateStatPoints(config.statPoints);
  const backToEditor = () => setView('editor');

  const selectMove = (moveId?: string) => {
    onChange({
      ...config,
      selectedMoveId: moveId,
      moveIds: moveId ? Array.from(new Set([moveId, ...config.moveIds.filter(Boolean)])).slice(0, 4) : config.moveIds,
    });
    backToEditor();
  };

  if (view === 'move' && entry) {
    return (
      <MovePickerPage
        availableMoves={availableMoves}
        environmentStats={usage?.moveStats}
        pokemonName={name}
        selectedMoveId={config.selectedMoveId}
        slot={0}
        takenSlots={new Map()}
        title="招式"
        onBack={backToEditor}
        onPick={(moveId) => selectMove(moveId)}
      />
    );
  }

  if (view === 'item' && entry) {
    return (
      <ItemPickerPage
        availableItems={availableItems}
        environmentStats={usage?.itemStats}
        holderOf={() => undefined}
        pokemonName={name}
        selectedItemId={config.itemId}
        onBack={backToEditor}
        onClear={() => {
          onChange({ ...config, itemId: undefined });
          backToEditor();
        }}
        onPick={(itemId) => {
          onChange({ ...config, itemId });
          backToEditor();
        }}
      />
    );
  }

  if (view === 'ability' && entry) {
    return (
      <AbilityPickerPage
        environmentStats={usage?.abilityStats}
        options={availableAbilities}
        pokemonName={name}
        selectedAbilityId={config.abilityId}
        onBack={backToEditor}
        onPick={(abilityId) => {
          onChange({ ...config, abilityId });
          backToEditor();
        }}
      />
    );
  }

  if (view === 'nature' && baseStats) {
    return (
      <NaturePickerPage
        baseStats={baseStats}
        environmentStats={usage?.natureStats}
        nature={config.nature}
        statPoints={config.statPoints}
        onBack={backToEditor}
        onPick={(nature) => {
          onChange({ ...config, nature });
          backToEditor();
        }}
      />
    );
  }

  const natureOption = currentRuleNatureOptions.find((option) => config.nature.includes(option.id));
  const natureMarker = (key: StatKey): 'up' | 'down' | null => {
    if (!natureOption || natureOption.neutral) return null;
    const statLabel = { hp: 'HP', attack: '攻击', defense: '防御', specialAttack: '特攻', specialDefense: '特防', speed: '速度' }[key];
    if ((natureOption.up as readonly string[]).includes(statLabel)) return 'up';
    if ((natureOption.down as readonly string[]).includes(statLabel)) return 'down';
    return null;
  };

  const configRows = [
    showMoves
      ? {
          key: 'move' as const,
          label: '招式',
          value: selectedMove?.chineseName ?? '未选',
        }
      : undefined,
    { key: 'nature' as const, label: '性格', value: natureOptionLabel(config.nature) },
    { key: 'ability' as const, label: '特性', value: ability?.chineseName ?? '未选' },
    { key: 'item' as const, label: '道具', value: item?.chineseName ?? '无道具' },
  ].filter(Boolean) as Array<{ key: SideEditorView; label: string; value: string }>;

  return (
    <div className="pb-8" data-calc-editor={side}>
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <RoundIconButton label="返回" onClick={onClose}>
          <ChevronLeft size={20} />
        </RoundIconButton>
        <KitButton ariaLabel="完成" disabled={spIssues.length > 0} height={32} shape="pill" onClick={onClose}>
          完成
        </KitButton>
      </div>

      <PageHeader className="px-6 pt-3.5" subtitle={`${name} · 临时修改不写回队伍`} title={label} />

      {entry && entry.megaForms.length > 0 && (
        <>
          <SectionLabel className="px-6 pt-6">形态</SectionLabel>
          <div className="mt-2.5 flex gap-2 overflow-x-auto px-6">
            <Pill height={32} selected={(config.formId ?? entry.id) === entry.id} onClick={() => onChange({ ...config, formId: undefined })}>
              普通
            </Pill>
            {entry.megaForms.map((form) => (
              <Pill key={form.id} height={32} selected={config.formId === form.id} onClick={() => onChange({ ...config, formId: form.id })}>
                {form.chineseName}
              </Pill>
            ))}
          </div>
        </>
      )}

      <div className="px-6 pt-5">
        {configRows.map((row, index) => (
          <ListRow
            key={row.key}
            ariaLabel={`${row.label} ${row.value}`}
            divider={index < configRows.length - 1}
            height={64}
            leading={<span className="w-[52px] shrink-0 text-[13px] font-semibold text-textSecondary">{row.label}</span>}
            title={<span className="text-[16px]">{row.value}</span>}
            trailing={<ChevronRight className="shrink-0 text-chevron" size={18} />}
            onClick={() => setView(row.key)}
          />
        ))}
      </div>

      {baseStats && (
        <StatWheel
          baseStats={baseStats}
          nature={config.nature}
          natureMarker={natureMarker}
          statPoints={config.statPoints}
          onChange={(key, value) =>
            onChange({ ...config, statPoints: { ...config.statPoints, [key]: clampStatPointValue(value) } })
          }
        />
      )}

      {spIssues.length > 0 && (
        <div className="mx-6 mt-3.5 flex gap-2.5 rounded-[14px] bg-danger/[0.12] p-3.5">
          <TriangleAlert className="mt-px shrink-0 text-danger" size={18} />
          <p className="min-w-0 flex-1 text-sm font-extrabold tracking-[-0.01em] text-danger">
            总计回到 {MAX_TOTAL_STAT_POINTS} 以内才会出结果
          </p>
        </div>
      )}

      <div className="px-6 pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">能力阶级</h2>
          <span className="text-xs font-semibold text-textSecondary">−6 … +6</span>
        </div>
        <div className="mt-2">
          {STAGE_LABELS.map(({ key, label: stageLabel }, index) => {
            const stage = config.statStages?.[key] ?? 0;
            const setStage = (next: number) =>
              onChange({ ...config, statStages: { ...(config.statStages ?? {}), [key]: Math.max(-6, Math.min(6, next)) } });
            return (
              <div
                key={key}
                className={`flex items-center gap-2.5 ${index < STAGE_LABELS.length - 1 ? 'border-b border-[var(--hairline)]' : ''}`}
                style={{ height: 60 }}
              >
                <span className="w-[38px] shrink-0 text-[13px] font-semibold text-textSecondary">{stageLabel}</span>
                <button
                  aria-label={`${stageLabel} 能力阶级 −1`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-btn1 text-textLabel"
                  type="button"
                  onClick={() => setStage(stage - 1)}
                >
                  −
                </button>
                <span
                  aria-label={`${stageLabel} 能力阶级`}
                  className={`min-w-0 flex-1 text-center text-[20px] font-extrabold tabular-nums ${stage === 0 ? 'text-textLabel' : 'text-textPrimary'}`}
                  role="status"
                >
                  {stage > 0 ? `+${stage}` : stage < 0 ? `−${Math.abs(stage)}` : '0'}
                </span>
                <button
                  aria-label={`${stageLabel} 能力阶级 +1`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-btn1 text-textLabel"
                  type="button"
                  onClick={() => setStage(stage + 1)}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
