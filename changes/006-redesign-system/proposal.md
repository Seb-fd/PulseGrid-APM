# 006 — UI/UX Redesign & Systemization — Proposal

> Delta: `changes/006-redesign-system` | Depends on: 005 (enterprise theme) | Status: Approved for build
> Date: 2026-09-13

## 1. Context

Audit of the rendered app found a "dark gray soup": three competing near-blacks
(`#090e1a` body vs `#020617` slate-950 vs `#0f172a` slate-900 with alpha stacking),
one card recipe copy-pasted 9x with `backdrop-blur-md` on opaque surfaces, a single
cyan accent used for everything, system-fallback typography (Inter/JetBrains Mono
referenced but never loaded), magic-number layout (`h-44` vs `h-[180px]` vs
`h-[calc(100vh-280px)]`), and Unicode glyph icons.

## 2. Motivation

Transform the prototype into a high-density enterprise observability UI
(Linear/Vercel dark aesthetics) with clear hierarchy, without changing behavior,
reactive streams, or breaking tests.

## 3. Scope

**In:**

- Global tokens in `src/styles.css` (`--color-root/surface/well/line/accent`,
  Inter + JetBrains Mono stacks, font-smoothing).
- Fonts via `<link>` + preconnect in `src/index.html` (not render-blocking `@import`).
- Systemized card/well/button/form/badge/icon contracts across shell + 5 pages.
- Dashboard uniform `h-[200px]` chart wells, de-nested borders, inline-SVG icons.
- Logs flex-fill viewport `h-[calc(100vh-140px)]` + column headers.
- Topology `preserveAspectRatio="xMidYMid slice"` + legible labels + sticky detail.
- Alerts grid rebalance + primary Save hierarchy + visible toggle states.
- `HEALTH_FILL` + log INFO standardization to emerald/amber/red/blue semantics.
- `MetricChartDirective` axis font 10px Inter -> 11px JetBrains Mono.

**Out:** new dependencies (no lucide-angular), light mode, chart lib swap,
ingestion/store logic changes, coverage-gate changes.

## 4. Alternatives

| Option                           | Verdict                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `@import` fonts in CSS           | Rejected: render-blocking, fails hermetic CI. Use `<link>`. |
| `lucide-angular` dep             | Rejected: +50-100kB vs 500kB warn budget. Use inline SVGs.  |
| Arbitrary `bg-[#...]` everywhere | Rejected: use `@theme` tokens so future pages inherit.      |
| Direct `src/` edits, no delta    | Rejected: violates constitution 9.1 SDD gate.               |

## 5. Risks & mitigations

- Class churn breaks E2E selectors -> preserve all `data-testid`/ARIA/`formControlName`/`@defer` boundaries (verified: no spec asserts on visual classes).
- `slice` crops SVG edges -> curated node positions have padding; verified in design.
- Component-style 8kB budget -> shared tokens in global CSS, no per-component style growth.
- Font load fails offline -> system fallbacks preserved in stacks.

## 6. Exit criteria

`npm run lint` clean, `npm run typecheck` clean,
`npm run test -- --run --coverage` green with >=80% gates,
`npm run build` passes, `npm run e2e` smoke passes, `tasks.md` checked in order.
