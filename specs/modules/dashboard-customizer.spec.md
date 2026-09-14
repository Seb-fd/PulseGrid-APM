# Dashboard Customizer — Functional Specification

> Feature 5: Dynamic Dashboard Customizer
> Engine: `@angular/cdk/drag-drop` | Persist: `localStorage` via `linkedSignal` + `effect`

## 1. Overview

Users rearrange/resize/show-hide widgets (telemetry charts, log console, topology, incidents) on a CSS Grid board.

## 2. Functional Requirements

- FR-D1: Grid board with draggable widgets (`CdkDragDrop`, `CdkDropList` + `moveItemInArray` / `transferArrayItem` across columns).
- FR-D2: Widget catalogue: CPU chart, Memory chart, Latency chart, Throughput chart, Log console (compact), Topology (compact), Incident list. Toggle visibility.
- FR-D3: Layout persists (`id, col, row, w, h, visible`) to `localStorage` via `effect`; restores on boot; "Reset layout" restores default.
- FR-D4: Each widget is `@defer`-wrapped host (`WidgetHostDirective`) so hidden/off-screen widgets don't load.
- FR-D5: DnD is keyboard-accessible fallback (move left/right buttons) + touch-friendly drag handle.

## 3. BDD Acceptance Criteria

```gherkin
Scenario: Reorder persists
  GIVEN dashboard with default layout
  WHEN user drags Latency widget above CPU widget
  THEN order updates immediately AND after reload the same order is restored

Scenario: Hide and restore widget
  GIVEN all widgets visible
  WHEN user hides Topology
  THEN grid reflows without gap AND after Reset layout topology reappears

Scenario: Deferred widget load
  GIVEN Log console widget is below fold
  WHEN dashboard loads
  THEN its bundle defers until viewport AND placeholder shimmer shows

Scenario: E2E drag-and-drop
  GIVEN Playwright on dashboard
  WHEN it drags widget A onto position B
  THEN DOM order changes AND localStorage snapshot matches
```

## 4. Non-Functional

- NFR-D1: Drag frame rate 60fps (transform-only, no layout thrash).
- NFR-D2: Layout schema versioned (`v1`) with migration guard for future changes.

## 5. Out of Scope

- Free-form pixel resize — grid-span presets (1x1, 2x1, 1x2) only.
- Multi-dashboard / sharing — single personal layout Phase 1.
