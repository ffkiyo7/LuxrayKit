import { ChevronRight, Search } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { currentRegulation } from '../data/schedule';
import { attackingTypes } from '../lib/calculations';
import { getDexFormEntries } from '../lib/pokemonForms';
import { readRecentDexEntries, readRecentToolUses, type RecentDexEntry } from '../lib/toolActivity';
import { typeColors } from '../components/ui';
import { Sprite } from '../components/kit';

export type ToolView = 'calculator' | 'dex' | 'speed' | 'typeChart';

/** 04-01 gives each tool a hue of its own, used on the card title and nowhere else. */
const toolCards: Array<{ id: ToolView; title: string; tone: string; meta?: string }> = [
  { id: 'calculator', title: '伤害计算', tone: 'text-fnTeal' },
  { id: 'speed', title: '速度线', tone: 'text-fnAmber' },
];

/** N04-11: entries that exist in the layout but are not built yet. */
const lockedCards = ['对局记录', '随机一队'];

function CardShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`lk-p4a-card box-border rounded-[20px] p-[18px] ${className}`}>{children}</div>;
}

export function ToolsPage({
  onOpenTool,
  onOpenDexEntry,
}: {
  onOpenTool: (tool: ToolView) => void;
  onOpenDexEntry: (entry: RecentDexEntry) => void;
}) {
  const dexCount = useMemo(() => getDexFormEntries().length, []);
  // Read once per mount: both lists only change while another page is open.
  const recentDex = useMemo(readRecentDexEntries, []);
  const recentTools = useMemo(readRecentToolUses, []);
  const regulationId = currentRegulation().id;

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
            onClick={() => onOpenTool('dex')}
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

        {toolCards.map((card) => (
          <button key={card.id} className="text-left" type="button" onClick={() => onOpenTool(card.id)}>
            <CardShell className="flex min-h-[150px] flex-col justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-[15px] font-extrabold tracking-[-0.01em] ${card.tone}`}>{card.title}</span>
                <span className="flex-1" />
                <ChevronRight className="shrink-0 text-chevron" size={17} />
              </div>
            </CardShell>
          </button>
        ))}

        <button className="col-span-2 text-left" type="button" onClick={() => onOpenTool('typeChart')}>
          <CardShell className="overflow-hidden">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-extrabold tracking-[-0.01em] text-fnPink">属性速查</span>
              <span className="flex-1" />
              <span className="text-xs font-normal text-textSecondary">18 × 18</span>
              <ChevronRight className="shrink-0 text-chevron" size={18} />
            </div>
            <div className="mt-3.5 flex gap-[5px]">
              {attackingTypes.map((type) => (
                <span key={type} className="h-1.5 flex-1 rounded-full" style={{ background: typeColors[type] }} />
              ))}
            </div>
          </CardShell>
        </button>

        {lockedCards.map((title) => (
          <div
            key={title}
            aria-disabled="true"
            className="lk-p4a-muted box-border flex min-h-[150px] flex-col justify-between rounded-[20px] p-[18px]"
          >
            <span className="text-[15px] font-extrabold tracking-[-0.01em] text-textSecondary">{title}</span>
            <p className="m-0 text-xs font-semibold text-btnDisabledInk">未开放</p>
          </div>
        ))}
      </div>

      {recentTools.length > 0 && (
        <div className="px-6 pt-7">
          <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">最近用过</h2>
          <div className="mt-3 flex gap-2.5">
            {recentTools.map((use) => (
              <button key={use.tool} className="min-w-0 flex-1 text-left" type="button" onClick={() => onOpenTool(use.tool as ToolView)}>
                <div className="lk-p4a-card box-border rounded-2xl p-3.5">
                  <Sprite iconRef={use.iconRef} label={use.label} size={48} />
                  <p className="mt-2 truncate text-sm font-bold">{use.label}</p>
                  <p className="mt-[3px] truncate text-xs font-semibold text-textSecondary">{use.caption}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
