# 004 — Dashboard Visual Widgets — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, alternatives, risks)
- [x] `design.md` (shared directive, 4 widgets, grid, header, test contracts)

## Implementation ✅ COMPLETE (2026-09-13)

- [x] Promote `MetricChartDirective` → `shared/ui/metric-chart/` (+ spec), repoint telemetry import, delete old files
- [x] `widgets/dashboard-metric-widget.component.ts` (uPlot via shared directive, `h-48`)
- [x] `widgets/dashboard-log-widget.component.ts` (compact VirtualScroll, last-100, `h-56`)
- [x] `widgets/dashboard-topology-widget.component.ts` (compact SVG health graph)
- [x] `widgets/dashboard-incident-widget.component.ts` (banner + badges, borderless)
- [x] `dashboard-grid.component.ts` refactor (visual dispatch, glass cards, drop `summary()`)
- [x] `app.component.ts` header polish (sticky glass + active nav)
- [x] Widget specs (metric/log/topology/incident) + updated `dashboard-grid.spec.ts`

## Verification ✅ COMPLETE

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npm run test` all-green 95/95 (21 files), 90.4% lines / 86.69% branches (≥80% gate)
- [x] `npm run build` passes (initial 310.44 kB / 83.59 kB transfer; widgets in lazy chunks)
- [x] `npx playwright test` 12/12 green
- [x] zone-ban grep clean (no `zone.js` imports, no `NgZone` usage)
- [x] All green → mark done
