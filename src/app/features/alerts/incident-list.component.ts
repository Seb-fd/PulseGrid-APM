import { ChangeDetectionStrategy, Component, type Signal, computed, inject } from '@angular/core';
import { CoreStore } from '../../core/store/core-store.service';
import type { AlertIncident } from '../../core/models/alert-rule.model';

/**
 * Incident List Feed — firing/resolved alerts with status indicators.
 * FR-A4: critical firing banner + badge counts.
 */
@Component({
  selector: 'app-incident-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      aria-label="Incident list"
      class="rounded-lg border border-slate-800 bg-[#0d1117] p-4 shadow-sm"
    >
      <div class="flex items-center gap-2">
        <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">Incidents</h3>
        <span
          data-testid="incident-count"
          class="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] leading-4 text-slate-200"
        >
          {{ firingCount() }} firing
        </span>
        <span class="ml-auto font-mono text-[11px] leading-4 text-slate-400"
          >{{ incidents().length }} total</span
        >
      </div>
      <div data-testid="incident-alert-region" role="alert">
        @if (firingCount() > 0) {
          <p
            data-testid="incident-banner"
            aria-atomic="true"
            class="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 font-mono text-[11px] leading-4 text-rose-300"
          >
            <span
              aria-hidden="true"
              class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
            ></span>
            {{ firingCount() }} alert{{ firingCount() === 1 ? '' : 's' }} firing — check thresholds.
          </p>
        }
      </div>
      <ul data-testid="incident-list" class="mt-3 space-y-1.5">
        @for (incident of incidents(); track incident.id) {
          <li
            [attr.data-testid]="'incident-' + incident.id"
            class="flex items-center gap-2 rounded-md border border-slate-800 bg-[#030712] px-2.5 py-2 text-xs leading-5 transition-colors hover:border-slate-700"
          >
            <span
              [attr.data-testid]="'status-' + incident.id"
              class="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold"
              [class]="
                incident.status === 'firing'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
              "
            >
              {{ incident.status }}
            </span>
            <span class="min-w-0 flex-1 truncate font-medium text-slate-200">{{
              ruleName(incident.ruleId)
            }}</span>
            <span class="shrink-0 font-mono text-[11px] text-slate-400">{{
              incident.observedValue
            }}</span>
          </li>
        } @empty {
          <li
            class="rounded-md border border-dashed border-slate-800 px-2.5 py-3 text-center font-mono text-[11px] leading-4 text-slate-400"
          >
            No incidents — rules are quiet.
          </li>
        }
      </ul>
    </section>
  `,
})
export class IncidentListComponent {
  private readonly store = inject(CoreStore);

  readonly incidents: Signal<readonly AlertIncident[]> = computed(() =>
    [...this.store.incidents()].reverse(),
  );

  readonly firingCount: Signal<number> = this.store.activeAlertsCount;

  ruleName(ruleId: string): string {
    return this.store.rules().find((r) => r.id === ruleId)?.name ?? ruleId;
  }
}
