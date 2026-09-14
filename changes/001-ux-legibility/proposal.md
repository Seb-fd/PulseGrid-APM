# 001 — UX Legibility (Dashboard, Logs, Topology) — Proposal

> Delta: `changes/001-ux-legibility` | Depends on: 006 (redesign-system chrome/tokens) | Status: Draft for approval
> Date: 2026-09-13
> Note: number `001` reused per explicit request; it does NOT supersede `001-initial-architecture`. Next delta should resume at `007`.

## 1. Context

PulseGrid APM renders live telemetry (`features/telemetry/telemetry-page.component.ts`),
dashboard widgets (`features/dashboard/widgets/dashboard-metric-widget.component.ts`,
`dashboard-grid.component.ts`), a VirtualScroll log console
(`features/logs/log-viewer.component.ts`), and an SVG service graph
(`features/topology/topology-map.component.ts` +
`features/dashboard/widgets/dashboard-topology-widget.component.ts`).

Gap analysis (verified 2026-09-13):

- Charts (`shared/ui/metric-chart/metric-chart.directive.ts:7-47`) have no threshold
  overlays, no summary headers (only `Title (unit)`), and no custom tooltip — only a
  uPlot crosshair + `HH:MM:SS` axis. An engineer cannot tell at a glance whether
  `CPU 92%` is warning or critical.
- Log rows show `Time|Level|Service|Message|Trace` only. No quick severity pills with
  counts, no HTTP method/status badges (`method|statusCode` = zero hits in `src/app`),
  no detail drawer (only trace-id copy button).
- Topology edges are static `stroke #334155` (`topology-map.component.ts:93-106`);
  node health uses fills (`#10b981/#f59e0b/#ef4444`) but there is no legend, no
  direction-flow animation, and no health-colored edges.

Goal: any engineer understands metrics, logs, and topology within 3 seconds,
without regressing performance budgets or the RxJS→signals split.

## 2. Motivation

Close the legibility gap while preserving everything proven:

- Zoneless + `OnPush` + native control flow + `@defer (on viewport)`.
- Ingestion ≤10 Hz (`sampleTime(100)`), charts ≤60 fps (rAF batching in
  `MetricChartDirective`), `RingBuffer` 300/series, `MAX_METRICS` 1200,
  `MAX_LOGS` 5000, CDK VirtualScroll `itemSize=28`.
- `CoreStore` as sole RxJS→signals bridge (`bindIngestion()`); components read
  `Signal<T>` only, never `subscribe()`.
- `LogEntry` frozen contract (`core/models/log-entry.model.ts:8-16`) — this delta
  does NOT alter it (HTTP badges are display-only parsing; see design §4).

## 3. Scope

**In:**

- uPlot threshold overlays (Warning amber dashed, Critical red dashed) with
  static per-kind defaults + active-alert-rule override.
- Metric summary headers `"<Title> — <current> (<arrow> <delta> avg)"` via
  `last vs window-avg` (cheap O(n≤300) `computed`).
- Rich hover tooltips: deterministic UTC timestamp + `formatValue` units.
- Log quick pills `[All] [Errors Only (N)] [Warnings (N)]` with live counts;
  HTTP method/status inline badges via message parsing + sim message augmentation;
  inline aside detail drawer (metadata + traceId + message, stacktrace placeholder).
- Topology animated dash-flow edges, 3-state health-colored edges
  (emerald/amber/red), bottom-left legend overlay, `prefers-reduced-motion` support.
- Unit + component specs (BDD `GIVEN/WHEN/THEN`) + E2E hermetic coverage;
  verify `lint → typecheck → vitest --coverage (≥80%) → build → e2e`.

**Out:** chart lib swap (uPlot stays ~40 kB), `LogEntry` interface change
(optional `httpMethod/statusCode/stacktrace` deferred to a future amendment),
CDK Overlay/Dialog modal variant (inline drawer chosen), force-graph auto-layout,
light mode, Prometheus/OTel ingestion, historical persistence, CSV export.

## 4. Alternatives

| Option                                             | Verdict                                                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Thresholds from alert rules only                   | Rejected: empty-rules state shows nothing; need static fallback.                                                        |
| Thresholds static only                             | Rejected: ignores user rules; approved answer is **both with override**.                                                |
| Delta = first-vs-last / prev-window                | Rejected: noisier / needs 2× reads; **last-vs-window-avg** is cheapest.                                                 |
| Extend `LogEntry` with `httpMethod/statusCode` now | Rejected for this delta: frozen contract + needs amendment; **parse display-only** + sim message text carries patterns. |
| CDK Overlay/Dialog log modal                       | Rejected: heavier + focus-trap code; **inline aside drawer** keeps bundle flat.                                         |
| Binary emerald/red edges, no reduced-motion        | Rejected: loses degraded signal + a11y; **3-state + reduced-motion** approved.                                          |
| Extra constant uPlot series for thresholds         | Rejected: heavier than `hooks.draw` dashed lines.                                                                       |

## 5. Risks & mitigations

- Throughput is low-is-bad (inverted) — ambiguous defaults → locked in design §2.
- Sim messages rarely contain HTTP tokens; naive `\b500\b` matches `"(500s surging)"`
  → guarded regexes + sim message augmentation (design §4), no model change.
- Tooltip date formatting flakes across timezones → deterministic UTC helpers (design §5).
- New CSS (dashes, legend, drawer, pills) vs `anyComponentStyle` 4 kB/8 kB budget →
  keep styles inline-minimal, share tokens, verify with `ng build`.
- VirtualScroll `itemSize=28` row-height breakage from badges → inline badges only,
  no new grid columns.
- Edge animation violates `prefers-reduced-motion` → media-query kill-switch (design §7).
- `@defer` placeholder in jsdom → specs assert chrome + placeholders; real render at
  widget level + Playwright hermetic seam
  (`?liveUrl=ws://127.0.0.1:9/dead&scenario=outage`).

## 6. Exit criteria

`proposal.md` + `design.md` + `tasks.md` approved · `eslint` clean ·
`tsc --noEmit -p tsconfig.app.json` clean ·
`npm run test -- --run --coverage` all-green ≥80% lines+branches+functions+statements ·
`npm run build` passes (500 kB warn / 1 MB err initial) · zone-ban grep clean ·
Playwright suites green · `tasks.md` checked strictly top-to-bottom.
