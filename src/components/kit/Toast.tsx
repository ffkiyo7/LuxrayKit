/**
 * Global operation feedback (08-08 / NL-07). One card shape for all three outcomes — only the
 * 8px dot changes colour — stacked from the top so the floating nav is never covered.
 */
export type ToastTone = 'success' | 'info' | 'danger';

const dotClass: Record<ToastTone, string> = {
  success: 'bg-success',
  info: 'lk-toast-dot-info',
  danger: 'bg-danger',
};

export function Toast({ title, description, tone = 'success' }: { title: string; description?: string; tone?: ToastTone }) {
  return (
    <div
      aria-live="polite"
      className="lk-toast fixed inset-x-4 top-4 z-50 mx-auto flex max-w-[398px] items-start gap-2.5 rounded-[14px] px-3.5 py-3"
      role="status"
    >
      <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dotClass[tone]}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold tracking-[-0.01em]">{title}</span>
        {description && <span className="mt-[3px] block text-xs font-semibold text-textSecondary">{description}</span>}
      </span>
    </div>
  );
}
