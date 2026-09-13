import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type Signal,
} from '@angular/core';
import { CoreStore } from '../../../core/store/core-store.service';
import type {
  MetricKind,
  MetricUnit,
  TelemetryMetric,
} from '../../../core/models/telemetry-metric.model';
import { MetricChartDirective } from '../../../shared/ui/metric-chart/metric-chart.directive';

/**
 * Dashboard metric widget — compact live uPlot chart for one metric kind.
 * Reads `CoreStore.selectWindow(kind, 100)` only; no cross-feature imports.
 * Parent grid wraps it in `@defer (on viewport)`; no inner defer here.
 */
@Component({
  selector: 'app-dashboard-metric-widget',
  standalone: true,
  imports: [MetricChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-md bg-[#030712] p-2 ring-1 ring-white/5">
      @if (series().length > 0) {
        <div
          appMetricChart
          [data]="series()"
          [unit]="unit()"
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
  private readonly cpu: Signal<readonly TelemetryMetric[]> = this.store.selectWindow('cpu', 100);
  private readonly memory: Signal<readonly TelemetryMetric[]> = this.store.selectWindow(
    'memory',
    100,
  );
  private readonly latency: Signal<readonly TelemetryMetric[]> = this.store.selectWindow(
    'latency',
    100,
  );
  private readonly throughput: Signal<readonly TelemetryMetric[]> = this.store.selectWindow(
    'throughput',
    100,
  );

  readonly series: Signal<readonly TelemetryMetric[]> = computed(() => {
    const k = this.kind();
    if (k === 'cpu') return this.cpu();
    if (k === 'memory') return this.memory();
    if (k === 'latency') return this.latency();
    return this.throughput();
  });
}
