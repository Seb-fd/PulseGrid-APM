import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../../test-helpers';
import { CoreStore } from '../../../core/store/core-store.service';
import type { TelemetryMetric } from '../../../core/models/telemetry-metric.model';
import {
  DashboardTopologyWidgetComponent,
  worstDashboardEdgeHealth,
} from './dashboard-topology-widget.component';

describe('GIVEN DashboardTopologyWidget (compact)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create(): { cmp: DashboardTopologyWidgetComponent; el: HTMLElement } {
    const fixture = TestBed.createComponent(DashboardTopologyWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
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

  it('GIVEN endpoint health WHEN combined THEN worst wins with matching stroke', () => {
    expect(worstDashboardEdgeHealth('healthy', 'degraded')).toBe('degraded');
    expect(worstDashboardEdgeHealth('healthy', 'down')).toBe('down');
    const { cmp, el } = create();
    expect(cmp.edgeStroke('healthy')).toBe('#10b981');
    expect(cmp.edgeStroke('down')).toBe('#ef4444');
    expect(el.querySelector('[data-testid="dash-topology-legend"]')?.textContent).toContain(
      'healthy',
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

  it('GIVEN compact nodes WHEN rendered THEN each exposes role, tabindex and a name', () => {
    const { el } = create();
    const node = el.querySelector('[data-testid="dash-node-auth"]');
    expect(node?.getAttribute('role')).toBe('button');
    expect(node?.getAttribute('tabindex')).toBe('0');
    expect(node?.getAttribute('aria-label')).toContain('Auth');
  });

  it('WHEN Enter or Space hits a node THEN selection toggles without scrolling', () => {
    const fixture = TestBed.createComponent(DashboardTopologyWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    const node = el.querySelector('[data-testid="dash-node-auth"]')!;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(cmp.selectedId()).toBe('auth');
    fixture.detectChanges();
    TestBed.tick();
    expect(node.getAttribute('aria-pressed')).toBe('true');
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    node.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(cmp.selectedId()).toBeNull();
  });
});
