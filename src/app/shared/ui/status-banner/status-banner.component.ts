import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import type { Signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { CoreStore } from '../../../core/store/core-store.service';
import type { ConnectionStatus } from '../../../core/models/alert-rule.model';

/**
 * Connection status pill: LIVE | SIMULATED | RECONNECTING + Retry.
 * Compact inline badge for the top nav header (delta 009) — replaces the
 * former full-width block banner. Pure signal reader (no subscribe) —
 * zoneless safe.
 *
 * Retry is delegated: the button emits `retry` and AppComponent owns the
 * reconnect orchestration (socket teardown + cache eviction + rebind).
 */
@Component({
  selector: 'app-status-banner',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="status"
      data-testid="status-pill"
      [attr.data-status]="status()"
      [attr.title]="fullLabel()"
      [attr.aria-label]="fullLabel()"
      class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      [ngClass]="{
        'border-emerald-500/20': status() === 'live',
        'bg-emerald-500/10': status() === 'live',
        'text-emerald-300': status() === 'live',
        'border-amber-500/20': status() === 'simulated',
        'bg-amber-500/10': status() === 'simulated',
        'text-amber-300': status() === 'simulated',
        'border-rose-500/20': status() === 'reconnecting',
        'bg-rose-500/10': status() === 'reconnecting',
        'text-rose-300': status() === 'reconnecting',
      }"
    >
      <span
        aria-hidden="true"
        class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-current"
      ></span>
      <span class="hidden sm:inline">{{ shortLabel() }}</span>
      <span class="min-w-0 truncate sm:hidden">{{ mobileLabel() }}</span>
      @if (status() !== 'live') {
        <button
          type="button"
          (click)="onRetry()"
          class="ml-1 shrink-0 rounded-full border border-current px-1.5 py-px text-[11px] hover:bg-white/10"
        >
          Retry Live
        </button>
      }
    </div>
  `,
})
export class StatusBannerComponent {
  private readonly store = inject(CoreStore);

  /** Emitted when the user clicks `Retry Live`; AppComponent reconnects. */
  readonly retry = output();

  readonly status: Signal<ConnectionStatus> = this.store.connectionStatus;
  readonly shortLabel: Signal<string> = computed(() => {
    switch (this.status()) {
      case 'live':
        return 'Live: Wikimedia EventStreams';
      case 'simulated':
        return 'Simulated fallback';
      case 'reconnecting':
        return 'Reconnecting…';
    }
  });

  readonly mobileLabel: Signal<string> = computed(() => {
    switch (this.status()) {
      case 'live':
        return 'LIVE';
      case 'simulated':
        return 'SIMULATED';
      case 'reconnecting':
        return 'RECONNECTING';
    }
  });

  readonly fullLabel: Signal<string> = computed(() => {
    switch (this.status()) {
      case 'live':
        return 'Connected to Wikimedia Global Event Stream';
      case 'simulated':
        return 'SIMULATED — fallback generator (live unreachable)';
      case 'reconnecting':
        return 'RECONNECTING — attempting live stream…';
    }
  });

  onRetry(): void {
    this.retry.emit();
  }
}
