import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Subject, of } from 'rxjs';
import type { AlertIncident, AlertRule, ConnectionStatus } from '../models/alert-rule.model';
import type { LogEntry, LogLevel } from '../models/log-entry.model';
import type { TelemetryMetric } from '../models/telemetry-metric.model';
import {
  CoreStore,
  MAX_INCIDENTS,
  MAX_LOGS,
  MAX_METRICS,
  OUTAGE_WINDOW_MS,
} from './core-store.service';

function metric(
  over: Partial<TelemetryMetric> & { kind: TelemetryMetric['kind'] },
): TelemetryMetric {
  const kind = over.kind;
  return {
    id: `${kind}:${String(over.timestamp ?? 1)}`,
    value: 1,
    unit: kind === 'latency' ? 'ms' : kind === 'throughput' ? 'rps' : '%',
    timestamp: 1,
    source: 'simulated',
    ...over,
  };
}

const latencyRule: AlertRule = {
  id: 'r-lat',
  name: 'High Latency',
  metric: 'latency',
  operator: '>',
  threshold: 200,
  durationSec: 10,
  enabled: true,
  severity: 'critical',
  createdAt: 0,
};

describe('GIVEN CoreStore', () => {
  it('WHEN ingesting THEN caps metrics and logs (no leaks)', () => {
    const store = new CoreStore();
    store.ingestMetrics(
      Array.from({ length: MAX_METRICS + 100 }, (_, i) =>
        metric({ kind: 'cpu', value: i, timestamp: i }),
      ),
    );
    expect(store.metrics().length).toBe(MAX_METRICS);
    store.appendLogs(
      Array.from({ length: MAX_LOGS + 10 }, (_, i) => ({
        id: String(i),
        level: 'INFO' as const,
        message: 'm',
        timestamp: i,
        serviceId: 's',
      })),
    );
    expect(store.logs().length).toBe(MAX_LOGS);
  });

  it('WHEN binding ingestion observable THEN metrics flow without direct subscribe in components', () => {
    const store = new CoreStore();
    const batch = [metric({ kind: 'cpu', value: 42, timestamp: 9 })];
    const unbind = store.bindIngestion(of(batch));
    expect(store.metrics()).toHaveLength(1);
    unbind();
  });

  it('WHEN selecting windows THEN returns newest N oldest-first', () => {
    const store = new CoreStore();
    store.ingestMetrics(
      [1, 2, 3, 4].map((v) => metric({ kind: 'latency', value: v, timestamp: v })),
    );
    expect(
      store
        .selectWindow('latency', 2)()
        .map((m) => m.value),
    ).toEqual([3, 4]);
  });

  it('WHEN filtering logs THEN computed reacts to filter signal', () => {
    const store = new CoreStore();
    store.appendLogs([
      { id: '1', level: 'INFO', message: 'ok', timestamp: 1, serviceId: 'a' },
      {
        id: '2',
        level: 'ERROR',
        message: 'boom payments',
        timestamp: 2,
        serviceId: 'payments-api',
      },
    ]);
    const f = signal({ query: 'payments', levels: new Set<LogLevel>(), serviceId: 'all' });
    expect(store.selectFilteredLogs(f)()).toHaveLength(1);
    f.set({ query: '', levels: new Set(['ERROR']), serviceId: 'all' });
    expect(store.selectFilteredLogs(f)()).toHaveLength(1);
  });

  it('WHEN outage set THEN node health turns down', () => {
    const store = new CoreStore();
    store.refreshNodeHealth(new Set(['ledger']));
    expect(store.nodes().find((n) => n.id === 'ledger')?.health).toBe('down');
  });

  it('WHEN latency breaches THEN healthNodes derives degraded without manual refresh', () => {
    const store = new CoreStore();
    expect(store.healthNodes().find((n) => n.id === 'payments-api')?.health).toBe('healthy');
    const t0 = 1_000_000;
    store.ingestMetrics(
      Array.from({ length: 20 }, (_, i) =>
        metric({ kind: 'latency', value: 250, timestamp: t0 + i, serviceId: 'payments-api' }),
      ),
    );
    expect(store.healthNodes().find((n) => n.id === 'payments-api')?.health).toBe('degraded');
  });

  it('WHEN recent zero-throughput arrives THEN outageIds marks the service down', () => {
    const store = new CoreStore();
    const now = Date.now();
    store.ingestMetrics([
      metric({ kind: 'throughput', value: 0, timestamp: now, serviceId: 'ledger' }),
    ]);
    expect(store.outageIds().has('ledger')).toBe(true);
    expect(store.healthNodes().find((n) => n.id === 'ledger')?.health).toBe('down');
  });

  it('WHEN sustained breach THEN fires once; WHEN transient THEN no fire; WHEN recovered THEN resolves', () => {
    const store = new CoreStore();
    store.upsertRule(latencyRule);
    const t0 = 1_000_000;
    // Sustained: 11 samples over 10s window, all >200.
    store.ingestMetrics(
      Array.from({ length: 11 }, (_, i) =>
        metric({ kind: 'latency', value: 250, timestamp: t0 + i * 1000 }),
      ),
    );
    store.tickAlerts(t0 + 10_000);
    expect(store.activeAlerts()).toHaveLength(1);
    // Second tick while still breached → still exactly one.
    store.tickAlerts(t0 + 11_000);
    expect(store.activeAlerts()).toHaveLength(1);
    // Recovery: fresh store with transient spike only.
    const s2 = new CoreStore();
    s2.upsertRule(latencyRule);
    s2.ingestMetrics([
      metric({ kind: 'latency', value: 300, timestamp: t0 }),
      metric({ kind: 'latency', value: 50, timestamp: t0 + 1000 }),
      metric({ kind: 'latency', value: 60, timestamp: t0 + 2000 }),
    ]);
    s2.tickAlerts(t0 + 10_000);
    expect(s2.activeAlerts()).toHaveLength(0);
    // Resolve: breach then recovery.
    const s3 = new CoreStore();
    s3.upsertRule(latencyRule);
    s3.ingestMetrics(
      Array.from({ length: 11 }, (_, i) =>
        metric({ kind: 'latency', value: 250, timestamp: t0 + i * 1000 }),
      ),
    );
    s3.tickAlerts(t0 + 10_000);
    expect(s3.activeAlerts()).toHaveLength(1);
    s3.ingestMetrics(
      Array.from({ length: 11 }, (_, i) =>
        metric({ kind: 'latency', value: 50, timestamp: t0 + 20_000 + i * 1000 }),
      ),
    );
    s3.tickAlerts(t0 + 30_000);
    expect(s3.activeAlerts()).toHaveLength(0);
    expect(s3.incidents()[0]?.status).toBe('resolved');
  });
});

describe('GIVEN CoreStore log bridge (delta 002)', () => {
  function log(id: string): LogEntry {
    return { id, level: 'INFO', message: 'm', timestamp: 1, serviceId: 's' };
  }

  it('WHEN logs bound THEN entries flow; WHEN unbound THEN stream detaches', () => {
    const store = new CoreStore();
    const src = new Subject<readonly LogEntry[]>();
    const unbind = store.bindLogs(src);
    src.next([log('1')]);
    expect(store.logs()).toHaveLength(1);
    unbind();
    src.next([log('2')]);
    expect(store.logs()).toHaveLength(1);
  });

  it('WHEN store unbinds THEN both metrics and log streams detach', () => {
    const store = new CoreStore();
    const metricsSrc = new Subject<TelemetryMetric[]>();
    const logsSrc = new Subject<readonly LogEntry[]>();
    store.bindIngestion(metricsSrc);
    store.bindLogs(logsSrc);
    store.unbind();
    metricsSrc.next([metric({ kind: 'cpu', value: 1, timestamp: 1 })]);
    logsSrc.next([log('1')]);
    expect(store.metrics()).toHaveLength(0);
    expect(store.logs()).toHaveLength(0);
  });

  it('WHEN binding with status THEN store takes the value once', () => {
    const store = new CoreStore();
    const unbind = store.bindIngestion(of([]), signal<ConnectionStatus>('live'));
    expect(store.connectionStatus()).toBe('live');
    unbind();
  });
});

describe('GIVEN CoreStore bounded rings (delta 002)', () => {
  it('WHEN metrics overflow THEN oldest drop and order stays oldest-first', () => {
    const store = new CoreStore();
    store.ingestMetrics(
      Array.from({ length: MAX_METRICS + 100 }, (_, i) =>
        metric({ kind: 'cpu', value: i, timestamp: i }),
      ),
    );
    const all = store.metrics();
    expect(all).toHaveLength(MAX_METRICS);
    expect(all[0]?.timestamp).toBe(100);
    expect(all[MAX_METRICS - 1]?.timestamp).toBe(MAX_METRICS + 99);
  });

  it('WHEN logs overflow THEN oldest drop oldest-first', () => {
    const store = new CoreStore();
    store.appendLogs(
      Array.from({ length: MAX_LOGS + 10 }, (_, i) => ({
        id: String(i),
        level: 'INFO' as const,
        message: 'm',
        timestamp: i,
        serviceId: 's',
      })),
    );
    const all = store.logs();
    expect(all).toHaveLength(MAX_LOGS);
    expect(all[0]?.id).toBe('10');
  });

  it('WHEN 201 rules breach THEN incidents cap keeps newest firing in order', () => {
    const store = new CoreStore();
    const t0 = 2_000_000;
    for (let i = 0; i < MAX_INCIDENTS + 1; i++) {
      store.upsertRule({ ...latencyRule, id: `r-${String(i)}`, name: `Rule ${String(i)}` });
    }
    store.ingestMetrics(
      Array.from({ length: 11 }, (_, i) =>
        metric({ kind: 'latency', value: 250, timestamp: t0 + i * 1000 }),
      ),
    );
    store.tickAlerts(t0 + 10_000);
    const all = store.incidents();
    expect(all).toHaveLength(MAX_INCIDENTS);
    expect(all.some((x) => x.ruleId === 'r-0')).toBe(false);
    expect(all[0]?.ruleId).toBe('r-1');
    expect(all.some((x) => x.ruleId === `r-${String(MAX_INCIDENTS)}`)).toBe(true);
    expect(store.activeAlertsCount()).toBe(MAX_INCIDENTS);
  });

  it('WHEN incidents overflow with resolved history THEN resolved drop before firing', () => {
    const store = new CoreStore();
    const seed: AlertIncident[] = [
      { id: 'old-resolved', ruleId: 'r-old', triggeredAt: 1, status: 'resolved', observedValue: 1 },
    ];
    for (let i = 0; i < MAX_INCIDENTS - 1; i++) {
      seed.push({
        id: `f-${String(i)}`,
        ruleId: `rf-${String(i)}`,
        triggeredAt: 2 + i,
        status: 'firing',
        observedValue: 250,
      });
    }
    store.incidents.set(seed);
    store.upsertRule(latencyRule);
    const t0 = 3_000_000;
    store.ingestMetrics(
      Array.from({ length: 11 }, (_, i) =>
        metric({ kind: 'latency', value: 250, timestamp: t0 + i * 1000 }),
      ),
    );
    store.tickAlerts(t0 + 10_000);
    expect(store.incidents()).toHaveLength(MAX_INCIDENTS);
    expect(store.incidents().some((x) => x.id === 'old-resolved')).toBe(false);
    expect(store.incidents().some((x) => x.ruleId === 'r-lat')).toBe(true);
  });

  it('WHEN committing a full 1200 window THEN ingest stays within budget', () => {
    const store = new CoreStore();
    const batch = Array.from({ length: MAX_METRICS }, (_, i) =>
      metric({ kind: 'cpu', value: i, timestamp: i }),
    );
    const t0 = performance.now();
    store.ingestMetrics(batch);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(store.metrics()).toHaveLength(MAX_METRICS);
  });
});

describe('GIVEN CoreStore memoized selectors (delta 002)', () => {
  it('WHEN selectWindow repeats THEN identical Signal instance returns', () => {
    const store = new CoreStore();
    expect(store.selectWindow('cpu', 100)).toBe(store.selectWindow('cpu', 100));
    expect(store.selectWindow('cpu', 100)).not.toBe(store.selectWindow('cpu', 300));
    expect(store.selectWindow('cpu', 100)).not.toBe(store.selectWindow('memory', 100));
    expect(store.selectWindow('cpu', 100, 'ledger')).toBe(store.selectWindow('cpu', 100, 'ledger'));
  });

  it('WHEN cpu-only batch arrives THEN healthNodes reference is untouched', () => {
    const store = new CoreStore();
    const before = store.healthNodes();
    store.ingestMetrics([metric({ kind: 'cpu', value: 50, timestamp: 100 })]);
    expect(store.metrics()).toHaveLength(1);
    expect(store.healthNodes()).toBe(before);
  });

  it('WHEN latency batch arrives THEN healthNodes refreshes synchronously', () => {
    const store = new CoreStore();
    const before = store.healthNodes();
    store.ingestMetrics([metric({ kind: 'latency', value: 250, timestamp: 100, serviceId: 'x' })]);
    expect(store.healthNodes()).not.toBe(before);
  });

  it('WHEN outage marker ages out THEN bumpHealthTick expires it without commits', () => {
    const store = new CoreStore();
    const now = Date.now();
    store.ingestMetrics([
      metric({ kind: 'throughput', value: 0, timestamp: now, serviceId: 'ledger' }),
    ]);
    expect(store.outageIds().has('ledger')).toBe(true);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now + OUTAGE_WINDOW_MS + 1000);
    try {
      store.bumpHealthTick();
      expect(store.outageIds().has('ledger')).toBe(false);
      expect(store.healthNodes().find((n) => n.id === 'ledger')?.health).not.toBe('down');
    } finally {
      nowSpy.mockRestore();
    }
  });
});
