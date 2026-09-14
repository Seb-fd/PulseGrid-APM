import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import '../../../test-helpers';
import { CoreStore } from './core-store.service';
import { ALERT_RULES_KEY, AlertEngineService } from './alert-engine.service';
import type { AlertRule } from '../models/alert-rule.model';
import type { TelemetryMetric } from '../models/telemetry-metric.model';

function metric(kind: TelemetryMetric['kind'], value: number, ts: number): TelemetryMetric {
  return {
    id: `${kind}:${String(ts)}`,
    kind,
    value,
    unit: kind === 'latency' ? 'ms' : kind === 'throughput' ? 'rps' : '%',
    timestamp: ts,
    source: 'simulated',
  };
}

const RULE: AlertRule = {
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

describe('GIVEN AlertEngineService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    TestBed.inject(AlertEngineService).stop();
    localStorage.clear();
  });

  it('WHEN tick sees a sustained breach THEN a firing incident appears within the window', () => {
    const store = TestBed.inject(CoreStore);
    const engine = TestBed.inject(AlertEngineService);
    store.upsertRule(RULE);
    const t0 = 1_000_000;
    store.ingestMetrics(
      Array.from({ length: 11 }, (_, i) => metric('latency', 250, t0 + i * 1000)),
    );
    engine.tick(t0 + 10_000);
    expect(store.activeAlerts()).toHaveLength(1);
    expect(store.activeAlerts()[0]?.observedValue).toBeGreaterThanOrEqual(200);
  });

  it('WHEN tick sees only a transient spike THEN no incident is created', () => {
    const store = TestBed.inject(CoreStore);
    const engine = TestBed.inject(AlertEngineService);
    store.upsertRule(RULE);
    const t0 = 2_000_000;
    store.ingestMetrics([
      metric('latency', 300, t0),
      metric('latency', 50, t0 + 1000),
      metric('latency', 60, t0 + 2000),
    ]);
    engine.tick(t0 + 10_000);
    expect(store.activeAlerts()).toHaveLength(0);
  });

  it('WHEN metric recovers THEN the firing incident resolves with resolvedAt', () => {
    const store = TestBed.inject(CoreStore);
    const engine = TestBed.inject(AlertEngineService);
    store.upsertRule(RULE);
    const t0 = 3_000_000;
    store.ingestMetrics(
      Array.from({ length: 11 }, (_, i) => metric('latency', 250, t0 + i * 1000)),
    );
    engine.tick(t0 + 10_000);
    expect(store.activeAlerts()).toHaveLength(1);
    store.ingestMetrics(
      Array.from({ length: 11 }, (_, i) => metric('latency', 50, t0 + 20_000 + i * 1000)),
    );
    engine.tick(t0 + 30_000);
    expect(store.activeAlerts()).toHaveLength(0);
    expect(store.incidents()[0]?.status).toBe('resolved');
    expect(store.incidents()[0]?.resolvedAt).toBe(t0 + 30_000);
  });

  it('WHEN start/stop cycle THEN running flips once and double-start is idempotent', () => {
    const engine = TestBed.inject(AlertEngineService);
    expect(engine.running()).toBe(false);
    engine.start();
    expect(engine.running()).toBe(true);
    engine.start();
    expect(engine.running()).toBe(true);
    engine.stop();
    expect(engine.running()).toBe(false);
    engine.stop();
    expect(engine.running()).toBe(false);
  });

  it('WHEN rules change THEN syncRules persists them to localStorage', () => {
    const store = TestBed.inject(CoreStore);
    const engine = TestBed.inject(AlertEngineService);
    store.upsertRule(RULE);
    engine.syncRules();
    const raw = localStorage.getItem(ALERT_RULES_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '[]') as unknown).toHaveLength(1);
  });

  it('WHEN storage holds corrupt rules THEN load skips them without throwing', () => {
    localStorage.setItem(ALERT_RULES_KEY, JSON.stringify([{ id: 'bad' }]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(CoreStore);
    TestBed.inject(AlertEngineService);
    TestBed.tick();
    expect(store.rules()).toHaveLength(0);
  });
});
