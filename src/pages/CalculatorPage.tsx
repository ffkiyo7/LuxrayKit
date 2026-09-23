import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentRuleSet, moves, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { currentRuleMovesForPokemon } from '../lib/currentRuleCatalog';
import {
  buildCalcConfigFromTeamMember,
  buildTemporaryCalcConfig,
  clampMoveCounter,
  computeDamage,
  MOVE_COUNTERS,
  surgeTerrainFor,
  validateStatPoints,
  type BattleTypeOption,
  type CalcSideConfig,
  type TerrainOption,
} from '../lib/damageAdapter';
import { findBattleForm } from '../lib/pokemonForms';
import { recordToolResult } from '../lib/toolActivity';
import { useAppStore } from '../state/AppContext';
import type { TeamMember } from '../types';
import { ListRow, PageHeader, Pill, SectionLabel, Switch, TypeDot } from '../components/kit';
import { moveMetaLine, statPointSpreadText, type CalcSide } from './calculator/calcSummary';
import { MoveCounterControl } from './calculator/MoveCounterControl';
import { OptionSheet } from './calculator/OptionSheet';
import { ResultCard } from './calculator/ResultCard';
import { SideCard } from './calculator/SideCard';
import { SideEditorPage, type SideEditorView } from './calculator/SideEditorPage';
import { SidePickerPage } from './calculator/SidePickerPage';

export type { CalcSide };

/** Debounce before a settled result reaches 04-01's card. */
const RESULT_RECORD_DELAY_MS = 800;

const weatherOptions: Array<{ id: string; note?: string }> = [
  { id: '无天气' },
  { id: '晴天', note: '火 ×1.5 · 水 ×0.5' },
  { id: '雨天', note: '水 ×1.5 · 火 ×0.5' },
  { id: '沙暴', note: '岩石 特防 ×1.5' },
  { id: '雪天', note: '冰 防御 ×1.5' },
];

const terrainOptions: Array<{ id: TerrainOption; note?: string }> = [
  { id: '无场地' },
  { id: '电气场地', note: '电 ×1.3' },
  { id: '青草场地', note: '草 ×1.3 · 地震减半' },
  { id: '精神场地', note: '超能力 ×1.3' },
  { id: '薄雾场地', note: '龙 ×0.5' },
];

const buildBlankCalcConfig = (role: CalcSide): CalcSideConfig => buildTemporaryCalcConfig({ pokemonId: '', role });


export function CalculatorPage({
  selectedMemberId,
  onPickMember,
  presetMember,
  environment,
}: {
  selectedMemberId?: string;
  onPickMember: (memberId: string) => void;
  presetMember?: { memberId: string; side: CalcSide };
  environment?: EnvironmentState | null;
}) {
  const { teams } = useAppStore();

  const [activeSide, setActiveSide] = useState<CalcSide>('attacker');
  const [attackerConfig, setAttackerConfig] = useState<CalcSideConfig>(() => buildBlankCalcConfig('attacker'));
  const [defenderConfig, setDefenderConfig] = useState<CalcSideConfig>(() => buildBlankCalcConfig('defender'));
  const [attackerDirty, setAttackerDirty] = useState(false);
  const [defenderDirty, setDefenderDirty] = useState(false);
  const [battleType, setBattleType] = useState<BattleTypeOption>(currentRuleSet.battleType);
  const [weather, setWeather] = useState(weatherOptions[0].id);
  const [terrain, setTerrain] = useState<TerrainOption>('无场地');
  const [moveCounter, setMoveCounter] = useState(0);
  const [isCritical, setIsCritical] = useState(false);
  const [pickerSide, setPickerSide] = useState<CalcSide | null>(null);
  const [editor, setEditor] = useState<{ side: CalcSide; view: SideEditorView } | null>(null);
  const [fieldSheet, setFieldSheet] = useState<'weather' | 'terrain' | null>(null);

  // A dex pick starts on the environment's most-used build for the current format (move, item,
  // ability, nature — SP stays 0), so 轰擂金刚猩 arrives as 青草滑梯 / 奇迹种子 / 青草制造者 / 固执.
  const freshConfig = (pokemonId: string, role: CalcSide) =>
    buildTemporaryCalcConfig({
      pokemonId,
      role,
      preset: environment?.pokemonUsage[battleType]?.find((row) => row.pokemonId === pokemonId),
    });

  const configFor = (side: CalcSide) => (side === 'attacker' ? attackerConfig : defenderConfig);
  const setConfigFor = (side: CalcSide, next: CalcSideConfig, dirty: boolean) => {
    if (side === 'attacker') {
      setAttackerConfig(next);
      setAttackerDirty(dirty);
    } else {
      setDefenderConfig(next);
      setDefenderDirty(dirty);
    }
  };

  const openEditor = (side: CalcSide, view: SideEditorView = 'editor') => {
    setActiveSide(side);
    setEditor({ side, view });
  };

  // Guard: only apply selectedMemberId ONCE, never overwrite user edits
  const lastAppliedMemberIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedMemberId) {
      lastAppliedMemberIdRef.current = undefined;
      return;
    }
    if (lastAppliedMemberIdRef.current === selectedMemberId) return;
    lastAppliedMemberIdRef.current = selectedMemberId;

    const found = teams.flatMap((team) => team.members).find((member) => member.id === selectedMemberId);
    if (found) {
      setAttackerConfig(buildCalcConfigFromTeamMember(found));
      setAttackerDirty(false);
      return;
    }

    const pokeId = pokemon.find((entry) => entry.id === selectedMemberId)?.id;
    if (pokeId) {
      setAttackerConfig(freshConfig(pokeId, 'attacker'));
      setAttackerDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, teams]);

  // Jump-in from a team member: carry the saved build into the chosen side, but reset moves to
  // the current-rule attacking list.
  const lastPresetRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!presetMember) {
      lastPresetRef.current = undefined;
      return;
    }
    const key = `${presetMember.memberId}:${presetMember.side}`;
    if (lastPresetRef.current === key) return;
    lastPresetRef.current = key;
    const found = teams.flatMap((team) => team.members).find((member) => member.id === presetMember.memberId);
    if (!found) return;
    const base = buildCalcConfigFromTeamMember(found);
    const firstMove = found.pokemonId
      ? currentRuleMovesForPokemon(found.pokemonId).find((move) => move.category !== 'Status')
      : undefined;
    setConfigFor(presetMember.side, { ...base, moveIds: firstMove ? [firstMove.id] : [], selectedMoveId: firstMove?.id }, false);
    setActiveSide(presetMember.side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetMember, teams]);

  // A 「XX制造者」 on either side lays its terrain the moment it lands on the board. When the side
  // that brought it loses it, the terrain goes with it unless the other side still brings one;
  // a terrain the user picked by hand is left alone until a surge ability changes again.
  const attackerSurge = surgeTerrainFor(attackerConfig.abilityId);
  const defenderSurge = surgeTerrainFor(defenderConfig.abilityId);
  const surgeRef = useRef<{ attacker?: TerrainOption; defender?: TerrainOption }>({});
  useEffect(() => {
    const previous = surgeRef.current;
    surgeRef.current = { attacker: attackerSurge, defender: defenderSurge };
    const arrived =
      attackerSurge && attackerSurge !== previous.attacker
        ? attackerSurge
        : defenderSurge && defenderSurge !== previous.defender
          ? defenderSurge
          : undefined;
    if (arrived) {
      setTerrain(arrived);
      return;
    }
    const left = [previous.attacker, previous.defender].filter(
      (surge): surge is TerrainOption => Boolean(surge) && surge !== attackerSurge && surge !== defenderSurge,
    );
    if (left.length > 0) setTerrain((current) => (left.includes(current) ? attackerSurge ?? defenderSurge ?? '无场地' : current));
  }, [attackerSurge, defenderSurge]);

  // The tier belongs to the move: a new move starts from 0, and 单打 caps 扫墓 lower than 双打.
  useEffect(() => setMoveCounter(0), [attackerConfig.selectedMoveId]);
  const moveCounterSpec = attackerConfig.selectedMoveId ? MOVE_COUNTERS[attackerConfig.selectedMoveId] : undefined;
  const activeMoveCounter = clampMoveCounter(attackerConfig.selectedMoveId, moveCounter, battleType);

  const currentMove = attackerConfig.selectedMoveId ? moves.find((move) => move.id === attackerConfig.selectedMoveId) : undefined;
  const spreadRows = (['attacker', 'defender'] as const).map((side) => {
    const config = configFor(side);
    const entry = pokemon.find((candidate) => candidate.id === config.pokemonId);
    const name = findBattleForm(entry?.id ?? '', config.formId)?.chineseName ?? entry?.chineseName;
    return { side, name: name ?? '—', spread: name ? statPointSpreadText(config.statPoints) : '—' };
  });

  function pickPokemon(side: CalcSide, pokemonId: string) {
    setConfigFor(side, freshConfig(pokemonId, side), false);
    if (side === 'attacker') onPickMember(pokemonId);
    setPickerSide(null);
  }

  function pickTeamMember(side: CalcSide, member: TeamMember) {
    if (!member.pokemonId) return;
    setConfigFor(side, buildCalcConfigFromTeamMember(member), false);
    if (side === 'attacker') onPickMember(member.id);
    setPickerSide(null);
  }

  function swapSides() {
    setAttackerConfig(defenderConfig);
    setDefenderConfig(attackerConfig);
    setAttackerDirty(defenderDirty);
    setDefenderDirty(attackerDirty);
  }

  const attackerSpIssues = validateStatPoints(attackerConfig.statPoints);
  const defenderSpIssues = validateStatPoints(defenderConfig.statPoints);
  const blockedBySp = attackerSpIssues.length > 0 || defenderSpIssues.length > 0;

  const damageKey = `${attackerConfig.pokemonId}|${attackerConfig.formId}|${attackerConfig.selectedMoveId}|${attackerConfig.nature}|${JSON.stringify(attackerConfig.statPoints)}|${JSON.stringify(attackerConfig.statStages)}|${attackerConfig.abilityId}|${attackerConfig.itemId}||${defenderConfig.pokemonId}|${defenderConfig.formId}|${defenderConfig.nature}|${JSON.stringify(defenderConfig.statPoints)}|${JSON.stringify(defenderConfig.statStages)}|${defenderConfig.abilityId}|${defenderConfig.itemId}||${battleType}|${weather}|${terrain}|${activeMoveCounter}|${isCritical}|${currentMove?.category}`;
  const damageResult = useMemo(() => {
    if (!attackerConfig.selectedMoveId || !attackerConfig.pokemonId || !defenderConfig.pokemonId) return null;
    if (currentMove?.category === 'Status') return null;
    if (blockedBySp) return null;
    return computeDamage({
      attacker: attackerConfig,
      defender: defenderConfig,
      battleType,
      weather,
      terrain,
      moveCounter: activeMoveCounter,
      isCritical,
      attackStage: 0,
    });
    // eslint-disable-next-line
  }, [damageKey]);

  // The move row shows the power the formula used (扫墓's tier, 广域战力 on Psychic Terrain), and
  // falls back to the tier's own figure while the other side is still unpicked.
  const displayedPower =
    damageResult?.status === 'experimental-success'
      ? damageResult.effectiveBasePower
      : moveCounterSpec
        ? moveCounterSpec.power(activeMoveCounter)
        : currentMove?.power;

  // 04-01 shows the last run on the tools landing. Wait for the inputs to settle so dragging an
  // SP slider does not write a row per frame.
  useEffect(() => {
    if (damageResult?.status !== 'experimental-success') return;
    const { minDamage, maxDamage, minPercent, maxPercent, possibleHkoText } = damageResult;
    if (minDamage === undefined || maxDamage === undefined || minPercent === undefined || maxPercent === undefined) return;
    if (!possibleHkoText) return;
    const entry = pokemon.find((candidate) => candidate.id === attackerConfig.pokemonId);
    const form = findBattleForm(entry?.id ?? '', attackerConfig.formId);
    const label = form?.chineseName ?? entry?.chineseName;
    if (!label) return;
    // 04-01 draws 「进攻方 招式 → 防守方」, so the card needs the other two sides by name as well.
    const defenderEntry = pokemon.find((candidate) => candidate.id === defenderConfig.pokemonId);
    const defenderForm = findBattleForm(defenderEntry?.id ?? '', defenderConfig.formId);
    const defenderLabel = defenderForm?.chineseName ?? defenderEntry?.chineseName;
    const moveLabel = currentMove?.chineseName;
    if (!defenderLabel || !moveLabel) return;
    const timer = window.setTimeout(
      () => recordToolResult({
        tool: 'calculator',
        label,
        iconRef: form?.iconRef ?? entry?.iconRef,
        moveLabel,
        defenderLabel,
        defenderIconRef: defenderForm?.iconRef ?? defenderEntry?.iconRef,
        minDamage,
        maxDamage,
        minPercent,
        maxPercent,
        hko: possibleHkoText,
      }),
      RESULT_RECORD_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    attackerConfig.formId,
    attackerConfig.pokemonId,
    currentMove,
    damageResult,
    defenderConfig.formId,
    defenderConfig.pokemonId,
  ]);

  if (pickerSide) {
    return (
      <SidePickerPage
        battleType={battleType}
        environment={environment ?? null}
        selectedPokemonId={configFor(pickerSide).pokemonId}
        side={pickerSide}
        teams={teams}
        onBack={() => setPickerSide(null)}
        onPickMember={(member) => pickTeamMember(pickerSide, member)}
        onPickPokemon={(pokemonId) => pickPokemon(pickerSide, pokemonId)}
      />
    );
  }

  if (editor) {
    return (
      <SideEditorPage
        battleType={battleType}
        config={configFor(editor.side)}
        environment={environment ?? null}
        initialView={editor.view}
        showMoves={editor.side === 'attacker'}
        side={editor.side}
        onChange={(next) => setConfigFor(editor.side, next, true)}
        onClose={() => setEditor(null)}
      />
    );
  }

  return (
    <div className="pb-8" data-calc-active-side={activeSide}>
      <PageHeader className="px-6 pt-5" subtitle="可从图鉴或队伍取配置 · 临时修改不写回队伍" title="伤害计算" />

      <div className="flex items-stretch gap-2.5 px-6 pt-5">
        <SideCard
          config={attackerConfig}
          side="attacker"
          onEdit={() => openEditor('attacker')}
          onPick={() => {
            setActiveSide('attacker');
            setPickerSide('attacker');
          }}
        />
        <button
          aria-label="交换攻守双方"
          className="grid h-9 w-9 shrink-0 self-center place-items-center rounded-full bg-surface text-textLabel"
          type="button"
          onClick={swapSides}
        >
          <ArrowLeftRight size={17} />
        </button>
        <SideCard
          config={defenderConfig}
          side="defender"
          onEdit={() => openEditor('defender')}
          onPick={() => {
            setActiveSide('defender');
            setPickerSide('defender');
          }}
        />
      </div>

      <div className="px-6 pt-[18px]">
        <div className="flex gap-2">
          <Pill selected={battleType === 'doubles'} onClick={() => setBattleType('doubles')}>
            双打
          </Pill>
          <Pill selected={battleType === 'singles'} onClick={() => setBattleType('singles')}>
            单打
          </Pill>
          <span className="flex-1" />
          <Pill ariaLabel={`天气 ${weather}`} className="px-[13px]" onClick={() => setFieldSheet('weather')}>
            {weather}
            <ChevronDown size={14} />
          </Pill>
          <Pill ariaLabel={`场地 ${terrain}`} className="px-[13px]" onClick={() => setFieldSheet('terrain')}>
            {terrain}
            <ChevronDown size={14} />
          </Pill>
        </div>

        <div className="mt-3 flex h-12 items-center gap-3">
          <span className="min-w-0 flex-1 text-sm font-bold">会心一击</span>
          <Switch checked={isCritical} label="会心一击" onChange={setIsCritical} />
        </div>

        <SectionLabel className="pt-3">当前招式</SectionLabel>
        <ListRow
          ariaLabel={currentMove ? `招式 ${currentMove.chineseName}` : '选择招式'}
          height={68}
          leading={currentMove ? <TypeDot type={currentMove.type} /> : <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-disabled" />}
          subtitle={currentMove ? moveMetaLine(currentMove, false, displayedPower) : '从进攻方的可学招式里选'}
          title={currentMove?.chineseName ?? '未选招式'}
          trailing={<ChevronRight className="shrink-0 text-chevron" size={18} />}
          onClick={() => openEditor('attacker', 'move')}
        />
        {moveCounterSpec && (
          <MoveCounterControl
            max={moveCounterSpec.max(battleType)}
            spec={moveCounterSpec}
            value={activeMoveCounter}
            onChange={setMoveCounter}
          />
        )}
      </div>

      <ResultCard
        attackerConfig={attackerConfig}
        defenderConfig={defenderConfig}
        move={currentMove}
        result={damageResult}
        onEditSide={(side) => openEditor(side)}
      />

      <div className="px-6 pt-5">
        {/* The SP each side was entered with, in the series' shorthand (「32ATK 32SPE」) — the
            figure players quote, rather than the derived stat. */}
        <SectionLabel>SP 分配</SectionLabel>
        <div className="mt-2">
          {spreadRows.map((row, index) => (
            <ListRow
              key={row.side}
              divider={index < spreadRows.length - 1}
              height={44}
              title={<span className="text-[13px] font-semibold text-textSecondary">{row.name}</span>}
              trailing={<span className="shrink-0 text-sm font-extrabold tabular-nums">{row.spread}</span>}
            />
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold text-textSecondary">公式 Gen9 · 招式参数取自 Champions 目录 · 结果为实验性近似</p>
      </div>

      {fieldSheet === 'weather' && (
        <OptionSheet
          options={weatherOptions.map((option) => ({ id: option.id, label: option.id, note: option.note }))}
          selectedId={weather}
          title="天气"
          onClose={() => setFieldSheet(null)}
          onSelect={(id) => {
            setWeather(id);
            setFieldSheet(null);
          }}
        />
      )}
      {fieldSheet === 'terrain' && (
        <OptionSheet
          footnote="只对着地的宝可梦生效，飞行属性和漂浮特性不受影响"
          options={terrainOptions.map((option) => ({ id: option.id, label: option.id, note: option.note }))}
          selectedId={terrain}
          title="场地"
          onClose={() => setFieldSheet(null)}
          onSelect={(id) => {
            setTerrain(id as TerrainOption);
            setFieldSheet(null);
          }}
        />
      )}
    </div>
  );
}
