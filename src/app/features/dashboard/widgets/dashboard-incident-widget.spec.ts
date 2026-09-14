import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../../test-helpers';
import { CoreStore } from '../../../core/store/core-store.service';
import type { AlertRule } from '../../../core/models/alert-rule.model';
import type { TelemetryMetric } from '../../../core/models/telemetry-metric.model';
import { DashboardIncidentWidgetComponent } from './dashboard-incident-widget.component';

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

describe('GIVEN DashboardIncidentWidget (compact)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create(): { cmp: DashboardIncidentWidgetComponent; el: HTMLElement } {
    const fixture = TestBed.createComponent(DashboardIncidentWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('WHEN no incidents exist THEN the quiet empty-state renders', () => {
    const { cmp, el } = create();
    expect(cmp.incidents()).toHaveLength(0);
    expect(cmp.firingCount()).toBe(0);
    expect(el.querySelector('[data-testid="dash-incident-list"]')?.textContent).toContain('quiet');
    expect(el.querySelector('[data-testid="dash-incident-banner"]')).toBeNull();
    expect(
      el.querySelector('[data-testid="dash-incident-alert-region"]')?.getAttribute('role'),
    ).toBe('alert');
  });

  it('WHEN a rule fires THEN the banner and firing badge render', () => {
    const store = TestBed.inject(CoreStore);
    store.upsertRule(RULE);
    const t0 = 5_000_000;
    store.ingestMetrics(Array.from({ length: 11 }, (_, i) => metric(250, t0 + i * 1000)));
    store.tickAlerts(t0 + 10_000);
    const { cmp, el } = create();
    expect(cmp.firingCount()).toBe(1);
    expect(el.querySelector('[data-testid="dash-incident-banner"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="dash-incident-count"]')?.textContent).toContain(
      '1 firing',
    );
    expect(cmp.ruleName('r-lat')).toBe('High Latency');
    expect(cmp.ruleName('unknown-id')).toBe('unknown-id');
  });

  it('WHEN more than 5 incidents exist THEN the list caps at 5', () => {
    const store = TestBed.inject(CoreStore);
    store.upsertRule(RULE);
    let t0 = 8_000_000;
    for (let k = 0; k < 7; k++) {
      store.ingestMetrics(Array.from({ length: 11 }, (_, i) => metric(250, t0 + i * 1000)));
      store.tickAlerts(t0 + 10_000);
      store.ingestMetrics(Array.from({ length: 11 }, (_, i) => metric(50, t0 + 20_000 + i * 1000)));
      store.tickAlerts(t0 + 30_000);
      t0 += 60_000;
    }
    const { cmp } = create();
    expect(cmp.incidents().length).toBeLessThanOrEqual(5);
  });
});
