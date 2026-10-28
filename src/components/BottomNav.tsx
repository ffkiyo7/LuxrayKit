import type { LucideIcon } from 'lucide-react';
import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { TabId } from '../App';
import { useAutoHideBottomNav } from '../hooks/useAutoHideBottomNav';

// Horizontal travel before a press turns into a drag; below it the press stays a plain tap.
const DRAG_THRESHOLD_PX = 6;

type BottomNavProps = {
  activeTab: TabId;
  tabs: Array<{ id: TabId; label: string; icon: LucideIcon }>;
  onChange: (tab: TabId) => void;
  collapsed?: boolean;
};

// Floating glass pill (design 09). One component, two states: scrolling down collapses it to
// icons only (54→48px tall, content width, still centred); it never leaves the screen, so a
// collapsed bar is still one tap away from any tab. The capsule can also be dragged across the
// bar; releasing it selects the tab underneath. Materials live in styles.css (.lk-nav-*)
// because the dark and light glass differ in more than a colour token.
export function BottomNav({ activeTab, tabs, onChange, collapsed = false }: BottomNavProps) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTab),
  );
  const navRef = useRef<HTMLElement>(null);
  const pointer = useRef<{ id: number; startX: number; dragging: boolean } | null>(null);
  // A drag that ends over a button can still produce a click on it; swallow that one click.
  const suppressClick = useRef(false);
  // Fractional tab index while the capsule is being dragged, null otherwise.
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const indexAt = (clientX: number) => {
    const rect = navRef.current?.getBoundingClientRect();
    if (!rect) return activeIndex;
    // 2px padding on each side, tabs share the rest equally; centre the capsule under the finger.
    const slot = (rect.width - 4) / tabs.length;
    if (slot <= 0) return activeIndex;
    return Math.min(tabs.length - 1, Math.max(0, (clientX - rect.left - 2) / slot - 0.5));
  };

  const endDrag = () => {
    pointer.current = null;
    setDragIndex(null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    suppressClick.current = false;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer.current = { id: event.pointerId, startX: event.clientX, dragging: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    if (!current.dragging) {
      if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return;
      current.dragging = true;
      // Keep receiving moves after the finger slides off the pill.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setDragIndex(indexAt(event.clientX));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.dragging) {
      suppressClick.current = true;
      const target = tabs[Math.round(indexAt(event.clientX))];
      if (target && target.id !== activeTab) onChange(target.id);
    }
    endDrag();
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const dragging = dragIndex !== null;
  // While dragging, the tab under the capsule lights up so the release target is obvious.
  const highlightIndex = dragging ? Math.round(dragIndex) : activeIndex;
  return (
    <>
      <div aria-hidden="true" className="lk-nav-fade" />
      <nav
        ref={navRef}
        className="lk-nav-pill"
        data-collapsed={collapsed ? 'true' : 'false'}
        data-dragging={dragging ? 'true' : 'false'}
        style={{ '--lk-nav-count': tabs.length, '--lk-nav-index': dragIndex ?? activeIndex } as CSSProperties}
        onClickCapture={handleClickCapture}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* One capsule that slides between tabs — transform only, so switching never relayouts.
            Dragging feeds it a fractional index so it follows the finger. */}
        <span aria-hidden="true" className="lk-nav-indicator" />
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
              className="lk-nav-tab"
              data-active={index === highlightIndex ? 'true' : 'false'}
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
