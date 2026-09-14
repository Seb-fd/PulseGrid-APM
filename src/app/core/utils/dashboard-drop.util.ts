/**
 * dashboard-drop — pure centroid/hysteresis helpers for the dashboard DnD preview.
 * Delta 011: framework-free so jsdom specs can test positioning without layout.
 * The component feeds the dragged element's center (never the raw cursor) here.
 */

export interface DropPoint {
  x: number;
  y: number;
}

export interface DropItemRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DropGridGeometry {
  boardLeft: number;
  boardTop: number;
  boardWidth: number;
  boardHeight: number;
  columns: number;
  itemCount: number;
}

/** Minimum px inside a neighbouring cell before a ±1 preview flip applies. */
export const DROP_PREVIEW_HYSTERESIS_PX = 8;

/** Minimum ms between grid recalculations during a drag (rAF-throttle guard). */
export const DROP_MOVE_THROTTLE_MS = 32;

/** Center point of the dragged element — the stable snap anchor. */
export function centroidOfRect(rect: DropItemRect): DropPoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Clamp a candidate index into `[0, itemCount - 1]`; empty board → `0`. */
export function clampDropIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.floor(index), 0), itemCount - 1);
}

function safeColumns(columns: number): number {
  if (!Number.isFinite(columns)) return 1;
  return Math.max(Math.floor(columns), 1);
}

function cellForIndex(index: number, columns: number): { row: number; col: number } {
  const cols = safeColumns(columns);
  return { row: Math.floor(index / cols), col: index % cols };
}

/**
 * Resolve the landing index for a dragged element's centroid.
 *
 * Maps the centroid into board-local coordinates, converts to `(row, col)` via
 * uniform cell size (`boardWidth / columns`, `boardHeight / rows`), then clamps.
 * Hysteresis: a ±1-cell candidate only wins when the centroid is at least
 * `DROP_PREVIEW_HYSTERESIS_PX` inside the new cell past the shared edge;
 * otherwise the sticky `currentPreview` is kept to avoid boundary flicker.
 * Larger jumps apply immediately. `currentPreview === null` disables hysteresis.
 */
export function resolveDropIndexFromCentroid(
  centroid: DropPoint,
  geometry: DropGridGeometry,
  currentPreview: number | null,
): number {
  const columns = safeColumns(geometry.columns);
  const itemCount = Math.max(Math.floor(geometry.itemCount), 0);
  if (itemCount === 0) return 0;
  if (itemCount === 1) return 0;

  const rows = Math.max(Math.ceil(itemCount / columns), 1);
  const boardWidth = geometry.boardWidth > 0 ? geometry.boardWidth : 1;
  const boardHeight = geometry.boardHeight > 0 ? geometry.boardHeight : 1;
  const colWidth = boardWidth / columns;
  const rowHeight = boardHeight / rows;

  const localX = centroid.x - geometry.boardLeft;
  const localY = centroid.y - geometry.boardTop;
  const col = Math.min(Math.max(Math.floor(localX / colWidth), 0), columns - 1);
  const row = Math.min(Math.max(Math.floor(localY / rowHeight), 0), rows - 1);
  const candidate = clampDropIndex(row * columns + col, itemCount);

  if (currentPreview === null) return candidate;
  const current = clampDropIndex(currentPreview, itemCount);
  if (candidate === current) return current;
  if (Math.abs(candidate - current) !== 1) return candidate;

  // Adjacent-cell move: require the centroid to be firmly inside the new cell.
  const next = cellForIndex(candidate, columns);
  const edgeLeft = geometry.boardLeft + next.col * colWidth;
  const edgeTop = geometry.boardTop + next.row * rowHeight;
  const insideX = Math.min(centroid.x - edgeLeft, edgeLeft + colWidth - centroid.x);
  const insideY = Math.min(centroid.y - edgeTop, edgeTop + rowHeight - centroid.y);
  const inside = Math.min(insideX, insideY);
  return inside >= DROP_PREVIEW_HYSTERESIS_PX ? candidate : current;
}
