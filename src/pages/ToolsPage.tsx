import { ChevronRight, Search } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { currentRuleSet } from '../data';
import type { EnvironmentState } from '../data/environment';
import { currentRegulation } from '../data/schedule';
import { attackingTypes } from '../lib/calculations';
import { primeKeyboard } from '../lib/keyboardHandoff';
import { getDexFormEntries } from '../lib/pokemonForms';
import { resolveDefaultSpeedSubject } from '../lib/speedTier';
import type { Team } from '../types';
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
import { Sprite } from '../components/kit';

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

function CardLabel({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  return (
    <p className={`mt-3.5 truncate text-[11px] font-bold text-chevron ${plain ? '' : 'uppercase tracking-[0.1em]'}`}>
      {children}
    </p>
  );
}

function CardCaption({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs font-semibold text-textSecondary">{children}</p>;
}

function DamageMeter({ result }: { result: CalculatorToolResult }) {
  const low = Math.max(0, Math.min(100, result.minPercent));
  const span = Math.max(0, Math.min(100 - low, result.maxPercent - result.minPercent));
  return (
    <div className="lk-p4a-meter-track mt-3.5 flex h-[5px] gap-0.5 overflow-hidden rounded-full">
      <div className="bg-fnTeal" style={{ width: `${low}%` }} />
      <div className="lk-p4a-damage-soft" style={{ width: `${span}%` }} />
    </div>
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

/** 「妖精 打 龙 ×2 · 挨 钢 ×2」 — either half is dropped when the type has no such matchup. */
function TypeChartLine({ result }: { result: TypeChartToolResult }) {
  const hits = offensiveProfile(result.type).superEffective[0];
  const takes = defensiveProfile(result.type).weakTo[0];
  if (!hits && !takes) return null;

  return (
    <p className="mt-2.5 text-[17px] font-bold tracking-[-0.01em]">
      {typeLabels[result.type]}
      {hits && (
        <> 打 {typeLabels[hits]} <span className="text-fnPink">×2</span></>
      )}
      {hits && takes && ' ·'}
      {takes && (
        <> 挨 {typeLabels[takes]} <span className="text-textLabel">×2</span></>
      )}
    </p>
  );
}

const recentUseCaption = (result: CalculatorToolResult | SpeedToolResult) =>
  result.tool === 'speed' ? `速度线 · ${result.speed}` : '伤害计算 · 进攻方';

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
  const speedSubjectLabel = useMemo(
    () => speed?.label ?? resolveDefaultSpeedSubject({ teams, environment, battleType: currentRuleSet.battleType }).label,
    [environment, speed?.label, teams],
  );

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
            damage && (
              <>
                <CardLabel>上次</CardLabel>
                <p className="mt-[5px] text-[28px] font-extrabold leading-8 tracking-[-0.02em] tabular-nums">
                  {damage.minDamage}
                  <span className="lk-p4a-range-dash">–</span>
                  {damage.maxDamage}
                </p>
                <CardCaption>{damage.hko} · {damage.maxPercent}%</CardCaption>
              </>
            )
          }
          foot={damage && <DamageMeter result={damage} />}
          title="伤害计算"
          tone="text-fnTeal"
          onClick={() => onOpenTool('calculator')}
        />

        <SquareToolCard
          body={
            <>
              <CardLabel plain>{speedSubjectLabel}</CardLabel>
              {speed && (
                <>
                  <p className="mt-[5px] text-[28px] font-extrabold leading-8 tracking-[-0.02em] tabular-nums">{speed.speed}</p>
                  {speed.nextTierSpeed !== undefined && speed.nextTierStatPoints !== undefined && (
                    <CardCaption>超 {speed.nextTierSpeed} 档需 +{speed.nextTierStatPoints}</CardCaption>
                  )}
                </>
              )}
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
            {typeChart && <TypeChartLine result={typeChart} />}
            <div className="mt-3.5 flex gap-[5px]">
              {attackingTypes.map((type) => (
                <span key={type} className="h-1.5 flex-1 rounded-full" style={{ background: typeColors[type] }} />
              ))}
            </div>
          </CardShell>
        </button>

      </div>

      {recentUses.length > 0 && (
        <div className="px-6 pt-7">
          <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">最近用过</h2>
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
        </div>
      )}
    </div>
  );
}
