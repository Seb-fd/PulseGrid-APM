import { Directive, ElementRef, OnDestroy, computed, effect, inject, input } from '@angular/core';
import uPlot from 'uplot';
import type { ThresholdDirection } from '../../../core/models/metric-thresholds.model';
import type { MetricUnit, TelemetryMetric } from '../../../core/models/telemetry-metric.model';
import {
  formatAxisTick,
  formatTooltipTimestamp,
  formatValue,
} from '../../../core/utils/format-metric';

const UNIT_LABEL: Record<MetricUnit, string> = { '%': '%', ms: 'ms', rps: 'rps' };

export interface ThresholdLines {
  warn: number;
  crit: number;
  direction?: ThresholdDirection;
}

function drawThresholdLine(u: uPlot, value: number, color: string): void {
  const y = Math.round(u.valToPos(value, 'y', true));
  const { left, width } = u.bbox;
  const ctx = u.ctx;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(left + width, y);
  ctx.stroke();
  ctx.restore();
}

function darkOptions(
  unit: MetricUnit,
  width: number,
  height: number,
  thresholds: ThresholdLines | null,
  onCursor: (u: uPlot) => void,
): uPlot.Options {
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
    hooks: {
      draw:
        thresholds === null
          ? []
          : [
              (u: uPlot): void => {
                drawThresholdLine(u, thresholds.warn, '#f59e0b');
                drawThresholdLine(u, thresholds.crit, '#ef4444');
              },
            ],
      setCursor: [
        (u: uPlot): void => {
          onCursor(u);
        },
      ],
    },
    axes: [
      {
        // Delta 003: axis-label grey lightened for 4.5:1 text contrast on #030712.
        stroke: '#94a3b8',
        grid: { stroke: 'rgba(148, 163, 184, 0.12)', width: 1 },
        ticks: { stroke: 'rgba(148, 163, 184, 0.25)', width: 1 },
        font: '11px "JetBrains Mono", ui-monospace, monospace',
        values: (_u, vals) => vals.map((v) => formatAxisTick(v)),
      },
      {
        stroke: '#94a3b8',
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
      // Delta 007: no `sync` key — each uPlot instance owns an independent
      // cursor/tooltip. Hovering one chart must not light up any other chart.
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
 * Delta 007: cursor sync removed — each chart owns an independent hover/tooltip.
 * Delta 001-ux-legibility: warning/critical dashed overlays (hooks.draw) +
 * rich hover tooltip (hooks.setCursor, DOM-only) + accessible host label.
 */
@Directive({
  selector: '[appMetricChart]',
  standalone: true,
  host: { role: 'img', '[attr.aria-label]': 'ariaLabel()' },
})
export class MetricChartDirective implements OnDestroy {
  /** Oldest→newest window (from `CoreStore.selectWindow`). */
  readonly data = input.required<readonly TelemetryMetric[]>();
  readonly unit = input<MetricUnit>('ms');
  readonly height = input<number>(200);
  readonly thresholds = input<ThresholdLines | null>(null);
  readonly label = input<string>('Metric chart');

  readonly ariaLabel = computed((): string => {
    const t = this.thresholds();
    const u = this.unit();
    const base = `${this.label()} (${u})`;
    if (t === null) return base;
    const suffix = t.direction === 'low' ? ', low-is-bad' : '';
    return `${base}, warn ${String(t.warn)}${u}, crit ${String(t.crit)}${u}${suffix}`;
  });

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private chart: uPlot | null = null;
  private pending: readonly TelemetryMetric[] | null = null;
  private raf = 0;
  private observer: ResizeObserver | null = null;
  private tip: HTMLDivElement | null = null;
  private lastOptionsKey = '';

  constructor() {
    effect(() => {
      this.pending = this.data();
      // Touch unit/height/thresholds/label so option changes repaint too.
      void this.unit();
      void this.height();
      void this.thresholds();
      void this.label();
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

  private optionsKey(): string {
    const t = this.thresholds();
    const key = t === null ? 'none' : `${String(t.warn)}:${String(t.crit)}:${t.direction ?? ''}`;
    return `${this.unit()}|${String(this.height())}|${key}|${this.label()}`;
  }

  private ensureTip(): HTMLDivElement {
    if (this.tip !== null) return this.tip;
    const host = this.el.nativeElement;
    const computed = typeof getComputedStyle === 'function' ? getComputedStyle(host) : null;
    if (computed !== null && computed.position === 'static') host.style.position = 'relative';
    else if (host.style.position === '') host.style.position = 'relative';
    const tip = document.createElement('div');
    tip.className = 'metric-tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.style.position = 'absolute';
    tip.style.display = 'none';
    tip.style.pointerEvents = 'none';
    tip.style.zIndex = '10';
    tip.style.maxWidth = '240px';
    tip.style.padding = '4px 8px';
    tip.style.borderRadius = '6px';
    tip.style.border = '1px solid rgba(148, 163, 184, 0.3)';
    tip.style.background = 'rgba(2, 6, 23, 0.92)';
    tip.style.color = '#e2e8f0';
    tip.style.font = '11px "JetBrains Mono", ui-monospace, monospace';
    tip.style.whiteSpace = 'nowrap';
    host.appendChild(tip);
    this.tip = tip;
    return tip;
  }

  private handleCursor(u: uPlot): void {
    const tip = this.tip;
    if (tip === null) return;
    const idx = u.cursor.idx;
    if (idx === null || idx === undefined) {
      tip.style.display = 'none';
      return;
    }
    const xs = u.data[0] as unknown as ArrayLike<unknown> | undefined;
    const ys = u.data[1] as unknown as ArrayLike<unknown> | undefined;
    const x: unknown = xs === undefined ? undefined : xs[idx];
    const y: unknown = ys === undefined ? undefined : ys[idx];
    if (typeof x !== 'number' || typeof y !== 'number') {
      tip.style.display = 'none';
      return;
    }
    const stamp = formatTooltipTimestamp(x * 1000);
    tip.textContent = `${stamp} · ${formatValue(y, this.unit())}`;
    tip.style.display = 'block';
    const left = typeof u.cursor.left === 'number' ? u.cursor.left : 0;
    const top = typeof u.cursor.top === 'number' ? u.cursor.top : 0;
    tip.style.left = `${String(Math.max(left + 12, 0))}px`;
    tip.style.top = `${String(Math.max(top - 8, 0))}px`;
  }

  private paint(): void {
    this.raf = 0;
    const batch = this.pending;
    this.pending = null;
    if (batch === null || batch.length === 0) return;
    const xs = batch.map((m) => m.timestamp / 1000);
    const ys = batch.map((m) => m.value);
    const key = this.optionsKey();
    if (this.chart === null || key !== this.lastOptionsKey) {
      this.chart?.destroy();
      this.chart = null;
      this.lastOptionsKey = key;
      const measured = this.el.nativeElement.clientWidth;
      const width = measured > 0 ? measured : 600;
      this.ensureTip();
      this.chart = new uPlot(
        darkOptions(this.unit(), width, this.height(), this.thresholds(), (u: uPlot): void => {
          this.handleCursor(u);
        }),
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
    this.tip?.remove();
    this.tip = null;
  }
}
