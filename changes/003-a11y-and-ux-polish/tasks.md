# 003 — A11y & UX Polish — Tasks

> Order enforced top-to-bottom. Check `[x]` only when tests pass.
> Verify order: `npm run lint` → `npm run typecheck` → `npm run test -- --run --coverage` → `npm run build` → `npm run e2e`.
> Component specs MUST keep the `test-helpers` side-effect import. No `describe.skip` without ticket.

## SDD

- [x] `proposal.md` approved (WCAG 2.2 AA scope, alternatives, risks)
- [x] `design.md` approved (contracts §§1–9 frozen before code; map-node keyboard contract refined: e2e layer, see below)

## Foundation

- [x] `styles.css`: global `:focus-visible` ring + `g[tabindex]` focus style + reduce block (§1)
- [x] `app.component.ts`: skip link + `<main id="main">`
- [x] `eslint.config.js`: `**/*.html` template block (extracted inline templates covered by construction)

## Blockers & keyboard

- [x] Grid: named Hide buttons, named `cdkDropList`, `LiveAnnouncer` in `drop()`/`toggleVisibility()`, `text-slate-400` + `focus-visible:` on icon buttons
- [x] Topology map: Space `preventDefault`; `aria-describedby` summary; legend `role="group"`
- [x] Topology widget: node keyboard parity (tabindex/role/Enter/Space + toggle select); legend `role="group"`

## Screen reader & announcements

- [x] Charts: `chartAltText()` computed + `sr-only` summary per card (telemetry + metric widget); tooltip stays `aria-hidden`
- [x] Incidents: `role="alert"` wrapper kept mounted + `aria-atomic` (list + dash widget)
- [x] `connection-pulse`: drop dead `title`; banner dots `aria-hidden`
- [x] `log-viewer`: labelled copy buttons + polite Copied confirmation; drawer focus return on close/Escape
- [x] `rule-builder`: error ids + `aria-describedby` links

## Contrast, motion, scroll

- [x] Axes `#64748b` → `#94a3b8`; interactive greys to `text-slate-400`; badge-tint spot-checks logged
- [x] `motion-reduce:animate-none` on all `animate-pulse` placeholders
- [x] Tail-follow: instant catch-up, smooth only on user resume, no yank when scrolled up

## Specs (TDD: specs first, GIVEN/WHEN/THEN)

- [x] `dashboard-grid.spec.ts` (named hide, named list, announce on drop/toggle)
- [x] `dashboard-topology-widget.spec.ts` (focus, Enter/Space toggle, no Space scroll); map-node keyboard covered in e2e (defer blocks stay placeholders in jsdom by repo convention)
- [x] `telemetry-page.spec.ts` + `dashboard-metric-widget.spec.ts` (hidden summary content)
- [x] `incident-list.spec.ts` + `dashboard-incident-widget.spec.ts` (persistent alert wrapper)
- [x] `log-viewer.spec.ts` (copy label/confirmation, focus return)
- [x] `rule-builder.spec.ts` (`aria-describedby` linkage)
- [x] `e2e/a11y-keyboard.spec.ts` (skip link → hide → topology Enter; role/name assertions; hermetic seam)

## Verification gates (2026-09-14, all green)

- [x] `npm run lint` clean (incl. inline-template coverage via `**/*.html`; `no-explicit-any:error`)
- [x] `npm run typecheck` clean (`strict`, `noUncheckedIndexedAccess`, `strictTemplates`)
- [x] `npm run test -- --run --coverage` green, thresholds ≥80% lines/branches/functions/statements (actual: 92.13/87.59/91.8/92.13; 169/169 tests)
- [x] `npm run build` passes budgets (initial 500kB warn / 1MB err; style 4kB/8kB); zone-ban grep clean
- [x] `npm run e2e` green incl. new keyboard flow (17/17); footnotes + LIVE/SIMULATED banner assertions pass
- [x] Manual checklist signed — outcomes recorded:
  - keyboard-only full pass: covered by `e2e/a11y-keyboard.spec.ts` (Tab→skip→#main, named hide/move, node Enter/Space) ✓
  - contrast spot-checks (computed WCAG ratios): axes 7.85:1 ✓ (was 4.23:1), slate-400 controls 7.38:1 ✓, badge tints 10–13:1 ✓ (no change needed), focus ring 11:1 ✓
  - 320px reflow probe: KNOWN LIMITATION — header `nav` min-content 371px overflows all routes at 320px (pre-existing shell issue, present before this slice; reflow rework explicitly out of scope) → nominated follow-up (collapsible/wrapping nav)
  - SR smoke: role/name/live-region assertions in unit + e2e ✓; full NVDA/VoiceOver pass deferred to reviewer (no AT in this environment)
- [x] Mark SDD + items `[x]`; nominate follow-up (arrow-key chart readout / log grid-pattern / touch targets / narrow-viewport nav)
