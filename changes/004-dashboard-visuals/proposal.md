# 004 — Dashboard Visual Widgets — Proposal

> Delta: `changes/004-dashboard-visuals` | Depends on: 003b (dashboard summaries, topology, alerts) | Status: Approved for build
> Date: 2026-09-13

## 1. Context

The Dashboard (`features/dashboard/dashboard-grid.component.ts`) renders plain-text
summaries (`"52 metric points in window"`, `"0 log rows buffered"`) inside `@defer`
bodies. The board chrome (CDK DragDrop, visibility toggles, `linkedSignal` +
`effect` persist `pg.dashboard.layout.v1`, keyboard fallback) is proven by unit +
E2E specs. Users asked for true enterprise-grade visuals in each widget.

## 2. Motivation

Close the UX gap between the Dashboard and the feature pages without breaking the
approved architecture rule (`specs/system-architecture.md` §Rules, `003b/proposal.md`
§4): **features never import cross-feature — share via `CoreStore` (and `shared/`)**.
Directly importing `<app-log-viewer>` / `<app-topology-map>` / `<app-incident-list>`
into the dashboard was rejected (unanimous review): it would couple lazy routes and
eagerly bundle CDK Scrolling + full toolbars into the dashboard chunk.

## 3. Scope

**In:**

- Promote `MetricChartDirective` (`features/telemetry/` → `shared/ui/metric-chart/`);
  `telemetry-page` repoints its import (no behavior change).
- Four dashboard-local widgets in `features/dashboard/widgets/` reading `CoreStore`
  signals only (no cross-feature imports):
  - `dashboard-metric-widget` (×4: cpu/memory/latency/throughput, uPlot via shared directive)
  - `dashboard-log-widget` (minimal compact CDK VirtualScroll, last-100 tail, `h-56`)
  - `dashboard-topology-widget` (compact SVG health graph, no detail aside)
  - `dashboard-incident-widget` (firing banner + badge list, borderless)
- `dashboard-grid` refactor: `@switch`-free `@if` dispatch inside the existing
  `@defer (on viewport)` body; all `widget-*` / `drag-*` / `move-*-up/down` /
  `hide-*` / `show-*` / `dashboard-reset` / `dashboard-board` testids preserved.
- Header glassmorphism polish (`sticky`, `backdrop-blur`, active nav state).
- Unit specs for each widget + updated grid spec (summaries removed); uPlot mocked.
- Verify: `lint` → `typecheck` → `vitest --coverage` (≥80%) → `build` → `e2e`.

**Out:** compact inputs on the full feature components, force-graph layout,
multi-dashboard sharing, CSV export, light mode.

## 4. Alternatives

| Option                                            | Verdict                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Direct cross-feature imports in dashboard         | Rejected: violates arch rules, bundles full pages into dashboard chunk. |
| Dashboard-local widgets (chosen)                  | Accepted: preserves lazy splitting, small duplication, fully testable.  |
| Charts-only hybrid (logs/topology stay summaries) | Rejected: user explicitly approved full visual grid.                    |

## 5. Risks & mitigations

- Directive move touches telemetry imports → pure path move; run telemetry specs first.
- `@defer` stays placeholder in jsdom → grid spec asserts chrome + placeholders;
  real render asserted at widget level + Playwright.
- uPlot constructs on rAF → specs mock `uplot` + stub rAF (established pattern).
- Bundle growth (uPlot + Scrolling on dashboard route) → per-widget `@defer`
  keeps initial paint cheap; budgets enforced by `ng build`.

## 6. Exit criteria

`eslint` clean · `tsc` clean · Vitest all-green ≥80% lines+branches+functions+statements ·
`ng build` passes (500kB warn / 1MB err) · zone-ban grep clean · Playwright dashboard
suite green · `tasks.md` items `[x]`.
