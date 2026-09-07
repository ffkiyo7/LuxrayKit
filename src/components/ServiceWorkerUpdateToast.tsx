import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Dispatched on `window` by the registration code in main.tsx when a *new* service worker takes
 * over a page that already had one. Kept as a CustomEvent so the registration side stays a few
 * lines of plain DOM code and never has to reach into React state.
 */
export const SERVICE_WORKER_UPDATE_EVENT = 'luxraykit:service-worker-updated';

/**
 * sw.js does skipWaiting + clients.claim, so a deploy swaps the controller under a running tab:
 * the shell keeps serving the old chunks until a reload. Say so instead of leaving the user on
 * a silently stale build. Renders nothing until that actually happens.
 */
export function ServiceWorkerUpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUpdate = () => setVisible(true);
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdate);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 flex items-center gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 text-sm shadow-lg"
      role="status"
    >
      <span className="min-w-0 flex-1">新版本已就绪，刷新以更新</span>
      <button
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-page active:scale-[0.98]"
        type="button"
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={13} aria-hidden="true" />
        刷新
      </button>
      <button
        aria-label="忽略更新提示"
        className="shrink-0 text-textMuted"
        type="button"
        onClick={() => setVisible(false)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
