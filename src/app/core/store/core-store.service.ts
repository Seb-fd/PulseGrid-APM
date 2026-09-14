import { Injectable, Signal, computed, signal } from '@angular/core';
import { Subscription, type Observable } from 'rxjs';
import {
  evaluateRule,
  type AlertIncident,
  type AlertRule,
  type ConnectionStatus,
} from '../models/alert-rule.model';
import { matchesLogFilter, type LogEntry, type LogFilter } from '../models/log-entry.model';
import { TOPOLOGY_SEED, deriveHealth, type ServiceNode } from '../models/service-node.model';
import type { MetricKind, TelemetryMetric } from '../models/telemetry-metric.model';
import { RingBuffer } from '../utils/ring-buffer';

export const MAX_METRICS = 1200;
export const MAX_LOGS = 5000;

/** Newest incidents kept; overflow drops oldest-resolved first, then oldest overall. */
export const MAX_INCIDENTS = 200;

/** Health-outage clock cadence: expiry re-evaluates on this clock when the stream stalls. */
export const HEALTH_TICK_MS = 1000;

/** Zero-throughput samples newer than this mark a node outage (sim signature). */
export const OUTAGE_WINDOW_MS = 15_000;

/** Pure health derivation shared by `refreshNodeHealth` and `healthNodes`. */
function deriveNodeHealth(
  base: readonly ServiceNode[],
  metrics: readonly TelemetryMetric[],
  logs: readonly LogEntry[],
  outages: ReadonlySet<string>,
): ServiceNode[] {
  const byService = new Map<string, number[]>();
  for (const m of metrics) {
    if (m.kind !== 'latency' || m.serviceId === undefined) continue;
    const arr = byService.get(m.serviceId) ?? [];
    arr.push(m.value);
    byService.set(m.serviceId, arr);
  }
  const errorCounts = new Map<string, number>();
  const totalCounts = new Map<string, number>();
  for (const l of logs) {
    totalCounts.set(l.serviceId, (totalCounts.get(l.serviceId) ?? 0) + 1);
    if (l.level === 'ERROR') errorCounts.set(l.serviceId, (errorCounts.get(l.serviceId) ?? 0) + 1);
  }
  return base.map((node) => {
    const lat = byService.get(node.id) ?? [];
    const sorted = [...lat].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p95: number | null = sorted.length > 0 ? (sorted[idx] ?? null) : null;
    const total = totalCounts.get(node.id) ?? 0;
    const errs = errorCounts.get(node.id) ?? 0;
    const health = deriveHealth({
      outageActive: outages.has(node.id),
      p95LatencyMs: p95,
      errorRate: total > 0 ? errs / total : 0,
    });
    return { ...node, health, lastLatencyMs: sorted[sorted.length - 1] ?? node.lastLatencyMs };
  });
}

/**
 * Cap helper: drop oldest-resolved first (preserving chronological order),
 * then oldest overall when everything is still firing.
 */
function capIncidents(all: readonly AlertIncident[]): readonly AlertIncident[] {
  const overflow = all.length - MAX_INCIDENTS;
  if (overflow <= 0) return all;
  const out = [...all];
  let dropped = 0;
  for (let i = 0; i < out.length && dropped < overflow; i++) {
    if (out[i]?.status !== 'firing') {
      out.splice(i, 1);
      i -= 1;
      dropped += 1;
    }
  }
  if (dropped < overflow) out.splice(0, overflow - dropped);
  return out;
}

/**
 * A metrics batch moves derived health only via latency samples (p95 /
 * last-latency) or zero-throughput markers (outage set). Pure cpu / memory /
 * non-zero-throughput batches cannot change the derivation — writers use this
 * to skip the recompute and spare dependents a cascade.
 */
function isHealthRelevant(batch: readonly TelemetryMetric[]): boolean {
  return batch.some((m) => m.kind === 'latency' || (m.kind === 'throughput' && m.value === 0));
}

/**
 * Central Signal Store (sole RxJS→Signals bridge, constitution §3).
 * Components read Signals only; ingestion pushes via `bindIngestion()` / `bindLogs()`.
 *
 * Write-path backing (delta 002):
 * - `metricRing` / `logRing` are the source of truth for bounded histories.
 *   Drop policy: keep-latest / keep-all-up-to-cap, then drop-oldest
 *   (identical observable semantics to the previous spread+slice, O(1) push).
 *   Public `metrics()` / `logs()` snapshots stay oldest→newest arrays.
 * - `healthNodes` is a writer-maintained snapshot (not a computed): viewers get
 *   the same synchronous values, but health-irrelevant batches no longer
 *   invalidate dependents. Mutate topology only via `refreshNodeHealth()`.
 */
@Injectable({ providedIn: 'root' })
export class CoreStore {
  // --- raw state ---
  readonly metrics = signal<readonly TelemetryMetric[]>([]);
  readonly logs = signal<readonly LogEntry[]>([]);
  readonly nodes = signal<readonly ServiceNode[]>(TOPOLOGY_SEED);
  readonly connectionStatus = signal<ConnectionStatus>('reconnecting');
  readonly rules = signal<readonly AlertRule[]>([]);
  readonly incidents = signal<readonly AlertIncident[]>([]);

  // --- derived ---
  readonly activeAlerts: Signal<readonly AlertIncident[]> = computed(() =>
    this.incidents().filter((i) => i.status === 'firing'),
  );

  readonly activeAlertsCount: Signal<number> = computed(() => this.activeAlerts().length);

  readonly metricsByKind: Signal<Readonly<Record<MetricKind, number>>> = computed(() => {
    const counts: Record<MetricKind, number> = { cpu: 0, memory: 0, latency: 0, throughput: 0 };
    for (const m of this.metrics()) counts[m.kind] += 1;
    return counts;
  });

  /**
   * 1Hz health clock (bumped by `LogIngestionService`). `outageIds` reads it so
   * zero-throughput markers expire even when the metric stream stalls.
   */
  readonly healthTick = signal(0);

  private metricsSub: Subscription | null = null;
  private logsSub: Subscription | null = null;
  private readonly metricRing = new RingBuffer<TelemetryMetric>(MAX_METRICS);
  private readonly logRing = new RingBuffer<LogEntry>(MAX_LOGS);
  private readonly windowCache = new Map<string, Signal<readonly TelemetryMetric[]>>();
  private readonly healthState = signal<readonly ServiceNode[]>(CoreStore.initialHealth());
  private lastOutageSize = 0;

  /** Live health view: same values as the former computed, refreshed by writers (see class docs). */
  readonly healthNodes: Signal<readonly ServiceNode[]> = this.healthState.asReadonly();

  private static initialHealth(): readonly ServiceNode[] {
    return deriveNodeHealth(TOPOLOGY_SEED, [], [], new Set<string>());
  }

  // --- ingestion bridge ---
  bindIngestion(
    metrics$: Observable<TelemetryMetric[]>,
    status?: Signal<ConnectionStatus>,
  ): () => void {
    this.unbindMetrics();
    this.metricsSub = metrics$.subscribe({
      next: (batch) => {
        this.ingestMetrics(batch);
      },
      error: () => {
        this.connectionStatus.set('simulated');
      },
    });
    if (status) {
      // One-way mirror; continuous sync is owned by the caller's effect (see AppComponent).
      this.connectionStatus.set(status());
    }
    return () => {
      this.unbindMetrics();
    };
  }

  bindLogs(logs$: Observable<readonly LogEntry[]>): () => void {
    this.unbindLogs();
    this.logsSub = logs$.subscribe({
      next: (entries) => {
        this.appendLogs(entries);
      },
    });
    return () => {
      this.unbindLogs();
    };
  }

  unbind(): void {
    this.unbindMetrics();
    this.unbindLogs();
  }

  private unbindMetrics(): void {
    this.metricsSub?.unsubscribe();
    this.metricsSub = null;
  }

  private unbindLogs(): void {
    this.logsSub?.unsubscribe();
    this.logsSub = null;
  }

  /**
   * Advance the 1Hz health clock; recomputes when markers are active (expiry
   * may flip them) or were active since the last snapshot (expiry may have
   * just resolved the final marker).
   */
  bumpHealthTick(): void {
    this.healthTick.update((v) => v + 1);
    if (this.outageIds().size > 0 || this.lastOutageSize > 0) {
      this.recomputeHealth();
    }
  }

  ingestMetrics(batch: readonly TelemetryMetric[]): void {
    if (batch.length === 0) return;
    this.seedMetricRing();
    this.metricRing.pushMany(batch);
    this.metrics.set(this.metricRing.toArray());
    this.noteMetricsWrite(batch);
  }

  appendLogs(entries: readonly LogEntry[]): void {
    if (entries.length === 0) return;
    this.seedLogRing();
    this.logRing.pushMany(entries);
    this.logs.set(this.logRing.toArray());
    // Any log shifts per-service error rates → refresh the snapshot.
    this.recomputeHealth();
  }

  clearLogs(): void {
    this.logRing.clear();
    this.logs.set([]);
    this.recomputeHealth();
  }

  setConnectionStatus(s: ConnectionStatus): void {
    this.connectionStatus.set(s);
  }

  /**
   * Gate health recomputation on batch relevance (see `isHealthRelevant`).
   * Irrelevant batches leave every signal untouched — dependents don't re-run.
   */
  private noteMetricsWrite(batch: readonly TelemetryMetric[]): void {
    if (isHealthRelevant(batch)) {
      this.recomputeHealth();
    }
  }

  private recomputeHealth(): void {
    const outages = this.outageIds();
    this.healthState.set(deriveNodeHealth(this.nodes(), this.metrics(), this.logs(), outages));
    this.lastOutageSize = outages.size;
  }

  /** Rehydrate rings when state was seeded bypassing the writers (specs, restores). */
  private seedMetricRing(): void {
    if (this.metricRing.size === 0 && this.metrics().length > 0) {
      this.metricRing.pushMany(this.metrics().slice(-MAX_METRICS));
    }
  }

  private seedLogRing(): void {
    if (this.logRing.size === 0 && this.logs().length > 0) {
      this.logRing.pushMany(this.logs().slice(-MAX_LOGS));
    }
  }

  /**
   * Window selector: newest N of kind (+optional service), oldest→newest.
   * Results are memoized per (kind, n, serviceId) — repeated calls with equal
   * args return the identical Signal instead of allocating a new computed.
   */
  selectWindow(
    kind: MetricKind,
    n: number,
    serviceId?: string,
  ): Signal<readonly TelemetryMetric[]> {
    const key = `${kind}|${String(n)}|${serviceId ?? ''}`;
    const hit = this.windowCache.get(key);
    if (hit !== undefined) return hit;
    const sel: Signal<readonly TelemetryMetric[]> = computed(() => {
      const all = this.metrics();
      const filtered: TelemetryMetric[] = [];
      for (let i = all.length - 1; i >= 0 && filtered.length < n; i--) {
        const m: TelemetryMetric | undefined = all[i];
        if (m === undefined) continue;
        if (m.kind !== kind) continue;
        if (serviceId !== undefined && m.serviceId !== serviceId && m.serviceId !== undefined) {
          // Global aggregates pass through when a service window is requested
          // only if no service-specific data exists — handled by fallback below.
          continue;
        }
        filtered.push(m);
      }
      return filtered.reverse();
    });
    this.windowCache.set(key, sel);
    return sel;
  }

  selectFilteredLogs(filter: Signal<LogFilter>): Signal<readonly LogEntry[]> {
    return computed(() => {
      const f = filter();
      return this.logs().filter((e) => matchesLogFilter(e, f));
    });
  }

  // --- topology health (computed from live windows) ---
  /**
   * Service ids with a recent zero-throughput sample — the simulator's
   * outage signature. Reads `healthTick` so markers expire on the 1Hz clock
   * even when no new batches arrive.
   */
  readonly outageIds: Signal<ReadonlySet<string>> = computed(() => {
    this.healthTick();
    const cutoff = Date.now() - OUTAGE_WINDOW_MS;
    const out = new Set<string>();
    for (const m of this.metrics()) {
      if (
        m.kind === 'throughput' &&
        m.value === 0 &&
        m.serviceId !== undefined &&
        m.timestamp >= cutoff
      ) {
        out.add(m.serviceId);
      }
    }
    return out;
  });

  refreshNodeHealth(outages: ReadonlySet<string> = new Set()): void {
    this.nodes.set(deriveNodeHealth(this.nodes(), this.metrics(), this.logs(), outages));
    this.recomputeHealth();
  }

  // --- alert rules ---
  upsertRule(rule: AlertRule): void {
    const existing = this.rules().findIndex((r) => r.id === rule.id);
    if (existing >= 0) {
      const copy = [...this.rules()];
      copy[existing] = rule;
      this.rules.set(copy);
    } else {
      this.rules.set([...this.rules(), rule]);
    }
  }

  removeRule(id: string): void {
    this.rules.set(this.rules().filter((r) => r.id !== id));
  }

  /**
   * Deterministic 1s-tick evaluation (interval wiring lives in AlertEngineService).
   * Fires one incident per continuous breach; resolves after recovery.
   * Open incidents are indexed by rule id (no per-rule linear scan);
   * stored history is capped at MAX_INCIDENTS (oldest-resolved first).
   */
  tickAlerts(now: number): void {
    const metrics = this.metrics();
    let incidents = [...this.incidents()];
    let changed = false;
    const openByRule = new Map<string, AlertIncident>();
    for (const i of incidents) {
      if (i.status === 'firing' && !openByRule.has(i.ruleId)) openByRule.set(i.ruleId, i);
    }

    for (const rule of this.rules()) {
      if (!rule.enabled) continue;
      // Window = samples of rule.metric within [now - durationSec*1000, now].
      const from = now - rule.durationSec * 1000;
      const window = metrics
        .filter((m) => m.kind === rule.metric && m.timestamp >= from && m.timestamp <= now)
        .map((m) => m.value);
      // Require at least 2 samples to avoid single-point flapping, unless duration is tiny.
      if (window.length === 0) continue;
      const breached = evaluateRule(window, rule);
      const open = openByRule.get(rule.id);

      if (breached && !open) {
        const last: number | undefined = window[window.length - 1];
        const created: AlertIncident = {
          id: `${rule.id}:${String(now)}`,
          ruleId: rule.id,
          triggeredAt: now,
          status: 'firing',
          observedValue: last ?? rule.threshold,
        };
        incidents.push(created);
        openByRule.set(rule.id, created);
        changed = true;
      } else if (!breached && open) {
        incidents = incidents.map((i) =>
          i.id === open.id ? { ...i, status: 'resolved' as const, resolvedAt: now } : i,
        );
        openByRule.delete(rule.id);
        changed = true;
      }
    }
    if (changed) this.incidents.set(capIncidents(incidents));
  }

  /** Test helper: bounded per-kind history as RingBuffers (reads the live write-path rings). */
  snapshotRingBuffers(capacity = 300): Map<MetricKind, RingBuffer<TelemetryMetric>> {
    this.seedMetricRing();
    const map = new Map<MetricKind, RingBuffer<TelemetryMetric>>();
    (['cpu', 'memory', 'latency', 'throughput'] as const).forEach((k) =>
      map.set(k, new RingBuffer<TelemetryMetric>(capacity)),
    );
    for (const m of this.metricRing.toArray()) map.get(m.kind)?.push(m);
    return map;
  }
}
