# PulseGrid APM — System Architecture

> Status: Approved (Build decisions locked per user 2026-09-12)
> Angular 19+ Standalone + Zoneless | Signals + RxJS | Tailwind v4 | CDK | Vitest + Playwright

## 1. Goals & Constraints

- 60 FPS telemetry visualizer from high-frequency streams without jank in zoneless CD.
- 10k+ log rows without DOM blowup (CDK VirtualScroll).
- Live Binance WS + deterministic simulator with seamless fallback.
- Strict SDD traceability: spec → design interface → task → test.

## 2. DDD Modular Folder Structure

```text
src/
  main.ts                    # bootstrapApplication(AppComponent, appConfig)
  app/
    app.component.ts         # shell: header, status-banner, router-outlet
    app.config.ts            # provideExperimentalZonelessChangeDetection(), provideRouter, HttpClient
    app.routes.ts            # lazy feature routes
    core/
      models/
        telemetry-metric.model.ts
        log-entry.model.ts
        service-node.model.ts
        alert-rule.model.ts
      ingestion/
        binance-ws.service.ts       # WebSocketSubject<BinanceFrame>, retry/backoff
        stochastic-sim.service.ts   # interval-based PRNG fault injector
        telemetry-ingestion.service.ts # merge, backpressure, normalize → TelemetryMetric[]
        log-ingestion.service.ts    # synthetic + mapped error logs
      store/
        core-store.service.ts       # signals: metrics, logs, nodes, connectionStatus
        alert-engine.service.ts     # rule evaluation over signal windows
      interceptors/ (if HTTP added later)
    features/
      telemetry/
        telemetry-page.component.ts
        metric-chart.directive.ts   # Canvas wrapper (uPlot / Lightweight Charts), rAF batching
        telemetry-page.spec.ts
        routes.ts
      logs/
        log-viewer.component.ts     # CDK VirtualScroll + computed() filter
        routes.ts
      topology/
        topology-map.component.ts   # SVG nodes, @defer(on viewport)
        routes.ts
      alerts/
        rule-builder.component.ts   # Reactive Forms
        incident-list.component.ts
        routes.ts
      dashboard/
        dashboard-grid.component.ts # CDK DragDrop, persist layout
        widget-host.directive.ts
        routes.ts
    shared/
      ui/
        status-banner.component.ts  # LIVE | SIMULATED | RECONNECTING
        metric-card.component.ts
      utils/
        ring-buffer.ts              # fixed-window time series
        prng.ts                     # seeded simulator
```

Rules:

- `core/` has NO component dependencies. Features import from `core/` only, never cross-feature (except via `core-store`).
- Every feature is lazy-loaded: `loadComponent` / `loadChildren`.
- Barrel exports forbidden (preserve tree-shaking + zoneless perf).

## 3. Data Flow Diagram (ASCII)

```text
                    +-----------------------------+
                    |   INGESTION LAYER (RxJS)    |
                    |  Binance WS Subject         |
                    |  wss://stream.binance.com:  |
                    |  9443/ws/!miniTicker@arr    |
                    +--------------+--------------+
                                   | raw frames (100-1000 msg/s)
                    +--------------+--------------+
                    |  Stochastic Sim (RxJS)      |
                    |  interval(250ms)+PRNG       |
                    |  fault scenarios            |
                    +--------------+--------------+
                                   |
                    +--------------v--------------+
                    | TelemetryIngestionService   |
                    |  merge(live, sim)           |
                    |  sampleTime(100)/auditTime  |
                    |  map(adapter→TelemetryMetric)|
                    |  catchError→fallback(sim)   |
                    |  retry({backoff 1s..30s})   |
                    |  shareReplay({size:1})      |
                    +--------------+--------------+
                                   | TelemetryMetric[] @ ~10Hz UI-safe
                    +--------------v--------------+
                    | STATE LAYER (Signals)       |
                    | CoreStore:                  |
                    |  metrics=signal<RingBuffer> |
                    |  logs=signal<LogEntry[]>    |
                    |  nodes=signal<ServiceNode[]>|
                    |  status=signal<'live'|... > |
                    |  filteredLogs=computed()    |
                    |  healthMap=computed()       |
                    +--------------+--------------+
                                   | Signal<T> reads (no subscribe)
              +--------------------+--------------------+
              |                     |                    |
     +--------v--------+  +---------v---------+ +--------v--------+
     | VIEW: Telemetry |  | VIEW: Logs        | | VIEW: Topology  |
     | Zoneless comp.  |  | CDK VirtualScroll | | SVG + @defer    |
     | Canvas dir. rAF |  | computed filter   | | computed health |
     +-----------------+  +-----------------+  +-----------------+
              |                     |                    |
     +--------v--------+  +---------v---------+ +--------v--------+
     | VIEW: Alerts    |  | VIEW: Dashboard   | | StatusBanner    |
     | Reactive Forms  |  | CDK DragDrop      | | LIVE/SIM/RECON  |
     +-----------------+  +-----------------+  +-----------------+
```

## 4. High-Frequency Change Detection Optimization

1. **Zoneless bootstrap** (`app.config.ts`):

   ```ts
   bootstrapApplication(AppComponent, {
     providers: [provideExperimentalZonelessChangeDetection(), provideRouter(routes)],
   });
   ```

   No `zone.js` in `package.json` or `angular.json:polyfills`.

2. **Backpressure at ingestion:** raw WS (up to ~1k msg/s burst on `!miniTicker@arr`) is reduced via `sampleTime(100)` for charts, `auditTime(250)` for logs, `throttleTime` for topology health. Charts render at ≤60fps via `auditTime(16)` + `requestAnimationFrame` batching inside `MetricChartDirective` (runs outside CD via `runOutsideAngular` equivalent — zoneless-safe since signals notify only on committed frames).

3. **Bounded state:** `RingBuffer<T>` (capacity 300 per metric ≈ 30s @10Hz). `logs` capped at 5000 (drop oldest). Prevents memory growth + keeps `computed()` O(n) cheap.

4. **Fine-grained reads:** components read `computed()` slices (`selectCpuWindow(60)`), not whole store. `@for (m of window(); track m.id)` ensures minimal DOM churn.

5. **Defer + lazy:** `@defer (on viewport)` on topology + secondary charts; route-level `loadComponent` code-splitting. Initial bundle target <250 kB gzipped (excluding charts lib).

6. **Canvas over SVG for series:** uPlot (preferred ~40kB) or Lightweight Charts; ECharts only if cartographic richness outweighs bundle. SVG reserved for topology (<50 nodes).

7. **No `setInterval` in components.** All timers in ingestion services; components are pure signal readers.

## 5. Ingestion Design (Locked)

- `BinanceWsService`: `webSocket<BinanceMiniTicker[]>({url, deserializer, openObserver, closeObserver})`. Heartbeat watchdog: if no frame in 10s → `RECONNECTING`.
- `StochasticSimService`: `interval(250).pipe(map(prngStep))` emitting `TelemetryMetric` + correlated `LogEntry` bursts (CPU spike → WARN, outage → ERROR + `HealthState.down`).
- `TelemetryIngestionService`: `merge(live$.pipe(map(binanceAdapter)), sim$.pipe(...))` gated by `connectionStatus` signal; `catchError` → sim; `retry` with `timer(backoff)`.
- Binance adapter: derives pseudo `cpu/memory/latency/throughput` from ticker volatility/volume (documented as synthetic mapping — NOT real infra metrics; UI labels MUST show `derived from market stream` footnote to avoid misleading users).

## 6. State Design

`CoreStore` (root-provided singleton):

- `metrics = signal<Map<MetricKind, RingBuffer<TelemetryMetric>>>`
- `logs = signal<LogEntry[]>` (append-only, cap 5000)
- `nodes = signal<ServiceNode[]>`
- `connectionStatus = signal<'live'|'simulated'|'reconnecting'>`
- `filteredLogs(query, level) = computed(...)`, `nodeHealth = computed(...)`, `chartWindow(kind, n) = computed(...)`
- Ingestion pushes via `toSignal(ingestion$.pipe(sampleTime...))` + `effect` to append to ring buffers (single writer).

## 7. Testing & CI Mapping

- Vitest covers stores, adapters, ring-buffer, computed filters (≥80% lines+branches).
- Playwright: `dashboard.spec.ts` (DnD + persist), `logs.spec.ts` (filter), `alerts.spec.ts` (sim spike → incident).
- CI: lint → typecheck → vitest coverage → build → playwright smoke.

## 8. Open Risks

- Binance WS rate-limit / firewall in CI → E2E MUST mock WS (`route.fulfill` / fake WS server), never hit live in CI.
- Bundle creep from chart lib → enforce `bundlesize` check in CI.
