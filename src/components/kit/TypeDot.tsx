import { typeColors, typeLabels } from '../ui';
import type { PokemonType } from '../../types';

/** The 9px (7px in dual-type rows) type dot the frames use instead of a filled type badge. */
export function TypeDot({ type, size = 9 }: { type: PokemonType; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: typeColors[type] }}
      title={`${typeLabels[type]}属性`}
    />
  );
}
