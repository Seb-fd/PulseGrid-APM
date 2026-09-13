import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { CoreStore } from '../../core/store/core-store.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import type {
  MetricKind,
  MetricUnit,
  TelemetryMetric,
} from '../../core/models/telemetry-metric.model';
import { MetricChartDirective } from '../../shared/ui/metric-chart/metric-chart.directive';

export type WindowSec = 10 | 30 | 60;
const WINDOW_KEY = 'pg.telemetry.window';
const WINDOW_POINTS: Record<WindowSec, number> = { 10: 100, 30: 300, 60: 300 };
const WINDOW_OPTIONS: readonly WindowSec[] = [10, 30, 60];

interface Card {
  kind: MetricKind;
  title: string;
  unit: MetricUnit;
  testId: string;
}

const CARDS: readonly Card[] = [
  { kind: 'cpu', title: 'CPU', unit: '%', testId: 'chart-cpu' },
  { kind: 'memory', title: 'Memory', unit: '%', testId: 'chart-memory' },
  { kind: 'latency', title: 'Latency', unit: 'ms', testId: 'chart-latency' },
  { kind: 'throughput', title: 'Throughput', unit: 'rps', testId: 'chart-throughput' },
];

function readStoredWindow(): WindowSec {
  try {
    const raw = localStorage.getItem(WINDOW_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (n === 10 || n === 30 || n === 60) return n;
  } catch {
    // Non-browser or blocked storage → default.
  }
  return 30;
}

/**
 * Telemetry Stream page — 4 deferred uPlot charts over CoreStore windows.
 * FR-T1..T6: window selector persisted via linkedSignal + localStorage.
 */
@Component({
  selector: 'app-telemetry-page',
  standalone: true,
  imports: [MetricChartDirective, NgClass, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Telemetry stream">
      <app-page-header title="Telemetry" subtitle="Time-series windows from the ingestion stream">
        <div class="flex items-center gap-1" role="group" aria-label="Time window in seconds">
          <span class="mr-1 font-mono text-[11px] leading-4 text-slate-400">Window</span>
          @for (opt of windowOptions; track opt) {
            <button
              type="button"
              [attr.aria-pressed]="windowSec() === opt"
              (click)="setWindow(opt)"
              class="h-7 rounded-md border px-2.5 text-xs font-medium transition-colors"
              [ngClass]="{
                'border-cyan-500/40': windowSec() === opt,
                'bg-cyan-500/10': windowSec() === opt,
                'text-cyan-300': windowSec() === opt,
                'border-slate-700': windowSec() !== opt,
                'bg-slate-800': windowSec() !== opt,
                'text-slate-200': windowSec() !== opt,
                'hover:bg-slate-700': windowSec() !== opt,
              }"
            >
              {{ opt }}s
            </button>
          }
        </div>
      </app-page-header>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        @for (card of cards; track card.kind) {
          <section
            [attr.data-testid]="card.testId"
            [attr.aria-label]="card.title + ' chart'"
            class="rounded-lg border border-slate-800 bg-[#0d1117] p-3 shadow-sm"
          >
            <h3 class="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              {{ card.title }}
              <span class="font-mono text-[11px] font-normal text-slate-400"
                >({{ card.unit }})</span
              >
            </h3>
            @defer (on viewport) {
              @if (series()[card.kind].length > 0) {
                <div
                  appMetricChart
                  [data]="series()[card.kind]"
                  [unit]="card.unit"
                  class="h-[200px] rounded-md bg-[#030712] p-2 ring-1 ring-white/5"
                ></div>
              } @else {
                <p
                  class="flex h-[200px] items-center justify-center rounded-md bg-[#030712] font-mono text-[11px] leading-4 text-slate-400 ring-1 ring-white/5"
                >
                  Awaiting stream…
                </p>
              }
            } @placeholder {
              <div
                class="h-[200px] animate-pulse rounded-md bg-slate-800/40 ring-1 ring-white/5"
                aria-hidden="true"
              ></div>
            }
          </section>
        }
      </div>
      <p class="mt-4 font-mono text-[11px] leading-4 text-slate-400">
        Values derived from market stream + simulator — not real infrastructure probes.
      </p>
    </section>
  `,
})
export class TelemetryPageComponent {
  private readonly store = inject(CoreStore);

  readonly cards = CARDS;
  readonly windowOptions = WINDOW_OPTIONS;
  readonly windowSec = linkedSignal<WindowSec>(() => readStoredWindow());

  private readonly full: Record<MetricKind, () => readonly TelemetryMetric[]> = {
    cpu: this.store.selectWindow('cpu', 300),
    memory: this.store.selectWindow('memory', 300),
    latency: this.store.selectWindow('latency', 300),
    throughput: this.store.selectWindow('throughput', 300),
  };

  readonly series = computed((): Record<MetricKind, readonly TelemetryMetric[]> => {
    const n = WINDOW_POINTS[this.windowSec()];
    return {
      cpu: this.full.cpu().slice(-n),
      memory: this.full.memory().slice(-n),
      latency: this.full.latency().slice(-n),
      throughput: this.full.throughput().slice(-n),
    };
  });

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(WINDOW_KEY, String(this.windowSec()));
      } catch {
        // Storage blocked — selection still works for the session.
      }
    });
  }

  setWindow(value: WindowSec): void {
    this.windowSec.set(value);
  }
}
