# 007 — Chart Hover Isolation + Dashboard Overview — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, alternatives, risks)
- [x] `design.md` (cursor contract, overview banner contract, test contracts)

## Implementation ✅ COMPLETE (2026-09-14)

- [x] Remove `sync: { key: 'pulsegrid' }` from `darkOptions()` in `metric-chart.directive.ts` (+ Delta 007 comment)
- [x] Add cursor-isolation regression spec in `metric-chart.directive.spec.ts`
- [x] Add overview storage helpers + `showOverview` signal + dismiss/restore in `dashboard-grid.component.ts`
- [x] Render `dashboard-overview` banner + legend + thresholds + `overview-show` restore (grid top, outside `@defer`)
- [x] Extend `dashboard-grid.spec.ts` (default visible, dismiss/persist, reload hidden, restore, a11y names)
- [x] Add `e2e/dashboard-overview.spec.ts` (dismiss → reload → restore)
- [x] Tighten `e2e/app.spec.ts` shell heading locator (`exact: true`; banner text tripped the loose matcher)

## Verification ✅ COMPLETE

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npx vitest run --coverage` all-green 174/174 (27 files), 92.12% lines / 87.53% branches (≥80% gate)
- [x] `npm run build` passes (initial 336.74 kB / 87.64 kB transfer; budgets intact)
- [x] `npx playwright test` 18/18 green (incl. new `dashboard-overview.spec.ts`)
- [x] zone-ban grep clean (no `zone.js` imports, no `NgZone` usage)
- [x] All green → mark done
