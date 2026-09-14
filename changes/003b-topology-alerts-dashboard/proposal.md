# 003b — Topology, Alerts & Dashboard — Proposal

> Delta: `changes/003b-topology-alerts-dashboard` | Depends on: 001 (contracts), 003a (telemetry/logs views) | Status: Approved for build
> Date: 2026-09-13 | Skills: `create-zoneless-component`, `generate-bdd-spec`

## 1. Context

Phase 2 delivered ingestion (`BinanceWsService`, `StochasticSimService`, `TelemetryIngestionService`), `CoreStore` signals (metrics, logs, nodes, rules, incidents + `tickAlerts`/`refreshNodeHealth`), and `StatusBannerComponent`. Delta 003a replaced telemetry + logs placeholders with real zoneless views (uPlot + rAF, CDK VirtualScroll). `dashboard`, `topology`, and `alerts` routes still point at `features/placeholder-pages.ts`.

## 2. Motivation

Complete the Phase 3 view layer: prove health derivation reacts to streams within 1s, alert rules fire deterministically on sustained breaches, and dashboard layout persists — the three remaining user-facing risks before Phase 4 hardening.

## 3. Scope

**In:**

- `TopologyMapComponent` (SVG 800×500, 10 seeded nodes, computed health, click detail, `@defer`, keyboard nav).
- `AlertEngineService` (`core/store/`, RxJS `interval(1000)` → `store.tickAlerts()`, `localStorage` rule persistence).
- `RuleBuilderComponent` (Reactive Forms CRUD) + `IncidentListComponent` + `AlertsPageComponent` host.
- `DashboardGridComponent` (CDK DragDrop, `linkedSignal` + `effect` persist `pg.dashboard.layout.v1`, `@defer` per widget, keyboard fallback).
- `core/models/dashboard-layout.model.ts` (only new domain type; `ServiceNode`/`AlertRule`/`AlertIncident`/`HealthState` reused frozen).
- Vitest BDD specs per `specs/modules/*.spec.md` + Playwright `e2e/topology-alerts-dashboard.spec.ts`.
- `app.routes.ts` repointed to lazy feature routes; `placeholder-pages.ts` removed.

**Out:** K8s auto-discovery, force-graph auto-layout, Slack/PagerDuty webhooks, alert silencing windows, multi-dashboard sharing, CSV export.

## 4. Alternatives

| Option                                                | Verdict                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Canvas force-graph for topology                       | Rejected: ≤50 SVG nodes per NFR-P1, no perf need.                                  |
| `setInterval` in components for alert tick            | Rejected by constitution §4 / arch §4.7; timers live in services only.             |
| `BehaviorSubject` for dashboard layout / filter state | Rejected by constitution §3.2; `signal`/`linkedSignal` only.                       |
| Cross-feature component imports in dashboard widgets  | Rejected by arch rules; dashboard renders compact summaries from `CoreStore` only. |

## 5. Risks & mitigations

- CDK DragDrop + zoneless: DnD uses native pointer events; state mutations are signals → no zone dependency. E2E uses keyboard fallback buttons (deterministic) + pointer drag assertion.
- `interval(1000)` flakiness in specs → specs call `engine.tick(now)` / `store.tickAlerts(now)` directly with fixed `now`; fake timers only where the subscription itself is asserted.
- `localStorage` blocked → all readers wrapped in try/catch with in-memory default (same pattern as `pg.telemetry.window`).
- `@defer (on viewport)` stays placeholder in jsdom (no IntersectionObserver) → specs assert component state + placeholder presence, E2E asserts real render.

## 6. Exit criteria

`tsc` clean · `eslint` clean · Vitest all-green with coverage ≥80% lines+branches+functions+statements · `ng build` passes · zone-ban grep clean · `tasks.md` 003b items `[x]`.
