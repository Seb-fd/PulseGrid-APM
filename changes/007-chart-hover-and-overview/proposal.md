# 007 — Chart Hover Isolation + Dashboard Overview — Proposal

> Delta: `changes/007-chart-hover-and-overview` | Depends on: 004 (shared `MetricChartDirective`), 003b (dashboard grid) | Status: Approved for build
> Date: 2026-09-14

## 1. Context

Two unrelated dashboard papercuts reported together:

1. **Multi-chart hover sync bug.** `MetricChartDirective.darkOptions()` sets
   `cursor.sync = { key: 'pulsegrid' }` (`src/app/shared/ui/metric-chart/metric-chart.directive.ts:94`).
   uPlot mirrors cursor/tooltip across every instance sharing a sync key, so hovering one
   chart lights up all 4 telemetry charts (and all 4 dashboard metric widgets). Tooltips
   overlap and the hovered series is unreadable.
2. **No onboarding context.** The dashboard grid opens straight into widgets with no
   explanation of what PulseGrid APM is, what the status colors mean, or what the metric
   thresholds are. New users must discover this from feature pages.

## 2. Motivation

- Hover tooltips are the primary way to read exact values on dense 60fps charts; synced
  cursors across different units (%, ms, rps) are actively misleading.
- A one-screen overview banner (dismissible) shortens first-run orientation without
  taxing experienced users.

## 3. Scope

**In:**

- Remove `sync.key` from `darkOptions()` so every uPlot instance owns an independent
  cursor/tooltip. Single fix covers telemetry page + dashboard widgets (shared directive).
- Regression spec: constructed cursor options carry no `sync` key.
- Dashboard-grid-top overview banner (`dashboard-grid.component.ts` only — not global
  `app.component.ts` header, per approval):
  - One-sentence platform description (real-time server metrics, log streams, topology health).
  - Legend callouts: Emerald = Healthy, Amber = Degraded, Red = Critical/Down.
  - Metric threshold callouts sourced from `METRIC_THRESHOLDS` (no hardcoding).
  - Dismissible via `overview-dismiss` button, persisted under `pg.dashboard.overview.v1`;
    compact `What is PulseGrid?` restore button (`overview-show`) when dismissed.
  - Accessible (`role="region"`, labelled, keyboard-focusable controls), OnPush + signals.
- Unit specs (banner show/dismiss/persist/restore/a11y) + E2E coverage (banner persist + reload).
- Full verify: `lint` → `typecheck` → `vitest --coverage` (≥80%) → `build` → `e2e`.

**Out:** per-chart opt-in sync, global header redesign, threshold value changes,
constitution amendment, light mode, CSV export.

## 4. Alternatives

| Option                                     | Verdict                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Delete `sync` entirely (chosen)            | Accepted: approved requirement is fully independent hovers; zero API change.       |
| Unique sync key per chart instance         | Rejected: adds key-plumbing for no benefit; approved decision is removal.          |
| Banner in `app.component.ts` global header | Rejected: approved scope is dashboard-grid top only; keeps other routes clean.     |
| Hardcoded threshold strings in banner      | Rejected: drifts from `METRIC_THRESHOLDS`; import the model instead.               |
| Session-only (no localStorage) dismiss     | Rejected: approved requirement persists preference via `pg.dashboard.overview.v1`. |

## 5. Risks & mitigations

- Directive change touches every chart → single shared code path; telemetry + dashboard
  specs re-run; uPlot mocked so no canvas flakiness.
- Banner inside `@defer` would be untestable in jsdom → banner lives in the grid header,
  outside all `@defer` blocks.
- `localStorage` blocked/SSR → storage-guarded read/write helpers (same pattern as
  `dashboard-layout.model.ts`), session still works.

## 6. Exit criteria

`eslint` clean · `tsc` clean · Vitest all-green ≥80% lines+branches+functions+statements ·
`ng build` passes budgets · Playwright dashboard/overview suite green · `tasks.md` all `[x]`.
