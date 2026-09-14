# 010 — Angular 22.1 Audit Remediation — Proposal

> Delta: `changes/010-angular22-audit-remediation` | Depends on: 009 | Status: Approved for build
> Date: 2026-09-14

## 1. Context

`npm audit` reports **35 vulnerabilities (2 low, 17 moderate, 15 high, 1 critical)** on the
Angular 19.2 baseline (`@angular/* 19.2.25`, CLI/build `19.2.27`, Vitest `3.2.7`, Vite `6.4.x`).

- Angular runtime: 7 GHSA across `common` (formatDate OOM DoS `GHSA-48r7-hpm6-gfxm`,
  HttpTransferCache `GHSA-39pv-4j6c-2g6v` / `GHSA-jhpw-976m-542j` / `GHSA-p297-fm68-3q8c`),
  `compiler`/`core` (XSS `GHSA-58w9-8g37-x9v5`, i18n event-handler `GHSA-jj27-h5hq-8x99`,
  host-binding sanitizer bypass `GHSA-hh8m-fm6v-7cvg`, hydration clobbering `GHSA-rgjc-h3x7-9mwg`).
  The 19.x line ends at `19.2.25` and is **EOL / will not be patched** — upgrade is mandatory.
- Toolchain transitives via `@angular/build` / `build-angular` / `cli`: `@babel/core`,
  `esbuild 0.28.0`, `vite <=6.4.2`, `piscina`, `postcss 8.5.12`, `http-proxy-middleware`,
  `image-size`/`less`, `serialize-javascript`, `uuid`/`sockjs`, all fixed by moving to a
  patched build train.
- Supply chain via `cli → pacote`: `tar <=7.5.20` (**critical**, 12 GHSA) + `sigstore`,
  fixed by `cli@22.1.8` (`pacote 21.5.x`).
- Test: `vitest 3.2.7` via `@vitest/mocker` (`GHSA-82fw-gwwq-j7x9`) needs `>=4.1.11`.
- Trivial: `qs 6.15.3` via `express` (fixable with plain `npm audit fix`), direct
  `postcss ^8.5.6` resolving to vulnerable `8.5.12`.

Blind `npm audit fix --force` would mix `22.1.6` + `21.2.24` + `22.1.8` majors and leave
TS 5.7 / AnalogJS 1.x / eslint 19 broken. A coordinated major is required.

## 2. Scope

**In:**

- Coordinated upgrade to **Angular `22.1.x`** (`core/build 22.1.6`, `cli 22.1.8`),
  `TypeScript 6.0.3` (satisfies `>=6.0 <6.1` peer; NOT TS 7), `@analogjs/* 2.7.2`,
  `angular-eslint 22.x`, `vitest` + `@vitest/coverage-v8` `4.1.11`, `vite 8`,
  `postcss ^8.5.28`, `qs 6.16.0+` transitive.
- Migrate zoneless provider if v22 renames `provideExperimentalZonelessChangeDetection`,
  fix TS 6.0 strict errors, adapt Vitest 4 / AnalogJS 2 harness deltas.
- Full verify: `lint → typecheck → vitest --coverage → build → e2e → audit`.

**Out:** feature changes, store/ingestion redesign, styling overhaul, light mode,
constitution rule changes (stack stays `Angular 19+`, zoneless, standalone OnPush,
native control flow, budgets untouched).

## 3. Alternatives

| Option                                | Verdict                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Angular 22.1 latest (chosen per user) | Approved: closes all runtime CVEs, longest runway, matches audit suggestion. Highest churn, accepted. |
| Angular 20.3 LTS minimal (`20.3.28+`) | Rejected per user choice: smaller churn but shorter support window.                                   |
| Angular 21.2 LTS                      | Rejected per user choice.                                                                             |
| `npm audit fix --force` blind         | Rejected: mixed majors, broken peers, untested.                                                       |
| Vitest as follow-up delta             | Rejected per user choice: same-change to close GHSA-82fw now.                                         |

## 4. Risks & mitigations

- `ng update` schematic drift (configs, `target`/`module`, polyfills) → review every
  schematic diff, keep `zone.js` ban + `strict`/`noUncheckedIndexedAccess`/`strictTemplates`.
- TS 5.7 → 6.0 strict errors in `core/models` + store selectors → fix before tests.
- AnalogJS 1→2 + Vite 6→8 + Vitest 3→4 triple-major in test harness (`vitest.config.ts`,
  `test-setup.ts`/`test-helpers.ts` side-effect import, single-fork pool) → pin `4.1.11`
  (not `5.0.0`), keep fork settings until proven.
- uPlot directive + CDK VirtualScroll + Tailwind v4 + budgets (500kB/1MB, 4kB/8kB) →
  verify `ng build` budgets explicitly.
- E2E hermetic seam (`liveUrl` dead-port + `scenario=`) must survive dev-server change.

## 5. Exit criteria

`eslint` clean · `tsc` clean · Vitest all-green ≥80%×4 gate · `ng build` passes budgets ·
Playwright green · `npm audit` 0 high/critical (residuals ticketed) · `tasks.md` all `[x]` ·
zone-ban grep clean.
