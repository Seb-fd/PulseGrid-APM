# 002 — Store Perf & Reactivity — Tasks

> Order enforced top-to-bottom. Check `[x]` only when tests pass.
> Verify order per slice: `npm run lint` → `npm run typecheck` → `npm run test -- --run --coverage` → `npm run build` → `npm run e2e`.
> Component specs MUST keep `import '../../test-helpers'` (relative) side-effect import. No `describe.skip` without ticket.

## SDD

- [x] `proposal.md` approved (scope H1+H2+H3, alternatives, risks)
- [x] `design.md` approved (contracts below frozen before code; §0 records D1–D4 build deviations)

## H1 — Timers out of `AppComponent`

- [x] Create `src/app/core/services/log-ingestion.service.ts` per design §1 (`logs$()`, `status`, `LOG_TICK_MS=1000`); explicit return types on all public APIs
- [x] Extend `CoreStore` with `bindLogs(logs$): () => void` (+ `logsSub` teardown); reuse `unbind` semantics
- [x] Rewrite `AppComponent.ngOnInit/ngOnDestroy` to pure wiring (`bindIngestion(metrics$, status)` + `bindLogs(logs$)`); delete `setInterval`, `simState`, inline `appendLogs`; keep `?liveUrl`/`?scenario` seam
- [x] Specs: `log-ingestion.service.spec.ts` (GIVEN live THEN empty / GIVEN simulated THEN correlated; deterministic seed+`now`); `app.component.spec.ts` (seam parsing, zero-timer assert); `core-store.spec.ts` (bind/unbind both streams, status mirror)

## H2 — Bounded state via `RingBuffer`

- [x] Back `ingestMetrics`/`appendLogs` with `metricRing(MAX_METRICS)` / `logRing(MAX_LOGS)`; preserve public `metrics()`/`logs()` oldest→newest shape; hydrate rings from existing values
- [x] Add `MAX_INCIDENTS=200` + drop-oldest-resolved-first policy + `openByRule` index in `tickAlerts`
- [x] Repoint `snapshotRingBuffers()` at live rings (no rescan)
- [x] Specs: bounds (1201st metric / 5001st log / 201st incident drop oldest, order kept); `tickAlerts` resolve-preference; timing assert on 1200-commit path

## H3 — Selector memoization

- [x] Add `windowCache` to `selectWindow(kind,n,serviceId?)`; `dashboard-metric-widget` → single `selectWindow(kind(),100)`; `telemetry-page` unchanged call sites (cache hits)
- [x] Add `healthTick`/`noteMetricsWrite(batch)` relevance gate + `bumpHealthTick()` expiry drive; `outageIds` reads `healthTick()` (time-driven expiry); writer-maintained `healthNodes` snapshot skips irrelevant batches (see design §0/D1); keep `deriveNodeHealth` pure signature
- [x] Add `CoreStore.activeAlertsCount`; rewire `alerts-page`/`incident-list`/`dashboard-incident-widget`/`dashboard-grid counts` to `activeAlerts`/`activeAlertsCount`/`metricsByKind`/`healthNodes`; fix grid `downCount` to `healthNodes`
- [x] Combine `log-viewer` scans into single `summary` computed (`rows/errorCount/warnCount/services`)
- [x] Specs: cache-identity; health skip/recompute-within-1-tick; summary single-scan (spy `matchesLogFilter` call count or row/count parity); all existing FR-P/T/L/A/D specs green

## Verification gates (2026-09-14, all green)

- [x] `npm run lint` clean (`no-explicit-any:error`, no new `$any`, explicit return types)
- [x] `npm run typecheck` clean (`strict`, `noUncheckedIndexedAccess`, `strictTemplates`)
- [x] `npm run test -- --run --coverage` green, thresholds ≥80% lines/branches/functions/statements (actual: 91.5/87.22/91.62/91.5; 155/155 tests)
- [x] `npm run build` passes budgets (initial 500kB warn / 1MB err; style 4kB/8kB); zone-ban grep clean (`zone.js` absent in `package.json`/`angular.json`/imports)
- [x] `npm run e2e` green incl. hermetic `liveUrl=ws://127.0.0.1:9/dead&scenario=outage` outage flow (12/12); `derived from market stream` footnotes present; LIVE/SIMULATED banner tolerant assertions pass
- [x] Mark SDD + items `[x]`; propose follow-up slice (H4 a11y or H5 dedupe) — do not bundle into this delta
