# PulseGrid APM — Agent Instructions

Angular 19 zoneless standalone app (Signals + RxJS). Single project `pulsegrid-apm`; entry `src/main.ts` → `app.config.ts` → `app.routes.ts`.

## Commands (exact)

- `npm ci` (CI uses Node 22), `npm run start` (dev, :4200), `npm run build` (budgets: 500kB warn / 1MB err initial; 4kB/8kB component style)
- Verify order (mirrors CI `verify` job): `npm run lint` → `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) → `npm run test -- --run --coverage` → `npm run build`; then `npm run e2e`
- Single unit test: `npx vitest run src/app/<path>/<name>.spec.ts` (include is `src/**/*.spec.ts` only; `e2e/**` excluded)
- Single E2E: `npx playwright test e2e/<name>.spec.ts` (baseURL `:4200`; config auto-starts `ng serve`, reuses server locally)
- `README.md` is stale (says Karma/`ng test`/`ng e2e`) — ignore; use the vitest/playwright scripts above

## Non-negotiables (`specs/constitution.md`)

- Zoneless: `provideExperimentalZonelessChangeDetection()`; `zone.js` forbidden in `package.json`, `angular.json:polyfills`, and any `src/` import (CI greps for it). No `NgZone.run()` / `ApplicationRef.tick()` hacks.
- Strict TS: `strict`, `noUncheckedIndexedAccess`, `strictTemplates`; `no-explicit-any: error`. Explicit return types on public service/store/component APIs.
- Standalone `OnPush` only; native control flow `@if`/`@for (track id)`/`@switch` (`*ngIf/*ngFor` banned); `@defer (on viewport)` for below-fold widgets; template a11y rules enforced. Prettier: singleQuote, printWidth 100.

## Architecture (`specs/system-architecture.md`)

- `src/app/core/` (models, `services/` ingestion, `store/`, `utils/`) has NO component deps. `features/<name>/` each owns `routes.ts`, lazy-loaded via `loadComponent`/`loadChildren`. Never import cross-feature — share via `CoreStore`. No barrel exports.
- Reactivity split: RxJS only in ingestion services (`WebSocketSubject`, `interval`, `sampleTime`/`auditTime`/`throttleTime`, `retry`/`catchError` → sim fallback); UI reads `signal`/`computed` from `CoreStore` (sole RxJS→signals bridge via `bindIngestion()`); `toSignal`/`toObservable` only at store boundary. Components never `subscribe()`; no `BehaviorSubject` for filter state; `effect()` for side-effects only; no `setInterval` in components.
- Budgets: store commits ≤10Hz (`sampleTime(100)`), chart paints ≤60fps (`auditTime(16)` + rAF); `RingBuffer` 300/series, `MAX_METRICS` 1200, `MAX_LOGS` 5000; logs via CDK VirtualScroll; chart lib is uPlot (~40kB) — alternatives need a `changes/` amendment. Metric views MUST keep the `derived from market stream` footnote (Binance data is synthetically mapped, not real infra).

## Testing quirks (will bite you)

- Component specs MUST `import '../../test-helpers'` (relative path) for its side-effect — `setupFiles: ['src/test-setup.ts']` alone does not execute in this Vitest runner (verified 2026-09-13). Helper is idempotent; single-fork pool tears down TestBed per file (NG0400) — don't remove the `afterAll`.
- TestBed harness: `BrowserTestingModule`/`platformBrowserTesting` + `provideExperimentalZonelessChangeDetection()` per module; never import `zone.js`. Test-host state MUST be signals (`.set()`) — mutating a plain field then `fixture.detectChanges()` throws NG0100.
- Deterministic streams: seeded PRNG `createState(<seed>)`, fixed `now`, open/`BehaviorSubject` streams for `sampleTime` tests (never bare `of()`), fake timers for timing.
- Gate: ≥80% lines+branches+functions+statements over `src/app/**/*.ts` (excludes `*.spec.ts`, `main.ts`, `test-setup.ts`, `*.routes.ts`). BDD: every `specs/modules/*.spec.md` criterion maps to ≥1 test named `GIVEN/WHEN/THEN`. No `describe.skip` without a linked ticket.

## E2E hermetic seam (`app.component.ts`)

- Never hit live Binance WS in CI. Force sim fallback + fault injection via query params: `/logs?liveUrl=ws://127.0.0.1:9/dead&scenario=outage` (scenarios: `normal|cpu-spike|memory-leak|outage|latency-burst`). Generic specs must tolerate LIVE or SIMULATED banner.

## Workflow

- SDD: no `src/` code without approved spec + delta `changes/<nnn>-<slug>/{proposal,design,tasks}.md`; interface changes update `design.md` first; `tasks.md` order is truth, check `[x]` only when tests pass. Amend constitution only via `changes/<nnn>-amend-constitution/`.
- Conventional Commits (`feat:|fix:|spec:|chore:`), PR title must follow. Pre-commit is `lint-staged` (prettier + `eslint --fix`).
- Subagents in `.opencode/agents/`: UI work → `ui-architect` (+ `create-zoneless-component` skill); tests → `qa-engineer` (+ `generate-bdd-spec`, `vitest` skills); charts/streams/perf → `performance-engineer` (+ `create-canvas-directive` skill).
