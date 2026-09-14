import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../test-helpers';
import { CoreStore } from '../../core/store/core-store.service';
import type { AlertRule } from '../../core/models/alert-rule.model';
import type { TelemetryMetric } from '../../core/models/telemetry-metric.model';
import { IncidentListComponent } from './incident-list.component';

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

function metric(value: number, ts: number): TelemetryMetric {
  return {
    id: `latency:${String(ts)}`,
    kind: 'latency',
    value,
    unit: 'ms',
    timestamp: ts,
    source: 'simulated',
  };
}

describe('GIVEN IncidentList feed', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create(): { cmp: IncidentListComponent; el: HTMLElement } {
    const fixture = TestBed.createComponent(IncidentListComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('WHEN no incidents exist THEN the quiet empty-state renders', () => {
    const { cmp, el } = create();
    expect(cmp.incidents()).toHaveLength(0);
    expect(el.querySelector('[data-testid="incident-list"]')?.textContent).toContain('quiet');
  });

  it('GIVEN silence WHEN rendered THEN the alert region persists without a banner', () => {
    const { el } = create();
    expect(el.querySelector('[data-testid="incident-alert-region"]')?.getAttribute('role')).toBe(
      'alert',
    );
    expect(el.querySelector('[data-testid="incident-banner"]')).toBeNull();
  });

  it('WHEN a rule fires THEN the incident shows firing with observedValue ≥ threshold', () => {
    const store = TestBed.inject(CoreStore);
    store.upsertRule(RULE);
    const t0 = 5_000_000;
    store.ingestMetrics(Array.from({ length: 11 }, (_, i) => metric(250, t0 + i * 1000)));
    store.tickAlerts(t0 + 10_000);
    const { cmp, el } = create();
    expect(cmp.firingCount()).toBe(1);
    expect(cmp.incidents()[0]?.status).toBe('firing');
    expect(cmp.incidents()[0]?.observedValue).toBeGreaterThanOrEqual(200);
    expect(el.querySelector('[data-testid="incident-banner"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="incident-count"]')?.textContent).toContain('1 firing');
  });

  it('WHEN the metric recovers THEN the incident transitions to resolved', () => {
    const store = TestBed.inject(CoreStore);
    store.upsertRule(RULE);
    const t0 = 6_000_000;
    store.ingestMetrics(Array.from({ length: 11 }, (_, i) => metric(250, t0 + i * 1000)));
    store.tickAlerts(t0 + 10_000);
    store.ingestMetrics(Array.from({ length: 11 }, (_, i) => metric(50, t0 + 20_000 + i * 1000)));
    store.tickAlerts(t0 + 30_000);
    const { cmp } = create();
    expect(cmp.firingCount()).toBe(0);
    expect(cmp.incidents()[0]?.status).toBe('resolved');
  });

  it('WHEN rule names resolve THEN rows display names instead of raw ids', () => {
    const store = TestBed.inject(CoreStore);
    store.upsertRule(RULE);
    const t0 = 7_000_000;
    store.ingestMetrics(Array.from({ length: 11 }, (_, i) => metric(250, t0 + i * 1000)));
    store.tickAlerts(t0 + 10_000);
    const { cmp } = create();
    expect(cmp.ruleName('r-lat')).toBe('High Latency');
    expect(cmp.ruleName('unknown-id')).toBe('unknown-id');
  });
});
