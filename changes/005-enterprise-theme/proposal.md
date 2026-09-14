# 005 — Enterprise Dark-Theme Visual Upgrade — Proposal

> Delta: `changes/005-enterprise-theme` | Depends on: 004 (visual widgets) | Status: Approved for build
> Date: 2026-09-14

## 1. Context

The application is functionally complete and fully tested (95 Vitest specs, 12 Playwright
E2E). However, the visual layer is still utilitarian: flat `bg-slate-900` cards, muted
borders, and unstyled telemetry charts. Users requested a Datadog / Grafana-grade
dark observability UI.

## 2. Motivation

Upgrade look-and-feel without changing behavior or breaking tests. All changes are
class-level styling plus two carefully bounded logic touches:

- uPlot crosshair enabled in `MetricChartDirective`.
- Status-aware brand pulse dot reading `CoreStore.connectionStatus` in the shell.

## 3. Scope

**In:**

- Global tokens + keyframes in `src/styles.css`.
- Shell: sticky glassmorphism header, brand glyph + status-aware pulse dot, active nav pills.
- `StatusBannerComponent` translucent fills.
- Dashboard grid: inset-glow cards, polished drag handle, consistent card chrome.
- Dashboard widgets: chart wells, log-row hover + translucent badges, topology node
  hover transitions + degraded pulse, incident badges/banner with soft fills.
- Feature pages: telemetry/log/topology/alert builder share the same card/typography
  recipe, with no `data-testid` or ARIA role changes.
- `MetricChartDirective` live crosshair (`cursor.show: true, x: true, y: false`).
- Updated directive spec + full verification gate.

**Out:** custom fonts, new dependencies, light mode, chart library swap, animation that
impacts ingestion perf.

## 4. Alternatives

| Option                     | Verdict                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| Use SCSS/global theme file | Rejected by Tailwind v4 CSS-first policy.                                |
| Replace uPlot with ECharts | Rejected: would exceed bundle budget and break existing directive specs. |
| Inline CSS-only keyframes  | Rejected: budget risk; put shared keyframes in global `styles.css`.      |
| Status-aware pulse dot     | Approved: pure signal read, no new subscriptions.                        |

## 5. Risks & mitigations

- Crosshair must not interfere with CDK DragDrop → `drag: { x: false, y: false }`; verified by dashboard E2E.
- Component style budget (8kB err) → shared keyframes live in global CSS.
- Health fills `#22c55e/#f59e0b/#f43f5e` asserted in E2E → preserved.

## 6. Exit criteria

`eslint` clean · `tsc` clean · Vitest 95/95 with coverage ≥80% lines+branches+functions+statements ·
`ng build` passes · Playwright 12/12 · `tasks.md` `[x]`.
