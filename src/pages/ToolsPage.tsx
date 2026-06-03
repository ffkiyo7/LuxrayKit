import { Calculator, ChevronRight, Gauge, Search } from 'lucide-react';
import { Card } from '../components/ui';

export type ToolView = 'calculator' | 'speed' | 'dex';

const toolEntries: Array<{
  id: ToolView;
  title: string;
  description: string;
  icon: typeof Calculator;
}> = [
  {
    id: 'calculator',
    title: '伤害计算',
    description: '攻防双方、招式、天气、场地与伤害区间。',
    icon: Calculator,
  },
  {
    id: 'speed',
    title: '速度线计算',
    description: '单体速度、队伍速度、常见 benchmark 对照。',
    icon: Gauge,
  },
  {
    id: 'dex',
    title: '规则图鉴',
    description: '当前规则内的宝可梦、招式、道具、特性。',
    icon: Search,
  },
];

export function ToolsPage({ onOpenTool }: { onOpenTool: (tool: ToolView) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">工具</h2>
        <p className="text-xs text-textSecondary">三个入口并列，进入后可从本地队伍带入配置。</p>
      </div>
      <div className="space-y-3">
        {toolEntries.map((entry) => {
          const Icon = entry.icon;
          return (
            <Card key={entry.id} className="p-0">
              <button className="flex w-full items-center gap-3 p-4 text-left" type="button" onClick={() => onOpenTool(entry.id)}>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Icon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{entry.title}</span>
                  <span className="mt-1 block text-sm text-textSecondary">{entry.description}</span>
                </span>
                <ChevronRight className="shrink-0 text-textMuted" size={20} />
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
