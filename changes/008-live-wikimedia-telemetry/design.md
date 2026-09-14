# 008 — Live Wikimedia Telemetry — Design

> Frozen contracts for delta 008. Constitution §6 amendment note lives in
> `proposal.md` §2. No domain-type changes to `TelemetryMetric` / `LogEntry`
> shapes (both keep `source: 'live'` for stream data).

## 1. Wikimedia event contract

```ts
// src/app/core/services/wikimedia-adapter.ts
export const WIKIMEDIA_RECENTCHANGE_URL = 'wss://stream.wikimedia.org/v2/stream/recentchange';
export const WIKIMEDIA_SSE_URL = 'https://stream.wikimedia.org/v2/stream/recentchange';

/** Minimal subset of the EventStreams `recentchange` schema we consume. */
export interface WikimediaRecentChange {
  wiki: string; // e.g. 'enwiki'
  title: string; // e.g. 'Albert Einstein'
  type: string; // 'edit' | 'new' | 'log' | 'categorize'
  user: string;
  bot: boolean;
  minor: boolean;
  /** Unix epoch seconds (payload `timestamp`). */
  timestamp: number;
  /** ISO instant (payload `meta.dt`), may be '' when absent. */
  eventDt: string;
  comment: string;
  serverName: string;
  lengthOld: number | null;
  lengthNew: number | null;
}

/** Narrow `unknown` WS/SSE payloads; returns `null` for malformed events. */
export function normalizeRecentChange(value: unknown): WikimediaRecentChange | null;
```

- `normalizeRecentChange` never throws and never returns `any`; missing fields
  get safe defaults (`wiki: 'wikimedia'`, `title: 'Unknown'`, `type: 'edit'`,
  `timestamp: NaN` → event treated as lag-unknown, not fatal).

## 2. Metric adapter contract (pure, deterministic)

```ts
export function adaptWikimediaToMetrics(
  events: readonly WikimediaRecentChange[],
  now: number,
): TelemetryMetric[];
```

- Input is one 1s `bufferTime` batch, so **throughput = `events.length`**
  (edits in the window = real edits/sec), clamped `0–8000`, unit `rps`.
- **Latency = mean event-time lag** `now − timestamp*1000` over events with
  finite non-negative lag; empty/unknown → `35`ms baseline. Clamped `5–2000`,
  unit `ms`. (Browsers expose no WS ping/pong; lag is the honest real RTT
  proxy and is documented as such in code comments.)
- **CPU** `clamp(12 + rps*5 + min(avgLag/100, 8), 2, 98)` unit `%` — dynamic
  load indicator off throughput intensity (≈22–37% at typical 2–5 rps).
- **Memory** `clamp(52 + rps*0.8, 10, 96)` unit `%`.
- Empty batch still emits the 4 baseline metrics (keeps charts alive during
  quiet windows); values rounded to 2 decimals; ids
  `` `${kind}:wikimedia:${now}:${idx}` ``; `source: 'live'`.

## 3. Log adapter contract (pure, deterministic)

```ts
export const WIKIMEDIA_LOGS_PER_BATCH = 25;

export function adaptWikimediaToLogs(
  events: readonly WikimediaRecentChange[],
  now: number,
): LogEntry[];
```

- One `LogEntry` per event, capped at 25/batch (first 25 win; protects the
  `MAX_LOGS` 5000 ring + VirtualScroll).
- `GET /wiki/{Title} {status}` with `Title = encodeURIComponent(title with
spaces → '_')` — parses with existing `parseHttpMethod`/`parseHttpStatus`
  (`log-format.ts`); e.g. `GET /wiki/Albert_Einstein 200 — enwiki edit by
Alice`.
- Status mapping: bot → `429` WARN; `type` `log`/`categorize` → `403` WARN;
  blanking/revert (`lengthNew − lengthOld < −500`) → `403` WARN; else `200`
  INFO. No live ERRORs (the stream carries no 500s; ERRORs stay sim-outage).
- `serviceId = wiki`, `timestamp = now`, `id = ${now}:live:${wiki}:${i}`,
  `traceId = live-${now}-${i}`.

## 4. Stream service contract (RxJS-only, constitution §3)

```ts
// src/app/core/services/wikimedia-stream.service.ts
export const WIKIMEDIA_SILENCE_TIMEOUT_MS = 10_000;
export const WIKIMEDIA_RETRY_ATTEMPTS = 3;
export const WIKIMEDIA_FRAME_WINDOW_MS = 1000;

export type WsEventSourceFactory = (url: string) => Observable<WikimediaRecentChange>;
export type SseEventSourceFactory = (url: string) => Observable<WikimediaRecentChange>;

export function defaultWsEvents(url: string): Observable<WikimediaRecentChange>;
export function defaultSseEvents(url: string): Observable<WikimediaRecentChange>;

@Injectable({ providedIn: 'root' })
export class WikimediaStreamService {
  /** 1s batches; shared per URL for default factories (single socket). */
  frames$(
    url: string = WIKIMEDIA_RECENTCHANGE_URL,
    wsFactory: WsEventSourceFactory = defaultWsEvents,
    sseFactory: SseEventSourceFactory = defaultSseEvents,
  ): Observable<WikimediaRecentChange[]>;
}
```

- WS deserializer parses single-object JSON (not Binance's array shape);
  malformed payloads are dropped, never fatal.
- `wsFactory(url).pipe(timeout({each: 10s}), retry({count: 3, backoff
1s/2s/4s…30s}), catchError(() => sseFactory(url)))`, then
  `bufferTime(1000)` + `shareReplay({bufferSize: 1, refCount: true})`.
- `defaultSseEvents` maps `wss:`→`https:`/`ws:`→`http:` and wraps
  `EventSource` in an `Observable` (close on teardown, error → `subscriber.error`).
- Custom factories bypass the per-URL cache (test isolation).

## 5. Ingestion rewiring

```ts
// telemetry-ingestion.service.ts
metrics$(
  liveUrl: string = WIKIMEDIA_RECENTCHANGE_URL,
  simSeed = Date.now() % 2_147_483_647,
): Observable<TelemetryMetric[]>;
// live$ = wikimedia.frames$(liveUrl).pipe(map((b) => adaptWikimediaToMetrics(b, Date.now())), tap(live));
// fallback$ unchanged (sim) → catchError sets simulated + lastError → sampleTime(100) → shareReplay(1).
```

```ts
// log-ingestion.service.ts
logs$(liveUrl: string = WIKIMEDIA_RECENTCHANGE_URL): Observable<LogEntry[]>;
// merge(
//   wikimedia.frames$(liveUrl).pipe(map((b) => status()==='live' ? adaptWikimediaToLogs(b, Date.now()) : []), catchError(() => EMPTY)),
//   interval(1000).pipe(map(() => status()==='simulated' ? sim.logsFor(...) : []), tap(() => store.bumpHealthTick())),
// )
```

- `BinanceWsService`/`binance-adapter.ts` stay in-repo (deprecated, still
  tested) but unwired. `AppComponent` default switches to
  `WIKIMEDIA_RECENTCHANGE_URL`; `?liveUrl=`/`?scenario=` seam unchanged.

## 6. UI strings

- `StatusBannerComponent` LIVE label →
  `Live Status: Connected to Wikimedia Global Event Stream`
  (SIMULATED/RECONNECTING unchanged + Retry kept).
- `DashboardGridComponent`: new `liveStatusText: Signal<string>` computed from
  `store.connectionStatus` (live → connected string; simulated → `Live Status:
Simulated fallback — live Wikimedia stream unreachable`; reconnecting →
  `Live Status: Reconnecting to Wikimedia Global Event Stream…`), rendered as
  `<p data-testid="dashboard-live-status">` inside the overview banner.
- Footnotes (`app.component.ts` footer, `dashboard-grid`, `telemetry-page`) →
  `Values derived from Wikimedia Global Event Stream + simulator — not real
infrastructure probes.`

## 7. Test contracts

| Criterion                                                                                        | Spec                                                 |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| normalize drops malformed, defaults safe                                                         | `wikimedia-adapter.spec.ts`                          |
| edit→200 INFO, bot→429 WARN, log-type→403, blanking→403, cap 25, deterministic                   | `wikimedia-adapter.spec.ts`                          |
| throughput = batch length; latency = mean lag; empty → baseline 4; cpu/mem clamp + deterministic | `wikimedia-adapter.spec.ts`                          |
| 1s batching of WS single events (fake timers)                                                    | `wikimedia-stream.service.spec.ts`                   |
| WS terminal failure → SSE fallback emits                                                         | `wikimedia-stream.service.spec.ts`                   |
| Both transports fail → errors (sim fallback upstream)                                            | `wikimedia-stream.service.spec.ts`                   |
| Live Wikimedia → `source:'live'` + status live; fail → simulated + error                         | `telemetry-ingestion.spec.ts` (rewired)              |
| Live → Wikimedia HTTP logs; simulated → sim ERROR logs; health tick advances                     | `log-ingestion.service.spec.ts` (extended)           |
| Default bind uses Wikimedia URL; seam overrides                                                  | `app.component.spec.ts` (updated)                    |
| Banner live label = Wikimedia string                                                             | `status-banner.spec.ts` (component test)             |
| Overview `dashboard-live-status` reflects live/simulated/reconnecting                            | `dashboard-grid.spec.ts` (extended)                  |
| E2E mock WS → connected banner + charts + logs; dead-port → SIMULATED                            | `e2e/wikimedia-live.spec.ts` (new, `routeWebSocket`) |
| Existing telemetry-logs footnote assertion updated to Wikimedia wording                          | `e2e/telemetry-logs.spec.ts`                         |
