import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  type Signal,
  computed,
  inject,
} from '@angular/core';
import { AlertEngineService } from '../../core/store/alert-engine.service';
import { CoreStore } from '../../core/store/core-store.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { RuleBuilderComponent } from './rule-builder.component';
import { IncidentListComponent } from './incident-list.component';

/** Alerts page — hosts rule builder + incident feed, owns engine lifecycle. */
@Component({
  selector: 'app-alerts-page',
  standalone: true,
  imports: [RuleBuilderComponent, IncidentListComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Alerts">
      <app-page-header title="Alerts" subtitle="Threshold rules and incident feed">
        <span
          class="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] leading-4 text-slate-200"
        >
          {{ firingCount() }} firing · {{ rulesCount() }} rules
        </span>
      </app-page-header>
      <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <app-rule-builder class="xl:col-span-3" />
        @defer (on viewport; prefetch on idle) {
          <app-incident-list class="xl:col-span-2" />
        } @placeholder {
          <div
            data-testid="incident-placeholder"
            class="h-[220px] animate-pulse rounded-lg bg-slate-800/40 ring-1 ring-white/5 motion-reduce:animate-none xl:col-span-2"
          ></div>
        }
      </div>
    </section>
  `,
})
export class AlertsPageComponent implements OnInit, OnDestroy {
  private readonly engine = inject(AlertEngineService);
  private readonly store = inject(CoreStore);

  readonly firingCount: Signal<number> = this.store.activeAlertsCount;
  readonly rulesCount: Signal<number> = computed(() => this.store.rules().length);

  ngOnInit(): void {
    this.engine.start();
  }

  ngOnDestroy(): void {
    this.engine.stop();
  }
}
