import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import '../../../../test-helpers';
import UPlot from 'uplot';
import { MetricChartDirective } from './metric-chart.directive';
import type { MetricUnit, TelemetryMetric } from '../../../core/models/telemetry-metric.model';

vi.mock('uplot', () => ({
  // Regular (non-arrow) implementation: invokable with `new` like the real class.
  default: vi.fn(function (this: unknown) {
    return { setData: vi.fn(), destroy: vi.fn(), setSize: vi.fn() };
  }),
}));

const MockUPlot = vi.mocked(UPlot);

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

// NOTE (zoneless harness): host state MUST be a signal. Plain-field mutation
// does not mark the view dirty, so ApplicationRef.tick() skips the update pass
// while the dev check pass still evaluates → NG0100. See src/test-helpers.ts.
@Component({
  standalone: true,
  imports: [MetricChartDirective],
  template: `<div appMetricChart [data]="rows()" [unit]="unit"></div>`,
})
class HostComponent {
  readonly rows = signal<readonly TelemetryMetric[]>([]);
  unit: MetricUnit = '%';
}

@Component({
  standalone: true,
  imports: [MetricChartDirective],
  template: `<div
    appMetricChart
    [data]="rows()"
    [unit]="unit()"
    [thresholds]="thresholds()"
    [label]="label()"
  ></div>`,
})
class ThresholdHostComponent {
  readonly rows = signal<readonly TelemetryMetric[]>([]);
  readonly unit = signal<MetricUnit>('%');
  readonly thresholds = signal<{ warn: number; crit: number; direction?: 'high' | 'low' } | null>(
    null,
  );
  readonly label = signal('CPU chart');
}

interface MockChart {
  setData: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
}

function lastChart(): MockChart {
  const results = MockUPlot.mock.results;
  const last = results[results.length - 1];
  if (last?.type !== 'return') throw new Error('uPlot was not constructed');
  return last.value as unknown as MockChart;
}

describe('GIVEN MetricChartDirective', () => {
  let nextId: number;
  let pending: Map<number, FrameRequestCallback>;
  let cancelled: Set<number>;
  let cancelSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    MockUPlot.mockClear();
    nextId = 1;
    pending = new Map();
    cancelled = new Set();
    cancelSpy = vi.fn();
    // Faithful rAF model: ids are unique, cancelled ids never fire on flush.
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const id = nextId;
      nextId += 1;
      pending.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      cancelled.add(id);
      cancelSpy(id);
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function pendingCount(): number {
    // Live (uncancelled) frames. NOTE: this counts the directive's frame AND
    // any frames Angular's own zoneless scheduler captured in the shared stub,
    // so it is used only as a smoke signal, never as a coalescing proof.
    // Coalescing is proven behaviorally: N rapid sets → ONE uPlot paint
    // carrying the LATEST batch (last-write-wins makes paint counts otherwise
    // unobservable by design).
    let n = 0;
    for (const id of pending.keys()) if (!cancelled.has(id)) n += 1;
    return n;
  }

  function flushRaf(): void {
    const entries = [...pending.entries()];
    pending.clear();
    for (const [id, cb] of entries) {
      if (!cancelled.has(id)) cb(16);
    }
  }

  function lastOptions(): unknown {
    const calls = MockUPlot.mock.calls;
    const last = calls[calls.length - 1];
    if (last?.[0] === undefined) throw new Error('uPlot was not constructed with options');
    return last[0];
  }

  it('WHEN inputs change rapidly THEN paints once with the latest batch', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    host.rows.set([metric('cpu', 10, 1), metric('cpu', 20, 2)]);
    fixture.detectChanges();
    host.rows.set([metric('cpu', 10, 1), metric('cpu', 30, 3)]);
    fixture.detectChanges();

    expect(pendingCount()).toBeGreaterThanOrEqual(1);
    flushRaf();
    expect(MockUPlot).toHaveBeenCalledTimes(1);
    expect(MockUPlot).toHaveBeenCalledWith(
      expect.anything(),
      [
        [0.001, 0.003],
        [10, 30],
      ],
      expect.anything(),
    );
    fixture.destroy();
  });

  it('WHEN chart is constructed THEN live crosshair is enabled with drag disabled', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.rows.set([metric('cpu', 10, 1000)]);
    fixture.detectChanges();
    flushRaf();
    const opts = lastOptions() as {
      cursor: { show: boolean; x: boolean; y: boolean; drag: { x: boolean; y: boolean } };
    };
    expect(opts.cursor.show).toBe(true);
    expect(opts.cursor.x).toBe(true);
    expect(opts.cursor.y).toBe(false);
    expect(opts.cursor.drag.x).toBe(false);
    expect(opts.cursor.drag.y).toBe(false);
    fixture.destroy();
  });

  it('WHEN chart is constructed THEN cursor has no sync key (hover is chart-local)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.rows.set([metric('cpu', 10, 1000)]);
    fixture.detectChanges();
    flushRaf();
    const opts = lastOptions() as { cursor: Record<string, unknown> };
    expect('sync' in opts.cursor).toBe(false);
    fixture.destroy();
  });

  it('WHEN data keeps flowing after creation THEN updates via setData', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    host.rows.set([metric('cpu', 10, 1000)]);
    fixture.detectChanges();
    flushRaf();
    expect(MockUPlot).toHaveBeenCalledTimes(1);

    host.rows.set([metric('cpu', 10, 1000), metric('cpu', 20, 2000)]);
    fixture.detectChanges();
    flushRaf();
    expect(lastChart().setData).toHaveBeenCalledTimes(1);
    expect(lastChart().setData).toHaveBeenCalledWith([
      [1, 2],
      [10, 20],
    ]);
    fixture.destroy();
    expect(lastChart().destroy).toHaveBeenCalledTimes(1);
  });

  it('WHEN destroyed with a pending frame THEN cancels rAF and never paints', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.rows.set([metric('latency', 42, 1000)]);
    fixture.detectChanges();
    fixture.destroy();
    // At least our directive cancelled its frame (Angular's own scheduler
    // shares the stubbed rAF and may cancel its own id during teardown).
    expect(cancelSpy).toHaveBeenCalled();
    flushRaf();
    expect(MockUPlot).not.toHaveBeenCalled();
  });

  it('WHEN data is empty THEN never constructs a chart', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    flushRaf();
    expect(MockUPlot).not.toHaveBeenCalled();
    const dir = fixture.debugElement
      .query(By.directive(MetricChartDirective))
      .injector.get(MetricChartDirective);
    expect(dir).toBeTruthy();
    fixture.destroy();
  });

  it('WHEN thresholds are null THEN draw hooks are empty', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.rows.set([metric('cpu', 10, 1000)]);
    fixture.detectChanges();
    flushRaf();
    const opts = lastOptions() as { hooks: { draw: unknown[] } };
    expect(opts.hooks.draw).toHaveLength(0);
    fixture.destroy();
  });

  it('WHEN thresholds provided THEN draw hook renders warn/crit and aria describes them', () => {
    const fixture = TestBed.createComponent(ThresholdHostComponent);
    const host = fixture.componentInstance;
    host.rows.set([metric('cpu', 42, 1786629822140)]);
    host.thresholds.set({ warn: 75, crit: 90, direction: 'high' });
    fixture.detectChanges();
    flushRaf();
    const opts = lastOptions() as { hooks: { draw: unknown[]; setCursor: unknown[] } };
    expect(opts.hooks.draw).toHaveLength(1);
    expect(opts.hooks.setCursor).toHaveLength(1);
    const el = fixture.nativeElement as HTMLElement;
    const labelled = el.querySelector('[role="img"]');
    expect(labelled?.getAttribute('aria-label')).toContain('warn 75%');
    expect(labelled?.getAttribute('aria-label')).toContain('crit 90%');
    fixture.destroy();
  });

  it('WHEN throughput thresholds low-is-bad THEN aria carries low-is-bad suffix', () => {
    const fixture = TestBed.createComponent(ThresholdHostComponent);
    const host = fixture.componentInstance;
    host.rows.set([metric('throughput', 820, 1000)]);
    host.unit.set('rps');
    host.thresholds.set({ warn: 500, crit: 100, direction: 'low' });
    host.label.set('Throughput chart');
    fixture.detectChanges();
    flushRaf();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('low-is-bad');
    fixture.destroy();
  });

  it('WHEN thresholds change THEN chart recreates with new options', () => {
    const fixture = TestBed.createComponent(ThresholdHostComponent);
    const host = fixture.componentInstance;
    host.rows.set([metric('cpu', 10, 1000)]);
    host.thresholds.set({ warn: 75, crit: 90 });
    fixture.detectChanges();
    flushRaf();
    expect(MockUPlot).toHaveBeenCalledTimes(1);
    const first = lastChart();
    host.rows.set([metric('cpu', 20, 2000)]);
    host.thresholds.set({ warn: 70, crit: 95 });
    fixture.detectChanges();
    flushRaf();
    expect(MockUPlot).toHaveBeenCalledTimes(2);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('WHEN cursor moves THEN tooltip shows UTC stamp plus formatted units', () => {
    const fixture = TestBed.createComponent(ThresholdHostComponent);
    const host = fixture.componentInstance;
    host.rows.set([metric('cpu', 42, 1786629822140)]);
    host.thresholds.set({ warn: 75, crit: 90 });
    fixture.detectChanges();
    flushRaf();
    const el = fixture.nativeElement as HTMLElement;
    const tip = el.querySelector<HTMLElement>('.metric-tip');
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
    const opts = lastOptions() as { hooks: { setCursor: ((u: unknown) => void)[] } };
    const fakeU = {
      cursor: { idx: 0, left: 10, top: 20 },
      data: [[1786629822.14], [42]],
    };
    opts.hooks.setCursor[0]?.(fakeU);
    expect(tip?.textContent).toContain('UTC');
    expect(tip?.textContent).toContain('42%');
    expect(tip?.style.display).toBe('block');
    fixture.destroy();
  });
});
