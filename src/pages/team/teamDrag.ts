/**
 * Pure drag-to-reorder maths for the team list. Kept out of `TeamPage.tsx` so the index the
 * pointer resolves to can be tested without a pointer, a layout, or an IndexedDB round trip.
 */

/** Fallback row height (px) used when no card has been measured yet — jsdom, or a first frame. */
export const DRAG_REORDER_FALLBACK_ROW_HEIGHT = 72;

export type TeamDragState = {
  teamId: string;
  sourceIndex: number;
  startY: number;
  currentY: number;
  targetIndex: number;
};

/** One measured list row: its position in the list and the y of its vertical centre. */
export type MeasuredDragRow = { rowIndex: number; midpoint: number };

export const clampIndex = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));

/** Rows whose element is missing or zero-height are dropped: an unmeasurable row can't be a target. */
export const measureDragRows = (rects: Array<DOMRect | undefined>): MeasuredDragRow[] =>
  rects
    .map((rect, rowIndex) => (rect && rect.height > 0 ? { rowIndex, midpoint: rect.top + rect.height / 2 } : null))
    .filter((row): row is MeasuredDragRow => Boolean(row));

/**
 * Where a drag currently pointing at `clientY` would drop.
 *
 * With real measurements the target is the first row whose centre is below the pointer (so the
 * card lands above it), falling back to the last measured row when the pointer is past every
 * centre. With nothing measured we step by a nominal row height from where the drag started.
 */
export const resolveDragTargetIndex = ({
  clientY,
  sourceIndex,
  startY,
  rowCount,
  measuredRows,
}: {
  clientY: number;
  sourceIndex: number;
  startY: number;
  rowCount: number;
  measuredRows: MeasuredDragRow[];
}) => {
  if (measuredRows.length > 0) {
    return measuredRows.find((row) => clientY < row.midpoint)?.rowIndex ?? measuredRows[measuredRows.length - 1].rowIndex;
  }

  const fallbackSteps = Math.round((clientY - startY) / DRAG_REORDER_FALLBACK_ROW_HEIGHT);
  return clampIndex(sourceIndex + fallbackSteps, rowCount);
};

/**
 * The reordered list, or `null` when the move is a no-op or out of range — the caller uses that
 * to skip the IndexedDB write entirely.
 */
export const reorderById = <T extends { id: string }>(items: T[], id: string, targetIndex: number): T[] | null => {
  const currentIndex = items.findIndex((item) => item.id === id);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length || currentIndex === targetIndex) return null;
  const next = [...items];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};
