import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useVisualViewportMetrics } from '../../hooks/useVisualViewportMetrics';

/**
 * Bottom sheet shell. The default geometry is 05-03 (24/24/28 padding, 30px close button);
 * `variant="handle"` is 05-06's grab-handle sheet, which sits on a deeper face and drops the
 * title row. `data-bottom-nav-lock` keeps the floating nav pinned while a sheet is open.
 *
 * The sheet rides the *visual* viewport rather than the layout one: on iOS the software
 * keyboard shrinks only the former, so a sheet with a field in it (N02-17, 03-05) would
 * otherwise sit behind the keyboard the moment it opens.
 */
export function Sheet({
  title,
  label,
  variant = 'titled',
  children,
  onClose,
}: {
  title?: string;
  /** Accessible name; defaults to `title`. */
  label?: string;
  variant?: 'titled' | 'handle';
  children: ReactNode;
  onClose: () => void;
}) {
  const handle = variant === 'handle';
  const viewport = useVisualViewportMetrics();
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);

  return (
    <div
      ref={dialog}
      aria-label={label ?? title}
      aria-modal="true"
      className="fixed inset-0 z-50 mx-auto max-w-[430px] outline-none"
      data-bottom-nav-lock="true"
      role="dialog"
      tabIndex={-1}
    >
      <button aria-label="关闭" className="lk-sheet-overlay absolute inset-0 h-full w-full" type="button" onClick={onClose} />
      <section
        className={`absolute inset-x-0 overflow-y-auto overscroll-contain ${
          handle ? 'lk-sheet--deep rounded-t-3xl px-6 pb-[26px] pt-2.5' : 'lk-sheet rounded-t-[20px] px-6 pb-7 pt-6'
        }`}
        style={{ bottom: `${viewport.bottomInset}px`, maxHeight: `${Math.round(viewport.height * 0.86)}px` }}
      >
        {handle ? (
          <span className="mx-auto mb-4 block h-1 w-[38px] rounded-full bg-textPrimary/20" />
        ) : (
          <div className="flex items-start gap-3">
            {title && <h2 className="m-0 min-w-0 flex-1 text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{title}</h2>}
            <button
              aria-label="关闭"
              className="-mr-1 -mt-0.5 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-btn1 text-textLabel"
              type="button"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {children}
      </section>
    </div>
  );
}
