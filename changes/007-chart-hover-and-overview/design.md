# 007 — Chart Hover Isolation + Dashboard Overview — Design

> Frozen contracts for delta 007. No constitution amendment. No domain-type changes
> (`TelemetryMetric`, `MetricThresholds`, `HealthState`, `DashboardLayout` unchanged).

## 1. Chart cursor contract (fix)

```ts
// src/app/shared/ui/metric-chart/metric-chart.directive.ts — darkOptions()
cursor: {
  show: true,
  x: true,
  y: false,
  drag: { x: false, y: false },
  points: { show: false },
  focus: { prox: 8 },
  lock: false,
  // Delta 007: NO `sync` key — each uPlot instance owns an independent
  // cursor/tooltip. Hovering one chart must not light up any other chart.
},
```

- Doc comment on the directive gains a `Delta 007` line noting independent cursors.
- No input/output signature change; `ThresholdLines`, rAF coalescing, `ResizeObserver`,
  threshold overlays, and DOM tooltip (`handleCursor`) are untouched.

## 2. Overview banner contract (dashboard-grid top only)

### 2.1 Storage

```ts
// features/dashboard/dashboard-grid.component.ts (or co-located helpers)
export const DASHBOARD_OVERVIEW_KEY = 'pg.dashboard.overview.v1';

export function readOverviewVisible(): boolean {
  try {
    const raw = localStorage.getItem(DASHBOARD_OVERVIEW_KEY);
    if (raw === null) return true; // first run → visible
    return raw !== '0';
  } catch {
    return true;
  }
}

export function writeOverviewVisible(visible: boolean): void {
  try {
    localStorage.setItem(DASHBOARD_OVERVIEW_KEY, visible ? '1' : '0');
  } catch {
    // Storage blocked — banner still works for the session.
  }
}
```

### 2.2 Component state (zoneless-safe, OnPush)

```ts
export class DashboardGridComponent {
  readonly showOverview = linkedSignal<boolean>(() => readOverviewVisible());

  constructor() {
    effect(() => {
      writeOverviewVisible(this.showOverview());
    });
    effect(() => {
      writeDashboardLayout(this.layout());
    });
  }

  dismissOverview(): void {
    this.showOverview.set(false);
  }

  restoreOverview(): void {
    this.showOverview.set(true);
  }
}
```

- `effect()` is persist-only (constitution §3.3); derived state stays in `computed`.
- `resetLayout()` does NOT touch the overview preference (independent concerns).
- Explicit return types on all public methods (`: void`, `: boolean`, `: string`).

### 2.3 Template (outside every `@defer` block, directly under grid header row)

```html
@if (showOverview()) {
<section
  role="region"
  aria-label="About PulseGrid APM"
  data-testid="dashboard-overview"
  class="mb-4 rounded-lg border border-slate-800 bg-[#0d1117] p-4"
>
  <div class="flex items-start gap-3">
    <div class="min-w-0 flex-1">
      <h3 class="text-sm font-semibold text-slate-100">What is PulseGrid APM?</h3>
      <p class="mt-1 text-xs leading-5 text-slate-300">
        PulseGrid APM is an enterprise observability platform for monitoring real-time server
        metrics, log streams, and system topology health.
      </p>
      <ul aria-label="Status legend" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <li class="flex items-center gap-1.5">
          <span aria-hidden="true" class="h-2 w-2 rounded-full bg-emerald-400"></span>
          <span class="text-slate-300">Emerald — Healthy</span>
        </li>
        <li class="flex items-center gap-1.5">
          <span aria-hidden="true" class="h-2 w-2 rounded-full bg-amber-400"></span>
          <span class="text-slate-300">Amber — Degraded</span>
        </li>
        <li class="flex items-center gap-1.5">
          <span aria-hidden="true" class="h-2 w-2 rounded-full bg-rose-500"></span>
          <span class="text-slate-300">Red — Critical / Down</span>
        </li>
      </ul>
      <p data-testid="overview-thresholds" class="mt-2 font-mono text-[11px] text-slate-400">
        Warn/Crit: CPU 75/90% · Memory 75/90% · Latency 200/500ms · Throughput 500/100rps
        (low-is-bad)
      </p>
    </div>
    <button
      type="button"
      (click)="dismissOverview()"
      data-testid="overview-dismiss"
      aria-label="Dismiss overview"
    >
      …
    </button>
  </div>
</section>
} @else {
<div class="mb-4">
  <button
    type="button"
    (click)="restoreOverview()"
    data-testid="overview-show"
    class="rounded-md border border-slate-700 ..."
  >
    What is PulseGrid?
  </button>
</div>
}
```

- Threshold line is rendered from `METRIC_THRESHOLDS` values (import, not literal drift);
  static English labels matched by specs via `overview-thresholds` testid.
- Existing `derived from market stream` footnote (`dashboard-grid.component.ts`) is kept
  untouched — the banner does not duplicate it.
- Native `@if` only; no `*ngIf`; buttons are real `<button type="button">` (keyboard + SR safe).

## 3. Test contracts

| Criterion                                                                                         | Spec                                                                                                     |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Cursor options carry no `sync` key (hover isolation)                                              | `shared/ui/metric-chart/metric-chart.directive.spec.ts` — `WHEN constructed THEN cursor has no sync key` |
| Banner visible by default with region label + legend + thresholds                                 | `features/dashboard/dashboard-grid.spec.ts`                                                              |
| Dismiss hides banner, shows restore, persists `pg.dashboard.overview.v1='0'`; reload stays hidden | `dashboard-grid.spec.ts` (localStorage round-trip like layout tests)                                     |
| Restore re-shows banner, persists `'1'`                                                           | `dashboard-grid.spec.ts`                                                                                 |
| Dismiss/restore controls expose accessible names; legend list labelled                            | `dashboard-grid.spec.ts` a11y test                                                                       |
| E2E: dismiss → reload stays hidden → restore re-shows                                             | `e2e/dashboard-overview.spec.ts` (new, hermetic `/dashboard` route)                                      |
