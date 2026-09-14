# 001 — Initial Architecture — Tasks

> Source of truth for execution. Check `[x]` only when tests pass. SDD order enforced.

## Phase 1: Specs Approval ✅ COMPLETE

- [x] Ratify `specs/constitution.md` (zoneless, no-any, RxJS/Signal split, 80% gate)
- [x] Ratify `specs/system-architecture.md` (DDD folders, ASCII flow, perf strategy)
- [x] Ratify `specs/modules/telemetry-stream.spec.md` (BDD ×5)
- [x] Ratify `specs/modules/log-viewer.spec.md` (BDD ×5)
- [x] Ratify `specs/modules/topology-map.spec.md` (BDD ×4)
- [x] Ratify `specs/modules/alert-engine.spec.md` (BDD ×5)
- [x] Ratify `specs/modules/dashboard-customizer.spec.md` (BDD ×4)
- [x] Freeze `changes/001-initial-architecture/design.md` interfaces

## Phase 2: Core Data Ingestion Engine ✅ COMPLETE (2026-09-13)

> Verified: `tsc` clean · `vitest` 36/36 · coverage 82.0% lines / 83.4% branches · `ng build` 65 kB transfer · `eslint` clean · `zone.js` absent

- [x] Scaffold Angular 19+ standalone zoneless (`provideExperimentalZonelessChangeDetection()`, no `zone.js`)
- [x] Configure Tailwind v4 + CDK + ESLint/Prettier/Husky + GH Actions CI
- [x] Implement `core/models` (TelemetryMetric, LogEntry, ServiceNode, AlertRule per design.md)
- [x] Implement `RingBuffer<T>` + `prng.ts` utils with 100% Vitest coverage
- [x] Implement `BinanceWsService` (mockable WS, backoff retry, watchdog)
- [x] Implement `StochasticSimService` (CPU spike, leak, outage, 500-burst scenarios)
- [x] Implement `TelemetryIngestionService` (merge, sampleTime/auditTime, adapter, fallback)
- [x] Implement `CoreStore` signals + `connectionStatus` + `StatusBannerComponent`
- [x] Vitest: adapter, ingestion fallback, store selectors ≥85%

## Phase 3: UI Components — 003a ✅ COMPLETE (2026-09-13) / 003b pending

- [x] Telemetry page: 4 Canvas charts via `MetricChartDirective` (rAF batching) + window selector (delta 003a)
- [x] Log viewer: CDK VirtualScroll + `computed()` filters + pause/resume (delta 003a)
- [ ] Topology map: SVG + `@defer(on viewport)` + click detail (delta 003b)
- [ ] Alerts: Reactive rule-builder form + incident list + 1s eval loop (delta 003b)
- [ ] Dashboard grid: CDK DragDrop + `localStorage` persist + reset (delta 003b)

## Phase 4: Verification (partial — 003a gates green)

- [x] `vitest --coverage` ≥80% lines AND branches (CI gate) — 84.1% / 83.8%, 49/49 tests
- [x] Playwright 003a: charts visible, window persist, log filter narrows, pause toggle (5/5)
- [ ] Playwright 003b: dashboard DnD persist, alert fires on sim spike
- [x] `ng build` zoneless passes, no `zone.js`, bundle budget check (81.4 kB transfer)
- [x] `ng lint` + `tsc --noEmit` clean, Husky pre-commit green

---

**Checklist status: Phases 1+2 done, 003a done (verified 2026-09-13). Ready for delta 003b (topology + alerts + dashboard).**
