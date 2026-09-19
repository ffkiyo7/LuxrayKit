import { Check } from 'lucide-react';
import { ListRow, Sheet } from '../../components/kit';

/** N05-10's 天气 sheet: one 60px row per option, the active one highlighted gutter to gutter. */
export function OptionSheet({
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  title: string;
  options: Array<{ id: string; label: string; note?: string }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="mt-3.5">
        {options.map((option, index) => (
          <ListRow
            key={option.id}
            active={option.id === selectedId}
            ariaLabel={option.label}
            bleed
            divider={index < options.length - 1}
            height={60}
            title={<span className="text-[16px]">{option.label}</span>}
            trailing={
              option.id === selectedId ? (
                <Check className="shrink-0 text-textPrimary" size={18} />
              ) : option.note ? (
                <span className="shrink-0 text-[13px] font-semibold text-textSecondary">{option.note}</span>
              ) : undefined
            }
            onClick={() => onSelect(option.id)}
          />
        ))}
      </div>
    </Sheet>
  );
}
