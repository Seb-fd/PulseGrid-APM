import {
  ChangeDetectionStrategy,
  Component,
  type Signal,
  computed,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CoreStore } from '../../core/store/core-store.service';
import {
  DEFAULT_DASHBOARD_LAYOUT,
  readDashboardLayout,
  writeDashboardLayout,
  type DashboardLayout,
  type DashboardWidgetLayout,
} from '../../core/models/dashboard-layout.model';
import type { MetricKind, MetricUnit } from '../../core/models/telemetry-metric.model';
import { DashboardMetricWidgetComponent } from './widgets/dashboard-metric-widget.component';
import { DashboardLogWidgetComponent } from './widgets/dashboard-log-widget.component';
import { DashboardTopologyWidgetComponent } from './widgets/dashboard-topology-widget.component';
import { DashboardIncidentWidgetComponent } from './widgets/dashboard-incident-widget.component';

const WIDGET_TITLES: Record<string, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  latency: 'Latency',
  throughput: 'Throughput',
  logs: 'Log console',
  topology: 'Topology',
  incidents: 'Incidents',
};

const METRIC_UNITS: Record<string, MetricUnit> = {
  cpu: '%',
  memory: '%',
  latency: 'ms',
  throughput: 'rps',
};

const WIDGET_ICON_PATHS: Record<string, string> = {
  cpu: 'M3 12h4l3 8 4-16 3 8h4',
  memory: 'M4 7h16v10H4z M9 11h6v2H9z',
  latency: 'M5 19a9 9 0 1 1 14 0 M12 15l4-6',
  throughput: 'M7 17L17 7 M7 7h10v10',
  logs: 'M4 17l6-5-6-5 M12 19h8',
  topology: 'M6 6h.01 M18 6h.01 M12 18h.01 M7.4 7.4l4.1 4.1 M16.6 7.4l-4.1 4.1',
  incidents: 'M12 3l10 18H2z M12 10v5 M12 18.5v.01',
};

/**
 * Dashboard Grid — draggable widget board with persisted layout.
 * FR-D1..D5: CDK DragDrop, visibility toggles, localStorage v1, @defer per widget.
 * Delta 004: each widget hosts its dashboard-local visual component.
 * Delta 006: system card chrome, inline-SVG icons, uniform 200px wells.
 */
@Component({
  selector: 'app-dashboard-grid',
  standalone: true,
  imports: [
    DragDropModule,
    DashboardMetricWidgetComponent,
    DashboardLogWidgetComponent,
    DashboardTopologyWidgetComponent,
    DashboardIncidentWidgetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Customizable dashboard">
      <div class="mb-4 flex items-end justify-between">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-slate-100">Dashboard</h2>
          <p class="mt-0.5 font-mono text-[11px] leading-4 text-slate-400">
            Drag or use arrow buttons to reorder widgets
          </p>
        </div>
        <button
          type="button"
          (click)="resetLayout()"
          data-testid="dashboard-reset"
          class="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
        >
          Reset layout
        </button>
      </div>
      <div
        cdkDropList
        (cdkDropListDropped)="drop($event)"
        data-testid="dashboard-board"
        class="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        @for (widget of visibleWidgets(); track widget.id) {
          <section
            cdkDrag
            [attr.data-testid]="'widget-' + widget.id"
            [attr.aria-label]="title(widget.id)"
            class="rounded-lg border border-slate-800 bg-[#0d1117] shadow-sm"
          >
            <div class="flex items-center gap-2 border-b border-slate-800 p-3">
              <span
                cdkDragHandle
                [attr.data-testid]="'drag-' + widget.id"
                class="grid h-7 w-7 cursor-grab place-items-center rounded-md border border-slate-800 bg-[#030712] text-slate-500 transition-colors active:cursor-grabbing hover:border-cyan-500/40 hover:text-cyan-300"
                title="Drag to reorder"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
                  <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
                  <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <svg
                viewBox="0 0 24 24"
                class="h-3.5 w-3.5 shrink-0 text-slate-400"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="widgetIcon(widget.id)" />
              </svg>
              <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                {{ title(widget.id) }}
              </h3>
              @if (isMetric(widget.id)) {
                <span
                  class="ml-2 rounded border border-slate-800 bg-[#030712] px-1.5 py-0.5 font-mono text-[11px] leading-4 text-slate-400"
                  >{{ unit(widget.id) }}</span
                >
              }
              <span class="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  (click)="moveWidget(widget.id, -1)"
                  [attr.data-testid]="'move-' + widget.id + '-up'"
                  [attr.aria-label]="'Move ' + title(widget.id) + ' earlier'"
                  class="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  (click)="moveWidget(widget.id, 1)"
                  [attr.data-testid]="'move-' + widget.id + '-down'"
                  [attr.aria-label]="'Move ' + title(widget.id) + ' later'"
                  class="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  (click)="toggleVisibility(widget.id)"
                  [attr.data-testid]="'hide-' + widget.id"
                  class="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18 M6 6l12 12" />
                  </svg>
                </button>
              </span>
            </div>
            @defer (on viewport) {
              <div class="p-3" [attr.data-testid]="'body-' + widget.id">
                @if (isMetric(widget.id)) {
                  <app-dashboard-metric-widget
                    [kind]="metricKind(widget.id)"
                    [unit]="unit(widget.id)"
                  />
                } @else if (widget.id === 'logs') {
                  <app-dashboard-log-widget />
                } @else if (widget.id === 'topology') {
                  <app-dashboard-topology-widget />
                } @else if (widget.id === 'incidents') {
                  <app-dashboard-incident-widget />
                }
              </div>
            } @placeholder {
              <div
                class="m-3 h-[200px] animate-pulse rounded-md bg-slate-800/40 ring-1 ring-white/5"
                [attr.data-testid]="'placeholder-' + widget.id"
                aria-hidden="true"
              ></div>
            }
          </section>
        }
      </div>
      @if (hiddenWidgets().length > 0) {
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <span class="font-mono text-[11px] leading-4 text-slate-400">Hidden widgets:</span>
          @for (widget of hiddenWidgets(); track widget.id) {
            <button
              type="button"
              (click)="toggleVisibility(widget.id)"
              [attr.data-testid]="'show-' + widget.id"
              class="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-200 transition-colors hover:border-cyan-500/30 hover:text-cyan-300"
            >
              {{ title(widget.id) }}
            </button>
          }
        </div>
      }
      <p class="mt-4 font-mono text-[11px] leading-4 text-slate-400">
        Values derived from market stream + simulator — not real infrastructure probes.
      </p>
    </section>
  `,
})
export class DashboardGridComponent {
  private readonly store = inject(CoreStore);

  readonly layout = linkedSignal<DashboardLayout>(() => readDashboardLayout());

  readonly visibleWidgets: Signal<DashboardWidgetLayout[]> = computed(() =>
    this.layout().widgets.filter((w) => w.visible),
  );

  readonly hiddenWidgets: Signal<DashboardWidgetLayout[]> = computed(() =>
    this.layout().widgets.filter((w) => !w.visible),
  );

  readonly counts: Signal<{ metrics: number; logs: number; firing: number; down: number }> =
    computed(() => ({
      metrics: this.store.metrics().length,
      logs: this.store.logs().length,
      firing: this.store.incidents().filter((i) => i.status === 'firing').length,
      down: this.store.nodes().filter((n) => n.health === 'down').length,
    }));

  constructor() {
    effect(() => {
      writeDashboardLayout(this.layout());
    });
  }

  title(id: string): string {
    return WIDGET_TITLES[id] ?? id;
  }

  widgetIcon(id: string): string {
    return WIDGET_ICON_PATHS[id] ?? 'M12 5v14 M5 12h14';
  }

  isMetric(id: string): boolean {
    return id === 'cpu' || id === 'memory' || id === 'latency' || id === 'throughput';
  }

  metricKind(id: string): MetricKind {
    if (id === 'cpu' || id === 'memory' || id === 'latency' || id === 'throughput') return id;
    return 'cpu';
  }

  unit(id: string): MetricUnit {
    return METRIC_UNITS[id] ?? 'ms';
  }

  drop(event: CdkDragDrop<DashboardWidgetLayout[]>): void {
    const widgets = [...this.layout().widgets];
    moveItemInArray(widgets, event.previousIndex, event.currentIndex);
    this.layout.set({ ...this.layout(), widgets });
  }

  toggleVisibility(id: string): void {
    const widgets = this.layout().widgets.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w,
    );
    this.layout.set({ ...this.layout(), widgets });
  }

  /** Keyboard/touch fallback: reorder without pointer drag. */
  moveWidget(id: string, dir: -1 | 1): void {
    const widgets = [...this.layout().widgets];
    const idx = widgets.findIndex((w) => w.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= widgets.length) return;
    moveItemInArray(widgets, idx, next);
    this.layout.set({ ...this.layout(), widgets });
  }

  resetLayout(): void {
    this.layout.set(DEFAULT_DASHBOARD_LAYOUT);
  }

  trackWidget(_index: number, widget: DashboardWidgetLayout): string {
    return widget.id;
  }
}
