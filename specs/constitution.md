# PulseGrid APM — Constitution (Governance & Golden Rules)

> Status: **Ratified — SDD Phase 1**
> Scope: All code in `src/`, all specs in `specs/`, all deltas in `changes/`
> Stack: Angular 22 Zoneless, TypeScript strict, Signals + RxJS, Tailwind CSS v4, Angular CDK

This document is non-negotiable. Any proposal in `changes/*` that violates these rules must be rejected or must explicitly amend this constitution via a new ADR.

## 1. Zoneless Is Mandatory

1.1. The app MUST bootstrap with `provideExperimentalZonelessChangeDetection()` (Angular 22 Zoneless).
1.2. `zone.js` is FORBIDDEN:

- MUST NOT appear in `package.json` dependencies.
- MUST NOT appear in `angular.json` `polyfills` array.
- `polyfills` SHALL be `["@angular/localize/init"]` or empty + explicit imports only.
  1.3. No `NgZone.run()` / `ApplicationRef.tick()` manual hacks to paper over reactivity bugs. Fix the signal/stream graph instead.
  1.4. All async side-effects that should update UI MUST funnel through Signals or `async` pipe equivalents compatible with zoneless (prefer `toSignal()`).

## 2. Strict Typing — No `any`

2.1. `tsconfig.json`: `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`.
2.2. `any` is banned. Use `unknown` + type narrowing, discriminated unions, or explicit domain types.
2.3. ESLint `@typescript-eslint/no-explicit-any: error`. CI fails on violation.
2.4. Public API contracts (services, stores, components `@Input/@Output`) MUST have explicit return types.
2.5. Domain types live in `src/app/core/models/` and are mirrored in `changes/*/design.md` before implementation.

## 3. Reactivity Split — RxJS vs Signals

| Concern                                                      | Tool                        | Rule                                                                                             |
| ------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------ |
| High-frequency ingestion (WebSocket, timers, stochastic sim) | RxJS                        | REQUIRED. Use `WebSocketSubject`, `interval`, `Subject` + operators                              |
| Backpressure / resilience                                    | RxJS                        | REQUIRED: `sampleTime` / `auditTime` / `throttleTime`, `retry({delay})`, `catchError` + fallback |
| UI state, filters, selections, derived views                 | Signals                     | REQUIRED: `signal`, `computed`, `linkedSignal`, `resource`                                       |
| Bridging streams → UI                                        | `toSignal` / `toObservable` | ONLY at store boundary (`CoreStore`), never inside dumb components                               |

3.1. Components MUST NOT `subscribe()` directly to ingestion streams. They consume `Signal<T>` selectors from a store.
3.2. Services MUST NOT expose `BehaviorSubject` for UI filter state — use `signal`.
3.3. `effect()` is for side-effects only (chart redraw, localStorage persist, logging). Never for deriving state — use `computed`.

## 4. Components & Rendering

4.1. Standalone Components ONLY. `NgModule` is forbidden for new code.
4.2. Native control flow ONLY: `@if`, `@for (track ...)`, `@switch`. `*ngIf/*ngFor` banned via ESLint.
4.3. `@defer (on viewport)` REQUIRED for below-fold widgets (topology map, secondary charts).
4.4. `@for` MUST specify `track` (stable `id`).
4.5. Chart rendering MUST run outside Angular change detection:

- Canvas library (uPlot preferred, Lightweight Charts / ECharts acceptable) wrapped in a Standalone directive.
- Data pushes batched via `requestAnimationFrame`, `sampleTime(16)` or `auditTime(16)` for 60 FPS target.
  4.6. Log console MUST use `@angular/cdk/scrolling` VirtualScroll. Rendering >100 DOM rows for logs is a violation.

## 5. Styling & Layout

5.1. Tailwind CSS v4 (CSS-first `@import "tailwindcss"`). No global SCSS theming except tokens.
5.2. Layout via CSS Grid / Flexbox. No component libraries for layout (CDK only for DnD, Overlay, Scrolling, A11y).
5.3. Dark-first observability theme. All charts/logs/topology MUST be legible in dark mode.

## 6. Data Sources (Pluggable Ingestion — Ratified Decisions)

6.1. **Pluggable ingestion engine (REQUIRED):** PulseGrid APM is a high-throughput
streaming APM dashboard. `TelemetryIngestionService` is decoupled and multi-feed
ready: any live provider exposing event frames can be normalized through a pure
adapter to `TelemetryMetric[]`, backpressured (`sampleTime`/`auditTime`), shared via
`shareReplay`, and failed over to simulation. UI consumers MUST NOT depend on a
specific provider.
6.2. **Default Live Stream Provider:** Wikimedia EventStreams `recentchange`
(WebSocket `wss://stream.wikimedia.org/v2/stream/recentchange` primary, SSE
`https://stream.wikimedia.org/v2/stream/recentchange` fallback). No API key. Adapter
normalizes `recentchange` frames → `TelemetryMetric[]` (real edits/sec throughput, real
event-time-lag latency, synthetic cpu/memory load indicators derived from throughput
intensity). Alternate market or event feeds (for example the legacy Binance
`!miniTicker@arr` feed) are permitted only as alternate pluggable-feed examples —
never as active providers.
6.3. **Simulated source:** Local stochastic RxJS stream (`interval` + seeded PRNG)
synthesizing CPU spikes, memory leaks, node outages, 500-error bursts. This is the
high-fidelity fallback when live terminally fails.
6.4. **Self-healing strategy (REQUIRED):** 5-second connection handshake timeout
(`WIKIMEDIA_CONNECT_TIMEOUT_MS`) + 10s silence watchdog; 3 retries with exponential
backoff (1s, 2s, 4s … max 30s); WS → SSE → simulator fallback chain; socket teardown
(refCounted `shareReplay` close) + shared-connection cache eviction
(`disconnect(url?)`) on manual retry; dynamic stream rebinding (`retryLiveConnection`
re-reads `liveUrl` and rebinds fresh `metrics$`/`logs$`). On WS `error`/close or
terminal parse failure → auto-switch to simulator + show persistent UI status banner
`LIVE | SIMULATED | RECONNECTING`. Manual "Retry Live" button REQUIRED.
6.5. No secrets in repo. Public event-stream URL is the only external endpoint allowed
in Phase 1.

## 7. Testing & Coverage Gates

7.1. Vitest for unit + component tests. Playwright for E2E.
7.2. Coverage gate: **≥80% lines AND ≥80% branches** (`vitest --coverage`). CI fails below.
7.3. BDD style: every `specs/modules/*.spec.md` acceptance criterion maps to ≥1 test (`GIVEN-WHEN-THEN` in test name/comment).
7.4. E2E MUST cover: dashboard DnD reorder + persist, log filter via computed signals, alert rule fires on simulated spike.
7.5. No skipped/flaky tests on `main`. Quarantine via issue + `describe.skip` with linked ticket only.

## 8. Quality & Tooling

8.1. ESLint + Prettier + Husky pre-commit (`lint-staged`). Commit blocked on lint/format/typecheck failure.
8.2. Conventional Commits (`feat:`, `fix:`, `spec:`, `chore:`). PR title must follow.
8.3. GitHub Actions CI: `install → lint → typecheck → vitest --coverage → build (zoneless) → playwright (smoke)`.
8.4. TypeScript strict mode + `angularCompilerOptions.strictTemplates: true`.

## 9. SDD Process

9.1. No production code in `src/` without an approved spec in `specs/` + delta in `changes/<nnn>-<slug>/` (`proposal.md`, `design.md`, `tasks.md`).
9.2. Interface changes require `design.md` update first.
9.3. `tasks.md` is the source of truth for execution order. Mark `[x]` only when tests pass.

## 10. Amendment Procedure

To change this constitution: open `changes/<nnn>-amend-constitution/`, justify, get explicit approval, then edit this file. Silent violations will be reverted.
