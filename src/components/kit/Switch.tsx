/** 48×28 rail with a 24px thumb (05-01 会心一击, N05-14 加速手段). */
export function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${checked ? 'justify-end' : 'justify-start bg-track'}`}
      role="switch"
      style={checked ? { background: 'var(--track-on)' } : undefined}
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span
        className={`h-6 w-6 rounded-full ${checked ? '' : 'bg-knob'}`}
        style={checked ? { background: 'var(--knob-on)' } : undefined}
      />
    </button>
  );
}
