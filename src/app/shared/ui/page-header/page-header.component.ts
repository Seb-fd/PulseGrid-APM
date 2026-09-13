import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shared page header — unified title + subtitle + right-aligned actions slot.
 * System type scale: `text-lg` title, mono 11px subtitle.
 * Pure presentational (no store access) — zoneless safe.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex items-end justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-lg font-semibold tracking-tight text-slate-100">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="mt-0.5 font-mono text-[11px] leading-4 text-slate-400">{{ subtitle() }}</p>
        }
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
