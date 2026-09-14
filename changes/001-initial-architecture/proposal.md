# 001 — Initial Architecture — Proposal

> Delta: `changes/001-initial-architecture` | Type: foundation scaffold + ingestion core
> Author: Principal Frontend Architect | Date: 2026-09-13 | Status: Approved for build

## 1. Technical Context

Greenfield repo (only `.git/`). Target: Angular 19+ SaaS-like observability dashboard showcasing zoneless signals + RxJS mastery. No `src/` exists; SDD Phase 1 specs are now ratified in `specs/`.

Locked decisions (user 2026-09-12):

1. Standalone + `provideExperimentalZonelessChangeDetection()`, `zone.js` omitted.
2. Binance `!miniTicker@arr` primary + stochastic sim + auto-fallback banner.
3. Canvas charts (uPlot preferred) + `requestAnimationFrame`; CDK VirtualScroll for logs.
4. Vitest ≥80% lines+branches; Playwright E2E (DnD, log filter, alert trigger).

## 2. Motivation

- Prove 60 FPS zoneless rendering under high-frequency WS load without `zone.js`.
- Enforce clean reactivity split (RxJS ingestion / Signals UI) from day one to avoid retrofit.
- SDD traceability gives portfolio-grade rigor: every UI behavior maps to GIVEN-WHEN-THEN → test.

## 3. Scope Breakdown

**In scope (this delta):**

- Angular 19 scaffold (standalone, zoneless, Tailwind v4, CDK, Vitest+Playwright configs, ESLint/Prettier/Husky/CI).
- `core/models` interfaces (frozen in `design.md`).
- Ingestion layer: Binance WS + sim + fallback + ring-buffer utils.
- `CoreStore` signals skeleton + status banner.
- Placeholder lazy routes for 5 features (real UI in 002+).

**Out of scope:**

- Full chart polish, topology auto-layout, notifications, backend persistence, OTel/Prometheus.

## 4. Alternatives Considered

| Option                                      | Verdict                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| OpenSky vs Binance                          | Binance chosen: higher throughput, no key, WS-friendly JSON array. OpenSky REST-polling rejected (rate limits, low frequency). |
| ECharts vs uPlot/Lightweight                | uPlot default (40kB, 60fps); ECharts allowed only if richness justifies bundle + passes `bundlesize` gate.                     |
| NgRx SignalStore vs hand-rolled `CoreStore` | Hand-rolled `signal` store Phase 1 (fewer deps, clearer teaching); migrate to SignalStore in 003 if boilerplate grows.         |
| Karma vs Vitest                             | Vitest (fast, coverage gates, modern).                                                                                         |

## 5. Risks & Mitigations

- Binance blocked in CI/sandbox → mock WS in all tests; live only in dev with banner.
- Chart bundle creep → CI `bundlesize` + `@defer` + lazy routes.
- Synthetic mapping misinterpreted as real infra → mandatory UI footnote + docs.

## 6. Exit Criteria

- `ng serve` boots zoneless with status banner; `vitest --coverage` ≥80%; `ng build` passes without `zone.js`.
