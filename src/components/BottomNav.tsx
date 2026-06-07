import type { LucideIcon } from 'lucide-react';
import type { TabId } from '../App';

export function BottomNav({
  activeTab,
  tabs,
  onChange,
  hidden = false,
}: {
  activeTab: TabId;
  tabs: Array<{ id: TabId; label: string; icon: LucideIcon }>;
  onChange: (tab: TabId) => void;
  hidden?: boolean;
}) {
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] transform-gpu border-t border-divider bg-secondary/95 px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none ${
        hidden ? 'translate-y-full' : 'translate-y-0'
      }`}
      data-hidden={hidden ? 'true' : 'false'}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                active ? 'text-accent' : 'text-textMuted'
              }`}
              onClick={() => onChange(tab.id)}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
              <span className={`h-1 w-1 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
