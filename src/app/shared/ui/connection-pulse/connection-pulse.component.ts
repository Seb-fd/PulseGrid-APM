import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CoreStore } from '../../../core/store/core-store.service';

/**
 * Status-aware brand pulse dot — reads connectionStatus from CoreStore only.
 * Pure signal reader, no subscribe, zoneless-safe.
 */
@Component({
  selector: 'app-connection-pulse',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      aria-hidden="true"
      class="inline-block h-2.5 w-2.5 rounded-full pulse-dot"
      [class.bg-emerald-400]="status() === 'live'"
      [class.bg-amber-400]="status() === 'simulated'"
      [class.bg-rose-500]="status() === 'reconnecting'"
      [class.shadow-emerald-glow]="status() === 'live'"
      [class.shadow-amber-glow]="status() === 'simulated'"
      [class.shadow-rose-glow]="status() === 'reconnecting'"
    ></span>
  `,
  styles: [
    `
      .shadow-emerald-glow {
        box-shadow: 0 0 10px rgba(52, 211, 153, 0.7);
      }
      .shadow-amber-glow {
        box-shadow: 0 0 10px rgba(251, 191, 36, 0.7);
      }
      .shadow-rose-glow {
        box-shadow: 0 0 10px rgba(244, 63, 94, 0.7);
      }
    `,
  ],
})
export class ConnectionPulseComponent {
  private readonly store = inject(CoreStore);
  readonly status = this.store.connectionStatus;
}
