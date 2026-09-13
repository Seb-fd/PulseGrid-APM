# 006 — UI/UX Redesign & Systemization — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md`
- [x] `design.md`

## Implementation

- [x] Phase 1: tokens + fonts (`src/styles.css`, `src/index.html`)
- [x] Phase 2: type scale (`page-header`, dashboard header, card titles)
- [x] Phase 3: chromium (cards/wells/buttons/forms/toggle/inline-SVG icons, semantics, directive font)
- [x] Phase 4a: dashboard uniform `h-[200px]` + de-nested borders
- [x] Phase 4b: telemetry `h-[200px]` + window buttons
- [x] Phase 4c: logs flex-fill viewport + column headers
- [x] Phase 4d: topology `slice` + labels + sticky detail
- [x] Phase 4e: alerts grid rebalance + Save primary

## Verification

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npm run test -- --run --coverage` green, >=80% gates
- [x] `npm run build` passes
- [ ] `npm run e2e` smoke passes
