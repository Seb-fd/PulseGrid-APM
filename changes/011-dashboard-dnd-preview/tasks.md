# 011 — Dashboard DnD Preview & Centroid Snapping — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, alternatives, risks)
- [x] `design.md` (helper contract, component delta, test contracts)
- [ ] All items below green → mark done

## Implementation ✅ COMPLETE (2026-09-14)

- [x] `core/utils/dashboard-drop.util.ts` (centroid + clamp + hysteresis resolver + constants)
- [x] `core/utils/dashboard-drop.util.spec.ts` (center/clamp/hysteresis/throttle-constant BDD)
- [x] `features/dashboard/dashboard-grid.component.ts` (signals, moved/started/released handlers, placeholder, styles)
- [x] `features/dashboard/dashboard-grid.spec.ts` (preview signals, ghost DOM, throttle, drop-clears)

## Verification ✅ COMPLETE

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npm run test -- --run` green (232/232, 90.39% lines / 82.15% branches)
- [x] `npm run build` passes (96.84 kB transfer)
