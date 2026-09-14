# 010 — Angular 22.1 Audit Remediation — Design

> Frozen contracts for delta 010. No domain-type changes. No constitution changes
> (stack `Angular 19+` already covers 22; zoneless/standalone/OnPush/control-flow/budgets unchanged).

## 1. Version pin contract (`package.json`)

```jsonc
// dependencies — all @angular/* move together
"@angular/cdk": "^22.1.0", // latest 22.1.x matching core
"@angular/common": "22.1.6",
"@angular/compiler": "22.1.6",
"@angular/core": "22.1.6",
"@angular/forms": "22.1.6",
"@angular/platform-browser": "22.1.6",
"@angular/router": "22.1.6",
"rxjs": "~7.8.0", // re-validate; do NOT take 8-alpha/9-beta
"tslib": "^2.8.0",
"uplot": "^1.6.32",
// devDependencies
"@angular-devkit/build-angular": "22.1.6",
"@angular/cli": "22.1.8",
"@angular/compiler-cli": "22.1.6",
"@analogjs/vite-plugin-angular": "^2.7.2", // 1.x peer caps at ng20 → must move
"@analogjs/vitest-angular": "^2.7.2",
"@angular-eslint/* + angular-eslint": "^22.x", // all 19.x entries move together
"typescript": "6.0.3", // peer >=6.0 <6.1; NEVER 7.x
"vitest": "4.1.11", // minimal patched (>=4.1.11), NOT 5.0.0 pre-release line
"@vitest/coverage-v8": "4.1.11",
"postcss": "^8.5.28",
"vite": "^8.1.5" // or drop direct dep and inherit from @angular/build 8.1.5
```

Transitive expectations after install: `vite 8.1.5` (fixes `<=6.4.2`), `esbuild 0.28.2`
(fixes `0.27.3-0.28.0`), `piscina 5.2.0` (fixes `<=4.9.2`), `@babel/core 8.0.1`
(fixes `<=7.29.0`), `postcss >=8.5.23`, `qs 6.16.0+`, `tar >7.5.20` via `pacote 21.5.x`,
`@sigstore/*` patched.

## 2. Source contracts

- `src/app/app.config.ts`: keep `provideExperimentalZonelessChangeDetection()` if still
  exported in 22.1, else adopt the v22-canonical zoneless provider with identical
  semantics. No `zone.js`, no `NgZone.run()` / `ApplicationRef.tick()`.
- Reactivity split unchanged: RxJS only in ingestion (`sampleTime(100)`, `auditTime(16)`),
  UI reads store signals, `toSignal`/`toObservable` only at `CoreStore` boundary,
  components never `subscribe()`, `effect()` for side-effects only.
- Rendering: standalone `OnPush`, `@if`/`@for (track id)`/`@switch`, `@defer (on viewport)`
  below fold, uPlot directive outside change detection + rAF batching, CDK VirtualScroll
  for logs, `derived from market stream` footnote kept.
- `angular.json` budgets unchanged (`initial 500kB warn / 1MB err`, component style
  `4kB/8kB`); `polyfills` stays zone-free.
- `tsconfig`: keep `strict`, `noUncheckedIndexedAccess`, `strictTemplates`,
  `no-explicit-any: error`. Accept schematic `target`/`module` bumps only.

## 3. Test contracts

- `vitest.config.ts`: AnalogJS 2.x plugin (`tsconfig: tsconfig.spec.json` in test mode),
  `jsdom`, `setupFiles: ['src/test-setup.ts']`, `include: ['src/**/*.spec.ts']`,
  coverage `src/app/**/*.ts` thresholds 80%×4, `pool: forks singleFork` until proven.
- Component specs keep `import '../../test-helpers'` side-effect (quirks doc) +
  `BrowserTestingModule`/`platformBrowserTesting` + zoneless provider, signal-based
  test-host state (no plain-field mutation → `detectChanges()` NG0100).
- Deterministic streams: seeded PRNG, fixed `now`, open/`BehaviorSubject` streams for
  `sampleTime` tests, fake timers.
- E2E hermetic seam unchanged: `liveUrl=ws://127.0.0.1:9/dead&scenario=` + banner
  `LIVE | SIMULATED | RECONNECTING` tolerance.

## 4. Verification contract

Order: `npm run lint` → `npm run typecheck` → `npm run test -- --run --coverage`
(≥80% lines+branches+functions+statements) → `npm run build` (budgets) → `npm run e2e` →
`npm audit` (0 high/critical) + `npm ls <fixed>` spot checks + zone-ban grep.
