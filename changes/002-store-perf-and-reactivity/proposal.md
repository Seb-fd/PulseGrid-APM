# 002 — Store Perf & Reactivity (H1+H2+H3) — Proposal

> Delta: `changes/002-store-perf-and-reactivity` | Status: Proposed for build
> Date: 2026-09-14 | Scope: core reactivity + memory bounds + selector perf (no UI redesign, no chart-lib change)
> Skills: `generate-bdd-spec`, `vitest` | Subagents: `qa-engineer`, `performance-engineer`

## 1. Problem statement

Three linked findings from the 2026-09-14 audit (High impact):

1. **H1 — Reactivity-split violation.** `src/app/app.component.ts:108,124-131` owns a `setInterval(1000)` that polls `ingestion.connectionStatus()` into the store and synthesizes demo logs via a divergent `sim.generateBatch(...)` call. Constitution §3 requires timers in ingestion services only; `CoreStore.bindIngestion(metrics$, status?)` (`core-store.service.ts:84-104`) already supports a status mirror that is never passed, leaving two writers to `connectionStatus`.
2. **H2 — Unbounded / copy-heavy hot path; `RingBuffer` dead in prod.** `ingestMetrics`/`appendLogs` (`core-store.service.ts:111-121`) do `[...old, ...batch].slice(-MAX)` at ≤10Hz/1Hz over 1200 metrics / 5000 logs. `RingBuffer` (`core/utils/ring-buffer.ts`) is constructed only in `snapshotRingBuffers()` test helper — zero prod callers. `incidents` (`tickAlerts:212-247`) grows without cap, making per-tick `find` + per-read `[...incidents].reverse()` progressively slower.
3. **H3 — Computed fan-out rescans per commit.** ~20 `selectWindow()` computeds (`core-store.service.ts:132-149`) each scan O(1200); `dashboard-metric-widget.component.ts:66-78` eagerly creates 4×100 windows but reads one. `outageIds` + `healthNodes` + `deriveNodeHealth:21-54` (per-node `sort` for p95) re-run at 10Hz over metrics+logs. `metricsByKind`/`activeAlerts` are re-derived in 4–5 clones (`dashboard-grid.component.ts:265-271`, `incident-list`, widgets) instead of reusing store selectors. `log-viewer.component.ts:348-354` scans 5000 logs 4× per write (`rows`, `serviceOptions`, `errorCount`, `warnCount`).

Copy cost alone is small (~12k metric refs/s); the real cost is every `set()` invalidating this fan-out.

## 2. Scope

**In:**

- New `LogIngestionService` (`src/app/core/services/log-ingestion.service.ts`): `interval(1000)`-driven correlated-log stream; `CoreStore.bindLogs()`/`unbind` extension; `AppComponent` reduced to `bindIngestion(metrics$, statusSignal)` + `bindLogs(logs$)` with zero timers.
- Bounded state: `MAX_METRICS=1200` (4 × 300/kind), `MAX_LOGS=5000` (kept), new `MAX_INCIDENTS=200`; `RingBuffer` moved into the write path with documented drop policies (metrics keep-latest, logs keep-all ≤1Hz, incidents drop-oldest).
- Selector memoization: cached `selectWindow(kind,n)`, single-pass health derivation, 1Hz-throttled `healthNodes`, combined log-summary computed, reuse of `activeAlerts`/`metricsByKind`; fix `dashboard-grid` stale `nodes()` read → `healthNodes`.
- Vitest BDD specs + timing asserts; no template/a11y redesign beyond what these refactors touch.

**Out (later slices):**

- H4 a11y blockers, H5 widget/page dedupe, M1 uPlot micro-opts, M4 `$any`/cast cleanup, README/CI hardening — tracked separately, untouched here.

## 3. Alternatives

| Option                                                                 | Verdict                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep `setInterval` in `AppComponent`, just extract a helper            | Rejected: still violates §3, keeps dual source of truth and untestable timer.                                                                                                                                            |
| Replace store arrays with `signal<Map<kind, RingBuffer>>` public shape | Rejected: breaks `metrics()`/`selectWindow` contract consumed by 19 specs + 6 views; flatten-by-timestamp merge adds risk for no measurable gain at 1200 rows. Keep public array-snapshot shape, back writes with rings. |
| `auditTime`-throttle everything at ingestion                           | Rejected: metrics already capped by `sampleTime(100)`; logs are 1Hz; the waste is downstream fan-out, not commit rate. Throttle only health derivation (1Hz).                                                            |
| Debounce log filter keystrokes now                                     | Deferred to M2 slice; this delta only combines the 4 scans into one computed (no input-behavior change).                                                                                                                 |

## 4. Risks & mitigations

- **Behavior change in log synthesis** (same-batch vs fresh `generateBatch`): mitigated by keeping `StochasticSimService.generateBatch`/`logsFor` pure and adding a determinism spec (fixed seed + fixed `now` → identical logs before/after).
- **`selectWindow` cache leaks computeds**: cache keyed `(kind,n,serviceId?)` with bounded key space (4 kinds × {100,300} × few services); specs assert cache-hit identity.
- **Health throttle staleness** (≤1s behind stream): within arch-doc tolerance ("≤1s behind"); outage e2e uses `scenario=outage` with >1s windows.
- **Coverage gate**: new service + store paths must keep ≥80% lines/branches/functions/statements; specs use open/`BehaviorSubject` streams for `sampleTime` paths, fake timers for `interval` (per `generate-bdd-spec` §4); every touched component spec keeps its `import '../../test-helpers'` side-effect import.

## 5. Exit criteria

`npm run lint` → `npm run typecheck` → `npm run test -- --run --coverage` (≥80% ×4) → `npm run build` (budgets 500kB warn/1MB err) → `npx playwright test e2e/` green; zone-ban grep clean; `derived from market stream` footnotes intact; `tasks.md` items `[x]` only when tests pass.
