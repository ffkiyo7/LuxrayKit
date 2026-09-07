import { describe, expect, it } from 'vitest';
import {
  DRAG_REORDER_FALLBACK_ROW_HEIGHT,
  clampIndex,
  measureDragRows,
  reorderById,
  resolveDragTargetIndex,
} from './teamDrag';

const rect = (top: number, height: number) => ({ top, height }) as DOMRect;

describe('clampIndex', () => {
  it('keeps an index inside the list', () => {
    expect(clampIndex(-3, 4)).toBe(0);
    expect(clampIndex(2, 4)).toBe(2);
    expect(clampIndex(9, 4)).toBe(3);
  });
});

describe('measureDragRows', () => {
  it('turns rects into midpoints and drops rows that cannot be measured', () => {
    expect(measureDragRows([rect(0, 100), undefined, rect(200, 0), rect(300, 60)])).toEqual([
      { rowIndex: 0, midpoint: 50 },
      { rowIndex: 3, midpoint: 330 },
    ]);
  });
});

describe('resolveDragTargetIndex', () => {
  const measuredRows = measureDragRows([rect(0, 100), rect(100, 100), rect(200, 100), rect(300, 100)]);
  const resolve = (clientY: number) =>
    resolveDragTargetIndex({ clientY, sourceIndex: 0, startY: 10, rowCount: 4, measuredRows });

  it('targets the first row whose centre is below the pointer', () => {
    expect(resolve(0)).toBe(0);
    expect(resolve(49)).toBe(0);
    // Exactly on a centre already belongs to the row below it.
    expect(resolve(50)).toBe(1);
    expect(resolve(120)).toBe(1);
    expect(resolve(151)).toBe(2);
  });

  it('pins to the last measured row once the pointer is past every centre', () => {
    expect(resolve(350)).toBe(3);
    expect(resolve(10_000)).toBe(3);
  });

  it('ignores rows it could not measure when choosing the last row', () => {
    const sparse = measureDragRows([rect(0, 100), undefined, undefined, undefined]);
    expect(resolveDragTargetIndex({ clientY: 900, sourceIndex: 0, startY: 0, rowCount: 4, measuredRows: sparse })).toBe(0);
  });

  it('steps by a nominal row height when nothing has been measured', () => {
    const fallback = (clientY: number, sourceIndex = 1) =>
      resolveDragTargetIndex({ clientY, sourceIndex, startY: 0, rowCount: 4, measuredRows: [] });

    expect(fallback(0)).toBe(1);
    expect(fallback(DRAG_REORDER_FALLBACK_ROW_HEIGHT)).toBe(2);
    expect(fallback(2 * DRAG_REORDER_FALLBACK_ROW_HEIGHT)).toBe(3);
    // And it never walks off either end of the list.
    expect(fallback(20 * DRAG_REORDER_FALLBACK_ROW_HEIGHT)).toBe(3);
    expect(fallback(-20 * DRAG_REORDER_FALLBACK_ROW_HEIGHT)).toBe(0);
  });
});

describe('reorderById', () => {
  const teams = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('moves an item to the target index', () => {
    expect(reorderById(teams, 'c', 0)).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
    expect(reorderById(teams, 'a', 2)).toEqual([{ id: 'b' }, { id: 'c' }, { id: 'a' }]);
  });

  it('returns null for a no-op or an out-of-range move so the caller skips the write', () => {
    expect(reorderById(teams, 'b', 1)).toBeNull();
    expect(reorderById(teams, 'b', 3)).toBeNull();
    expect(reorderById(teams, 'b', -1)).toBeNull();
    expect(reorderById(teams, 'missing', 0)).toBeNull();
  });

  it('does not mutate the input list', () => {
    const original = [...teams];
    reorderById(teams, 'c', 0);
    expect(teams).toEqual(original);
  });
});
