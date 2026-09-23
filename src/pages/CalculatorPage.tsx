import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentRuleSet, moves, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { currentRuleMovesForPokemon } from '../lib/currentRuleCatalog';
import {
  buildCalcConfigFromTeamMember,
  buildTemporaryCalcConfig,
  computeDamage,
  validateStatPoints,
  type BattleTypeOption,
  type CalcSideConfig,
} from '../lib/damageAdapter';
import { findBattleForm } from '../lib/pokemonForms';
import { recordToolResult } from '../lib/toolActivity';
import { useAppStore } from '../state/AppContext';
import type { TeamMember } from '../types';
import { ListRow, PageHeader, Pill, SectionLabel, Switch, TypeDot } from '../components/kit';
import { moveMetaLine, type CalcSide } from './calculator/calcSummary';
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

const buildBlankCalcConfig = (role: CalcSide): CalcSideConfig => buildTemporaryCalcConfig({ pokemonId: '', role });

const PHYSICAL_DEFENSE_SPECIAL_MOVES = new Set(['psyshock', 'psystrike', 'secret-sword']);

const usedStatsForMove = (move: { id: string; category: string } | undefined) => {
  const special = move?.category === 'Special';
  const attackKey = move?.id === 'body-press' ? 'defense' : special ? 'specialAttack' : 'attack';
  const defenseKey = special && !PHYSICAL_DEFENSE_SPECIAL_MOVES.has(move?.id ?? '') ? 'specialDefense' : 'defense';
  const label = { attack: '攻击', defense: '防御', specialAttack: '特攻', specialDefense: '特防' } as const;
  return { attackKey, attackLabel: label[attackKey], defenseKey, defenseLabel: label[defenseKey] } as const;
};

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
  const [isCritical, setIsCritical] = useState(false);
  const [pickerSide, setPickerSide] = useState<CalcSide | null>(null);
  const [editor, setEditor] = useState<{ side: CalcSide; view: SideEditorView } | null>(null);
  const [weatherOpen, setWeatherOpen] = useState(false);

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
      const firstMove = currentRuleMovesForPokemon(pokeId).find((move) => move.category !== 'Status');
      const cfg = buildTemporaryCalcConfig({ pokemonId: pokeId, role: 'attacker', moveCategory: firstMove?.category ?? 'unknown' });
      setAttackerConfig(firstMove ? { ...cfg, selectedMoveId: firstMove.id, moveIds: [firstMove.id] } : cfg);
      setAttackerDirty(false);
    }
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

  const currentMove = attackerConfig.selectedMoveId ? moves.find((move) => move.id === attackerConfig.selectedMoveId) : undefined;
  // 代入能力值 shows the two stats the damage formula actually used, not always 攻击 / 防御: a special
  // move reads 特攻 / 特防, 扑击 (body press) attacks with 防御, and the 精神冲击 family is special
  // but hits 防御.
  const usedStats = usedStatsForMove(currentMove);

  function pickPokemon(side: CalcSide, pokemonId: string) {
    const firstMove = currentRuleMovesForPokemon(pokemonId).find((move) => move.category !== 'Status');
    const cfg = buildTemporaryCalcConfig({ pokemonId, role: side, moveCategory: firstMove?.category ?? 'unknown' });
    const next = firstMove
      ? { ...cfg, selectedMoveId: firstMove.id, moveIds: Array.from(new Set([firstMove.id, ...cfg.moveIds.filter(Boolean)])).slice(0, 4) }
      : cfg;
    setConfigFor(side, next, false);
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

  const damageKey = `${attackerConfig.pokemonId}|${attackerConfig.formId}|${attackerConfig.selectedMoveId}|${attackerConfig.nature}|${JSON.stringify(attackerConfig.statPoints)}|${JSON.stringify(attackerConfig.statStages)}|${attackerConfig.abilityId}|${attackerConfig.itemId}||${defenderConfig.pokemonId}|${defenderConfig.formId}|${defenderConfig.nature}|${JSON.stringify(defenderConfig.statPoints)}|${JSON.stringify(defenderConfig.statStages)}|${defenderConfig.abilityId}|${defenderConfig.itemId}||${battleType}|${weather}|${isCritical}|${currentMove?.category}`;
  const damageResult = useMemo(() => {
    if (!attackerConfig.selectedMoveId || !attackerConfig.pokemonId || !defenderConfig.pokemonId) return null;
    if (currentMove?.category === 'Status') return null;
    if (blockedBySp) return null;
    return computeDamage({ attacker: attackerConfig, defender: defenderConfig, battleType, weather, isCritical, attackStage: 0 });
    // eslint-disable-next-line
  }, [damageKey]);

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
          <Pill ariaLabel={`天气 ${weather}`} className="px-[13px]" onClick={() => setWeatherOpen(true)}>
            {weather}
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
          subtitle={currentMove ? moveMetaLine(currentMove) : '从进攻方的可学招式里选'}
          title={currentMove?.chineseName ?? '未选招式'}
          trailing={<ChevronRight className="shrink-0 text-chevron" size={18} />}
          onClick={() => openEditor('attacker', 'move')}
        />
      </div>

      <ResultCard
        attackerConfig={attackerConfig}
        defenderConfig={defenderConfig}
        move={currentMove}
        result={damageResult}
        onEditSide={(side) => openEditor(side)}
      />

      <div className="px-6 pt-5">
        <SectionLabel>代入能力值</SectionLabel>
        <div className="mt-2">
          <ListRow
            height={44}
            title={<span className="text-[13px] font-semibold text-textSecondary">进攻方 {usedStats.attackLabel} / 速度</span>}
            trailing={
              <span className="shrink-0 text-sm font-extrabold tabular-nums">
                {damageResult?.attackerStats ? `${damageResult.attackerStats[usedStats.attackKey]} / ${damageResult.attackerStats.speed}` : '— / —'}
              </span>
            }
          />
          <ListRow
            divider={false}
            height={44}
            title={<span className="text-[13px] font-semibold text-textSecondary">防守方 HP / {usedStats.defenseLabel}</span>}
            trailing={
              <span className="shrink-0 text-sm font-extrabold tabular-nums">
                {damageResult?.defenderStats ? `${damageResult.defenderStats.hp} / ${damageResult.defenderStats[usedStats.defenseKey]}` : '— / —'}
              </span>
            }
          />
        </div>
        <p className="mt-3 text-xs font-semibold text-textSecondary">公式 Gen9 · 招式参数取自 Champions 目录 · 结果为实验性近似</p>
      </div>

      {weatherOpen && (
        <OptionSheet
          options={weatherOptions.map((option) => ({ id: option.id, label: option.id, note: option.note }))}
          selectedId={weather}
          title="天气"
          onClose={() => setWeatherOpen(false)}
          onSelect={(id) => {
            setWeather(id);
            setWeatherOpen(false);
          }}
        />
      )}
    </div>
  );
}
