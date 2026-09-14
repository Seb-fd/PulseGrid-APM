# 008 — Live Wikimedia Telemetry — Proposal

> Delta: `changes/008-live-wikimedia-telemetry` | Depends on: 003a (ingestion), 007 (overview banner) | Status: Approved for build
> Date: 2026-09-14

## 1. Context

PulseGrid APM's live ingestion is locked to Binance market WebSockets
(`wss://stream.binance.com:9443/ws/!miniTicker@arr`). The stream is a synthetic
stand-in for infra telemetry (volatility → cpu/latency, quote-volume →
throughput) and is frequently unreachable from user networks and CI sandboxes,
so most sessions silently run on the local simulator. The request is to connect
PulseGrid to a real, live public data stream — Wikipedia's EventStreams
`recentchange` feed (`wss://stream.wikimedia.org/v2/stream/recentchange`) —
and map genuine edit events onto `CoreStore` structures (logs, throughput,
latency, load indicators), making it the default ingestion mode with the local
simulator kept as offline fallback.

## 2. Constitution §6 amendment note (explicit, approved)

Constitution §6.1 names Binance as the primary live source and §6.4 allows the
Binance public WS URL as the only external endpoint in Phase 1; architecture
§5 and the `derived from market stream` footnotes repeat the lock-in. **This
delta explicitly amends that position for the ingestion default:**

- New primary live source: `wss://stream.wikimedia.org/v2/stream/recentchange`
  (SSE `https://stream.wikimedia.org/v2/stream/recentchange` as transport
  fallback). No API key; still a public read-only endpoint, so the no-secrets
  rule (§6.4 intent) is preserved.
- Binance adapter/service files stay in-repo (deprecated, still unit-tested)
  but are no longer wired into `TelemetryIngestionService` or `AppComponent`.
- All three `derived from market stream` footnotes are reworded to
  `derived from Wikimedia Global Event Stream`.
- No other constitution rule changes: zoneless, strict typing, RxJS-ingestion /
  signals-UI split, backpressure budgets, and coverage gates are untouched.

## 3. Scope

**In:**

- Pure `wikimedia-adapter.ts`: `WikimediaRecentChange` type + `normalize`,
  `adaptWikimediaToMetrics` (real edits/sec throughput, event-time-lag
  latency, throughput-derived cpu/memory load), `adaptWikimediaToLogs`
  (`GET /wiki/{Title} 200`, bot → `429`, reverted/non-edit → `403`).
- `wikimedia-stream.service.ts`: RxJS `webSocket` primary + `EventSource` SSE
  fallback, injectable factories, 10s silence watchdog, 3-attempt exponential
  backoff, 1s `bufferTime` batching with per-URL shared connection.
- Rewire `TelemetryIngestionService` (Wikimedia default URL, sim fallback,
  `sampleTime(100)` kept) and `LogIngestionService` (live Wikimedia logs while
  `live`, sim logs while `simulated`, 1Hz health tick always).
- `AppComponent` default URL switch (keeps `?liveUrl=` / `?scenario=` hermetic
  seam); global `StatusBanner` LIVE label →
  `Live Status: Connected to Wikimedia Global Event Stream`; dashboard overview
  banner gains a `dashboard-live-status` line; three footnotes reworded.
- Unit specs (`wikimedia-adapter.spec.ts`, `wikimedia-stream.service.spec.ts`,
  updates to ingestion/log/app/banner/dashboard specs) + hermetic
  `e2e/wikimedia-live.spec.ts` (`routeWebSocket` mock + dead-port fallback).
- Full verify: lint → typecheck → vitest coverage (≥80%) → build → Playwright.

**Out:** Binance removal (files stay, deprecated), per-wiki breakdown charts,
alert-rule changes, historical persistence, light mode, constitution-file edit
(the amendment lives here as the approved note).

## 4. Alternatives

| Option                                              | Verdict                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Replace Binance default, keep sim fallback (chosen) | Approved: single live path, honest real data, smallest wiring diff.      |
| Wikimedia alongside Binance (merge)                 | Rejected: two live sockets, two adapters, merge semantics unneeded.      |
| Adapter only, no rewiring                           | Rejected: does not satisfy the "default live stream" request.            |
| Strict WebSocket only                               | Rejected: Wikimedia officially documents SSE; WS-only is fragile.        |
| WS primary + SSE fallback (chosen)                  | Approved: resilient, still RxJS-shaped, hermetic-testable via factories. |
| SSE only                                            | Rejected: breaks the `WebSocketSubject` ingestion pattern for no gain.   |
| True WS ping/pong RTT for latency                   | Rejected as impossible: browsers expose no socket ping/pong to JS.       |
| Event-time lag `now − meta.dt` (chosen)             | Approved: real per-event network+server lag, deterministic in tests.     |
| Throughput-derived synthetic latency                | Rejected: hides the one genuinely real measurement this stream offers.   |
| Banner in dashboard overview only                   | Rejected: approved scope is global banner + overview line + footnotes.   |

## 5. Risks & mitigations

- `wss://…/recentchange` is unofficial (docs describe SSE) → WS+SSE fallback;
  contract tests pin the JSON shape; malformed single events are dropped, never
  fatal.
- Wikimedia message shape (single object, not Binance's array) → custom
  deserializer + `normalizeRecentChange` narrowing; 3 consecutive socket errors
  still route to sim fallback with the persistent banner + Retry.
- Real edit lag (often 0.3–1.5s) reads higher than sim latency (~42ms) → honest
  by design; documented in `design.md`; thresholds unchanged.
- Two subscribers (metrics + logs) must not open two sockets → per-URL shared
  `shareReplay` connection in the stream service; custom factories bypass cache
  so tests stay isolated.
- E2E must never hit live Wikimedia in CI → `routeWebSocket` mock for the live
  case, dead-port `liveUrl` for the fallback case (existing seam).

## 6. Exit criteria

`eslint` clean · `tsc` clean · Vitest all-green ≥80% lines+branches+functions+
statements · `ng build` passes budgets · Playwright suite green (incl. new
`wikimedia-live.spec.ts`) · `tasks.md` all `[x]` · zone-ban grep clean.
