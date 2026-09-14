import { describe, expect, it } from 'vitest';
import { matchesLogFilter, type LogEntry } from '../models/log-entry.model';
import { deriveHealth } from '../models/service-node.model';
import { evaluateRule, validateRuleDraft, type AlertRule } from '../models/alert-rule.model';
import { isTelemetryMetric } from '../models/telemetry-metric.model';

const entry = (over: Partial<LogEntry>): LogEntry => ({
  id: 'x',
  level: 'INFO',
  message: 'hello payments-api',
  timestamp: 1,
  serviceId: 'payments-api',
  ...over,
});

describe('LogFilter (computed() semantics)', () => {
  it('matches by level set', () => {
    expect(
      matchesLogFilter(entry({ level: 'ERROR' }), {
        query: '',
        levels: new Set(['ERROR']),
        serviceId: 'all',
      }),
    ).toBe(true);
    expect(
      matchesLogFilter(entry({ level: 'INFO' }), {
        query: '',
        levels: new Set(['ERROR']),
        serviceId: 'all',
      }),
    ).toBe(false);
  });

  it('matches by service and case-insensitive query', () => {
    expect(
      matchesLogFilter(entry({}), { query: 'PAYMENTS', levels: new Set(), serviceId: 'all' }),
    ).toBe(true);
    expect(
      matchesLogFilter(entry({}), { query: 'ledger', levels: new Set(), serviceId: 'all' }),
    ).toBe(false);
    expect(
      matchesLogFilter(entry({ serviceId: 'ledger' }), {
        query: '',
        levels: new Set(),
        serviceId: 'ledger',
      }),
    ).toBe(true);
  });

  it('matches traceId', () => {
    expect(
      matchesLogFilter(entry({ traceId: 'abc-123' }), {
        query: 'ABC',
        levels: new Set(),
        serviceId: 'all',
      }),
    ).toBe(true);
  });
});

describe('deriveHealth', () => {
  it('down wins over degraded', () => {
    expect(deriveHealth({ outageActive: true, p95LatencyMs: 500, errorRate: 1 })).toBe('down');
  });
  it('degraded on latency or errors', () => {
    expect(deriveHealth({ outageActive: false, p95LatencyMs: 250, errorRate: 0 })).toBe('degraded');
    expect(deriveHealth({ outageActive: false, p95LatencyMs: 50, errorRate: 0.1 })).toBe(
      'degraded',
    );
  });
  it('healthy otherwise', () => {
    expect(deriveHealth({ outageActive: false, p95LatencyMs: 50, errorRate: 0.01 })).toBe(
      'healthy',
    );
    expect(deriveHealth({ outageActive: false, p95LatencyMs: null, errorRate: null })).toBe(
      'healthy',
    );
  });
});

describe('evaluateRule (sustained breach)', () => {
  const rule: AlertRule = {
    id: 'r1',
    name: 'High Latency',
    metric: 'latency',
    operator: '>',
    threshold: 200,
    durationSec: 10,
    enabled: true,
    severity: 'critical',
    createdAt: 0,
  };
  it('fires only when EVERY sample breaches', () => {
    expect(evaluateRule([250, 260, 300], rule)).toBe(true);
    expect(evaluateRule([250, 150, 300], rule)).toBe(false);
  });
  it('never fires on empty window or transient spike', () => {
    expect(evaluateRule([], rule)).toBe(false);
    expect(evaluateRule([300], { ...rule, durationSec: 10 })).toBe(true); // single sustained sample counts
  });
});

describe('validateRuleDraft', () => {
  it('rejects short names, bad thresholds, bad durations', () => {
    const base = {
      name: 'High Latency',
      metric: 'latency' as const,
      operator: '>' as const,
      threshold: 200,
      durationSec: 10,
      enabled: true,
      severity: 'critical' as const,
    };
    expect(validateRuleDraft({ ...base, name: 'ab' }).length).toBeGreaterThan(0);
    expect(validateRuleDraft({ ...base, threshold: NaN }).length).toBeGreaterThan(0);
    expect(validateRuleDraft({ ...base, metric: 'cpu', threshold: 150 }).length).toBeGreaterThan(0);
    expect(validateRuleDraft({ ...base, durationSec: 3 }).length).toBeGreaterThan(0);
    expect(validateRuleDraft(base)).toEqual([]);
  });
});

describe('GIVEN isTelemetryMetric type guard', () => {
  const good = (over: Record<string, unknown> = {}): unknown => ({
    id: 'cpu:global:1:0',
    kind: 'cpu',
    value: 14,
    unit: '%',
    timestamp: 1_700_000_000_000,
    source: 'live',
    ...over,
  });

  it('WHEN a well-formed point THEN accepts live and simulated sources', () => {
    expect(isTelemetryMetric(good())).toBe(true);
    expect(isTelemetryMetric(good({ source: 'simulated' }))).toBe(true);
  });

  it('WHEN not an object THEN rejects', () => {
    expect(isTelemetryMetric(null)).toBe(false);
    expect(isTelemetryMetric(undefined)).toBe(false);
    expect(isTelemetryMetric('cpu')).toBe(false);
    expect(isTelemetryMetric(42)).toBe(false);
  });

  it('WHEN shape fields are wrong THEN rejects', () => {
    expect(isTelemetryMetric(good({ id: 7 }))).toBe(false);
    expect(isTelemetryMetric(good({ kind: 'disk' }))).toBe(false);
    expect(isTelemetryMetric(good({ value: 'high' }))).toBe(false);
    expect(isTelemetryMetric(good({ value: NaN }))).toBe(false);
    expect(isTelemetryMetric(good({ value: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(isTelemetryMetric(good({ timestamp: 'now' }))).toBe(false);
    expect(isTelemetryMetric(good({ source: 'reconnecting' }))).toBe(false);
  });
});
