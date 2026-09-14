import { describe, expect, it } from 'vitest';
import {
  DROP_MOVE_THROTTLE_MS,
  DROP_PREVIEW_HYSTERESIS_PX,
  centroidOfRect,
  clampDropIndex,
  resolveDropIndexFromCentroid,
  type DropGridGeometry,
} from './dashboard-drop.util';

function geometry(): DropGridGeometry {
  // 7 widgets, 2 columns → 4 rows; board 600x800 starting at origin.
  return {
    boardLeft: 0,
    boardTop: 0,
    boardWidth: 600,
    boardHeight: 800,
    columns: 2,
    itemCount: 7,
  };
}

describe('GIVEN dashboard-drop centroid helper', () => {
  it('WHEN rect is measured THEN centroid is its center', () => {
    expect(centroidOfRect({ left: 10, top: 20, width: 100, height: 60 })).toEqual({
      x: 60,
      y: 50,
    });
  });

  it('WHEN index is out of range THEN it clamps into bounds', () => {
    expect(clampDropIndex(-3, 7)).toBe(0);
    expect(clampDropIndex(99, 7)).toBe(6);
    expect(clampDropIndex(2.9, 7)).toBe(2);
    expect(clampDropIndex(0, 0)).toBe(0);
    expect(clampDropIndex(Number.NaN, 7)).toBe(0);
  });

  it('WHEN centroid sits in a cell THEN index maps to Grid Column/Row', () => {
    const geo = geometry();
    // colWidth 300, rowHeight 200: (350, 450) → row 2, col 1 → index 5.
    expect(resolveDropIndexFromCentroid({ x: 350, y: 450 }, geo, null)).toBe(5);
    // Top-left cell → index 0; bottom row only has col 0 (index 6), col 1 clamps.
    expect(resolveDropIndexFromCentroid({ x: 10, y: 10 }, geo, null)).toBe(0);
    expect(resolveDropIndexFromCentroid({ x: 590, y: 790 }, geo, null)).toBe(6);
  });

  it('WHEN centroid jitters near a cell edge THEN hysteresis keeps the sticky preview', () => {
    const geo = geometry();
    // Edge between index 0 (x 0..300) and index 1 (x 300..600) at row 0.
    // 2px inside cell 1 → below hysteresis → stays 0.
    expect(
      resolveDropIndexFromCentroid({ x: 300 + DROP_PREVIEW_HYSTERESIS_PX - 6, y: 50 }, geo, 0),
    ).toBe(0);
    // Firmly inside cell 1 → flips to 1.
    expect(resolveDropIndexFromCentroid({ x: 450, y: 50 }, geo, 0)).toBe(1);
  });

  it('WHEN centroid jumps more than one cell THEN it applies immediately', () => {
    const geo = geometry();
    // Row 3, col 1 → 7, clamped to last index 6: a multi-cell jump from 0 applies at once.
    expect(resolveDropIndexFromCentroid({ x: 350, y: 650 }, geo, 0)).toBe(6);
  });

  it('WHEN board is single-column or degenerate THEN resolution stays safe', () => {
    const single: DropGridGeometry = { ...geometry(), columns: 1 };
    expect(resolveDropIndexFromCentroid({ x: 5, y: 750 }, single, null)).toBe(6);
    expect(resolveDropIndexFromCentroid({ x: 5, y: 750 }, single, 0)).toBe(6);
    const empty: DropGridGeometry = { ...geometry(), itemCount: 0 };
    expect(resolveDropIndexFromCentroid({ x: 5, y: 5 }, empty, null)).toBe(0);
  });

  it('WHEN throttle constant is read THEN recalculations stay debounced at rAF scale', () => {
    expect(DROP_MOVE_THROTTLE_MS).toBeGreaterThanOrEqual(16);
    expect(DROP_MOVE_THROTTLE_MS).toBeLessThanOrEqual(64);
  });
});
