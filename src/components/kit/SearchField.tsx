import { Search, X } from 'lucide-react';

/**
 * 44px search field (05-04 idle, 07-07 / 03-05 / N05-07 active): the frame draws the active
 * state as a violet 1.5px ring with the query in 16/700 and a 22px clear button. The caret
 * stays the platform one (tinted to match the frame's 1.5px bar) so text entry, IME and
 * selection behave natively.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const active = value.length > 0;

  return (
    <div
      className={`flex h-11 items-center gap-2.5 rounded-[14px] bg-surface px-3.5 ${active ? 'lk-field-on' : ''} ${className}`}
    >
      <Search className={`shrink-0 ${active ? 'text-textLabel' : 'text-chevron'}`} size={18} />
      <input
        aria-label={label}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent text-[16px] font-bold caret-textPrimary outline-none placeholder:text-[15px] placeholder:font-medium placeholder:text-textSecondary"
        inputMode="search"
        placeholder={placeholder}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {active && (
        <button
          aria-label={`清除${label}`}
          className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-btn1 text-textLabel"
          type="button"
          onClick={() => onChange('')}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
