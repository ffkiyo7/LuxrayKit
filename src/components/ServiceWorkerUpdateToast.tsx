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
      className="lk-float fixed inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-50 mx-auto flex max-w-[390px] items-center gap-3 rounded-[18px] bg-btn1 py-3.5 pl-4 pr-3.5"
      role="status"
    >
      <RefreshCw aria-hidden="true" className="shrink-0 text-textLabel" size={18} />
      <span className="min-w-0 flex-1 text-sm font-extrabold tracking-[-0.01em]">新版本已下载</span>
      <button
        className="inline-flex h-9 shrink-0 items-center rounded-xl bg-accent px-3.5 text-sm font-extrabold text-page active:scale-[0.98]"
        type="button"
        onClick={() => window.location.reload()}
      >
        重载
      </button>
      <button
        aria-label="忽略更新提示"
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-textSecondary"
        type="button"
        onClick={() => setVisible(false)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
