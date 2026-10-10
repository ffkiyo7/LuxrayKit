import { ChevronLeft } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** How far the page scrolls before the 34px large title has slid under the bar. */
const COLLAPSE_OFFSET = 56;

function useScrolledPast(offset: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > offset);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [offset]);
  return past;
}

/**
 * Navigation bar of every pushed page: a 36px round back button left, page actions right.
 * It sticks to the top, so 返回 stays in reach on long pages — a Home Screen PWA gets no system
 * edge-swipe back. Once the large title below has scrolled under it, the bar takes on a material
 * and the title fades in small in the middle (the iOS Large Title → inline title collapse).
 *
 * Must be a direct child of the page's root element: `sticky` only holds inside its parent.
 */
export function NavBar({
  onBack,
  backLabel = '返回',
  title,
  trailing,
  onHero = false,
  collapseAt = COLLAPSE_OFFSET,
  className = '',
}: {
  onBack: () => void;
  backLabel?: string;
  /** The page's large title, shown small in the bar once collapsed. */
  title?: string;
  trailing?: ReactNode;
  /** Sits on a page's aura hero, so the buttons use the hero's translucent fill. */
  onHero?: boolean;
  /** Scroll offset where the large title has gone under the bar, for pages with art above it. */
  collapseAt?: number;
  className?: string;
}) {
  const collapsed = useScrolledPast(collapseAt);
  return (
    // z-30: above the tab bar (z-20), so a trailing menu's full-screen dismiss layer still covers it.
    <div className={`sticky top-0 z-30 flex items-center gap-3 px-6 pb-2 pt-3 ${className}`}>
      {/* The material is its own layer: a backdrop-filter on the bar itself would trap the
          fixed-position overlays some trailing menus render. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 border-b bg-page/80 backdrop-blur-xl transition-opacity duration-200 ${
          collapsed ? 'border-[var(--hairline-strong)] opacity-100' : 'border-transparent opacity-0'
        }`}
      />
      <button
        aria-label={backLabel}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${onHero ? 'lk-on-hero text-textPrimary' : 'bg-surface text-textLabel'}`}
        type="button"
        onClick={onBack}
      >
        <ChevronLeft size={20} />
      </button>
      {/* Drawn from an attribute, not a text node: the page's own heading stays the one place the
          title is written, for screen readers and for text queries alike. */}
      <span
        aria-hidden="true"
        className={`min-w-0 flex-1 truncate text-center text-[17px] font-bold tracking-[-0.01em] transition-opacity duration-200 before:content-[attr(data-title)] ${
          title && collapsed ? 'opacity-100' : 'opacity-0'
        }`}
        data-title={title}
      />
      {trailing ?? <span aria-hidden="true" className="h-9 w-9 shrink-0" />}
    </div>
  );
}
