# 008 — Live Wikimedia Telemetry — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, §6 amendment note, alternatives, risks)
- [x] `design.md` (event/metric/log/stream/ingestion/UI/test contracts)

## Implementation

- [x] `wikimedia-adapter.ts` (URL consts, type, normalize, metric + log adapters)
- [x] `wikimedia-stream.service.ts` (WS primary + SSE fallback, watchdog, backoff, 1s batching, shared cache)
- [x] Rewire `telemetry-ingestion.service.ts` to Wikimedia default (sim fallback kept)
- [x] Extend `log-ingestion.service.ts` with live Wikimedia logs (sim path + health tick kept)
- [x] Update `app.component.ts` default URL (seam kept) + footer footnote
- [x] Update `status-banner.component.ts` LIVE label
- [x] Update `dashboard-grid.component.ts` overview live-status line + footnote
- [x] Update `telemetry-page.component.ts` footnote

## Tests

- [x] `wikimedia-adapter.spec.ts` (normalize, metrics, logs, determinism)
- [x] `wikimedia-stream.service.spec.ts` (batching, SSE fallback, dual-failure)
- [x] Update `telemetry-ingestion.spec.ts` (Wikimedia live + sim fallback + retry)
- [x] Update `log-ingestion.service.spec.ts` (live logs + existing sim/health tests)
- [x] Update `app.component.spec.ts` (Wikimedia default URL)
- [x] Update `status-banner.spec.ts` (Wikimedia live label)
- [x] Update `dashboard-grid.spec.ts` (live-status line states)
- [x] `e2e/wikimedia-live.spec.ts` (mock WS live + dead-port fallback)
- [x] Update `e2e/telemetry-logs.spec.ts` footnote wording

## Verification (2026-09-14, all green)

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npx vitest run --coverage` all-green (≥80% lines+branches+functions+statements)
- [x] `npm run build` passes budgets
- [x] `npx playwright test` green (incl. new `wikimedia-live.spec.ts`)
- [x] zone-ban grep clean (no `zone.js` imports, no `NgZone` usage)
- [x] All green → mark done
