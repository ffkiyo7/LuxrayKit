import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { TabId } from '../App';
import { useAutoHideBottomNav } from '../hooks/useAutoHideBottomNav';

type BottomNavProps = {
  activeTab: TabId;
  tabs: Array<{ id: TabId; label: string; icon: LucideIcon }>;
  onChange: (tab: TabId) => void;
  collapsed?: boolean;
};

// Floating glass pill (design 09). One component, two states: scrolling down collapses it to
// icons only (54→48px tall, content width, still centred); it never leaves the screen, so a
// collapsed bar is still one tap away from any tab. Materials live in styles.css (.lk-nav-*)
// because the dark and light glass differ in more than a colour token.
export function BottomNav({ activeTab, tabs, onChange, collapsed = false }: BottomNavProps) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTab),
  );
  return (
    <>
      <div aria-hidden="true" className="lk-nav-fade" />
      <nav
        className="lk-nav-pill"
        data-collapsed={collapsed ? 'true' : 'false'}
        style={{ '--lk-nav-count': tabs.length, '--lk-nav-index': activeIndex } as CSSProperties}
      >
        {/* One capsule that slides between tabs — transform only, so switching never relayouts. */}
        <span aria-hidden="true" className="lk-nav-indicator" />
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
              className="lk-nav-tab"
              data-active={active ? 'true' : 'false'}
              onClick={() => onChange(tab.id)}
            >
              <Icon size={22} />
              <span aria-hidden="true" className="lk-nav-label">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// The collapse state lives here rather than in App: it flips mid-scroll, and re-rendering the
// whole App tree at that exact moment is what made the 180ms collapse animation drop frames.
export function AutoHideBottomNav({
  autoHideEnabled,
  lock,
  ...navProps
}: Omit<BottomNavProps, 'collapsed'> & { autoHideEnabled: boolean; lock: boolean }) {
  const { hidden } = useAutoHideBottomNav({ enabled: autoHideEnabled, lock });
  return <BottomNav {...navProps} collapsed={hidden} />;
}
