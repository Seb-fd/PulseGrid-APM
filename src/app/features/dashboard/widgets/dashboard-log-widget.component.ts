import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  viewChild,
  type Signal,
} from '@angular/core';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CoreStore } from '../../../core/store/core-store.service';
import type { LogEntry } from '../../../core/models/log-entry.model';

const COMPACT_TAIL = 100;

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23);
}

/**
 * Dashboard log widget — minimal compact CDK VirtualScroll console.
 * Last-100 tail with count badge; no search/filters/pause (full console lives
 * on the Logs page). Reads `CoreStore` only; no cross-feature imports.
 */
@Component({
  selector: 'app-dashboard-log-widget',
  standalone: true,
  imports: [ScrollingModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2 flex items-center gap-2">
      <span
        data-testid="dash-log-count"
        class="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] leading-4 text-slate-200"
        aria-live="off"
      >
        {{ count() }} rows
      </span>
      <span class="font-mono text-[11px] leading-4 text-slate-400"
        >tail · last {{ rows().length }}</span
      >
    </div>
    <cdk-virtual-scroll-viewport
      itemSize="28"
      data-testid="dash-log-viewport"
      class="h-[200px] rounded-md bg-[#030712] ring-1 ring-white/5"
      role="log"
      aria-live="off"
      aria-label="Recent log entries"
    >
      <div
        *cdkVirtualFor="let entry of rows(); trackBy: trackLog"
        class="flex items-center gap-2 border-b border-slate-800/60 px-2 font-mono text-[11px] leading-4 transition-colors hover:bg-slate-800/60"
        [style.height.px]="28"
      >
        <span class="w-20 shrink-0 text-slate-400">{{ formatTime(entry.timestamp) }}</span>
        <span
          class="w-14 shrink-0 rounded border px-1 text-center font-semibold"
          [class]="badgeClass(entry.level)"
          >{{ entry.level }}</span
        >
        <span class="w-24 shrink-0 truncate text-slate-200">{{ entry.serviceId }}</span>
        <span class="min-w-0 flex-1 truncate text-slate-400">{{ entry.message }}</span>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
})
export class DashboardLogWidgetComponent {
  private readonly store = inject(CoreStore);
  private readonly viewport = viewChild(CdkVirtualScrollViewport);

  readonly rows: Signal<readonly LogEntry[]> = computed(() =>
    this.store.logs().slice(-COMPACT_TAIL),
  );

  readonly count: Signal<number> = computed(() => this.store.logs().length);

  constructor() {
    // Tail-follow (guarded: viewport may be absent while the parent @defer
    // placeholder is showing; never viewChild.required here).
    effect(() => {
      const current = this.rows();
      const viewport = this.viewport();
      if (viewport !== undefined && current.length > 0) {
        viewport.scrollToIndex(current.length - 1);
      }
    });
  }

  formatTime(ts: number): string {
    return formatTime(ts);
  }

  badgeClass(level: LogEntry['level']): string {
    switch (level) {
      case 'INFO':
        return 'border-blue-500/20 bg-blue-500/10 text-blue-300';
      case 'WARN':
        return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
      case 'ERROR':
        return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
    }
  }

  trackLog(_index: number, entry: LogEntry): string {
    return entry.id;
  }
}
