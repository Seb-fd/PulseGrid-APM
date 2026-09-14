import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type Signal,
} from '@angular/core';
import { CoreStore } from '../../../core/store/core-store.service';
import { resolveThresholds } from '../../../core/models/metric-thresholds.model';
import type { ThresholdLines } from '../../../shared/ui/metric-chart/metric-chart.directive';
import type {
  MetricKind,
  MetricUnit,
  TelemetryMetric,
} from '../../../core/models/telemetry-metric.model';
import {
  formatSummary,
  summarizeWindow,
  describeSeriesForScreenReader,
} from '../../../core/utils/format-metric';
import { MetricChartDirective } from '../../../shared/ui/metric-chart/metric-chart.directive';

/**
 * Dashboard metric widget — compact live uPlot chart for one metric kind.
 * Reads one memoized `CoreStore.selectWindow(kind, 100)`; no cross-feature imports.
 * Parent grid wraps it in `@defer (on viewport)`; no inner defer here.
 * Delta 001-ux-legibility: summary header (last vs window-avg) + threshold overlay.
 */
@Component({
  selector: 'app-dashboard-metric-widget',
  standalone: true,
  imports: [MetricChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-md bg-[#030712] p-2 ring-1 ring-white/5">
      <p
        [attr.data-testid]="'summary-' + kind()"
        aria-live="off"
        class="mb-1 truncate font-mono text-[11px] leading-4 text-slate-300"
      >
        {{ summaryText() }}
      </p>
      <p class="sr-only" [attr.data-testid]="'chart-alt-' + kind()">
        {{ chartAlt() }}
      </p>
      @if (series().length > 0) {
        <div
          appMetricChart
          [data]="series()"
          [unit]="unit()"
          [thresholds]="thresholdLines()"
          [label]="kind() + ' chart'"
          [attr.data-testid]="'chart-' + kind()"
          class="relative h-[200px] w-full"
        ></div>
      } @else {
        <p
          [attr.data-testid]="'chart-' + kind() + '-empty'"
          class="flex h-[200px] items-center justify-center font-mono text-[11px] leading-4 text-slate-400"
        >
          Awaiting stream…
        </p>
      }
    </div>
  `,
})
export class DashboardMetricWidgetComponent {
  readonly kind = input.required<MetricKind>();
  readonly unit = input.required<MetricUnit>();

  private readonly store = inject(CoreStore);

  /**
   * Single parametrized window keyed by the `kind` input (delta 002).
   * `selectWindow` memoizes per (kind, n), so this resolves to one shared
   * computed instead of four eager windows with a switch.
   */
  readonly series: Signal<readonly TelemetryMetric[]> = computed(() =>
    this.store.selectWindow(this.kind(), 100)(),
  );

  readonly thresholdLines: Signal<ThresholdLines> = computed(() => {
    const t = resolveThresholds(this.kind(), this.store.rules());
    return { warn: t.warn, crit: t.crit, direction: t.direction };
  });

  readonly summaryText: Signal<string> = computed(() => {
    const rows = this.series();
    const unit = this.unit();
    if (rows.length === 0) return `Awaiting stream… (${unit})`;
    const s = summarizeWindow(rows);
    return formatSummary(s.current, s.delta, s.arrow, unit);
  });

  /** Screen-reader data alternative (delta 003) — the chart host stays non-interactive. */
  readonly chartAlt: Signal<string> = computed(() => {
    const kind = this.kind();
    const title = kind.charAt(0).toUpperCase() + kind.slice(1);
    return describeSeriesForScreenReader(title, this.unit(), this.series(), this.thresholdLines());
  });
}
