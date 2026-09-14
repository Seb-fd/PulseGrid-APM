# 010 — Angular 22.1 Audit Remediation — Tasks

> Check `[x]` only when tests pass. Order enforced top-to-bottom.

## SDD

- [x] `proposal.md` (scope, alternatives, risks)
- [x] `design.md` (pin table, source/test/verification contracts)

## Phase 1 — Non-breaking quick wins

- [x] `npm audit fix` (qs) → no-op (pinned via `webpack-dev-server→express`; needs major)
- [x] `postcss ^8.5.6 → ^8.5.28`, reinstall → root tree deduped to 8.5.28; nested
      `build-angular/node_modules/postcss` remains (needs major, verified via audit nodes)

## Phase 2 — Coordinated Angular 22.1 major

- [x] `ng update` CLI/core/build to 22.1.6/22.1.8 + CDK + eslint 22 (review schematic diffs)
      → installed tree verified: core/build 22.1.6, CLI 22.1.8, CDK 22.1.6,
      angular-eslint 22.5.0, Node 22.23.2 satisfies ng22 engines
- [x] Pin TS 6.0.3 + AnalogJS 2.7.2 + Vitest 4.1.11 + Vite 8, reinstall
      → TS 6.0.3, `@analogjs/*` 2.7.2, vitest + coverage-v8 4.1.11,
      vite 8.3.0 direct / 8.1.5 via `@angular/build`, postcss 8.5.28 root
- [x] Fix TS 6.0 strict errors + zoneless provider if renamed
      → v22 removed `provideExperimentalZonelessChangeDetection()` (stable
      `provideZonelessChangeDetection()` only): renamed in `app.config.ts`,
      all `*.spec.ts`, `test-setup.ts` comment. App `tsc` clean, no other
      TS 6.0 strict fallout in `src/app`.
      → angular-eslint 22 `prefer-inject` fires on the two ingestion services;
      kept constructor injection (specs construct via `new` with deterministic
      fakes) with file-level disable + justification.
      → `flushEffects()` deprecated → `TestBed.tick()` in all specs.

## Phase 3 — Harness alignment

- [x] `vitest.config.ts` / `test-setup.ts` / `test-helpers.ts` AnalogJS-2/Vitest-4 deltas
      → config already matches design (AnalogJS 2 plugin, singleFork, 80%×4).
      Vitest 4 now executes `setupFiles`, so `test-helpers.ts` double-init
      guard also swallows Angular 22's "already been called" message
      (was only "twice"). Side-effect import kept (harmless under both).
- [x] Fix failing unit/component specs (signals, timers, streams)
      → 29 files / 211 tests green. Backfilled 5 branch tests to hold the gate:
      `isTelemetryMetric` guard (was 0%) in `models.spec.ts`,
      `resolveThresholds` salvage/beyond-repair fallbacks in
      `metric-thresholds.spec.ts`. Branches 78.4% → 81.9%.

## Verification (all green required)

- [x] `npm run lint` clean (exit 0; only node ESM-config warning, pre-existing)
- [x] `npm run typecheck` clean
- [x] `npx vitest run --coverage` all-green ≥80%×4
      → 29 files / 211 tests pass; Stmts 89.77 / Branches 81.9 / Funcs 89.77 /
      Lines 91.03
- [x] `npm run build` passes budgets → initial 373.18 kB (< 500 kB warn)
- [x] `npx playwright test` green → 27 passed incl. dead-port SIMULATED
      fallback + LIVE/SIMULATED banner tolerance
- [x] `npm audit` 0 high/critical (+ `npm ls` spot checks)
      → 35 (15 high + 1 critical) → 8 moderate, all dev-server-only:
      `uuid<11.1.1` via `sockjs→webpack-dev-server` (no fix available
      upstream) and `qs@6.14.2` nested under `express@4.22.1` (`audit fix`
      no-op, exact pin). Follow-up tickets: uuid needs
      webpack-dev-server/sockjs upstream release; qs needs express 4.x repin
      or webpack-dev-server major.
- [x] zone-ban grep clean (no `zone.js` import / `NgZone.run`, not installed,
      `polyfills: []`)

## Residual notes (non-blocking)

- `binance-ws.service.ts` stays in-repo deprecated per delta 008; Vitest 4
  coverage logs a rolldown parse complaint on its inline-`type` import and
  excludes it — cosmetic only, tests/build unaffected. Do not "fix" without
  also excluding it from coverage (it has no spec by design).
- Vitest 4 prints a `pool-rework` migration warning for the `pool: 'forks'`
  config; singleFork behavior verified (platform init/destroy per file).
- Constitution §1.1 + `specs/system-architecture.md` + skill docs still name
  the experimental zoneless token — needs a `changes/<nnn>-amend-constitution/`
  follow-up (out of scope for this delta per §9).
