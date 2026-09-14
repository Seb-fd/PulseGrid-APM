# 003a — Telemetry & Logs UI — Design

> Frozen contracts for delta 003a. Implements FR-T1..T6 (charts/banner/window) and FR-L1..L6 (console/filters/scroll).

## 1. MetricChartDirective

```ts
// src/app/features/telemetry/metric-chart.directive.ts
@Directive({ selector: '[appMetricChart]', standalone: true })
export class MetricChartDirective implements OnDestroy {
  readonly data = input.required<readonly TelemetryMetric[]>(); // oldest→newest window
  readonly unit = input<MetricUnit>('ms');
  readonly height = input<number>(180);
  // Internals: uPlot | null, raf: number, pending: readonly TelemetryMetric[] | null,
  // ResizeObserver → chart.setSize(). effect() coalesces inputs → paint() on rAF.
  ngOnDestroy(): void; // cancel rAF, disconnect observer, chart.destroy()
}
```

- Paint maps `batch → [xs(sec), ys]`; creates uPlot lazily (dark opts per `unit`), else `setData`.
- Empty batch → no-op (host shows "awaiting stream" caption from parent `@if`).
- uPlot module mocked in specs (`vi.mock('uplot')`).

## 2. TelemetryPageComponent

```ts
// src/app/features/telemetry/telemetry-page.component.ts
type WindowSec = 10 | 30 | 60;
const WINDOW_POINTS: Record<WindowSec, number> = { 10: 100, 30: 300, 60: 300 };
```

- `windowSec = linkedSignal<WindowSec>(() => readLocalStorage() ?? 30)`; `effect` persists to `localStorage['pg.telemetry.window']`.
- Per kind: `windows: Record<MetricKind, Signal<readonly TelemetryMetric[]>>` via `store.selectWindow(kind, WINDOW_POINTS[windowSec()])` — created once per `windowSec` change (recreated computeds are cheap; documented).
- Template: header + `<select>` window + grid of 4 `<section>` cards, each:
  ```html
  @defer (on viewport) {
  <div appMetricChart [data]="windows.cpu()" unit="%" />
  } @placeholder {
  <div class="skeleton">…</div>
  }
  ```
- Footer footnote (FR-T5): "Values derived from market stream + simulator."
- `CARDS: { kind, title, unit, testId }[]` drives `@for (card of CARDS; track card.kind)`.

## 3. LogsPageComponent

```ts
// src/app/features/logs/log-viewer.component.ts
query = signal('');
levels = signal<Set<LogLevel>>(new Set());
serviceId = signal('all');
paused = signal(false);
filter: Signal<LogFilter> = computed(() => ({
  query: this.query(),
  levels: this.levels(),
  serviceId: this.serviceId(),
}));
rows = this.store.selectFilteredLogs(this.filter); // computed, memoized
```

- Template: toolbar (search input, 3 level toggle buttons `aria-pressed`, service `<select>`, Pause/Resume, Clear, count badge `{{ rows().length }}`), then:
  ```html
  <cdk-virtual-scroll-viewport itemSize="28" class="log-viewport" role="log" aria-live="off">
    <div *cdkVirtualFor="let e of rows(); trackBy: trackLog" class="log-row">
      …badge, service, message, traceId (copy on click)…
    </div>
  </cdk-virtual-scroll-viewport>
  ```
- Imports `ScrollingModule` (CDK). `trackLog = (_: number, e: LogEntry): string => e.id`.
- Tail: `effect(() => { rows(); if (!paused()) viewport.scrollToIndex(rows().length - 1); })` — viewport ref via `viewChild.required(CdkVirtualScrollViewport)`. Pause freezes scroll; buffer keeps growing (capped 5000).
- Clear calls `store.clearLogs()`.

## 4. Routes

```ts
// features/telemetry/routes.ts → [{ path: '', component: TelemetryPageComponent }]
// features/logs/routes.ts → [{ path: '', component: LogViewerComponent }]
// app.routes.ts: 'telemetry' | 'logs' → loadChildren(feature routes); dashboard/topology/alerts stay on placeholders until 003b.
```

## 5. Test contracts (BDD → file)

| Criterion                                                                                      | Spec                             |
| ---------------------------------------------------------------------------------------------- | -------------------------------- |
| rAF coalescing N→1 paint; destroy cancels + destroys; empty no-op                              | `metric-chart.directive.spec.ts` |
| 4 cards render; window switch re-queries + persists `localStorage`; footnote present           | `telemetry-page.spec.ts`         |
| ERROR-only filter; query narrows + count badge; pause freezes tail then resumes; clear empties | `log-viewer.spec.ts`             |
| E2E: banner + 4 charts visible; log filter narrows; sim banner path                            | `e2e/telemetry-logs.spec.ts`     |
