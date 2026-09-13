import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { NgClass } from '@angular/common';
import { CoreStore } from '../../core/store/core-store.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import type { LogEntry, LogFilter, LogLevel } from '../../core/models/log-entry.model';

const LEVELS: readonly LogLevel[] = ['INFO', 'WARN', 'ERROR'];

const LEVEL_BADGE: Record<LogLevel, string> = {
  INFO: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
  WARN: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  ERROR: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
};

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23);
}

/**
 * Log Stream Viewer — CDK VirtualScroll console with computed filters.
 * FR-L1..L6: tail-by-default, pause/resume, clear, correlated fault rows.
 */
@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [ScrollingModule, NgClass, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Log stream viewer" class="flex min-h-0 flex-col">
      <app-page-header title="Logs" subtitle="Live tail from the ingestion stream">
        <span
          data-testid="log-count"
          class="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] leading-4 text-slate-200"
          aria-live="off"
        >
          {{ rows().length }} rows
        </span>
        <button
          type="button"
          (click)="togglePaused()"
          class="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
        >
          {{ paused() ? 'Resume' : 'Pause' }}
        </button>
        <button
          type="button"
          (click)="clear()"
          class="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
        >
          Clear
        </button>
      </app-page-header>
      <div
        class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-[#0d1117] p-2 shadow-sm"
      >
        <input
          type="search"
          placeholder="Filter message, service, trace…"
          aria-label="Filter logs"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          class="h-8 min-w-0 flex-1 rounded-md border border-slate-800 bg-[#030712] px-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        />
        @for (level of levels; track level) {
          <button
            type="button"
            [attr.aria-pressed]="isLevelOn(level)"
            (click)="toggleLevel(level)"
            class="h-8 rounded-md border px-2 font-mono text-[11px] font-semibold transition-colors"
            [ngClass]="[
              badgeClass(level),
              isLevelOn(level) ? 'border-current' : 'border-slate-800 opacity-60',
            ]"
          >
            {{ level }}
          </button>
        }
        <select
          [value]="serviceId()"
          (change)="serviceId.set($any($event.target).value)"
          aria-label="Service filter"
          class="h-8 rounded-md border border-slate-800 bg-[#030712] px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        >
          @for (svc of serviceOptions(); track svc) {
            <option [value]="svc">{{ svc }}</option>
          }
        </select>
      </div>
      <div
        class="grid grid-cols-[5rem_3.5rem_7rem_1fr_auto] gap-2 border-b border-slate-800 px-2 pb-1 font-mono text-[10px] tracking-wider text-slate-500 uppercase"
        aria-hidden="true"
      >
        <span>Time</span>
        <span>Level</span>
        <span>Service</span>
        <span>Message</span>
        <span class="hidden xl:block">Trace</span>
      </div>
      <cdk-virtual-scroll-viewport
        itemSize="28"
        class="log-viewport h-[calc(100vh-140px)] min-h-[320px] w-full flex-1 rounded-lg border border-slate-800 bg-[#0d1117] shadow-sm"
        role="log"
        aria-live="off"
        aria-label="Log entries"
      >
        <div
          *cdkVirtualFor="let entry of rows(); trackBy: trackLog"
          class="log-row grid grid-cols-[5rem_3.5rem_7rem_1fr_auto] items-center gap-2 border-b border-slate-800/60 px-2 font-mono text-[11px] leading-4 transition-colors odd:bg-[#030712]/60 hover:bg-slate-800/60"
          [style.height.px]="28"
        >
          <span class="truncate text-slate-400">{{ formatTime(entry.timestamp) }}</span>
          <span
            class="rounded border px-1 text-center font-semibold"
            [class]="badgeClass(entry.level)"
            >{{ entry.level }}</span
          >
          <span class="truncate text-slate-200">{{ entry.serviceId }}</span>
          <span class="min-w-0 flex-1 truncate text-slate-400">{{ entry.message }}</span>
          @if (entry.traceId) {
            <button
              type="button"
              (click)="copyTrace(entry.traceId)"
              [title]="copiedId() === entry.traceId ? 'Copied!' : 'Copy trace id'"
              class="hidden max-w-24 shrink-0 truncate text-slate-500 transition-colors hover:text-cyan-300 xl:block"
            >
              {{ entry.traceId }}
            </button>
          }
        </div>
      </cdk-virtual-scroll-viewport>
    </section>
  `,
})
export class LogViewerComponent {
  private readonly store = inject(CoreStore);
  private readonly viewport = viewChild.required(CdkVirtualScrollViewport);

  readonly levels = LEVELS;
  readonly query = signal('');
  readonly levelSet = signal<Set<LogLevel>>(new Set());
  readonly serviceId = signal('all');
  readonly paused = signal(false);
  readonly copiedId = signal<string | null>(null);

  readonly filter: Signal<LogFilter> = computed(() => ({
    query: this.query(),
    levels: this.levelSet(),
    serviceId: this.serviceId(),
  }));

  readonly rows = this.store.selectFilteredLogs(this.filter);

  readonly serviceOptions = computed(() => [
    'all',
    ...Array.from(new Set(this.store.logs().map((l) => l.serviceId))).sort(),
  ]);

  constructor() {
    // Tail-follow: whenever rows change and we are live, jump to newest.
    effect(() => {
      const current = this.rows();
      if (!this.paused() && current.length > 0) {
        this.viewport().scrollToIndex(current.length - 1, 'smooth');
      }
    });
  }

  isLevelOn(level: LogLevel): boolean {
    return this.levelSet().has(level);
  }

  badgeClass(level: LogLevel): string {
    return LEVEL_BADGE[level];
  }

  formatTime(ts: number): string {
    return formatTime(ts);
  }

  toggleLevel(level: LogLevel): void {
    const next = new Set(this.levelSet());
    if (next.has(level)) next.delete(level);
    else next.add(level);
    this.levelSet.set(next);
  }

  togglePaused(): void {
    this.paused.update((p) => !p);
    if (!this.paused()) {
      const current = this.rows();
      if (current.length > 0) this.viewport().scrollToIndex(current.length - 1);
    }
  }

  clear(): void {
    this.store.clearLogs();
  }

  trackLog(_index: number, entry: LogEntry): string {
    return entry.id;
  }

  copyTrace(traceId: string): void {
    this.copiedId.set(traceId);
    try {
      void navigator.clipboard.writeText(traceId);
    } catch {
      // Clipboard unavailable (permissions/context) — id display is the fallback.
    }
  }
}
