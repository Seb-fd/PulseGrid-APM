import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../../test-helpers';
import { CoreStore } from '../../../core/store/core-store.service';
import type { TelemetryMetric } from '../../../core/models/telemetry-metric.model';
import { DashboardTopologyWidgetComponent } from './dashboard-topology-widget.component';

describe('GIVEN DashboardTopologyWidget (compact)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideExperimentalZonelessChangeDetection()] });
  });

  function create(): { cmp: DashboardTopologyWidgetComponent; el: HTMLElement } {
    const fixture = TestBed.createComponent(DashboardTopologyWidgetComponent);
    fixture.detectChanges();
    TestBed.flushEffects();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('WHEN healthy THEN all nodes render green with zero down', () => {
    const { cmp, el } = create();
    expect(cmp.downCount()).toBe(0);
    expect(el.querySelector('[data-testid="dash-topology-svg"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="dash-node-ledger"]')).not.toBeNull();
    expect(cmp.healthFill('healthy')).toBe('#10b981');
    expect(cmp.healthFill('degraded')).toBe('#f59e0b');
    expect(cmp.healthFill('down')).toBe('#ef4444');
    expect(el.querySelector('[data-testid="dash-topology-summary"]')?.textContent).toContain(
      '0 nodes down',
    );
  });

  it('WHEN a zero-throughput sample streams THEN the node turns down and edges dim', () => {
    const store = TestBed.inject(CoreStore);
    const outage: TelemetryMetric = {
      id: 'throughput:ledger:outage',
      kind: 'throughput',
      value: 0,
      unit: 'rps',
      timestamp: Date.now(),
      source: 'simulated',
      serviceId: 'ledger',
    };
    store.ingestMetrics([outage]);
    const { cmp, el } = create();
    expect(cmp.downCount()).toBeGreaterThanOrEqual(1);
    expect(cmp.edges().some((e) => e.dimmed)).toBe(true);
    expect(el.querySelector('[data-testid="dash-topology-summary"]')?.textContent).not.toContain(
      '0 nodes down',
    );
  });
});
