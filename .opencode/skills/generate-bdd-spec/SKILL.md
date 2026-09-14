---
name: generate-bdd-spec
description: Generate Vitest unit/component specs from BDD GIVEN-WHEN-THEN scenarios in specs/modules/*.spec.md plus Playwright E2E flows. Use when writing tests, mapping acceptance criteria to test cases, backfilling coverage toward the 80% gate, or scaffolding e2e/*.spec.ts flows.
---

# Generate BDD Spec (PulseGrid APM)

Every `specs/modules/*.spec.md` acceptance criterion maps to ≥1 test (constitution §7). Test names ARE the scenario sentences.

## Vitest unit/component specs (`src/**/*.spec.ts`)

1. One `describe('GIVEN <context>')` per scenario context; one `it('WHEN <action> THEN <outcome>')` per criterion.
2. Pure logic (adapters, `RingBuffer`, `matchesLogFilter`, `evaluateRule`, `CoreStore.tickAlerts`) is tested WITHOUT `TestBed` — instantiate directly with deterministic seeds (`createState(11)`, fixed `now`).
3. Component specs use the zoneless harness ONLY:
   ```ts
   TestBed.configureTestingModule({ providers: [provideExperimentalZonelessChangeDetection()] });
   ```
   Never import `zone.js` or `@analogjs/vitest-angular/setup-zone`. Import
   `src/test-helpers` for its side-effect (platform init + jsdom stubs).
   Test-host state MUST be signals — mutating plain host fields between
   `detectChanges()` throws NG0100 (zoneless tick honors dirtiness). Assert
   effect side-effects (e.g. `localStorage` writes) after a `detectChanges()`
   on the CD pipeline, not after `TestBed.flushEffects()` alone.
4. RxJS timing: `sampleTime`/`auditTime` need real timers or `vi.useFakeTimers`; a synchronously-completing `of()` emits NOTHING through `sampleTime` — use `BehaviorSubject` or `repeat()` sources that stay open.
5. Cover: fallback transitions (`live → simulated`), caps (`MAX_METRICS`/`MAX_LOGS`), sustained-vs-transient alert semantics, empty-window no-fire, single-incident-per-breach, resolve-on-recovery.
6. Keep the 80% lines+branches gate green: check `npm run test -- --run --coverage` output per touched area; backfill the cheapest missing-branch tests first.

## Playwright E2E (`e2e/*.spec.ts`)

1. Flows required by specs: dashboard DnD reorder + `localStorage` persist + reload restore; log level filter narrows rows; sim spike fires an alert incident.
2. NEVER hit the live Binance WS in CI — mock the socket (route fulfill / fake WS server / `simulated` banner path).
3. Selectors: `role=status` banner, `data-status` attribute, semantic headings — no brittle CSS chains.
4. `webServer` reuses `npm run start -- --port 4200`; keep specs independent and retry-safe (`forbidOnly` in CI).

## Workflow per feature

1. Read the feature's `specs/modules/<name>.spec.md` + relevant `CoreStore` selectors.
2. Emit the spec file(s) FIRST (TDD), watch them fail.
3. Implement until green, then run the gates: `npm run typecheck`, `npm run lint`, `npm run test -- --run --coverage`, `npm run build`.
