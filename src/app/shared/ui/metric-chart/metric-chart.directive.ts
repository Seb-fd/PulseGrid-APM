import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import uPlot from 'uplot';
import type { MetricUnit, TelemetryMetric } from '../../../core/models/telemetry-metric.model';

const UNIT_LABEL: Record<MetricUnit, string> = { '%': '%', ms: 'ms', rps: 'rps' };

function darkOptions(unit: MetricUnit, width: number, height: number): uPlot.Options {
  return {
    width: Math.max(width, 120),
    height,
    scales: { x: { time: false } },
    series: [
      {},
      {
        label: `value (${UNIT_LABEL[unit]})`,
        stroke: '#22d3ee',
        width: 1.5,
        fill: 'rgba(34, 211, 238, 0.08)',
      },
    ],
    axes: [
      {
        stroke: '#64748b',
        grid: { stroke: 'rgba(148, 163, 184, 0.12)', width: 1 },
        ticks: { stroke: 'rgba(148, 163, 184, 0.25)', width: 1 },
        font: '11px "JetBrains Mono", ui-monospace, monospace',
        values: (_u, vals) => vals.map((v) => new Date(v * 1000).toISOString().slice(11, 19)),
      },
      {
        stroke: '#64748b',
        grid: { stroke: 'rgba(148, 163, 184, 0.12)', width: 1 },
        font: '11px "JetBrains Mono", ui-monospace, monospace',
      },
    ],
    cursor: {
      show: true,
      x: true,
      y: false,
      drag: { x: false, y: false },
      points: { show: false },
      focus: { prox: 8 },
      lock: false,
      sync: { key: 'pulsegrid' },
    },
    legend: { show: false },
  };
}

/**
 * Canvas chart directive (uPlot) — the ONLY imperative paint loop in the app.
 * Signal inputs are coalesced into one uPlot update per animation frame,
 * entirely outside Angular change detection.
 * Shared ownership (delta 004): imported by telemetry + dashboard widgets.
 * Delta 005: live crosshair enabled (x-axis vertical line, no drag/zoom).
 */
@Directive({ selector: '[appMetricChart]', standalone: true })
export class MetricChartDirective implements OnDestroy {
  /** Oldest→newest window (from `CoreStore.selectWindow`). */
  readonly data = input.required<readonly TelemetryMetric[]>();
  readonly unit = input<MetricUnit>('ms');
  readonly height = input<number>(200);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private chart: uPlot | null = null;
  private pending: readonly TelemetryMetric[] | null = null;
  private raf = 0;
  private observer: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.pending = this.data();
      // Touch unit/height so option changes repaint too.
      void this.unit();
      void this.height();
      this.schedule();
    });
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => {
        const w = this.el.nativeElement.clientWidth;
        if (this.chart && w > 0) this.chart.setSize({ width: w, height: this.height() });
      });
      this.observer.observe(this.el.nativeElement);
    }
  }

  private schedule(): void {
    if (this.raf) return;
    const run = (): void => {
      this.paint();
    };
    this.raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(run)
        : (setTimeout(run, 16) as unknown as number);
  }

  private paint(): void {
    this.raf = 0;
    const batch = this.pending;
    this.pending = null;
    if (batch === null || batch.length === 0) return;
    const xs = batch.map((m) => m.timestamp / 1000);
    const ys = batch.map((m) => m.value);
    if (this.chart === null) {
      const measured = this.el.nativeElement.clientWidth;
      const width = measured > 0 ? measured : 600;
      this.chart = new uPlot(
        darkOptions(this.unit(), width, this.height()),
        [xs, ys],
        this.el.nativeElement,
      );
    } else {
      this.chart.setData([xs, ys]);
    }
  }

  ngOnDestroy(): void {
    if (this.raf) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
      else clearTimeout(this.raf);
      this.raf = 0;
    }
    this.observer?.disconnect();
    this.observer = null;
    this.chart?.destroy();
    this.chart = null;
  }
}
