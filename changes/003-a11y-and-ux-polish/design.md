# 003 — A11y & UX Polish — Design

> Frozen contracts. WCAG 2.2 AA. No new dependencies (`@angular/cdk/a11y` ships with
> the installed CDK). No data-path, budget, or render-architecture changes.

## 1. Foundation (`styles.css`, `app.component.ts`, `eslint.config.js`)

```css
/* styles.css additions — single accent token, legible on all dark wells */
:focus-visible {
  outline: 2px solid #22d3ee;
  outline-offset: 2px;
  border-radius: 4px;
}
g[tabindex]:focus-visible {
  outline: 2px solid #22d3ee;
  outline-offset: 4px;
}
@media (prefers-reduced-motion: reduce) {
  .pulse-dot,
  .node-down,
  .node-degraded,
  .edge-flow,
  .cdk-drag-animating {
    animation: none !important;
    transition: none !important;
  }
}
```

- Skip link (first focusable element, `app.component.ts` header):
  `<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-2 focus:rounded-md focus:bg-cyan-500/10 focus:px-3 focus:py-1.5 focus:text-cyan-300">Skip to content</a>`
  - `<main id="main">` (Tailwind v4 `sr-only`/`not-sr-only` exist; no new CSS).
- ESLint intent: the template block matches `**/*.html` (not `src/**/*.html`) so the
  virtual `inline-template-*.component.html` blocks extracted by
  `processInlineTemplates` are covered by construction. (A `src/` prefix misses
  them on Windows backslash paths; a `src/**/*.component.ts` override extending
  `templateAccessibility` was tried and rejected — `template-base` resets the
  parser and breaks type-aware TS rules.) Verified via `eslint --debug`: inline
  templates extract and parse as linted blocks.

## 2. Dashboard grid (`dashboard-grid.component.ts`)

- Hide button: `[attr.aria-label]="'Hide ' + title(widget.id)"` (fixes
  `button-has-accessible-name` gap at current lines 186–203).
- `cdkDropList`: `aria-label="Dashboard widgets, reorderable"`.
- Announcements via `LiveAnnouncer` (CDK a11y, injected service, `announce()` on
  discrete actions only): `drop()` → `"${title} moved to position ${i+1} of ${n}"`;
  `toggleVisibility()` → `"${title} hidden"` / `"${title} shown"`. Never streams.
- Icon buttons: `text-slate-500` → `text-slate-400` on the three meaningful controls
  (move ×2, hide); mirror `hover:` with `focus-visible:` variants.

## 3. Topology map + compact widget

- Map nodes (`topology-map.component.ts:192`): `(keydown.space)="select(node.id); $event.preventDefault()"`.
- Widget nodes (`dashboard-topology-widget.component.ts:111-116`): mirror the map —
  `tabindex="0" role="button"` + `(click)`/`(keydown.enter)`/`(keydown.space+$event.preventDefault())`
  - same `aria-label` (already present). Roving-tabindex/arrow-graph nav explicitly deferred.
- Legends (map `:215-218`, widget `:135-138`): `role="group"` + keep `aria-label`
  (`<div role="group" aria-label="Map legend" …>`). Inner swatches already `aria-hidden`.
- SVG `role="img"` + per-node `<title>` stay; add `aria-describedby` pointing at the
  visible summary (`X services · Y down`) — one phrase becomes a real description.

## 4. Charts: text alternative, hosts untouched

Charts stay `role="img"` + computed `aria-label` (threshold metadata) and
non-interactive (no `tabindex` — valid with an alternative). Per card
(telemetry page + dashboard metric widget), a visually-hidden summary bound to the
existing `summaryText()`/series signals:

```html
<p class="sr-only" [attr.data-testid]="'chart-alt-' + kind">
  {{ chartAltText() }}
  <!-- e.g. "CPU, percent. Latest 46%, window average 42%, range 40 to 46. Warn at 75, critical at 90." -->
</p>
```

- `chartAltText()` is a pure `computed` (min/max/avg/latest + unit + thresholds) —
  no subscriptions, no effect changes, `@defer`/rAF paths untouched. Tooltip stays
  `aria-hidden="true"` (correct: pointer-only enhancement, not the data source).

## 5. Live regions & announcements (keep / fix)

- Keep: `status-banner` `role="status"` (polite); viewports `role="log" aria-live="off"`;
  all high-frequency counts `aria-live="off"`.
- Fix incident banners (`incident-list`, `dashboard-incident-widget`): keep the
  `role="alert"` wrapper **mounted** (`@if` moves inside, `aria-atomic="true"` on the
  text) so count-only updates don't re-create + re-announce the assertive region.
- `connection-pulse`: remove dead `[title]` (host is `aria-hidden`; banner speaks).
- Decorative status dots in banners: add `aria-hidden="true"` (empty spans).
- Log drawer (`log-viewer`): store trigger on `select()`, restore focus in
  `closeDetail()` (incl. Escape path); copy buttons get `aria-label="Copy trace id"`
  - visually-hidden polite `"Copied <id>"` confirmation instead of `title` swap.

## 6. Rule builder errors (`rule-builder.component.ts`)

- Error `<p>`s gain stable ids (`error-name-text`, …); inputs gain matching
  `aria-describedby` alongside existing `aria-invalid`. The `aria-live="polite"`
  container (:156-160) stays. Submit stays disabled while invalid (no focus-move needed).

## 7. Contrast deltas (token-scoped)

- uPlot axes: `stroke '#64748b'` → `'#94a3b8'` (tick labels ≈7:1 on `#030712`;
  gridlines stay faint — decorative, exempt).
- Interactive controls `text-slate-500` → `text-slate-400` (grid move/hide, log copy);
  `text-slate-500` remains legal for large/decorative/duplicate (`aria-hidden` headers).
- Badge tints (`LEVEL/METHOD/STATUS_BADGE`) + series/threshold hues: spot-check at 11px
  against backgrounds with a contrast tool during build; adjust fills, never remove
  the text pairing (color is never the sole signal — invariant).

## 8. Motion & scroll polish

- Placeholders (`animate-pulse` in telemetry/grid/alerts/topology): add
  `motion-reduce:animate-none`.
- Log tail-follow: instant `scrollToIndex` for catch-up batches, `smooth` only on
  user-initiated resume; skip scroll when the user has scrolled up (guard on viewport
  offset — no new deps, CDK viewport API).

## 9. Test contracts (BDD → file)

| Criterion                                                                                               | Spec                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hide button exposes `Hide <title>`; drop list named                                                     | `dashboard-grid.spec.ts`                                                                                                                                                                                                    |
| Widget node focusable + Enter/Space selects; Space never scrolls (map + widget)                         | `dashboard-topology-widget.spec.ts` (rendered directly); map-node keyboard in `e2e/a11y-keyboard.spec.ts` — `@defer` blocks stay placeholders in jsdom by repo convention, so map DOM is only exercisable in a real browser |
| Card renders hidden data summary with latest/avg/range + thresholds                                     | `telemetry-page.spec.ts`, `dashboard-metric-widget.spec.ts`                                                                                                                                                                 |
| Incident banner wrapper persists across count changes                                                   | `incident-list.spec.ts`, `dashboard-incident-widget.spec.ts`                                                                                                                                                                |
| Copy announces; drawer close returns focus                                                              | `log-viewer.spec.ts`                                                                                                                                                                                                        |
| Error inputs link `aria-describedby` to message ids                                                     | `rule-builder.spec.ts`                                                                                                                                                                                                      |
| E2E keyboard: skip link first → named hide → topology node focus + Enter opens detail; all by role/name | `e2e/a11y-keyboard.spec.ts` (new; hermetic `liveUrl` seam)                                                                                                                                                                  |
