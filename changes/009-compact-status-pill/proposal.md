# 009 — Compact Status Pill — Proposal

> Delta: `changes/009-compact-status-pill` | Depends on: 008 (Wikimedia live status) | Status: Approved for build
> Date: 2026-09-14

## 1. Context

The connection status indicator (`app-status-banner`) renders as a full-width
block banner stretched across the entire viewport below the sticky header
(`app.component.ts`). It consumes a full row of vertical space, looks visually
intrusive next to the already-compact header, and overflows on mobile
viewports (< 768px) because the long label
(`Live Status: Connected to Wikimedia Global Event Stream`) never truncates.

The header already hosts a second status dot (`app-connection-pulse`), so the
current shell shows two adjacent status indicators with overlapping meaning.

## 2. Scope

**In:**

- Refactor `StatusBannerComponent` from a full-width block into a compact,
  responsive inline pill/badge (`inline-flex`, `rounded-full`, pulsing dot).
- Embed the pill inside the top navigation `<header>`, right after the
  `PulseGrid APM` title and before `<nav>` (always visible, no push-off).
- Remove `<app-connection-pulse/>` from the header; the pill owns the single
  pulsing dot (no double-dot).
- Responsive labels (CSS-only, no JS resize listener):
  - Desktop (`≥640px`, Tailwind `sm:`): `Live: Wikimedia EventStreams`
    (plus short simulated/reconnecting equivalents).
  - Mobile (`<640px`, Tailwind default): truncated status word only —
    `LIVE` / `SIMULATED` / `RECONNECTING` — with `title` + `aria-label`
    carrying the full string (`Connected to Wikimedia Global Event Stream`).
- Keep `role="status"` + `data-status` + `Retry Live` button contracts.
- Keep the detailed explanation inside the dashboard `What is PulseGrid APM?`
  overview banner (`dashboard-live-status` line) unchanged.
- Update unit (`status-banner.spec.ts`) and E2E (`wikimedia-live.spec.ts`,
  `app.spec.ts`) contracts + add a mobile-viewport pill test.

**Out:** store/ingestion changes, overview-banner copy changes, footer
footnote changes, nav restructuring, light mode, constitution amendment
(no rule changes — zoneless, strict TS, signals-UI split untouched).

## 3. Alternatives

| Option                                                   | Verdict                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| Pill next to logo, remove pulse dot (chosen)             | Approved: always visible, single dot, smallest diff.                 |
| Pill at right end of nav                                 | Rejected: crowds 5 nav links, risks push-off/overflow on mobile.     |
| Keep both pulse dot + pill                               | Rejected: two adjacent dots with identical meaning.                  |
| CSS-only `hidden sm:inline` / `sm:hidden` spans (chosen) | Approved: no resize listener, zoneless-safe, deterministic in tests. |
| Single span + JS `matchMedia` truncation                 | Rejected: needs listener/teardown, flakier tests, more code.         |
| `title` + `aria-label` for full string (chosen)          | Approved: tooltip + screen-reader parity on mobile.                  |
| `title` only                                             | Rejected: tooltip-only is not exposed to all AT.                     |

## 4. Risks & mitigations

- Header crowding on very narrow screens (5 nav links + pill) → pill uses
  `max-w` + `truncate` + `min-w-0`; logo/nav get `shrink-0`. Nav
  scroll/wrap restructuring is explicitly out of scope.
- Existing specs assert the old full-width block string → updated in the same
  delta (unit + E2E); `data-status` and `role="status"` selectors are kept so
  churn is limited to text/class assertions.
- E2E must stay hermetic → reuse the dead-port `liveUrl` seam and the
  `routeWebSocket` mock; no live network.

## 5. Exit criteria

`eslint` clean · `tsc` clean · Vitest all-green ≥80% gate · `ng build`
passes budgets · Playwright suite green (incl. mobile pill test) ·
`tasks.md` all `[x]` · zone-ban grep clean.
