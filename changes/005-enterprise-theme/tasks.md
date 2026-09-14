# 005 — Enterprise Dark-Theme Visual Upgrade — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md`
- [x] `design.md`

## Implementation

- [x] Global tokens + keyframes in `src/styles.css`
- [x] `app.component.ts` header: glassmorphism, brand glyph, `app-connection-pulse` status dot
- [x] New `shared/ui/connection-pulse/connection-pulse.component.ts`
- [x] `StatusBannerComponent` translucent fills
- [x] Dashboard grid chrome + 4 widget styling upgrades
- [x] Telemetry page styling
- [x] Logs page styling
- [x] Topology page styling
- [x] Alerts page / rule-builder / incident-list styling
- [x] `MetricChartDirective` live crosshair

## Verification

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npm run test -- --run --coverage` 95/95, ≥80% gates
- [x] `npm run build` passes (watch component-style budget)
- [x] `npm run e2e` 12/12
- [x] All green → mark done
