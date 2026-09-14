import { ChangeDetectionStrategy, Component, computed, inject, type Signal } from '@angular/core';
import { CoreStore } from '../../../core/store/core-store.service';
import type { AlertIncident } from '../../../core/models/alert-rule.model';

const COMPACT_LIMIT = 5;

/**
 * Dashboard incident widget — firing banner + badge list (borderless; the grid
 * card provides chrome). Reads `CoreStore` only; no cross-feature imports.
 */
@Component({
  selector: 'app-dashboard-incident-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2 flex items-center gap-2">
      <span
        data-testid="dash-incident-count"
        class="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] leading-4 text-slate-200"
        aria-live="off"
      >
        {{ firingCount() }} firing
      </span>
    </div>
    <div data-testid="dash-incident-alert-region" role="alert">
      @if (firingCount() > 0) {
        <p
          data-testid="dash-incident-banner"
          aria-atomic="true"
          class="mb-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 font-mono text-[11px] leading-4 text-rose-300"
        >
          <span
            aria-hidden="true"
            class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
          ></span>
          {{ firingCount() }} alert{{ firingCount() === 1 ? '' : 's' }} firing — check thresholds.
        </p>
      }
    </div>
    <ul data-testid="dash-incident-list" class="space-y-1.5">
      @for (incident of incidents(); track incident.id) {
        <li
          [attr.data-testid]="'dash-incident-' + incident.id"
          class="flex items-center gap-2 rounded-md border border-slate-800 bg-[#030712] px-2 py-1.5 text-xs leading-5"
        >
          <span
            [attr.data-testid]="'dash-status-' + incident.id"
            class="rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold"
            [class]="
              incident.status === 'firing'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            "
          >
            {{ incident.status }}
          </span>
          <span class="truncate font-medium text-slate-200">{{ ruleName(incident.ruleId) }}</span>
          <span class="ml-auto shrink-0 font-mono text-[11px] text-slate-400">{{
            incident.observedValue
          }}</span>
        </li>
      } @empty {
        <li class="font-mono text-[11px] leading-4 text-slate-400">
          No incidents — rules are quiet.
        </li>
      }
    </ul>
  `,
})
export class DashboardIncidentWidgetComponent {
  private readonly store = inject(CoreStore);

  readonly incidents: Signal<readonly AlertIncident[]> = computed(() =>
    [...this.store.incidents()].reverse().slice(0, COMPACT_LIMIT),
  );

  readonly firingCount: Signal<number> = this.store.activeAlertsCount;

  ruleName(ruleId: string): string {
    return this.store.rules().find((r) => r.id === ruleId)?.name ?? ruleId;
  }
}
