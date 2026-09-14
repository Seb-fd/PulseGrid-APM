# 003a — Telemetry & Logs UI — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, uPlot lock, risks)
- [x] `design.md` (directive/page/viewer/routes/test contracts)
- [ ] All items below green → mark done

## Implementation ✅ COMPLETE (2026-09-13)

- [x] Add `uplot` dep + `uPlot.min.css` import (esbuild resolved first try; no fallback needed)
- [x] `features/telemetry/metric-chart.directive.ts` (uPlot + rAF + ResizeObserver + destroy)
- [x] `features/telemetry/telemetry-page.component.ts` (4 cards, window `linkedSignal` + persist, `@defer`, footnote)
- [x] `features/telemetry/routes.ts` + repoint `app.routes.ts` telemetry/logs to lazy feature routes
- [x] `features/logs/log-viewer.component.ts` (CDK VirtualScroll, computed filters, pause/resume, clear)

## Verification (TDD: specs first) ✅ COMPLETE

- [x] `metric-chart.directive.spec.ts` (coalesce, destroy, empty)
- [x] `telemetry-page.spec.ts` (4 cards, window persist, footnote)
- [x] `log-viewer.spec.ts` (level filter, query+count, pause/resume, clear)
- [x] `e2e/telemetry-logs.spec.ts` (charts visible, filter narrows, banner)
- [x] Gates: `tsc` · `eslint` · `vitest --coverage ≥80%` · `ng build <250 kB` · zone-ban grep

## Hard-won harness lessons (fed back into skills + test-helpers)

- Zoneless `fixture.detectChanges()` → `ApplicationRef.tick()` honors dirtiness: test-host state MUST be signals or NG0100.
- `setupFiles` does not execute in this Vitest runner: `src/test-helpers.ts` side-effect import instead (+ per-file platform teardown vs NG0400).
- rAF stubs capture Angular's own scheduler callbacks: model cancellation faithfully; assert paint behavior, not queue length.
- Native `<select [value]>` does not reflect on boot (creation-order timing): segmented `aria-pressed` buttons instead.
- E2E hermeticity: `?liveUrl=` + `?scenario=` seams on AppComponent (dead-port WS forces sim fallback).
