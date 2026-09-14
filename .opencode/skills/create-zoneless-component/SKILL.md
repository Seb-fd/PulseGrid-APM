---
name: create-zoneless-component
description: Scaffold Angular 19 zoneless standalone components for PulseGrid APM. Use when creating components, pages, directives, refactoring to signals, replacing *ngIf/*ngFor with @if/@for, or wiring CoreStore selectors into views.
---

# Create Zoneless Component (PulseGrid APM)

All UI code MUST obey `specs/constitution.md`: zoneless, standalone-only, signals for state, RxJS never subscribed in components.

## Component template (mandatory shape)

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CoreStore } from '../../core/store/core-store.service';

@Component({
  selector: 'app-<name>',
  standalone: true,
  imports: [/* standalone deps only */],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`,
})
export class FeatureComponent {
  private readonly store = inject(CoreStore);
  // Expose store signals directly; derive with computed() only.
}
```

## Non-negotiable rules

1. `standalone: true` + `ChangeDetectionStrategy.OnPush`. No `NgModule`.
2. Native control flow ONLY: `@if`, `@for (item of list(); track item.id)`, `@switch`. `*ngIf`/`*ngFor` are lint errors.
3. State reads are `Signal<T>` from `CoreStore` (`metrics`, `logs`, `nodes`, `connectionStatus`, `activeAlerts`) or `computed()` selectors (`selectWindow`, `selectFilteredLogs`). NEVER call `.subscribe()` in a component — bridge streams via `toSignal()` at the store boundary only.
4. `effect()` is for side-effects (persist layout, chart redraw triggers) — never to derive state.
5. `zone.js` is forbidden: no `NgZone.run()`, no `ApplicationRef.tick()`, no `zone.js` imports (not even in specs).
6. Strict TS: no `any` (use `unknown` + narrowing), explicit `@Input()`/`@Output()` types, `noUncheckedIndexedAccess`-safe indexing (guard, never `!`).
7. Styling: Tailwind v4 utilities, dark-first (`bg-slate-950`, `text-slate-200`); layout via Grid/Flexbox; CDK only for DnD/Overlay/Scrolling.
8. Below-fold/heavy widgets: wrap in `@defer (on viewport)` with a `@placeholder` skeleton.
9. Footnote rule: any value derived from the Binance stream or simulator MUST carry the "derived, not real infra" label.

## Component spec harness (zoneless, Vitest)

```ts
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

describe('GIVEN <Feature>', () => {
  it('WHEN ... THEN ...', async () => {
    TestBed.configureTestingModule({ providers: [provideExperimentalZonelessChangeDetection()] });
    // ...create component, flush, assert DOM/signals
  });
});
```

No `zone.js` / `setup-zone` imports in `src/test-setup.ts` or specs.
