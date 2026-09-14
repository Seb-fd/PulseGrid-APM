import { describe, expect, it } from 'vitest';
import {
  METRIC_THRESHOLDS,
  isBreach,
  isCritBreach,
  isWarnBreach,
  resolveThresholds,
} from './metric-thresholds.model';
import type { AlertRule } from './alert-rule.model';

function rule(over: Partial<AlertRule>): AlertRule {
  return {
    id: 'r1',
    name: 'Test rule',
    metric: 'cpu',
    operator: '>',
    threshold: 80,
    durationSec: 10,
    enabled: true,
    severity: 'warning',
    createdAt: 0,
    ...over,
  };
}

describe('GIVEN metric threshold defaults', () => {
  it('THEN cpu/memory/latency are high-is-bad and throughput is low-is-bad', () => {
    expect(METRIC_THRESHOLDS.cpu).toEqual({ warn: 75, crit: 90, direction: 'high' });
    expect(METRIC_THRESHOLDS.memory).toEqual({ warn: 75, crit: 90, direction: 'high' });
    expect(METRIC_THRESHOLDS.latency).toEqual({ warn: 200, crit: 500, direction: 'high' });
    expect(METRIC_THRESHOLDS.throughput).toEqual({ warn: 500, crit: 100, direction: 'low' });
  });

  it('WHEN no rules THEN resolveThresholds returns static defaults', () => {
    expect(resolveThresholds('cpu', [])).toEqual({ warn: 75, crit: 90, direction: 'high' });
    expect(resolveThresholds('throughput', [])).toEqual({
      warn: 500,
      crit: 100,
      direction: 'low',
    });
  });
});

describe('GIVEN active alert rules', () => {
  it('WHEN warning+critical rules match THEN they override the matching slots', () => {
    const out = resolveThresholds('cpu', [
      rule({ id: 'w', severity: 'warning', threshold: 70 }),
      rule({ id: 'c', severity: 'critical', threshold: 95 }),
    ]);
    expect(out).toEqual({ warn: 70, crit: 95, direction: 'high' });
  });

  it('WHEN several candidates exist THEN most-sensitive wins (high: min, low: max)', () => {
    const high = resolveThresholds('latency', [
      rule({ id: 'w1', metric: 'latency', severity: 'warning', threshold: 180 }),
      rule({ id: 'w2', metric: 'latency', severity: 'warning', threshold: 150 }),
      rule({ id: 'c1', metric: 'latency', severity: 'critical', threshold: 600 }),
      rule({ id: 'c2', metric: 'latency', severity: 'critical', threshold: 450 }),
    ]);
    expect(high.warn).toBe(150);
    expect(high.crit).toBe(450);

    const low = resolveThresholds('throughput', [
      rule({ id: 'w1', metric: 'throughput', severity: 'warning', threshold: 600 }),
      rule({ id: 'w2', metric: 'throughput', severity: 'warning', threshold: 550 }),
      rule({ id: 'c1', metric: 'throughput', severity: 'critical', threshold: 150 }),
      rule({ id: 'c2', metric: 'throughput', severity: 'critical', threshold: 120 }),
    ]);
    expect(low.warn).toBe(600);
    expect(low.crit).toBe(150);
  });

  it('WHEN rules are disabled, info severity, or other metric THEN they are ignored', () => {
    const out = resolveThresholds('cpu', [
      rule({ id: 'd', severity: 'warning', threshold: 10, enabled: false }),
      rule({ id: 'i', severity: 'info', threshold: 10 }),
      rule({ id: 'm', metric: 'memory', severity: 'warning', threshold: 10 }),
      rule({ id: 'n', severity: 'warning', threshold: NaN }),
    ]);
    expect(out).toEqual({ warn: 75, crit: 90, direction: 'high' });
  });

  it('WHEN override breaks the invariant THEN the bad slot falls back to default', () => {
    // high: warn must be < crit. warn=95 against default crit=90 is invalid → warn falls back.
    expect(resolveThresholds('cpu', [rule({ severity: 'warning', threshold: 95 })])).toEqual({
      warn: 75,
      crit: 90,
      direction: 'high',
    });
    // low: warn must be > crit. warn=50 against default crit=100 is invalid → default survives.
    expect(
      resolveThresholds('throughput', [
        rule({ metric: 'throughput', severity: 'warning', threshold: 50 }),
      ]),
    ).toEqual({ warn: 500, crit: 100, direction: 'low' });
  });

  it('WHEN throughput warning/600 + critical/150 THEN override wins', () => {
    expect(
      resolveThresholds('throughput', [
        rule({ id: 'w', metric: 'throughput', severity: 'warning', threshold: 600 }),
        rule({ id: 'c', metric: 'throughput', severity: 'critical', threshold: 150 }),
      ]),
    ).toEqual({ warn: 600, crit: 150, direction: 'low' });
  });

  it('WHEN warn slot is salvageable but crit is not THEN keeps warn and restores crit', () => {
    // warn=80 is valid against base crit=90; crit=70 is invalid against base warn=75.
    expect(
      resolveThresholds('cpu', [
        rule({ id: 'w', severity: 'warning', threshold: 80 }),
        rule({ id: 'c', severity: 'critical', threshold: 70 }),
      ]),
    ).toEqual({ warn: 80, crit: 90, direction: 'high' });
  });

  it('WHEN both slots break beyond repair THEN falls back to full defaults', () => {
    expect(
      resolveThresholds('cpu', [
        rule({ id: 'w', severity: 'warning', threshold: 95 }),
        rule({ id: 'c', severity: 'critical', threshold: 50 }),
      ]),
    ).toEqual({ warn: 75, crit: 90, direction: 'high' });
  });
});

describe('GIVEN directional breach semantics', () => {
  it('WHEN high direction THEN breach on >= line', () => {
    const t = { warn: 75, crit: 90, direction: 'high' as const };
    expect(isWarnBreach(75, t)).toBe(true);
    expect(isWarnBreach(74.9, t)).toBe(false);
    expect(isCritBreach(90, t)).toBe(true);
    expect(isCritBreach(89, t)).toBe(false);
    expect(isBreach(80, t, 'warn')).toBe(true);
    expect(isBreach(80, t, 'crit')).toBe(false);
  });

  it('WHEN low direction THEN breach on <= line', () => {
    const t = { warn: 500, crit: 100, direction: 'low' as const };
    expect(isWarnBreach(500, t)).toBe(true);
    expect(isWarnBreach(501, t)).toBe(false);
    expect(isCritBreach(100, t)).toBe(true);
    expect(isCritBreach(101, t)).toBe(false);
    expect(isBreach(0, t, 'warn')).toBe(true);
    expect(isBreach(0, t, 'crit')).toBe(true);
    expect(isBreach(820, t, 'warn')).toBe(false);
  });
});
