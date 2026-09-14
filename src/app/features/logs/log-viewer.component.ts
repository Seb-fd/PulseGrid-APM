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
import {
  matchesLogFilter,
  type LogEntry,
  type LogFilter,
  type LogLevel,
} from '../../core/models/log-entry.model';
import { parseHttpMethod, parseHttpStatus, statusTone, type HttpMethod } from './log-format';

const LEVELS: readonly LogLevel[] = ['INFO', 'WARN', 'ERROR'];

const LEVEL_BADGE: Record<LogLevel, string> = {
  INFO: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
  WARN: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  ERROR: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
};

const METHOD_BADGE: Record<HttpMethod, string> = {
  GET: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
  POST: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  PUT: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  DELETE: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  PATCH: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
};

const STATUS_BADGE: Record<'ok' | 'warn' | 'err', string> = {
  ok: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  err: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
};

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23);
}

function formatFullTime(ts: number): string {
  return new Date(ts).toISOString();
}

/**
 * Log Stream Viewer — CDK VirtualScroll console with computed filters.
 * FR-L1..L6: tail-by-default, pause/resume, clear, correlated fault rows.
 * Delta 001-ux-legibility: quick severity pills, HTTP badges (display-only),
 * inline detail drawer.
 */
@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [ScrollingModule, NgClass, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      aria-label="Log stream viewer"
      class="flex min-h-0 flex-col"
      tabindex="-1"
      (keydown.escape)="closeDetail()"
    >
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
        role="group"
        aria-label="Quick severity filter"
        data-testid="log-quick-filters"
        class="mb-2 flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          data-testid="pill-all"
          [attr.aria-pressed]="levelSet().size === 0"
          (click)="selectAll()"
          class="h-7 rounded-full border px-2.5 font-mono text-[11px] font-semibold transition-colors"
          [ngClass]="[
            levelSet().size === 0
              ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
              : 'border-slate-800 bg-[#0d1117] text-slate-400 hover:text-slate-200',
          ]"
        >
          All
        </button>
        <button
          type="button"
          data-testid="pill-errors"
          [attr.aria-pressed]="isOnly('ERROR')"
          (click)="selectOnly('ERROR')"
          class="h-7 rounded-full border px-2.5 font-mono text-[11px] font-semibold transition-colors"
          [ngClass]="[
            isOnly('ERROR')
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              : 'border-slate-800 bg-[#0d1117] text-slate-400 hover:text-slate-200',
          ]"
        >
          Errors Only ({{ errorCount() }})
        </button>
        <button
          type="button"
          data-testid="pill-warnings"
          [attr.aria-pressed]="isOnly('WARN')"
          (click)="selectOnly('WARN')"
          class="h-7 rounded-full border px-2.5 font-mono text-[11px] font-semibold transition-colors"
          [ngClass]="[
            isOnly('WARN')
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : 'border-slate-800 bg-[#0d1117] text-slate-400 hover:text-slate-200',
          ]"
        >
          Warnings ({{ warnCount() }})
        </button>
      </div>
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
      <span class="sr-only" aria-live="polite" data-testid="log-copy-feedback">{{
        copiedId() !== null ? 'Copied ' + copiedId() : ''
      }}</span>
      <div
        class="grid min-h-0 flex-1 gap-3"
        [class.lg:grid-cols-[1fr_320px]]="selectedEntry() !== undefined"
      >
        <cdk-virtual-scroll-viewport
          itemSize="28"
          class="log-viewport h-[calc(100vh-140px)] min-h-[320px] w-full flex-1 rounded-lg border border-slate-800 bg-[#0d1117] shadow-sm"
          role="log"
          aria-live="off"
          aria-label="Log entries"
        >
          <div
            *cdkVirtualFor="let entry of rows(); trackBy: trackLog"
            role="button"
            tabindex="0"
            [attr.data-log-id]="entry.id"
            [attr.aria-label]="
              entry.level + ' ' + entry.serviceId + ' ' + formatTime(entry.timestamp)
            "
            (click)="select(entry)"
            (keydown.enter)="select(entry)"
            (keydown.space)="select(entry); $event.preventDefault()"
            class="log-row grid cursor-pointer grid-cols-[5rem_3.5rem_7rem_1fr_auto] items-center gap-2 border-b border-slate-800/60 px-2 font-mono text-[11px] leading-4 transition-colors odd:bg-[#030712]/60 hover:bg-slate-800/60"
            [style.height.px]="28"
          >
            <span class="truncate text-slate-400">{{ formatTime(entry.timestamp) }}</span>
            <span
              class="rounded border px-1 text-center font-semibold"
              [class]="badgeClass(entry.level)"
              >{{ entry.level }}</span
            >
            <span class="truncate text-slate-200">{{ entry.serviceId }}</span>
            <span class="flex min-w-0 flex-1 items-center gap-1 truncate text-slate-400">
              @if (httpMethod(entry.message); as method) {
                <span
                  data-testid="log-method"
                  class="shrink-0 rounded border px-1 text-[10px] font-semibold"
                  [class]="methodClass(method)"
                  >{{ method }}</span
                >
              }
              @if (httpStatus(entry.message); as status) {
                <span
                  data-testid="log-status"
                  class="shrink-0 rounded border px-1 text-[10px] font-semibold"
                  [class]="statusClass(status)"
                  >{{ status }}</span
                >
              }
              <span class="min-w-0 flex-1 truncate">{{ entry.message }}</span>
            </span>
            @if (entry.traceId) {
              <button
                type="button"
                (click)="copyTrace(entry.traceId); $event.stopPropagation()"
                aria-label="Copy trace id"
                class="hidden max-w-24 shrink-0 truncate text-slate-400 transition-colors hover:text-cyan-300 focus-visible:text-cyan-300 xl:block"
              >
                {{ entry.traceId }}
              </button>
            }
          </div>
        </cdk-virtual-scroll-viewport>
        @if (selectedEntry(); as sel) {
          <aside
            role="dialog"
            aria-modal="false"
            aria-label="Log details"
            data-testid="log-detail"
            class="max-h-[480px] overflow-y-auto rounded-lg border border-slate-800 bg-[#0d1117] p-4 shadow-sm"
          >
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Log details
              </h3>
              <button
                type="button"
                data-testid="log-detail-close"
                (click)="closeDetail()"
                aria-label="Close log details"
                class="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 transition-colors hover:bg-slate-700"
              >
                Close
              </button>
            </div>
            <dl class="mt-3 space-y-1.5 font-mono text-[11px] leading-5">
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-slate-500">Time</dt>
                <dd class="min-w-0 flex-1 break-all text-slate-200">
                  {{ fullTime(sel.timestamp) }}
                </dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-slate-500">Level</dt>
                <dd>
                  <span class="rounded border px-1 font-semibold" [class]="badgeClass(sel.level)">{{
                    sel.level
                  }}</span>
                </dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-slate-500">Service</dt>
                <dd class="text-slate-200">{{ sel.serviceId }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="w-16 shrink-0 text-slate-500">Trace</dt>
                <dd class="min-w-0 flex-1 break-all text-slate-200">
                  {{ sel.traceId ?? '—' }}
                  @if (sel.traceId) {
                    <button
                      type="button"
                      (click)="copyTrace(sel.traceId)"
                      aria-label="Copy trace id"
                      class="ml-1 text-slate-400 transition-colors hover:text-cyan-300 focus-visible:text-cyan-300"
                    >
                      {{ copiedId() === sel.traceId ? 'Copied!' : 'Copy' }}
                    </button>
                  }
                </dd>
              </div>
            </dl>
            <h4
              class="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold tracking-wider text-slate-400 uppercase"
            >
              Message
            </h4>
            <p data-testid="log-detail-message" class="mt-1 font-mono text-[11px] text-slate-200">
              {{ sel.message }}
            </p>
            <h4
              class="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold tracking-wider text-slate-400 uppercase"
            >
              Stacktrace
            </h4>
            <pre
              data-testid="log-detail-stack"
              class="mt-1 overflow-x-auto rounded bg-[#030712] p-2 font-mono text-[11px] text-slate-400"
            >
No stacktrace captured for this entry.</pre>
          </aside>
        }
      </div>
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
  readonly selectedId = signal<string | null>(null);
  private trigger: Element | null = null;

  readonly filter: Signal<LogFilter> = computed(() => ({
    query: this.query(),
    levels: this.levelSet(),
    serviceId: this.serviceId(),
  }));

  /**
   * Single-scan summary (delta 002): one pass over `logs()` yields filtered
   * rows, severity counts, and the service list. Previously four independent
   * computeds each rescanned up to 5000 rows per write.
   */
  private readonly logSummary: Signal<{
    rows: readonly LogEntry[];
    errorCount: number;
    warnCount: number;
    services: readonly string[];
  }> = computed(() => {
    const f = this.filter();
    const all = this.store.logs();
    const rows = all.filter((e) => matchesLogFilter(e, f));
    let errorCount = 0;
    let warnCount = 0;
    const svc = new Set<string>();
    for (const e of all) {
      svc.add(e.serviceId);
      if (e.level === 'ERROR') errorCount += 1;
      else if (e.level === 'WARN') warnCount += 1;
    }
    return { rows, errorCount, warnCount, services: ['all', ...[...svc].sort()] };
  });

  readonly rows: Signal<readonly LogEntry[]> = computed(() => this.logSummary().rows);

  readonly serviceOptions: Signal<readonly string[]> = computed(() => this.logSummary().services);

  readonly errorCount: Signal<number> = computed(() => this.logSummary().errorCount);
  readonly warnCount: Signal<number> = computed(() => this.logSummary().warnCount);

  readonly selectedEntry: Signal<LogEntry | undefined> = computed(() => {
    const id = this.selectedId();
    if (id === null) return undefined;
    return this.rows().find((l) => l.id === id) ?? this.store.logs().find((l) => l.id === id);
  });

  constructor() {
    // Tail-follow: instant catch-up while live; never yank a user who scrolled up.
    // Smooth motion is reserved for the explicit user-initiated resume (togglePaused).
    effect(() => {
      const current = this.rows();
      if (!this.paused() && current.length > 0 && this.isNearBottom()) {
        this.viewport().scrollToIndex(current.length - 1);
      }
    });
    // Drawer a11y: move focus to Close on open (side-effect only).
    effect(() => {
      if (this.selectedEntry() !== undefined && typeof document !== 'undefined') {
        const btn = document.querySelector<HTMLElement>('[data-testid="log-detail-close"]');
        btn?.focus();
      }
    });
  }

  isLevelOn(level: LogLevel): boolean {
    return this.levelSet().has(level);
  }

  isOnly(level: LogLevel): boolean {
    const set = this.levelSet();
    return set.size === 1 && set.has(level);
  }

  selectAll(): void {
    this.levelSet.set(new Set());
  }

  selectOnly(level: LogLevel): void {
    this.levelSet.set(new Set([level]));
  }

  badgeClass(level: LogLevel): string {
    return LEVEL_BADGE[level];
  }

  methodClass(method: HttpMethod): string {
    return METHOD_BADGE[method];
  }

  statusClass(status: number): string {
    return STATUS_BADGE[statusTone(status)];
  }

  httpMethod(message: string): HttpMethod | null {
    return parseHttpMethod(message);
  }

  httpStatus(message: string): number | null {
    return parseHttpStatus(message);
  }

  formatTime(ts: number): string {
    return formatTime(ts);
  }

  fullTime(ts: number): string {
    return formatFullTime(ts);
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
      if (current.length > 0) this.viewport().scrollToIndex(current.length - 1, 'smooth');
    }
  }

  clear(): void {
    this.store.clearLogs();
  }

  trackLog(_index: number, entry: LogEntry): string {
    return entry.id;
  }

  /** Within ~4 rows of the tail: safe to auto-follow without yanking scrolled-up readers. */
  private isNearBottom(): boolean {
    return this.viewport().measureScrollOffset('bottom') < 120;
  }

  select(entry: LogEntry): void {
    this.trigger = typeof document !== 'undefined' ? document.activeElement : null;
    this.selectedId.set(entry.id);
  }

  closeDetail(): void {
    this.selectedId.set(null);
    // Return focus where the drawer was opened from (a11y focus management).
    if (this.trigger instanceof HTMLElement) this.trigger.focus();
    this.trigger = null;
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
