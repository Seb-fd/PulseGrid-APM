# 009 — Compact Status Pill — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, alternatives, risks)
- [x] `design.md` (pill/header/overview/test contracts)

## Implementation

- [x] `status-banner.component.ts` (inline pill, pulsing dot, responsive labels, title/aria-label)
- [x] `app.component.ts` (remove pulse + block bar, embed pill in header)

## Tests

- [x] Update `status-banner.spec.ts` (compact labels, title/aria-label, retry, pill classes)
- [x] Update `e2e/wikimedia-live.spec.ts` (pill selectors + mobile 375px test)
- [x] Update `e2e/app.spec.ts` (header pill scope)

## Verification (2026-09-14, all green)

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npx vitest run --coverage` all-green (199 tests, 91.21% stmts / 87.77% branch / 91.62% funcs)
- [x] `npm run build` passes budgets (initial 339.74 kB < 500 kB warn)
- [x] `npx playwright test` green (22/22, incl. new mobile pill test)
- [x] zone-ban grep clean (comments-only mentions, no imports/usage)
- [x] All green → mark done
