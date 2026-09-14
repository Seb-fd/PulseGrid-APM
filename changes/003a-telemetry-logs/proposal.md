# 003a — Telemetry & Logs UI — Proposal

> Delta: `changes/003a-telemetry-logs` | Depends on: 001 (specs+ingestion) | Status: Approved for build
> Date: 2026-09-13 | Chart lib: uPlot 1.6.32 (locked) | Skills: `create-canvas-directive`, `create-zoneless-component`, `generate-bdd-spec`

## 1. Context

Phase 2 delivered the ingestion engine (`BinanceWsService`, `StochasticSimService`, `TelemetryIngestionService`), `CoreStore` signals, and `StatusBannerComponent`. `src/app/features/` holds only `placeholder-pages.ts`. This delta replaces the telemetry + logs placeholders with real zoneless views.

## 2. Motivation

Prove the core thesis: high-frequency streams → Canvas at 60 FPS without Zone.js, and 5k log rows without DOM blowup — the two hardest perf risks, retired before topology/alerts/dashboard.

## 3. Scope

**In:**

- `MetricChartDirective` (uPlot + rAF coalescing + ResizeObserver + destroy).
- `TelemetryPageComponent`: 4 chart cards (CPU/Memory/Latency/Throughput), window selector 10/30/60s (`linkedSignal` + `localStorage`), `@defer (on viewport)` per card, derived-data footnote.
- `LogsPageComponent`: CDK `CdkVirtualScrollViewport` (`itemSize=28`), query/level/service filters via `computed()`, pause/resume tail, clear, `role=log aria-live=off`.
- `features/telemetry/routes.ts`, `features/logs/routes.ts`; `app.routes.ts` repointed from placeholders.
- Vitest BDD specs (directive coalescing/destroy/empty; page window persist; log filter/pause/clear) + Playwright 003a flows.
- `uplot` runtime dep + `uPlot.min.css` import in `src/styles.css`.

**Out (delta 003b):** topology SVG, rule builder/incidents UI, dashboard DnD grid, toast notifications, CSV export.

## 4. Alternatives

| Option                                          | Verdict                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| ECharts / lightweight-charts                    | Rejected: bundle cost vs 65 kB baseline; revisit via amendment only. |
| SVG charts                                      | Rejected: DOM churn at 60 FPS.                                       |
| `async` pipe + manual `subscribe` in components | Rejected by constitution; signals only.                              |

## 5. Risks & mitigations

- uPlot CSS import fails under esbuild → fallback: inline minimal `.uplot` CSS in directive host styles (verified at build gate).
- CDK Scrolling + zoneless: viewport uses native scroll events; no zone dependency. Covered by component spec with 1k rows.
- `sampleTime` swallowing sync emissions in tests → specs use `BehaviorSubject`/open streams (skill `generate-bdd-spec` §4).

## 6. Exit criteria

`tsc` clean · `eslint` clean · Vitest all-green with coverage ≥80% lines+branches · `ng build` passes with transfer <250 kB · zone-ban grep clean · `tasks.md` 003a items `[x]`.
