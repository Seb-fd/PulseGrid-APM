# 011 — Dashboard DnD Preview & Centroid Snapping — Proposal

> Delta: `changes/011-dashboard-dnd-preview` | Depends on: 003b (dashboard grid), 007 (overview) | Status: Approved for build
> Date: 2026-09-14 | Skills: `create-zoneless-component`, `generate-bdd-spec`

## 1. Context

`DashboardGridComponent` (`src/app/features/dashboard/dashboard-grid.component.ts`) is a
linear `cdkDropList` (`grid-cols-1 md:grid-cols-2`) with a single `drop()` handler using
`moveItemInArray`. There is no X/Y math, no drop ghost, no `moved/entered` handling. CDK's
default cursor-based sorting flickers when the pointer straddles an item boundary, and users
get no exact cell-span feedback before release.

## 2. Motivation

Make graph positioning intuitive and predictable: a visible dashed ghost shows the exact
landing cell, centroid (element center — not cursor) drives the target index with hysteresis,
and recalculations are rAF-throttled so the grid never jolts mid-drag.

## 3. Scope

**In:**

- Pure helper `src/app/core/utils/dashboard-drop.util.ts` (centroid + hysteresis index
  resolution, framework-free, strict-TS).
- `DashboardGridComponent` signals `draggedWidgetId` / `dropPreviewIndex`, `*cdkDragPlaceholder`
  ghost + Tailwind feedback (drag shadow, dashed accent border), rAF-throttled `onDragMoved`.
- Unit/BDD specs: helper spec + extended `dashboard-grid.spec.ts` (preview signals, ghost DOM,
  hysteresis, throttle).
- Gates: `lint` → `typecheck` → `vitest --run --coverage` → `build`.

**Out:** free-form pixel resize, multi-dashboard sharing, cross-column `transferArrayItem`,
chart-library changes, E2E additions (existing DnD E2E stays).

## 4. Alternatives

| Option                                               | Verdict                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Cursor `pointerPosition` directly as target          | Rejected: boundary straddle flickers; centroid is stable.                                 |
| Fully custom absolutely-positioned ghost             | Rejected: duplicates CDK sorting/anim; style `*cdkDragPlaceholder` instead (approved).    |
| RxJS `Subject + auditTime` in component for throttle | Rejected by constitution §3: no `subscribe()` in components; rAF timestamp guard instead. |
| `BehaviorSubject` for drag state                     | Rejected by §3.2; `signal` only.                                                          |

## 5. Risks & mitigations

- CDK + zoneless: pointer events mutate signals only; no `NgZone.run()` / `tick()` hacks (§1.3).
- jsdom has no layout: helper takes explicit rects/geometry args so it is fully unit-testable
  without DOM measurement; component handlers guard `getBoundingClientRect` with try/catch.
- A11y: keyboard `moveWidget` fallback + `LiveAnnouncer` messages unchanged; ghost is
  `aria-hidden`, board `aria-label` unchanged.
- Coverage gate ≥80% preserved; new code is pure + signal-driven (trivially covered).

## 6. Exit criteria

`proposal/design/tasks` present · `eslint` clean · `tsc` clean · Vitest green (helper + grid
specs) with coverage ≥80% · `ng build` passes · commit
`fix(dashboard): improve drag and drop UX with clear drop preview and smooth grid snapping`.
