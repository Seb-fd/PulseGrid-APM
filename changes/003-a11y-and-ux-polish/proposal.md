# 003 — A11y & UX Polish (H4+M5) — Proposal

> Delta: `changes/003-a11y-and-ux-polish` | Status: Proposed for build
> Date: 2026-09-14 | Target: WCAG 2.2 AA | Skills: `accessibility`, `generate-bdd-spec`
> Source: codebase audit 2026-09-14 (H4 blockers, M5 motion/live-region polish), verified against the live tree

## 1. Context

PulseGrid APM is functionally complete (002 landed store perf) but carries the exact
defects automated lint cannot see: an icon-only Hide button with no accessible name
(`dashboard-grid.component.ts:186-203`), keyboard-dead dashboard topology nodes
(`dashboard-topology-widget.component.ts:111-116`, `aria-label` on a role-less `<g>`),
mouse-only chart data (`metric-chart.directive.ts`, tooltip `aria-hidden` with no
alternative), no skip link, no `:focus-visible` system (`styles.css` has zero focus
rules), sub-4.5:1 greys (`#64748b` axes + `text-slate-500` controls on near-black),
and motion without reduce guards (`.pulse-dot`, `animate-pulse` placeholders).
Template a11y lint only matches `src/**/*.html` — of which zero files exist, and the
extracted inline-template blocks miss that prefix on Windows paths — so inline
templates are effectively unlinted today (additionally, no
`button-has-accessible-name` rule ships in angular-eslint v19, which is why the
unnamed Hide button passed CI).

## 2. Motivation

Keyboard-only users currently cannot hide widgets by name, operate compact topology
nodes, or read any chart point. Screen-reader users get an unnamed control, ignored
node labels, and re-announced alert banners on every count change. Low-vision users
face failing axis/control contrast with no visible focus indicator. This slice closes
the AA blockers without touching data paths, budgets, or the uPlot/render architecture.

## 3. Scope

**In:**

- Accessible names: grid Hide buttons, dashboard topology nodes (keyboard parity with
  the full map), log copy buttons, named `cdkDropList`, grouped legends.
- Keyboard: skip link → `<main id="main">`; Space `preventDefault` on topology nodes;
  focus-return on drawer close; `LiveAnnouncer` for reorder/hide/show/copy (CDK a11y,
  already installed — no new deps).
- Screen reader: chart text alternative per card (visually-hidden min/max/avg/latest
  from existing summary signals — charts stay non-interactive by design); incident
  `role="alert"` wrapper kept mounted to stop re-announcement; rule-builder
  `aria-describedby` error links; drop decorative `title` on `connection-pulse`.
- Focus: global `:focus-visible` ring in `styles.css` + SVG node focus style.
- Contrast: axes `#64748b` → `#94a3b8`; interactive `text-slate-500` → `text-slate-400`;
  badge-tint spot-checks.
- Motion: global reduce block (`.pulse-dot`, topology pulses already guarded — verify)
  - `motion-reduce:animate-none` on placeholders; instant (non-smooth) tail catch-up.
- Lint intent: `**/*.html` template block (covers extracted inline templates by
  construction) + two regression specs (named hide button, grouped legend).
- Specs: BDD unit specs per area + Playwright keyboard/name assertions (no new tooling).

**Out (follow-ups):** arrow-key chart readout (text alternative suffices for AA);
log-row `role="row"` grid-pattern redesign (keep button-row + labelled copy);
320px/200% reflow rework beyond verification (stack/fallbacks already exist);
touch-target enlargement past AA minimums.

## 4. Alternatives

| Option                                      | Verdict                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focusable charts with arrow-key readout now | Rejected for this slice: 3–5× the work; hidden data summary + `role="img"` label meets AA non-text-content + name requirements. Recorded as follow-up. |
| Assertive (`role="alert"`) status banner    | Rejected: connection flaps are infrequent but non-critical; `role="status"` (polite) stays.                                                            |
| New a11y dep (axe-core) in CI               | Rejected: no new deps per NFR; role/name/keyboard Playwright assertions + manual checklist instead.                                                    |
| Redesign log rows as grid pattern           | Deferred: nested-interactive concern mitigated by labelled copy + existing `stopPropagation`; full pattern is its own delta.                           |

## 5. Risks & mitigations

- **Contrast changes shift theme aesthetics** → token-scoped greys only; snapshot via existing visual e2e (no pixel gates to break).
- **`LiveAnnouncer` needs `aria-live` politeness discipline** → announce only discrete actions (moved/hidden/shown/copied), never streams; high-frequency regions stay `aria-live="off"` (already correct).
- **Focus ring vs dark-theme legibility** → single cyan token (`#22d3ee`, already the accent) + offset; verified in the manual checklist.
- **Coverage gate** → every fix ships with its BDD spec; `test-helpers` side-effect import kept; no `describe.skip`.

## 6. Exit criteria

`npm run lint` → `npm run typecheck` → `npm run test -- --run --coverage` (≥80% ×4) →
`npm run build` (budgets 500kB warn/1MB err) → `npx playwright test` green (incl. new
keyboard/name flows); zone-ban grep clean; keyboard-only + 200% zoom + SR-smoke
manual checklist signed in `tasks.md`; `derived from market stream` footnotes intact.
