# 003b — Topology, Alerts & Dashboard — Design

> Frozen contracts for delta 003b. Reuses `ServiceNode`, `HealthState`, `AlertRule`, `AlertIncident` unchanged from `001-initial-architecture/design.md` §§3–4. Only new domain type is `DashboardLayout`.

## 1. Dashboard layout model (new)

```ts
// src/app/core/models/dashboard-layout.model.ts
export interface DashboardWidgetLayout {
  id: string;
  col: number;
  row: number;
  w: 1 | 2;
  h: 1 | 2;
  visible: boolean;
}
export interface DashboardLayout {
  version: 1;
  widgets: DashboardWidgetLayout[];
}
export const DASHBOARD_LAYOUT_KEY = 'pg.dashboard.layout.v1';
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout; // 7 widgets: cpu, memory, latency, throughput, logs, topology, incidents
export function parseDashboardLayout(raw: unknown): DashboardLayout | null; // null on shape/version mismatch
export function readDashboardLayout(): DashboardLayout; // try/catch localStorage → DEFAULT
```

## 2. AlertEngineService

```ts
// src/app/core/store/alert-engine.service.ts
@Injectable({ providedIn: 'root' })
export class AlertEngineService implements OnDestroy {
  readonly running = signal(false);
  constructor(private readonly store = inject(CoreStore)) {
    this.loadRules(); // localStorage 'pg.alerts.rules' → store.upsertRule (validated)
    effect(() => {
      this.persistRules(this.store.rules());
    }); // side-effect only
  }
  start(): void; // interval(1000).subscribe(() => this.tick()) once; running.set(true)
  stop(): void; // unsubscribe; running.set(false)
  tick(now?: number): void; // store.tickAlerts(now ?? Date.now()) — explicit now for tests
  syncRules(): void; // explicit persist after CRUD (deterministic in specs)
  ngOnDestroy(): void; // stop()
}
```

- No `BehaviorSubject`; no component `subscribe`. Engine is the only `interval` owner for alerts.
- Rule persistence shape: `AlertRule[]` under `'pg.alerts.rules'`, guarded by `validateRuleDraft` on load.

## 3. TopologyMapComponent

```ts
// src/app/features/topology/topology-map.component.ts
@Component({ selector: 'app-topology-map', standalone: true, changeDetection: OnPush })
export class TopologyMapComponent {
  private readonly store = inject(CoreStore);
  readonly nodes = this.store.healthNodes; // Signal<readonly ServiceNode[]> (live computed)
  readonly selectedId = signal<string | null>(null);
  readonly selectedNode: Signal<ServiceNode | undefined>;
  readonly selectedLogs: Signal<readonly LogEntry[]>; // last 20 for serviceId
  readonly edges: Signal<readonly { from: ServiceNode; to: ServiceNode }[]>;
  select(id: string): void;
  clearSelection(): void;
  healthFill(h: HealthState): string; // healthy #22c55e, degraded #f59e0b, down #f43f5e
  depLabel(node: ServiceNode): string;
}
```

- `CoreStore.healthNodes` (new, pure `computed` per arch §6 `nodeHealth`): base nodes + `deriveHealth` over latency p95 / error rate / `outageIds` (recent zero-throughput samples, `OUTAGE_WINDOW_MS` 15s). Views never write health; `refreshNodeHealth()` remains for imperative callers/tests and shares the same pure helper.

- Template: `@defer (on viewport; prefetch on idle)` around `<svg viewBox="0 0 800 500" role="img" aria-label="Microservice topology">`; edges `<line>` (dim class when either endpoint `down`); nodes `<g tabindex="0" role="button" [attr.aria-label]="name + health" (click)/(keydown.enter)/(keydown.space)" data-testid="node-{{id}}">` + `<circle>` + label; `@placeholder` skeleton `data-testid="topology-placeholder"`; detail `<aside data-testid="topology-detail">` with metrics spark value, deps, last-20 logs.
- CSS: `.node-down { animation: pulse-red 1.2s infinite; }` keyframes only (no JS per-frame loop).
- `features/topology/routes.ts` → `TOPOLOGY_ROUTES`.

## 4. Alerts UI

```ts
// src/app/features/alerts/rule-builder.component.ts
@Component({
  selector: 'app-rule-builder',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: OnPush,
})
export class RuleBuilderComponent {
  readonly form: FormGroup; // name, metric, operator, threshold, durationSec, severity, enabled
  readonly rules = this.store.rules;
  save(): void;
  remove(id: string): void;
  toggleEnabled(rule: AlertRule): void;
}
```

- Validators: `name` required+minLength(3); `threshold` required + finite + cpu/memory 0–100 cross-check (group validator); `durationSec` required+min(5)+max(300)+integer pattern. Save disabled when invalid; inline `<p data-testid="error-…">`.
- Testids: `rule-name`, `rule-metric`, `rule-operator`, `rule-threshold`, `rule-duration`, `rule-severity`, `rule-enabled`, `rule-save`, `rule-list`.

```ts
// src/app/features/alerts/incident-list.component.ts
@Component({ selector: 'app-incident-list', standalone: true, changeDetection: OnPush })
export class IncidentListComponent {
  readonly incidents: Signal<readonly AlertIncident[]>; // newest-first
  readonly firingCount: Signal<number>;
}
```

- Template: `data-testid="incident-list"`, per-row `data-testid="incident-{{id}}"`, status badge firing/resolved, critical banner when `firingCount > 0` with a critical rule.

```ts
// src/app/features/alerts/alerts-page.component.ts — hosts <app-rule-builder/> + <app-incident-list/>, starts/stops engine.
```

- `features/alerts/routes.ts` → `ALERTS_ROUTES`.

## 5. DashboardGridComponent

```ts
// src/app/features/dashboard/dashboard-grid.component.ts
export type DashboardWidgetId =
  'cpu' | 'memory' | 'latency' | 'throughput' | 'logs' | 'topology' | 'incidents';
@Component({
  selector: 'app-dashboard-grid',
  standalone: true,
  imports: [DragDropModule],
  changeDetection: OnPush,
})
export class DashboardGridComponent {
  readonly layout = linkedSignal<DashboardLayout>(() => readDashboardLayout());
  readonly visibleWidgets: Signal<DashboardWidgetLayout[]>;
  readonly counts: Signal<{ metrics: number; logs: number; firing: number; down: number }>;
  drop(event: CdkDragDrop<DashboardWidgetLayout[]>): void; // moveItemInArray on copy → layout.set
  toggleVisibility(id: string): void;
  moveWidget(id: string, dir: -1 | 1): void;
  resetLayout(): void;
  trackWidget(_i: number, w: DashboardWidgetLayout): string;
  constructor() {
    effect(() => persist(layout()));
  }
}
```

- Template: toolbar (Reset `data-testid="dashboard-reset"`), `cdkDropList` grid, `@for (w of visibleWidgets(); track w.id)` → `<section cdkDrag data-testid="widget-{{id}}">` with drag handle `data-testid="drag-{{id}}"`, hide button `data-testid="hide-{{id}}"`, keyboard `move` buttons `data-testid="move-{{id}}-up/down"`; each body `@defer (on viewport)` + shimmer placeholder. Bodies are compact summaries from `CoreStore` (no cross-feature imports).
- `features/dashboard/routes.ts` → `DASHBOARD_ROUTES`.

## 6. Routes

```ts
// app.routes.ts: 'dashboard' | 'topology' | 'alerts' → loadChildren(feature routes); telemetry/logs unchanged.
```

## 7. Test contracts (BDD → file)

| Criterion                                                                                       | Spec                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Health amber on latency; outage red+pulse+dim; click detail; keyboard select; defer placeholder | `features/topology/topology-map.spec.ts`                                                   |
| Engine tick fires/resolves via `tick(now)`; start/stop once; rules persist                      | `core/store/alert-engine.service.spec.ts`                                                  |
| Valid save + persist; invalid disabled + errors; toggle; remove                                 | `features/alerts/rule-builder.spec.ts`                                                     |
| Firing/resolved rows, observed value, critical banner                                           | `features/alerts/incident-list.spec.ts`                                                    |
| Reorder updates + persists; hide reflows; reset restores; keyboard move; version-guard parse    | `features/dashboard/dashboard-grid.spec.ts` + `core/models/dashboard-layout.model.spec.ts` |
| E2E: DnD reorder + persist; alert create → fire on `latency-burst`; topology outage red         | `e2e/topology-alerts-dashboard.spec.ts`                                                    |
