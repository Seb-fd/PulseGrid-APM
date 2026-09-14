# 011 — Dashboard DnD Preview & Centroid Snapping — Design

> Frozen contracts for delta 011. Reuses `DashboardLayout` / `DashboardWidgetLayout`
> unchanged from `003b/design.md` §1. No schema migration.

## 1. Pure helper (new)

```ts
// src/app/core/utils/dashboard-drop.util.ts (no Angular deps)
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
export function centroidOfRect(rect: DropItemRect): DropPoint;
export function clampDropIndex(index: number, itemCount: number): number;
export function resolveDropIndexFromCentroid(
  centroid: DropPoint,
  geometry: DropGridGeometry,
  currentPreview: number | null,
): number;
export const DROP_PREVIEW_HYSTERESIS_PX = 8;
export const DROP_MOVE_THROTTLE_MS = 32;
```

- `centroidOfRect`: `x = left + width / 2`, `y = top + height / 2`.
- `clampDropIndex`: `min(max(floor(index), 0), max(itemCount - 1, 0))`; empty board → `0`.
- `resolveDropIndexFromCentroid`: pointer-independent. Maps the dragged element's center
  into board-local coords, derives `row = floor((y - boardTop) / rowHeight)`,
  `col = floor((x - boardLeft) / colWidth)` with `rowHeight = boardHeight / rows`,
  `rows = ceil(itemCount / columns)`; candidate `= row * columns + col` clamped.
  Hysteresis: when `currentPreview !== null`, the candidate must move the centroid at
  least `DROP_PREVIEW_HYSTERESIS_PX` past the current cell's center boundary before the
  index flips — implemented as: if candidate differs by exactly ±1 cell, require the
  centroid to be ≥ hysteresis px inside the new cell (measured against the shared cell
  edge), otherwise keep `currentPreview`. Larger jumps apply immediately. Single-column
  boards degrade to vertical midpoint logic.
- Throttle constant consumed by the component's rAF/timestamp guard (not RxJS).

## 2. DashboardGridComponent delta

```ts
// additions only; existing layout/visibleWidgets/drop/toggle/move/reset untouched
readonly draggedWidgetId = signal<string | null>(null);
readonly dropPreviewIndex = signal<number | null>(null);
readonly dropPreviewPosition: Signal<{ row: number; col: number } | null>;
onDragStarted(id: string): void;
onDragMoved(event: CdkDragMove<unknown>): void; // rAF-throttled centroid → dropPreviewIndex
onDragEnded(): void; // clears both signals
override drop(event: CdkDragDrop<DashboardWidgetLayout[]>): void; // clears signals first, then existing moveItemInArray path
isDragging(id: string): boolean;
isPreview(index: number): boolean;
private lastDragMoveAt = 0;
```

- `dropPreviewPosition` is a `computed` mapping `dropPreviewIndex` → `{ row, col }`
  (2-col `md:` geometry, 1-col below `md` is display-only; index stays canonical).
- `onDragMoved` reads `event.source.getRootElement().getBoundingClientRect()` (guarded),
  takes its centroid, builds board geometry from the `data-testid="dashboard-board"`
  element, calls `resolveDropIndexFromCentroid`, sets `dropPreviewIndex` only on change
  (no CD churn). Timestamp guard `DROP_MOVE_THROTTLE_MS` prevents layout thrash.
- Template: `<section cdkDrag (cdkDragStarted)="onDragStarted(widget.id)"
(cdkDragMoved)="onDragMoved($event)" (cdkDragReleased)="onDragEnded()"
[class.drag-active]="isDragging(widget.id)">` + `<div *cdkDragPlaceholder
class="drop-ghost" data-testid="drop-preview" aria-hidden="true"></div>`.
- Styles (component `styles: [...]`, Tailwind classes + CDK hooks):
  `.drag-active { box-shadow + border-cyan tint }`,
  `.drop-ghost { dashed cyan border, translucent fill, min-h 200px }`,
  `::ng-deep .cdk-drag-preview { shadow }`, `.cdk-drag-placeholder { opacity }` fallback.

## 3. Test contracts (BDD → file)

| Criterion                                                                                                             | Spec                                                     |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Centroid center math; clamp bounds; single-col rows; hysteresis holds ±1 on jitter, flips past threshold, jumps apply | `core/utils/dashboard-drop.util.spec.ts`                 |
| Drag start sets `draggedWidgetId` + `.drag-active`; release clears; ghost `drop-preview` renders while dragging       | `features/dashboard/dashboard-grid.spec.ts`              |
| Throttled `onDragMoved` updates `dropPreviewIndex` once per window; `drop()` clears preview + persists order          | `features/dashboard/dashboard-grid.spec.ts`              |
| Existing reorder/persist/hide/reset/keyboard/a11y unchanged                                                           | `features/dashboard/dashboard-grid.spec.ts` (regression) |
