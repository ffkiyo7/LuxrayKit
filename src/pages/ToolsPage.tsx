import { ArrowRight, ChevronRight, Search } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { currentRuleSet, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { currentRegulation } from '../data/schedule';
import { attackingTypes } from '../lib/calculations';
import { primeKeyboard } from '../lib/keyboardHandoff';
import { findBattleForm, findPokemon, getDexFormEntries } from '../lib/pokemonForms';
import { calculateSpeedForBuild, resolveDefaultSpeedSubject, type SpeedSubject } from '../lib/speedTier';
import { DAMAGE_SAMPLE, SPEED_SAMPLE_CAPTION, TYPE_CHART_SAMPLE_TYPE } from '../lib/toolSamples';
import type { PokemonType, Team } from '../types';
import { defensiveProfile, offensiveProfile } from '../lib/typeChart';
import {
  readRecentDexEntries,
  readToolResults,
  type CalculatorToolResult,
  type RecentDexEntry,
  type SpeedToolResult,
  type ToolResult,
  type TypeChartToolResult,
} from '../lib/toolActivity';
import { typeColors, typeLabels } from '../components/ui';
import { Sprite, SpriteDisc } from '../components/kit';

export type ToolView = 'calculator' | 'dex' | 'speed' | 'typeChart';

/** 04-01's sparkline reads as a shape, not a scale: the slowest bar still has to be visible. */
const SPARK_MIN_HEIGHT = 30;

function CardShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`lk-p4a-card box-border rounded-[20px] p-[18px] ${className}`}>{children}</div>;
}

/**
 * 04-01's two square cards: the title row is the entry, everything under it is the last result
 * this tool produced. With nothing recorded the card is title + chevron and nothing else.
 *
 * The pair has to stay one size whatever either of them has to say, so the shell owns the
 * geometry: equal grid columns, `h-full` down to the card face so the shorter card stretches to
 * the row, and three slots (title, a body that takes the slack, a foot pinned to the bottom).
 * The name truncates rather than wrapping — no fixed card height is involved.
 */
function SquareToolCard({
  title,
  tone,
  body,
  foot,
  onClick,
}: {
  title: string;
  tone: string;
  body?: ReactNode;
  foot?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="h-full w-full text-left" type="button" onClick={onClick}>
      <CardShell className="flex h-full min-h-[150px] flex-col">
        <div className="flex items-center gap-2">
          <span className={`text-[15px] font-extrabold tracking-[-0.01em] ${tone}`}>{title}</span>
          <span className="flex-1" />
          <ChevronRight className="shrink-0 text-chevron" size={17} />
        </div>
        <div className="flex-1">{body}</div>
        {foot}
      </CardShell>
    </button>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return <p className="mt-3.5 truncate text-[11px] font-bold uppercase tracking-[0.1em] text-chevron">{children}</p>;
}

/** The speed card's second line: who it is about, and — when there is one — the tier advice. */
function SubjectRow({ subject, caption }: { subject: Combatant; caption?: string }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <SpriteDisc iconRef={subject.iconRef} label={subject.label} />
      {caption && <span className="min-w-0 truncate text-xs font-bold text-textLabel">{caption}</span>}
    </div>
  );
}

function DamageMeter({ minPercent, maxPercent }: { minPercent: number; maxPercent: number }) {
  const low = Math.max(0, Math.min(100, minPercent));
  const span = Math.max(0, Math.min(100 - low, maxPercent - minPercent));
  return (
    <div className="lk-p4a-meter-track mt-3.5 flex h-[5px] gap-0.5 overflow-hidden rounded-full">
      <div className="bg-fnTeal" style={{ width: `${low}%` }} />
      <div className="lk-p4a-damage-soft" style={{ width: `${span}%` }} />
    </div>
  );
}

type Combatant = { label: string; iconRef?: string };

/** 「进攻方 · 招式 → 防守方」. Only the move name may truncate; neither sprite ever does. */
function MatchupRow({ attacker, move, defender }: { attacker: Combatant; move: string; defender: Combatant }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <SpriteDisc iconRef={attacker.iconRef} label={attacker.label} />
      <span className="min-w-0 truncate text-xs font-bold text-textLabel">{move}</span>
      <ArrowRight aria-hidden="true" className="shrink-0 text-textSecondary" size={14} strokeWidth={2.2} />
      <SpriteDisc iconRef={defender.iconRef} label={defender.label} />
    </div>
  );
}

/** The card's headline figure: 「92–109%」, with the unit a size down and a step quieter. */
function PercentRange({ minPercent, maxPercent }: { minPercent: number; maxPercent: number }) {
  return (
    <p className="mt-[5px] text-[28px] font-extrabold leading-8 tracking-[-0.02em] tabular-nums">
      {Math.round(minPercent)}
      <span className="lk-p4a-range-dash">–</span>
      {Math.round(maxPercent)}
      <span className="ml-0.5 text-[17px] tracking-normal text-textSecondary">%</span>
    </p>
  );
}

function SpeedSparkline({ speeds, index }: { speeds: number[]; index: number }) {
  const slowest = Math.min(...speeds);
  const fastest = Math.max(...speeds);
  const heightOf = (speed: number) =>
    fastest === slowest ? 100 : SPARK_MIN_HEIGHT + ((100 - SPARK_MIN_HEIGHT) * (speed - slowest)) / (fastest - slowest);

  return (
    <div className="mt-3.5 flex h-7 items-end gap-1">
      {speeds.map((speed, position) => (
        <span
          key={`${speed}-${position}`}
          className={`flex-1 rounded-[3px] ${position === index ? 'lk-p4a-spark-on' : 'lk-p4a-spark-idle'}`}
          style={{ height: `${heightOf(speed)}%` }}
        />
      ))}
    </div>
  );
}

function TypeDot({ type }: { type: PokemonType }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: typeColors[type] }} />;
}

/** One matchup, read as 「攻击方 → 受击方 ×2」. */
function TypeMatchup({ from, to, toneClass }: { from: PokemonType; to: PokemonType; toneClass: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <TypeDot type={from} />
      {typeLabels[from]}
      <span className="sr-only">攻击</span>
      <ArrowRight aria-hidden="true" className="shrink-0 text-textSecondary" size={15} strokeWidth={2.2} />
      <TypeDot type={to} />
      {typeLabels[to]}
      <span className={toneClass}>×2</span>
    </span>
  );
}

/**
 * 「妖精 → 龙 ×2 · 钢 → 妖精 ×2」: what this type doubles, then what doubles it. Either half is
 * dropped when the type has no such matchup.
 */
function TypeChartLine({ type }: { type: PokemonType }) {
  const hits = offensiveProfile(type).superEffective[0];
  const takenBy = defensiveProfile(type).weakTo[0];
  if (!hits && !takenBy) return null;

  return (
    <div className="mt-2 flex items-center gap-[18px] text-[16px] font-bold tracking-[-0.01em]">
      {hits && <TypeMatchup from={type} to={hits} toneClass="text-fnPink" />}
      {takenBy && <TypeMatchup from={takenBy} to={type} toneClass="text-textLabel" />}
    </div>
  );
}

const recentUseCaption = (result: CalculatorToolResult | SpeedToolResult) =>
  result.tool === 'speed' ? `速度线 · ${result.speed}` : '伤害计算 · 进攻方';

/**
 * The speed card's sample figure: the default subject at 0 SP on a neutral nature, with nothing
 * else applied — cheap enough to compute on every render, unlike the damage sample.
 */
const sampleSpeedOf = (subject: SpeedSubject) => {
  const baseSpeed = findBattleForm(subject.pokemonId, subject.formId)?.baseStats.speed
    ?? findPokemon(subject.pokemonId)?.baseStats.speed;
  if (baseSpeed === undefined) return undefined;
  return calculateSpeedForBuild({
    baseSpeed,
    statPoints: 0,
    nature: 'neutral',
    scarf: false,
    speedAbility: false,
    tailwind: false,
  });
};

/** 「最近用过」 only takes the tools whose result has a pokemon behind it (04-01 draws its sprite). */
const hasSubject = (result: ToolResult): result is CalculatorToolResult | SpeedToolResult =>
  result.tool === 'calculator' || result.tool === 'speed';

export function ToolsPage({
  teams,
  environment,
  onOpenTool,
  onOpenDexEntry,
}: {
  teams?: Team[];
  environment?: EnvironmentState | null;
  onOpenTool: (tool: ToolView) => void;
  onOpenDexEntry: (entry: RecentDexEntry) => void;
}) {
  const dexCount = useMemo(() => getDexFormEntries().length, []);
  // Read once per mount: both lists only change while another page is open.
  const recentDex = useMemo(readRecentDexEntries, []);
  const toolResults = useMemo(readToolResults, []);
  const regulationId = currentRegulation().id;

  const damage = toolResults.find((result): result is CalculatorToolResult => result.tool === 'calculator');
  const speed = toolResults.find((result): result is SpeedToolResult => result.tool === 'speed');
  const typeChart = toolResults.find((result): result is TypeChartToolResult => result.tool === 'typeChart');
  const recentUses = toolResults.filter(hasSubject).slice(0, 2);
  // The speed card names the Pokémon it is previewing, and tapping it opens the page on exactly
  // that one — so with nothing recorded both sides read the same default subject.
  const defaultSpeedSubject = useMemo(
    () => resolveDefaultSpeedSubject({ teams, environment, battleType: currentRuleSet.battleType }),
    [environment, teams],
  );

  // Before a tool has been run, its card shows a worked example instead of an empty panel.
  // The damage figures are frozen (see `toolSamples.ts`); everything else is computed here.
  const damageSample = useMemo(() => {
    const named = (id: string): Combatant => {
      const entry = pokemon.find((candidate) => candidate.id === id);
      return { label: entry?.chineseName ?? id, iconRef: entry?.iconRef };
    };
    return { attacker: named(DAMAGE_SAMPLE.attackerPokemonId), defender: named(DAMAGE_SAMPLE.defenderPokemonId) };
  }, []);

  const sampleSpeed = useMemo(() => sampleSpeedOf(defaultSpeedSubject), [defaultSpeedSubject]);
  const speedValue = speed ? speed.speed : sampleSpeed;

  return (
    <div className="pb-8">
      <h1 className="px-6 pt-11 text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">工具</h1>

      <div className="grid grid-cols-2 gap-3 px-6 pt-[22px]">
        <CardShell className="col-span-2">
          <button
            className="flex w-full items-center gap-2.5 text-left"
            type="button"
            onClick={() => onOpenTool('dex')}
          >
            <h2 className="text-[20px] font-extrabold leading-[25px] tracking-[-0.01em]">规则图鉴</h2>
            <span className="flex-1" />
            <span className="text-xs font-bold text-textSecondary">{dexCount} 只 · {regulationId}</span>
            <ChevronRight className="shrink-0 text-chevron" size={18} />
          </button>
          <button
            aria-label="在图鉴里搜索"
            className="lk-p4a-field mt-3.5 flex h-11 w-full items-center gap-2.5 rounded-[14px] px-[13px]"
            type="button"
            onClick={() => {
              // This looks like a field, so it has to behave like one: raise the keyboard inside
              // the tap, and the dex hands it to its own search field once it has mounted.
              primeKeyboard();
              onOpenTool('dex');
            }}
          >
            <Search className="shrink-0 text-textSecondary" size={17} />
            <span className="min-w-0 flex-1 text-left text-[15px] font-medium text-textSecondary">搜宝可梦 / 招式 / 道具</span>
          </button>
          {recentDex.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-hidden">
              {recentDex.map((entry) => (
                <button
                  key={`${entry.kind}-${entry.id}`}
                  className={`lk-p4a-recent-chip inline-flex h-8 shrink-0 items-center gap-[7px] rounded-full text-[13px] font-bold ${
                    entry.iconRef ? 'pl-[7px] pr-[11px]' : 'px-3 text-textLabel'
                  }`}
                  type="button"
                  onClick={() => onOpenDexEntry(entry)}
                >
                  {entry.iconRef && <Sprite iconRef={entry.iconRef} label={entry.label} size={22} />}
                  {entry.label}
                </button>
              ))}
            </div>
          )}
        </CardShell>

        <SquareToolCard
          body={
            <>
              <CardLabel>{damage ? '上次' : '示例'}</CardLabel>
              <PercentRange
                maxPercent={damage?.maxPercent ?? DAMAGE_SAMPLE.maxPercent}
                minPercent={damage?.minPercent ?? DAMAGE_SAMPLE.minPercent}
              />
              <MatchupRow
                attacker={damage ? { label: damage.label, iconRef: damage.iconRef } : damageSample.attacker}
                defender={damage ? { label: damage.defenderLabel, iconRef: damage.defenderIconRef } : damageSample.defender}
                move={damage ? damage.moveLabel : DAMAGE_SAMPLE.moveLabel}
              />
            </>
          }
          foot={
            <DamageMeter
              maxPercent={damage?.maxPercent ?? DAMAGE_SAMPLE.maxPercent}
              minPercent={damage?.minPercent ?? DAMAGE_SAMPLE.minPercent}
            />
          }
          title="伤害计算"
          tone="text-fnTeal"
          onClick={() => onOpenTool('calculator')}
        />

        <SquareToolCard
          body={
            <>
              <CardLabel>{speed ? '上次' : '示例'}</CardLabel>
              {speedValue !== undefined && (
                <p className="mt-[5px] text-[28px] font-extrabold leading-8 tracking-[-0.02em] tabular-nums">{speedValue}</p>
              )}
              <SubjectRow
                caption={
                  speed
                    ? (speed.nextTierSpeed !== undefined && speed.nextTierStatPoints !== undefined
                      ? `超 ${speed.nextTierSpeed} 档需 +${speed.nextTierStatPoints}`
                      : undefined)
                    : SPEED_SAMPLE_CAPTION
                }
                subject={
                  speed
                    ? { label: speed.label, iconRef: speed.iconRef }
                    : { label: defaultSpeedSubject.label, iconRef: defaultSpeedSubject.iconRef }
                }
              />
            </>
          }
          foot={
            speed?.window && speed.window.length > 0 && (
              <SpeedSparkline index={speed.windowIndex ?? 0} speeds={speed.window} />
            )
          }
          title="速度线"
          tone="text-fnAmber"
          onClick={() => onOpenTool('speed')}
        />

        <button className="col-span-2 text-left" type="button" onClick={() => onOpenTool('typeChart')}>
          <CardShell className="overflow-hidden">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-extrabold tracking-[-0.01em] text-fnPink">属性速查</span>
              <span className="flex-1" />
              <span className="text-xs font-normal text-textSecondary">18 × 18</span>
              <ChevronRight className="shrink-0 text-chevron" size={18} />
            </div>
            <CardLabel>{typeChart ? '上次' : '示例'}</CardLabel>
            <TypeChartLine type={typeChart ? typeChart.type : TYPE_CHART_SAMPLE_TYPE} />
            <div className="mt-3.5 flex gap-[5px]">
              {attackingTypes.map((type) => (
                <span key={type} className="h-1.5 flex-1 rounded-full" style={{ background: typeColors[type] }} />
              ))}
            </div>
          </CardShell>
        </button>

      </div>

      {/* The heading stays put with nothing under it: 04-01 keeps the section, not its cards. */}
      <div className="px-6 pt-7">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">最近用过</h2>
        {recentUses.length > 0 && (
          <div className="mt-3 flex gap-2.5">
            {recentUses.map((use) => (
              <button key={use.tool} className="min-w-0 flex-1 text-left" type="button" onClick={() => onOpenTool(use.tool)}>
                <div className="lk-p4a-card box-border rounded-2xl p-3.5">
                  <Sprite iconRef={use.iconRef} label={use.label} size={48} />
                  <p className="mt-2 truncate text-sm font-bold">{use.label}</p>
                  <p className="mt-[3px] truncate text-xs font-semibold text-textSecondary">{recentUseCaption(use)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
