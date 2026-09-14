# 002 — Store Perf & Reactivity — Design

> Frozen contracts. Implements H1+H2+H3. Constitution §1/§3/§4 and NFR budgets non-negotiable.

## 0. Build deviations (recorded 2026-09-14, behavior contracts unchanged)

- **D1 — `healthNodes` is writer-maintained, not a computed.** A manual cache inside a
  computed is provably useless (signals already memoize; any metrics write mints a new
  array ref). Instead writers refresh a `healthState` snapshot synchronously and skip
  health-irrelevant batches entirely (`isHealthRelevant`: latency or zero-throughput
  only — proven to be the complete input set of `deriveNodeHealth`). Same public type
  (`Signal<readonly ServiceNode[]>`), same values, zero dependent churn on cpu/memory
  batches. Topology reads `healthNodes` untouched. There is no `healthDirty` signal;
  `noteMetricsWrite(batch)` is the relevance gate. Mutate topology only via
  `refreshNodeHealth()`.
- **D2 — `capIncidents` preserves chronological order.** The draft sketch
  (`[...firing, ...resolved]`) reordered the feed and would corrupt the
  newest-first views; the shipped helper drops oldest-resolved in place, then
  oldest overall.
- **D3 — status mirror is one-shot + effect.** `bindIngestion(metrics$, status)` takes
  the initial value; continuous sync is an `effect()` in `AppComponent`
  (side-effect only, constitution-legal) — a single `set()` could never track
  `reconnecting → simulated` transitions.
- **D4 — health expiry needs `lastOutageSize`.** `bumpHealthTick()` recomputes when
  markers are active OR were active since the last snapshot, otherwise resolving
  the final marker would never refresh the snapshot. Driven globally by
  `LogIngestionService` (1Hz tap) and covering `AlertEngine` flows.

## 1. `LogIngestionService` (new, RxJS-only)

```ts
// src/app/core/services/log-ingestion.service.ts
import { Injectable, type Signal } from '@angular/core';
import { interval, map, type Observable } from 'rxjs';
import type { ConnectionStatus } from '../models/alert-rule.model';
import type { LogEntry } from '../models/log-entry.model';
import { StochasticSimService } from './stochastic-sim.service';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

export const LOG_TICK_MS = 1000;

@Injectable({ providedIn: 'root' })
export class LogIngestionService {
  constructor(
    private readonly sim: StochasticSimService,
    private readonly telemetry: TelemetryIngestionService,
  ) {}

  /** Correlated demo logs at 1Hz; empty unless live stream has failed over to sim. */
  logs$(): Observable<LogEntry[]> {
    const state = this.sim.createState(20260913);
    return interval(LOG_TICK_MS).pipe(
      map(() => {
        if (this.telemetry.connectionStatus() !== 'simulated') return [];
        const now = Date.now();
        return this.sim.logsFor(this.sim.generateBatch(state, this.sim.scenario(), now), now);
      }),
    );
  }

  /** Read-only mirror source for the store bridge (no polling in components). */
  readonly status: Signal<ConnectionStatus> = this.telemetry.connectionStatus;
}
```

`AppComponent` contract (only wiring, zero timers):

```ts
// src/app/app.component.ts (after)
ngOnInit(): void {
  const params = new URLSearchParams(this.document.location.search);
  const liveUrl = params.get('liveUrl') ?? BINANCE_MINI_TICKER_URL;
  const scenario = params.get('scenario');
  if (scenario !== null && (SCENARIOS as readonly string[]).includes(scenario)) {
    this.sim.setScenario(scenario as SimScenario);
  }
  this.unbindIngestion = this.store.bindIngestion(
    this.ingestion.metrics$(liveUrl),
    this.logIngestion.status, // one-way mirror; replaces setInterval poll
  );
  this.unbindLogs = this.store.bindLogs(this.logIngestion.logs$());
}
ngOnDestroy(): void {
  this.unbindIngestion(); this.unbindLogs();
}
```

Rules: no `subscribe()` in components; no `BehaviorSubject` for UI state; `interval`/`sampleTime` only in services; `OnPush` + standalone unchanged; `?liveUrl`/`?scenario` seam preserved for hermetic E2E.

## 2. Bounded state (`CoreStore`)

```ts
// additions to src/app/core/store/core-store.service.ts
export const MAX_METRICS = 1200; // unchanged (4 kinds × 300)
export const MAX_LOGS = 5000; // unchanged
export const MAX_INCIDENTS = 200; // NEW — drop-oldest on write
export const HEALTH_TICK_MS = 1000; // health recompute ceiling

// Drop policies (documented on each writer):
// - ingestMetrics: keep-latest (RingBuffer overwrite-oldest, snapshot oldest→newest)
// - appendLogs: keep-all up to cap, then drop-oldest (matches current slice semantics)
// - tickAlerts: drop-oldest resolved first, then oldest firing
```

Write-path backing (public signal shape **unchanged**: `metrics(): readonly TelemetryMetric[]` oldest→newest):

```ts
private readonly metricRing = new RingBuffer<TelemetryMetric>(MAX_METRICS);
private readonly logRing = new RingBuffer<LogEntry>(MAX_LOGS);

ingestMetrics(batch: readonly TelemetryMetric[]): void {
  if (batch.length === 0) return;
  this.metricRing.pushMany(batch);
  this.metrics.set(this.metricRing.toArray());
  this.noteMetricsWrite(batch); // sets healthDirty when batch has latency/throughput-0
}

appendLogs(entries: readonly LogEntry[]): void {
  if (entries.length === 0) return;
  this.logRing.pushMany(entries);
  this.logs.set(this.logRing.toArray());
}

// Ingestion bridge additions:
private logsSub: Subscription | null = null;
bindLogs(logs$: Observable<readonly LogEntry[]>): () => void {
  this.logsSub?.unsubscribe();
  this.logsSub = logs$.subscribe({ next: (entries) => this.appendLogs(entries) });
  return () => { this.logsSub?.unsubscribe(); this.logsSub = null; };
}
```

Seeding: constructor (or first `ingestMetrics`/`appendLogs`) hydrates rings from existing signal values so late `bindLogs` never drops pre-existing rows. `snapshotRingBuffers(capacity)` helper kept (now reads rings instead of rescanning).

`tickAlerts` cap:

```ts
if (changed) {
  // keep newest MAX_INCIDENTS; prefer dropping resolved
  const resolved = incidents.filter((i) => i.status !== 'firing');
  const firing = incidents.filter((i) => i.status === 'firing');
  const overflow = incidents.length - MAX_INCIDENTS;
  const dropResolved = Math.min(overflow, resolved.length);
  this.incidents.set([...firing, ...resolved.slice(dropResolved)].slice(-MAX_INCIDENTS));
}
// + private openByRule: Map<string, AlertIncident> index replaces per-rule incidents.find()
```

## 3. Selector memoization

```ts
// selectWindow: cached per (kind, n, serviceId) — bounded key space
private readonly windowCache = new Map<string, Signal<readonly TelemetryMetric[]>>;
selectWindow(kind: MetricKind, n: number, serviceId?: string): Signal<readonly TelemetryMetric[]> {
  const key = `${kind}|${String(n)}|${serviceId ?? ''}`;
  const hit = this.windowCache.get(key);
  if (hit !== undefined) return hit;
  const sel: Signal<readonly TelemetryMetric[]> = computed(() => {
    const all = this.metrics(); // single backward scan, oldest→newest out
    const filtered: TelemetryMetric[] = [];
    for (let i = all.length - 1; i >= 0 && filtered.length < n; i--) {
      const m: TelemetryMetric | undefined = all[i];
      if (m === undefined) continue;
      if (m.kind !== kind) continue;
      if (serviceId !== undefined && m.serviceId !== serviceId && m.serviceId !== undefined) continue;
      filtered.push(m);
    }
    return filtered.reverse();
  });
  this.windowCache.set(key, sel);
  return sel;
}
```

Callers change (no behavior change): `dashboard-metric-widget` creates **one** `selectWindow(kind(), 100)` keyed by its `kind` input instead of 4 eager windows + switch. `telemetry-page` keeps 4 windows (one per card) — now cache hits across re-renders.

Health (single pass, 1Hz ceiling):

```ts
readonly healthTick = signal(0); // bumped by interval(HEALTH_TICK_MS) in AlertEngine or LogIngestion; tests set manually
private readonly healthDirty = signal(true);

readonly outageIds: Signal<ReadonlySet<string>> = computed(() => {
  void this.healthTick(); // time-driven expiry, not commit-driven (fixes Date.now-in-computed staleness)
  const cutoff = Date.now() - OUTAGE_WINDOW_MS;
  const out = new Set<string>();
  for (const m of this.metrics()) {
    if (m.kind === 'throughput' && m.value === 0 && m.serviceId !== undefined && m.timestamp >= cutoff) out.add(m.serviceId);
  }
  return out;
});

readonly healthNodes: Signal<readonly ServiceNode[]> = computed(() =>
  deriveNodeHealth(this.nodes(), this.metrics(), this.logs(), this.outageIds()),
);
// noteMetricsWrite(batch): sets healthDirty only when batch contains latency or throughput-0;
// healthTick effect recomputes at most 1Hz AND skips when !healthDirty (keeps ≤1s tolerance per arch §4)
```

`deriveNodeHealth` itself gains an early-out: when the batch has no `latency` entries and no new outage ids, reuse prior per-service p95 (documented; pure function signature unchanged so `refreshNodeHealth` keeps working).

Log summary (one scan, replaces 4):

```ts
// log-viewer.component.ts (after) — single computed consumed by template
readonly summary: Signal<{ rows: readonly LogEntry[]; errorCount: number; warnCount: number; services: readonly string[] }> = computed(() => {
  const f = this.filter();
  const rows = this.store.logs().filter((e) => matchesLogFilter(e, f));
  let errorCount = 0; let warnCount = 0;
  const svc = new Set<string>();
  for (const e of this.store.logs()) {
    svc.add(e.serviceId);
    if (e.level === 'ERROR') errorCount++;
    else if (e.level === 'WARN') warnCount++;
  }
  return { rows, errorCount, warnCount, services: ['all', ...[...svc].sort()] };
});
```

Reuse (no new APIs): `alerts-page`, `incident-list`, `dashboard-incident-widget`, `dashboard-grid` read `store.activeAlerts` (+ new `activeAlertsCount = computed(() => this.activeAlerts().length)`) instead of local `.filter(firing)`; `dashboard-grid counts` composes `metricsByKind/activeAlertsCount/healthNodes` and `downCount` reads `healthNodes` (fixes stale-health read of raw `nodes()`).

## 4. Test contracts (BDD → file)

| Criterion                                                                                                      | Spec                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GIVEN sim fallback WHEN 1s ticks THEN correlated logs append; GIVEN live THEN empty                            | `log-ingestion.service.spec.ts` (fake timers, fixed seed+`now`)                                     |
| GIVEN `bindIngestion(metrics$, status)` THEN store mirrors status with no poll; `unbind` stops both streams    | `core-store.spec.ts` (+ `app.component.spec.ts` asserts zero timers: no `setInterval` in component) |
| GIVEN >1200 metrics / >5000 logs / >200 incidents THEN oldest dropped, newest kept, order oldest→newest        | `core-store.spec.ts` (bounds)                                                                       |
| GIVEN repeated `selectWindow(same args)` THEN identical Signal instance; different args THEN distinct          | `core-store.spec.ts` (cache identity)                                                               |
| GIVEN latency-free batch THEN health recompute skipped; GIVEN outage THEN `healthNodes` reflects within 1 tick | `core-store.spec.ts` + `topology-map.spec.ts` (existing FR-P4/P5 stay green)                        |
| E2E hermetic seam intact: `?liveUrl=ws://127.0.0.1:9/dead&scenario=outage` → SIMULATED banner + outage health  | `e2e/` outage flow (existing specs must pass unmodified)                                            |

NFR guards: store commits stay ≤10Hz (`sampleTime(100)` untouched); health ≤1Hz; VirtualScroll/`@defer`/uPlot paths untouched; footnotes intact; budgets enforced at build gate.
