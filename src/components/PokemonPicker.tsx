import { useMemo, useState } from 'react';
import { pokemon } from '../data';
import type { Pokemon } from '../types';
import { ListRow, SearchField, Sheet, Sprite, TypeDot } from './kit';

/**
 * 「添加成员」— the picker the team detail opens from an empty slot. The editor's own
 * Pokémon/move/item pickers (03) are a separate screen and do not share this sheet.
 */
export function PokemonPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (pokemon: Pokemon) => void;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return pokemon;
    return pokemon.filter(
      (entry) =>
        entry.chineseName.toLowerCase().includes(normalized) ||
        entry.englishName.toLowerCase().includes(normalized) ||
        entry.id.includes(normalized),
    );
  }, [query]);

  if (!open) return null;

  return (
    <Sheet title="添加成员" onClose={onClose}>
      <SearchField
        autoFocus
        className="mt-4"
        label="搜索宝可梦"
        placeholder="搜索 Pokémon 名称..."
        value={query}
        onChange={setQuery}
      />
      <div className="mt-2 max-h-[52vh] overflow-y-auto overscroll-contain">
        {results.length === 0 ? (
          <p className="py-8 text-center text-sm text-textSecondary">未找到匹配的 Pokémon</p>
        ) : (
          results.map((entry, index) => (
            <ListRow
              key={entry.id}
              divider={index < results.length - 1}
              height={68}
              leading={<Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />}
              title={entry.chineseName}
              trailing={
                <span className="flex shrink-0 items-center gap-1.5">
                  {entry.types.map((type) => (
                    <TypeDot key={type} type={type} />
                  ))}
                </span>
              }
              onClick={() => {
                onPick(entry);
                setQuery('');
              }}
            />
          ))
        )}
      </div>
    </Sheet>
  );
}
