# 003b — Topology, Alerts & Dashboard — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, alternatives, risks)
- [x] `design.md` (engine/map/builder/list/grid/routes/test contracts)
- [x] All items below green → mark done

## Implementation ✅ COMPLETE (2026-09-13)

- [x] `core/models/dashboard-layout.model.ts` (DEFAULT + parse + read)
- [x] `core/store/alert-engine.service.ts` (interval driver + rule persistence)
- [x] `core/store/core-store.service.ts` (`outageIds` + `healthNodes` pure computeds per arch §6)
- [x] `features/topology/topology-map.component.ts` + `routes.ts`
- [x] `features/alerts/rule-builder.component.ts` + `incident-list.component.ts` + `alerts-page.component.ts` + `routes.ts`
- [x] `features/dashboard/dashboard-grid.component.ts` + `routes.ts`
- [x] `app.routes.ts` repointed; `placeholder-pages.ts` removed

## Verification (TDD: specs first) ✅ COMPLETE

- [x] `dashboard-layout.model.spec.ts` (defaults, parse guard, version mismatch)
- [x] `alert-engine.service.spec.ts` (tick fire/resolve, start/stop, persist)
- [x] `topology-map.spec.ts` (health, outage, detail, keyboard, defer)
- [x] `rule-builder.spec.ts` (valid/invalid/toggle/remove/persist)
- [x] `incident-list.spec.ts` (firing/resolved/banner)
- [x] `alerts-page.spec.ts` (engine lifecycle, host render)
- [x] `dashboard-grid.spec.ts` (reorder/persist/hide/reset/keyboard)
- [x] `e2e/topology-alerts-dashboard.spec.ts` (DnD persist, alert fires, topology outage)
- [x] Gates: `tsc` clean · `eslint` clean · `vitest 84/84, 90.06% lines / 85.07% branches` · `ng build 82.6kB transfer` · zone-ban grep clean · Playwright 12/12

## Hard-won harness lessons (fed back into specs)

- Zoneless `fixture.detectChanges()` required after signal mutations before DOM + persist-effect assertions settle (dashboard-grid spec `settle()` helper).
- `aria-label="... {{...}}"` interpolation trips NG0303 in tests — use `[attr.aria-label]` bindings.
- E2E: poll DOM reads after reset clicks (CD race); keyboard fallback drives strict reorder, pointer `dragTo` exercises the drop path with a storage-consistency assertion.

## Phase 3 + Phase 4

- [x] All green → Phase 3 and Phase 4 complete
