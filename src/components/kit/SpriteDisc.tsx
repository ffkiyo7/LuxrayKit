import { Sprite } from './Sprite';

/**
 * A sprite on a coin: the card's own face plus a hairline, so a transparent artwork still reads
 * as one object at small sizes. 04-01's tool cards introduced it at 26px; 05-01's side cards
 * reuse it at 30px, where the name sits beside it rather than under it.
 *
 * The artwork inlays 4px so the ring never crops it.
 */
export function SpriteDisc({ iconRef, label, size = 26 }: { iconRef?: string; label: string; size?: number }) {
  return (
    <span className="lk-p4a-tool-disc grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size }}>
      <Sprite iconRef={iconRef} label={label} size={size - 4} />
    </span>
  );
}
