import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../test-helpers';
import { CoreStore } from '../../core/store/core-store.service';
import type { LogEntry } from '../../core/models/log-entry.model';
import type { TelemetryMetric } from '../../core/models/telemetry-metric.model';
import { TopologyMapComponent, worstEdgeHealth } from './topology-map.component';

function latency(serviceId: string, value: number, ts: number): TelemetryMetric {
  return {
    id: `latency:${serviceId}:${String(ts)}`,
    kind: 'latency',
    value,
    unit: 'ms',
    timestamp: ts,
    source: 'simulated',
    serviceId,
  };
}

function outage(serviceId: string, ts: number): TelemetryMetric {
  return {
    id: `throughput:${serviceId}:${String(ts)}`,
    kind: 'throughput',
    value: 0,
    unit: 'rps',
    timestamp: ts,
    source: 'simulated',
    serviceId,
  };
}

function log(i: number, serviceId: string): LogEntry {
  return {
    id: `log-${String(i)}`,
    level: 'ERROR',
    message: `boom ${String(i)}`,
    timestamp: i,
    serviceId,
  };
}

describe('GIVEN TopologyMap with CoreStore stream', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create(): TopologyMapComponent {
    const fixture = TestBed.createComponent(TopologyMapComponent);
    fixture.detectChanges();
    TestBed.tick();
    return fixture.componentInstance;
  }

  it('WHEN payments-api latency exceeds 200ms THEN its computed health turns degraded with no manual refresh', () => {
    const store = TestBed.inject(CoreStore);
    const t0 = 1_000_000;
    store.ingestMetrics(
      Array.from({ length: 20 }, (_, i) => latency('payments-api', 250, t0 + i * 100)),
    );
    const cmp = create();
    TestBed.tick();
    expect(cmp.nodes().find((n) => n.id === 'payments-api')?.health).toBe('degraded');
    expect(cmp.healthFill('degraded')).toBe('#f59e0b');
  });

  it('WHEN a recent zero-throughput sample marks ledger THEN ledger is down AND its edges dim', () => {
    const store = TestBed.inject(CoreStore);
    const now = Date.now();
    store.ingestMetrics([outage('ledger', now), latency('ledger', 2000, now)]);
    const cmp = create();
    TestBed.tick();
    expect(store.outageIds().has('ledger')).toBe(true);
    expect(cmp.nodes().find((n) => n.id === 'ledger')?.health).toBe('down');
    expect(cmp.healthFill('down')).toBe('#ef4444');
    const dimmed = cmp.edges().filter((e) => e.to.id === 'ledger' || e.from.id === 'ledger');
    expect(dimmed.length).toBeGreaterThan(0);
    expect(dimmed.every((e) => e.dimmed)).toBe(true);
  });

  it('WHEN user clicks auth THEN detail selection shows auth metrics and its filtered logs', () => {
    const store = TestBed.inject(CoreStore);
    store.appendLogs([log(1, 'auth'), log(2, 'auth'), log(3, 'ledger')]);
    const cmp = create();
    expect(cmp.selectedNode()).toBeUndefined();
    cmp.select('auth');
    TestBed.tick();
    expect(cmp.selectedNode()?.id).toBe('auth');
    expect(cmp.selectedLogs()).toHaveLength(2);
    expect(cmp.depLabel(cmp.selectedNode() ?? ({ dependencies: [] } as never))).toContain(
      'postgres',
    );
    cmp.clearSelection();
    expect(cmp.selectedNode()).toBeUndefined();
  });

  it('WHEN nodes render below fold THEN a viewport placeholder guards the deferred bundle', () => {
    const fixture = TestBed.createComponent(TopologyMapComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // jsdom never fires IntersectionObserver → @defer stays on its placeholder by design.
    expect(el.querySelector('[data-testid="topology-placeholder"]')).not.toBeNull();
  });

  it('GIVEN endpoint health WHEN combined THEN worst wins and stroke follows tone', () => {
    expect(worstEdgeHealth('healthy', 'healthy')).toBe('healthy');
    expect(worstEdgeHealth('healthy', 'degraded')).toBe('degraded');
    expect(worstEdgeHealth('degraded', 'down')).toBe('down');
    const store = TestBed.inject(CoreStore);
    const now = Date.now();
    store.ingestMetrics([outage('ledger', now)]);
    const cmp = create();
    TestBed.tick();
    const edge = cmp.edges().find((e) => e.to.id === 'ledger' || e.from.id === 'ledger');
    expect(edge?.health).toBe('down');
    expect(cmp.edgeStroke('healthy')).toBe('#10b981');
    expect(cmp.edgeStroke('degraded')).toBe('#f59e0b');
    expect(cmp.edgeStroke('down')).toBe('#ef4444');
    expect(cmp.edgeMarker('down')).toContain('arrow-err');
  });

  it('WHEN healthy THEN fill is green', () => {
    const cmp = create();
    expect(cmp.healthFill('healthy')).toBe('#10b981');
  });
});
