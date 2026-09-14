# PulseGrid APM

PulseGrid APM is an enterprise-grade observability platform processing live global event
streams from Wikimedia EventStreams. It maps real-time edits into network latency,
throughput (RPS), and HTTP log entries while maintaining 60fps UI performance.

Angular 19 zoneless standalone app (Signals + RxJS). Single project `pulsegrid-apm`;
entry `src/main.ts` → `app.config.ts` → `app.routes.ts`.

## Architecture

- **Zoneless Angular 19:** `provideExperimentalZonelessChangeDetection()` in
  `src/app/app.config.ts`. No `zone.js` in `package.json`, `angular.json:polyfills`, or any
  `src/` import. Standalone `OnPush` components only, native control flow
  (`@if` / `@for (track id)` / `@switch`), `@defer (on viewport)` for below-fold widgets.
- **Reactivity split:** RxJS only in ingestion services; UI reads `signal` / `computed` from
  `CoreStore` (the sole RxJS → signals bridge via `bindIngestion()`). Components never
  `subscribe()`; `effect()` is for side-effects only; no `setInterval` in components.
- **Layering:** `src/app/core/` (models, `services/` ingestion, `store/`, `utils/`) has no
  component dependencies. Each `features/<name>/` owns `routes.ts` and is lazy-loaded via
  `loadComponent` / `loadChildren`. Never import cross-feature — share via `CoreStore`.
  No barrel exports.
- **Performance budgets:** store commits ≤ 10 Hz (`sampleTime(100)`), chart paints ≤ 60 fps
  (`auditTime(16)` + `requestAnimationFrame` batching in the canvas directive, run outside
  change detection). Chart lib is uPlot (~40 kB). Logs render via CDK VirtualScroll.

## Telemetry: Wikimedia WebSocket / SSE fallback adapter

Live source is Wikipedia's public EventStreams `recentchange` feed, consumed by
`WikimediaStreamService` (`src/app/core/services/wikimedia-stream.service.ts`):

- **Primary transport:** WebSocket `wss://stream.wikimedia.org/v2/stream/recentchange`.
- **Fallback transport:** SSE `https://stream.wikimedia.org/v2/stream/recentchange`
  (the officially documented EventStreams transport). WS terminal failure falls back to SSE;
  dual failure falls back to the deterministic stochastic simulator.
- **Batching:** 1 s event batches with watchdog + exponential backoff; shared cache for
  metric and log consumers.
- **Adapter** (`src/app/core/services/wikimedia-adapter.ts`, pure and tested):
  - `throughput` is real — edits/sec counted from 1 s batches;
  - `latency` is real — event-time lag (`now − event timestamp`, 35 ms quiet baseline);
  - `cpu` / `memory` are synthetic load indicators derived from throughput intensity;
  - `recentchange` events map to HTTP-style log entries (capped at 25 rows per batch).
- **Ingestion:** `TelemetryIngestionService` (Wikimedia default, sim fallback kept) and
  `LogIngestionService` (live Wikimedia logs, sim error logs + health tick kept).
- **Status:** `CoreStore.connectionStatus` (`live` | `simulated` | `reconnecting`) drives the
  `Live Status: Connected to Wikimedia Global Event Stream` banner line and the dashboard
  overview banner.
- **Thresholds** (`METRIC_THRESHOLDS`): CPU 75/90 %, Memory 75/90 %, Latency 200/500 ms,
  Throughput 500/100 rps (low-is-bad). Status indicators: Emerald = Healthy, Amber =
  Degraded, Red = Critical / Down. Metric views keep the
  `Values derived from Wikimedia Global Event Stream + simulator — not real infrastructure probes`
  footnote (data is synthetically mapped, not real infra).

## Memory bounds

`RingBuffer<T>` (`src/app/core/utils/ring-buffer.ts`, 300 points per series ≈ 30 s @ 10 Hz)
backs the write path with documented drop policies:

- `MAX_METRICS = 1200` (4 kinds × 300) — keep-latest, oldest dropped;
- `MAX_LOGS = 5000` — drop oldest, newest kept, oldest → newest order;
- `MAX_INCIDENTS = 200` — drop oldest-resolved-first on overflow.

This keeps `computed()` windows O(n) cheap and prevents memory growth at 10 Hz commits.

## Accessibility (WCAG 2.2 AA)

- Keyboard operability: every drag-reorder has a button fallback (move earlier / later),
  icon-only controls expose `aria-label`s, dashboard board and status legend are labelled
  regions.
- Screen readers: `LiveAnnouncer` announces reorder / hide / show; charts expose `role="img"`
  with threshold summaries; dynamic status uses live regions.
- Focus and motion: `:focus-visible` styles on all controls, `motion-reduce` disables shimmer
  placeholders and chart animation, emerald / amber / red status never relies on color alone
  (text labels + legend).

## Commands

Requires Node 22. Install with `npm ci`.

Verify in CI order:

```bash
npm run lint
npm run typecheck
npm run test -- --run --coverage
npm run build
npm run e2e
```

Useful variants:

```bash
npm run start                                   # dev server on http://localhost:4200/
npx vitest run src/app/<path>/<name>.spec.ts   # single unit / component spec
npm run build                                   # production build with bundle budgets
npx playwright test e2e/<name>.spec.ts         # single E2E flow (baseURL :4200)
```

E2E never hits live Wikimedia in CI. Force the simulator fallback and fault injection via
query params: `/logs?liveUrl=ws://127.0.0.1:9/dead&scenario=outage`
(scenarios: `normal` | `cpu-spike` | `memory-leak` | `outage` | `latency-burst`).
