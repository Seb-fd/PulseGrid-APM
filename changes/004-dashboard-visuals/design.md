# 004 — Dashboard Visual Widgets — Design

> Frozen contracts for delta 004. Reuses `TelemetryMetric`, `MetricKind`,
> `MetricUnit`, `LogEntry`, `ServiceNode`, `HealthState`, `AlertIncident` unchanged.
> No constitution amendment (arch rule preserved: no cross-feature imports).

## 1. Shared directive (moved, not forked)

```ts
// src/app/shared/ui/metric-chart/metric-chart.directive.ts
@Directive({ selector: '[appMetricChart]', standalone: true })
export class MetricChartDirective implements OnDestroy {
  readonly data = input.required<readonly TelemetryMetric[]>();
  readonly unit = input<MetricUnit>('ms');
  readonly height = input<number>(180);
  // ... unchanged rAF coalescing + ResizeObserver + uPlot darkOptions
}
```

- `features/telemetry/telemetry-page.component.ts` repoints to
  `../../shared/ui/metric-chart/metric-chart.directive`.
- Old `features/telemetry/metric-chart.directive(.spec).ts` removed (spec moves with it).

## 2. Dashboard widgets (all `standalone`, `OnPush`, native control flow)

```ts
// features/dashboard/widgets/dashboard-metric-widget.component.ts
@Component({
  selector: 'app-dashboard-metric-widget',
  standalone: true,
  imports: [MetricChartDirective],
  changeDetection: OnPush,
})
export class DashboardMetricWidgetComponent {
  readonly kind = input.required<MetricKind>();
  readonly unit = input.required<MetricUnit>();
  readonly series: Signal<readonly TelemetryMetric[]>; // store.selectWindow(kind, 100)
}
```

Template: `@if (series().length > 0)` → `<div appMetricChart [data]="series()"
[unit]="unit()" [attr.data-testid]="'chart-' + kind()" class="relative h-48 w-full">`
`@else` → `Awaiting stream…` (`h-48` flex center). Container is `relative` + explicit
`h-48` so uPlot `clientWidth` + `setSize` resize correctly.

```ts
// features/dashboard/widgets/dashboard-log-widget.component.ts
@Component({
  selector: 'app-dashboard-log-widget',
  standalone: true,
  imports: [ScrollingModule],
  changeDetection: OnPush,
})
export class DashboardLogWidgetComponent {
  readonly rows: Signal<readonly LogEntry[]>; // store.logs().slice(-100)
  readonly count: Signal<number>; // store.logs().length
  formatTime(ts: number): string;
  trackLog(_i: number, e: LogEntry): string;
}
```

Template: count badge `data-testid="dash-log-count"` (`"N rows"`) + single
`cdk-virtual-scroll-viewport` `itemSize="28"` `class="h-56 ..."` `role="log"`,
`*cdkVirtualFor="let entry of rows(); trackBy: trackLog"`. No search/filters/pause
(minimal compact per review). `viewChild` optional + guarded tail-follow `effect`
(never `viewChild.required` — widget may sit in a `@defer` placeholder parent).

```ts
// features/dashboard/widgets/dashboard-topology-widget.component.ts
@Component({ selector: 'app-dashboard-topology-widget', standalone: true, changeDetection: OnPush })
export class DashboardTopologyWidgetComponent {
  readonly nodes: Signal<readonly ServiceNode[]>; // store.healthNodes
  readonly edges: Signal<readonly { from: ServiceNode; to: ServiceNode; dimmed: boolean }[]>;
  healthFill(h: HealthState): string; // #22c55e / #f59e0b / #f43f5e
}
```

Template: compact `<svg viewBox="0 0 800 500" data-testid="dash-topology-svg"
class="h-56 w-full ...">` with `<line>` edges (`.edge-dim` when down) +
`<circle r="22">` nodes (`data-testid="dash-node-{{id}}"`, `.node-down` pulse).
No detail `<aside>`, no inner `@defer` (grid defers). Down-count line
`data-testid="dash-topology-summary"` (`"N nodes down"`) preserves the old signal.

```ts
// features/dashboard/widgets/dashboard-incident-widget.component.ts
@Component({ selector: 'app-dashboard-incident-widget', standalone: true, changeDetection: OnPush })
export class DashboardIncidentWidgetComponent {
  readonly incidents: Signal<readonly AlertIncident[]>; // newest-first, top 5
  readonly firingCount: Signal<number>;
  ruleName(ruleId: string): string;
}
```

Template: borderless (grid card provides chrome): `dash-incident-count`
(`"N firing"`), conditional `dash-incident-banner` (`role="alert"`), list
`dash-incident-list` with rows `dash-incident-{{id}}` + `dash-status-{{id}}`
rose/emerald badges. `@empty` → `"No incidents — rules are quiet."`.

## 3. Grid refactor

```ts
// features/dashboard/dashboard-grid.component.ts
imports: [
  DragDropModule,
  DashboardMetricWidgetComponent,
  DashboardLogWidgetComponent,
  DashboardTopologyWidgetComponent,
  DashboardIncidentWidgetComponent,
];
```

- Card chrome: `rounded-lg border border-slate-800 bg-slate-900/80 shadow-sm backdrop-blur`.
- Body keeps `@defer (on viewport)` + shimmer `placeholder-{{id}}`; inside, `@if`
  dispatch: `cpu|memory|latency|throughput` → `<app-dashboard-metric-widget
[kind] [unit]>`; `logs` → `<app-dashboard-log-widget>`; `topology` → `<app-...-topology>`;
  `incidents` → `<app-...-incident>`.
- `METRIC_UNITS` map (`cpu|memory → %`, `latency → ms`, `throughput → rps`) drives
  `[unit]` binding. `summary()` removed; `title/trackWidget/drop/toggleVisibility/
moveWidget/resetLayout/counts` unchanged. All existing `data-testid`s preserved.

## 4. Header polish (`app.component.ts`)

`header class="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80
backdrop-blur"`; nav imports `RouterLinkActive`, links get
`routerLinkActive="text-cyan-300"` + `ariaCurrentWhenActive="page"`,
base `transition-colors hover:text-cyan-300`.

## 5. Styles (verified, no pipeline change)

`src/styles.css` keeps `@import "tailwindcss";` then
`@import "uplot/dist/uPlot.min.css";`; `.postcssrc.json` keeps
`@tailwindcss/postcss`; `angular.json` styles unchanged.

## 6. Test contracts

| Criterion                                                                      | Spec                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Directive rAF coalesce / setData / destroy / empty                             | `shared/ui/metric-chart/metric-chart.directive.spec.ts` (moved) |
| Metric widget empty→awaiting; series→chart bound w/ testid                     | `widgets/dashboard-metric-widget.spec.ts`                       |
| Log widget last-100 cap, count badge, trackLog                                 | `widgets/dashboard-log-widget.spec.ts`                          |
| Topology widget health fills, dimmed edges, down summary                       | `widgets/dashboard-topology-widget.spec.ts`                     |
| Incident widget banner/count/rows/empty                                        | `widgets/dashboard-incident-widget.spec.ts`                     |
| Grid chrome (reorder/persist/hide/reset/keyboard) + placeholders, no summaries | `dashboard-grid.spec.ts` (updated)                              |
| E2E: DnD persist; widget bodies render                                         | `e2e/topology-alerts-dashboard.spec.ts` (unchanged testids)     |
