import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import '../../../../test-helpers';
import { CoreStore } from '../../../core/store/core-store.service';
import type { TelemetryMetric } from '../../../core/models/telemetry-metric.model';
import { DashboardMetricWidgetComponent } from './dashboard-metric-widget.component';

vi.mock('uplot', () => ({
  default: vi.fn(function (this: unknown) {
    return { setData: vi.fn(), destroy: vi.fn(), setSize: vi.fn() };
  }),
}));

function metric(value: number, ts: number): TelemetryMetric {
  return {
    id: `cpu:${String(ts)}`,
    kind: 'cpu',
    value,
    unit: '%',
    timestamp: ts,
    source: 'simulated',
  };
}

describe('GIVEN DashboardMetricWidget (cpu)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function create(): { cmp: DashboardMetricWidgetComponent; el: HTMLElement } {
    const fixture = TestBed.createComponent(DashboardMetricWidgetComponent);
    fixture.componentRef.setInput('kind', 'cpu');
    fixture.componentRef.setInput('unit', '%');
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('WHEN the stream is empty THEN the awaiting placeholder renders', () => {
    const { cmp, el } = create();
    expect(cmp.series()).toHaveLength(0);
    expect(el.querySelector('[data-testid="chart-cpu-empty"]')?.textContent).toContain(
      'Awaiting stream',
    );
  });

  it('WHEN cpu points arrive THEN the series binds to the uPlot host', () => {
    const store = TestBed.inject(CoreStore);
    store.ingestMetrics([metric(10, 1000), metric(20, 2000)]);
    const { cmp, el } = create();
    expect(cmp.series()).toHaveLength(2);
    expect(el.querySelector('[data-testid="chart-cpu"]')).not.toBeNull();
  });

  it('GIVEN seeded cpu series WHEN rendered THEN summary shows current plus delta avg', () => {
    const store = TestBed.inject(CoreStore);
    store.ingestMetrics([metric(40, 1000), metric(40, 2000), metric(46, 3000)]);
    const { cmp, el } = create();
    expect(cmp.summaryText()).toContain('46%');
    expect(cmp.summaryText()).toContain('avg');
    expect(el.querySelector('[data-testid="summary-cpu"]')?.textContent).toContain('46%');
  });

  it('WHEN other kinds arrive THEN the cpu window stays empty', () => {
    const store = TestBed.inject(CoreStore);
    store.ingestMetrics([
      { id: 'm:1', kind: 'memory', value: 50, unit: '%', timestamp: 1000, source: 'simulated' },
    ]);
    const { cmp } = create();
    expect(cmp.series()).toHaveLength(0);
  });

  it('GIVEN seeded cpu series WHEN rendered THEN a hidden screen-reader summary reads out', () => {
    const store = TestBed.inject(CoreStore);
    store.ingestMetrics([metric(40, 1000), metric(40, 2000), metric(46, 3000)]);
    const { cmp, el } = create();
    expect(cmp.chartAlt()).toContain('Latest 46 percent');
    expect(cmp.chartAlt()).toContain('window average');
    const node = el.querySelector('[data-testid="chart-alt-cpu"]');
    expect(node?.className).toContain('sr-only');
    expect(node?.textContent).toContain('46 percent');
  });
});
