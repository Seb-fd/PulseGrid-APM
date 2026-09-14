# 001 — UX Legibility — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom (tasks.md is truth).
> Verify chain mirrors CI: `lint → typecheck → vitest --coverage → build → e2e`.

## SDD

- [x] `proposal.md` approved (scope, alternatives, risks, exit criteria)
- [x] `design.md` approved (thresholds §1, throughput inversion §2, charts §3, HTTP parse+sim §4, UTC §5, pills+drawer §6, topology+a11y+motion §7, budgets §8, test contracts §9)

## Implementation — Charts & summaries (design §1–§3, §5, §8)

- [x] `core/models/metric-thresholds.model.ts` — `METRIC_THRESHOLDS`, `resolveThresholds` (most-sensitive wins, invariant guard, throughput `low`)
- [x] `core/models/metric-thresholds.spec.ts` — defaults, rule override, throughput invariant discard, `isBreach` high/low
- [x] `core/utils/format-metric.ts` — `formatValue`, `formatAxisTick`, `formatTooltipTimestamp` (UTC), `formatLogTime`, `summarizeWindow` (last-vs-avg), `formatSummary`
- [x] `core/utils/format-metric.spec.ts` — unit pins (incl. 3 fixed epochs, `.007` millis, k-rps, arrows)
- [x] `shared/ui/metric-chart/metric-chart.directive.ts` — `thresholds` input, `hooks.draw` dashed amber/red lines, `hooks.setCursor` tooltip div (DOM-only), `aria-label` with thresholds
- [x] `shared/ui/metric-chart/metric-chart.directive.spec.ts` — draw lines, null-skip, threshold repaint, tooltip UTC+units (uPlot mocked, rAF stubbed)
- [x] `features/dashboard/widgets/dashboard-metric-widget.component.ts` — `thresholds` + `summary` computeds, `summary-<kind>` header
- [x] `features/telemetry/telemetry-page.component.ts` — per-card `thresholds` + `summaries`, `summary-<kind>` headers, footnote kept

## Implementation — Logs (design §4–§6, §8)

- [x] `features/logs/log-format.ts` — `parseHttpMethod`, `parseHttpStatus` (`500s` guard), `statusTone`
- [x] `features/logs/log-format.spec.ts` — method/status/tone pins
- [x] `core/services/stochastic-sim.service.ts` — message-only augmentation (`GET /api/<svc> 500`, `POST … 429`, `GET … 200 <ms>`); seeded determinism kept
- [x] `features/logs/log-viewer.component.ts` — quick pills (`pill-all|errors|warnings` + counts), inline method/status badges (no grid change), inline aside drawer (`log-detail`, `log-detail-close`, Esc, focus return)
- [x] `features/logs/log-viewer.spec.ts` — pills+counts, badges, drawer open/Esc/empty-stack, FR-L1..L6 green

## Implementation — Topology (design §7–§8)

- [x] `features/topology/topology-map.component.ts` — edge `health=worst()`, per-tone stroke + `arrow-ok|warn|err` markers, `.edge-flow` dashes, `topology-legend` overlay, reduced-motion block
- [x] `features/dashboard/widgets/dashboard-topology-widget.component.ts` — same edge/legend treatment (`dash-topology-legend`)
- [x] `features/topology/topology-map.spec.ts` + `dashboard-topology-widget.spec.ts` — health mapping, markers, legend, reduced-motion, outage dims

## Verification ✅ COMPLETE (2026-09-13)

- [x] `npm run lint` clean
- [x] `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) clean
- [x] `npm run test -- --run --coverage` all-green, ≥80% lines+branches+functions+statements (135 tests, 26 files; 90.68% lines / 86.1% branches)
- [x] `npm run build` passes (initial 500 kB warn / 1 MB err; component styles 4 kB/8 kB — initial 332.79 kB)
- [x] zone-ban grep clean (no `zone.js`, no `NgZone.run()`/`tick()` — only doc comments)
- [x] `npx playwright test` green (12/12; hermetic `liveUrl=ws://127.0.0.1:9/dead&scenario=outage`; generic specs tolerate LIVE/SIMULATED)
- [x] All green → mark delta done
