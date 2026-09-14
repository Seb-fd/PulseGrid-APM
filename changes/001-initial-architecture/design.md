# 001 — Initial Architecture — Design (Interface Contracts)

> Frozen contracts for Phase 2 implementation. Any change requires spec amendment.
> Path: `src/app/core/models/*.ts` | Strict TS, no `any`.

## 1. TelemetryMetric

```ts
export type MetricKind = 'cpu' | 'memory' | 'latency' | 'throughput';
export type MetricSource = 'live' | 'simulated';

export interface TelemetryMetric {
  /** Stable unique key: `${kind}:${serviceId ?? 'global'}:${timestamp}:${seq}` */
  id: string;
  kind: MetricKind;
  /** Normalized display value. Units per `unit`. */
  value: number;
  /** Display unit: '% STA' for cpu/memory, 'ms' for latency, 'rps' for throughput */
  unit: '%' | 'ms' | 'rps';
  /** Unix epoch ms */
  timestamp: number;
  source: MetricSource;
  /** Owning service; undefined = global/cluster aggregate */
  serviceId?: string;
}

/** Binance raw frame (subset we consume) */
export interface BinanceMiniTicker {
  s: string; // symbol e.g. BTCUSDT
  c: string; // close price as string
  o: string; // open price
  h: string; // high
  l: string; // low
  v: string; // base volume
  q: string; // quote volume
}

/** Adapter contract: Binance frame[] → domain metrics (synthetic mapping, see footnote req). */
export function adaptBinanceToMetrics(frames: BinanceMiniTicker[], now: number): TelemetryMetric[];
```

Validation: `value` finite; `timestamp` >0; `cpu/memory` clamped 0–100; `latency` ≥0; `throughput` ≥0.

## 2. LogEntry

```ts
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string; // `${timestamp}:${seq}:${serviceId}`
  level: LogLevel;
  message: string;
  timestamp: number;
  serviceId: string;
  traceId?: string;
}

export interface LogFilter {
  query: string; // substring over message|serviceId|traceId, case-insensitive
  levels: Set<LogLevel>; // empty = all
  serviceId: string | 'all';
}
```

Cap: store keeps last 5000; viewport renders ~30 via CDK.

## 3. ServiceNode

```ts
export type HealthState = 'healthy' | 'degraded' | 'down';

export interface ServiceNode {
  id: string; // e.g. 'payments-api'
  name: string; // display label
  health: HealthState; // derived via computed(), never set by view
  dependencies: string[]; // ids this node calls
  position: { x: number; y: number }; // curated SVG coords (viewBox 800x500)
  lastLatencyMs?: number;
}

export interface TopologySeed {
  nodes: ServiceNode[];
}
```

Default seed (11 nodes): `api-gateway → auth, payments-api, ledger, search, notifications → postgres, redis, kafka` (+ `frontend` edge node).

Health rule (v1): `down` if outage event active for id; else `degraded` if p95 latency window >200ms or error rate >5%; else `healthy`.

## 4. AlertRule & Incident

```ts
export type AlertOperator = '>' | '<' | '>=' | '<=' | '==';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type IncidentStatus = 'firing' | 'resolved';

export interface AlertRule {
  id: string;
  name: string; // min 3 chars
  metric: MetricKind;
  operator: AlertOperator;
  threshold: number; // finite; cpu/memory 0–100
  durationSec: number; // 5–300 int
  enabled: boolean;
  severity: AlertSeverity;
  createdAt: number;
}

export interface AlertIncident {
  id: string;
  ruleId: string;
  triggeredAt: number;
  resolvedAt?: number;
  status: IncidentStatus;
  observedValue: number; // value that breached
}

export function evaluateRule(window: number[], rule: AlertRule): boolean;
```

Semantics: `evaluateRule` true iff EVERY sample in window satisfies `value <op> threshold` (sustained-breach, no flapping). Engine ticks 1s; single incident per continuous breach.

## 5. Supporting Types

```ts
export type ConnectionStatus = 'live' | 'simulated' | 'reconnecting';

export interface DashboardWidgetLayout {
  id: string;
  col: number; row: number; w: 1 | 2; h: 1 | 2;
  visible: boolean;
}
export interface DashboardLayout { version: 1; widgets: DashboardWidgetLayout[]; }

export class RingBuffer<T> {
  constructor(public capacity: number);
  push(v: T): void;
  toArray(): readonly T[];
  get size(): number;
  clear(): void;
}
```

## 6. Store Shape (skeleton)

```ts
export abstract class CoreStore {
  abstract readonly metrics: Signal<Map<MetricKind, RingBuffer<TelemetryMetric>>>;
  abstract readonly logs: Signal<readonly LogEntry[]>;
  abstract readonly nodes: Signal<readonly ServiceNode[]>;
  abstract readonly connectionStatus: Signal<ConnectionStatus>;
  abstract chartWindow(kind: MetricKind, n: number): Signal<readonly TelemetryMetric[]>;
  abstract filteredLogs(f: Signal<LogFilter>): Signal<readonly LogEntry[]>;
}
```
