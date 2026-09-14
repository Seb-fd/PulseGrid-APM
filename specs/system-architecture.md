# PulseGrid APM — System Architecture

> Status: Approved (Build decisions locked per user 2026-09-12)
> Angular 22 Zoneless Standalone | Signals + RxJS | Tailwind v4 | CDK | Vitest + Playwright

## 1. Goals & Constraints

- 60 FPS telemetry visualizer from high-frequency streams without jank in Angular 22
  Zoneless CD.
- 10k+ log rows without DOM blowup (CDK VirtualScroll).
- Pluggable telemetry ingestion engine with Default Live Stream Provider (Wikimedia
  EventStreams) + high-fidelity deterministic simulator with seamless self-healing
  fallback.
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
      services/
        wikimedia-stream.service.ts   # Default Live Stream Provider: WS primary + SSE fallback, 5s handshake guard, retry/backoff, shared-cache eviction
        wikimedia-adapter.ts          # pure recentchange → TelemetryMetric[] / LogEntry[] mapper
        stochastic-sim.service.ts     # interval-based PRNG fault injector (high-fidelity fallback)
        telemetry-ingestion.service.ts # pluggable pipeline: live → adapter → backpressure → shareReplay → sim fallback
        log-ingestion.service.ts      # live Wikimedia logs + sim error logs + health tick
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
              +--------------------------------------------------+
              |           INGESTION LAYER (RxJS, pluggable)      |
              |  Default Live Stream Provider: Wikimedia WS      |
              |  wss://stream.wikimedia.org/v2/stream/recentchange|
              |  + SSE fallback (official EventStreams transport)|
              |  Alternate feeds (e.g. legacy Binance) plug in   |
              |  via the same adapter pattern (not active)       |
              +-----------------------+--------------------------+
                                      | raw frames (bursts 100-1000 msg/s)
                      +---------------+--------------+
                      |  Stochastic Sim (RxJS)       |
                      |  interval(250ms)+PRNG        |
                      |  high-fidelity fallback      |
                      |  fault scenarios             |
                      +---------------+--------------+
                                      |
                    +-----------------v----------------+
                    | TelemetryIngestionService        |
                    |  pluggable pipeline:             |
                    |  live → adapter →                |
                    |  sampleTime(100)/auditTime       |
                    |  catchError→fallback(sim)        |
                    |  retry({backoff 1s..30s})        |
                    |  5s handshake guard              |
                    |  teardown + cache eviction       |
                    |  dynamic stream rebinding        |
                    |  shareReplay({size:1})           |
                    +-----------------+----------------+
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

2. **Backpressure at ingestion:** raw provider bursts (up to ~1k msg/s on the Default
   Live Stream Provider) are reduced via `sampleTime(100)` for charts, `auditTime(250)`
   for logs, `throttleTime` for topology health. Charts render at ≤60fps via `auditTime(16)`
   - `requestAnimationFrame` batching inside `MetricChartDirective` (runs outside CD via
     `runOutsideAngular` equivalent — Angular 22 Zoneless-safe since signals notify only on
     committed frames).

3. **Bounded state:** `RingBuffer<T>` (capacity 300 per metric ≈ 30s @10Hz). `logs` capped at 5000 (drop oldest). Prevents memory growth + keeps `computed()` O(n) cheap.

4. **Fine-grained reads:** components read `computed()` slices (`selectCpuWindow(60)`), not whole store. `@for (m of window(); track m.id)` ensures minimal DOM churn.

5. **Defer + lazy:** `@defer (on viewport)` on topology + secondary charts; route-level `loadComponent` code-splitting. Initial bundle target <250 kB gzipped (excluding charts lib).

6. **Canvas over SVG for series:** uPlot (preferred ~40kB) or Lightweight Charts; ECharts only if cartographic richness outweighs bundle. SVG reserved for topology (<50 nodes).

7. **No `setInterval` in components.** All timers in ingestion services; components are pure signal readers.

## 5. Ingestion Design (Locked): Pluggable Pipeline + Self-Healing

- `TelemetryIngestionService` (provider-agnostic): `live$.pipe(map(adapter))` with
  `catchError` → cold simulator stream; `sampleTime(100)` caps store commits at ~10Hz;
  `shareReplay({bufferSize: 1, refCount: true})` shares one subscription. Status
  transitions: `reconnecting` → `live` (first frame) | `reconnecting` → `simulated`
  (live terminal failure). `retryLive(url?)` evicts cache + resets to `reconnecting`.
- Default Live Stream Provider `WikimediaStreamService`:
  `webSocket({url, deserializer})` primary + official SSE `EventSource` fallback.
  Self-healing: 5s handshake guard (`WIKIMEDIA_CONNECT_TIMEOUT_MS`, no first frame →
  fail fast), 10s silence watchdog (`WIKIMEDIA_SILENCE_TIMEOUT_MS` → `RECONNECTING`),
  3 WS retries with exponential backoff (1s, 2s, 4s … max 30s), then SSE (also 5s-guarded),
  then simulator. Shared per-URL cache (`Map<string, Observable>`) for metrics + logs;
  `disconnect(url?)` evicts one URL or all; callers unsubscribe first so refCounted
  teardown closes the socket (client close `1000`) and SSE source before rebind.
- Dynamic stream rebinding: `AppComponent.retryLiveConnection()` unbinds, evicts,
  re-reads `liveUrl` (supports `?liveUrl=` E2E override), rebinds fresh
  `metrics$`/`logs$`, and pins `reconnecting` until live/sim resolves.
- `StochasticSimService`: `interval(250).pipe(map(prngStep))` emitting `TelemetryMetric` +
  correlated `LogEntry` bursts (CPU spike → WARN, outage → ERROR + `HealthState.down`).
- Wikimedia adapter: real edits/sec `throughput`, real event-time-lag `latency` (35ms
  quiet baseline), synthetic `cpu`/`memory` load indicators derived from throughput
  intensity (documented as synthetic mapping — NOT real infra metrics; UI labels MUST show
  `derived from market stream` footnote to avoid misleading users). Alternate feeds
  (e.g. legacy Binance `!miniTicker@arr`) follow the same adapter contract when plugged in.

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

- Default Live Stream Provider rate-limit / firewall in CI → E2E MUST mock WS
  (`route.fulfill` / fake WS server via `?liveUrl=`, never hit live in CI) and force sim
  fallback + fault injection via `?scenario=`.
- Bundle creep from chart lib → enforce `bundlesize` check in CI.
