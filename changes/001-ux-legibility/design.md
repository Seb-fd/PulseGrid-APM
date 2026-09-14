# 001 — UX Legibility — Design

> Frozen contracts for delta `001-ux-legibility`. Reuses `TelemetryMetric`,
> `MetricKind`, `MetricUnit`, `LogEntry`, `LogFilter`, `ServiceNode`,
> `HealthState`, `AlertRule`, `AlertSeverity` unchanged — **no constitution
> amendment, no `LogEntry` interface change**.
> No `zone.js`, no `NgModule`, no `*ngIf/*ngFor`, no component `subscribe()`.

## 1. Threshold model (static defaults + rule override)

New file `src/app/core/models/metric-thresholds.model.ts` (pure, unit-tested):

```ts
import type { AlertRule } from './alert-rule.model';
import type { MetricKind } from './telemetry-metric.model';

export type ThresholdDirection = 'high' | 'low';
export interface MetricThresholds {
  warn: number;
  crit: number;
  direction: ThresholdDirection;
}

export const METRIC_THRESHOLDS: Record<MetricKind, MetricThresholds> = {
  cpu: { warn: 75, crit: 90, direction: 'high' },
  memory: { warn: 75, crit: 90, direction: 'high' },
  latency: { warn: 200, crit: 500, direction: 'high' },
  throughput: { warn: 500, crit: 100, direction: 'low' },
};

export function resolveThresholds(kind: MetricKind, rules: readonly AlertRule[]): MetricThresholds;
```

Rationale for defaults: `cpu/mem 75/90` aligns with sim `cpu>90 → WARN`
(`stochastic-sim.service.ts:100`) + `validateRuleDraft` 0–100 range;
`latency 200/500` aligns with `deriveHealth` p95>200 → degraded
(`service-node.model.ts:36-44`) + sim `latency>200 → WARN`;
`throughput` see §2.

`resolveThresholds` precedence (locked): consider only `rule.enabled &&
rule.metric === kind`; map `severity === 'warning'` → warn candidate,
`'critical'` → crit candidate (ignore `'info'`); when several candidates exist
for one slot, pick the **most sensitive** (for `high`: min warn, min crit; for
`low`: max warn, max crit — i.e. the value closest to normal that still fires
first); invalid results (`!Number.isFinite`, `crit` on the wrong side of `warn`
for the direction) are discarded and the static default survives. Returns a
fresh `{warn, crit, direction}` (direction always from statics).

Callers: `telemetry-page.component.ts` + `dashboard-metric-widget.component.ts`
(or its parent grid) compute `thresholds = computed(() =>
resolveThresholds(kind, store.rules()))` and bind into the directive. Rules are
already a `CoreStore` signal — no new store state, no ingestion change.

## 2. Inverted threshold logic for throughput (low-is-bad) — REQUIRED DETAIL 1

`throughput.direction === 'low'` inverts breach semantics AND visual wording:

- Breach predicate: `value <= warn` is warning, `value <= crit` is critical
  (vs `>=` for `high`). With defaults `warn: 500, crit: 100`: normal sim
  `~820 rps` is healthy; degraded sim `~300-600 rps` crosses warn; outage
  `0 rps` crosses crit. Invariant enforced: `warn > crit` for `low`
  (vs `warn < crit` for `high`); `resolveThresholds` discards rule overrides
  that violate the invariant for the kind's direction.
- Rendering is direction-agnostic (both lines are horizontal levels on the same
  y-scale), but the **legend/summary copy** must not say "exceeds": tooltip and
  header use neutral wording (`"warn 500 rps · crit 100 rps (low-is-bad)"` in
  `title`/`aria-label`). Delta arrow semantics are unchanged (↑ = value rose,
  even though for throughput a drop is the bad direction — the threshold lines,
  not the arrow, carry severity meaning; documented to avoid misreading).
- Tests (locked): `resolveThresholds('throughput', [])` → `{500,100,low}`;
  override with `warning/600 + critical/150` wins; override with
  `warning/50 (< crit)` is discarded → default survives; breach helper
  `isBreach(value, thresholds)` unit-tested for both directions.

## 3. Chart overlays + summary headers + tooltips

### 3a. `MetricChartDirective` (`shared/ui/metric-chart/metric-chart.directive.ts`)

```ts
export interface ThresholdLines { warn: number; crit: number; }
readonly thresholds = input<ThresholdLines | null>(null);
```

- Rendering via uPlot `hooks.draw` (NOT extra series): in `darkOptions()` (or a
  `thresholdPlugin`) push `draw: [(u) => { ... }]`. Each hook converts the
  threshold value → canvas y via `u.valToPos(v, 'y', true)`, then
  `ctx.save(); ctx.setLineDash([6,4]); ctx.strokeStyle = '#f59e0b'|'#ef4444';
ctx.globalAlpha = 0.75; ctx.lineWidth = 1; line; ctx.restore()`.
- Existing `effect()` touches `thresholds()` alongside `data()/unit()/height()`
  so threshold-only changes repaint; rAF coalescing (`schedule()/paint()`),
  `setData` fast-path, `ResizeObserver`, and `ngOnDestroy` stay untouched
  (≤60 fps preserved). Skip lines when `thresholds() === null`.
- Tooltip: one absolutely-positioned `<div class="metric-tip">` created lazily
  per directive host (host gets `position: relative` — parents already use
  `relative h-[200px]` wells). Updated in `hooks.setCursor` via direct DOM
  writes only (no signals, no CD): `left/top` from `u.cursor.left/top`,
  content `formatTooltipTimestamp(ts) + formatValue(v, unit)`. Hidden on
  `cursor.idx == null`. Keeps `cursor:{show,x}` + `legend:{show:false}` +
  `sync:{key:'pulsegrid'}` behavior.

### 3b. Summary headers (last vs window-avg)

New pure util `src/app/core/utils/format-metric.ts`:

```ts
export function formatValue(value: number, unit: MetricUnit): string;
export function summarizeWindow(series: readonly TelemetryMetric[]): {
  current: number;
  avg: number;
  delta: number;
  arrow: '↑' | '↓' | '→';
};
export function formatSummary(
  current: number,
  delta: number,
  arrow: string,
  unit: MetricUnit,
): string;
```

- `formatValue`: `%` → `"42%"` (1-decimal trimmed); `ms` → `"140 ms"`;
  `rps` → `"820 rps"` with k-format ≥10000 (`"12.4k rps"`). No `KB/s` unit exists
  (`MetricUnit = '%ертиф'|...` is `'%'|'ms'|'rps'`) — the task's `"1.2 KB/s"`
  example is aspirational only and out of scope.
- `summarizeWindow`: `avg = mean(values)` (empty → `{0,0,0,'→'}`),
  `delta = last − avg`, `arrow = delta > epsilon ? '↑' : delta < -epsilon ? '↓' : '→'`
  (epsilon `1e-9`). O(n), n≤300.
- Components: `dashboard-metric-widget` adds
  `summary = computed(() => summarizeWindow(this.series()))` rendered above the
  chart as `CPU — 42% (↓ 3% avg)` (`data-testid="summary-<kind>"`,
  `aria-live="off"`); `telemetry-page` adds per-card
  `summaries = computed((): Record<MetricKind, Summary>)` rendered in each card
  `h3` (`data-testid="summary-<kind>"`). Grid title + unit badge
  (`dashboard-grid.component.ts:136-144`) unchanged. Footnote
  `"Values derived from market stream…"` preserved in both places.

## 4. Log HTTP badges via display-only parsing + sim message augmentation — REQUIRED DETAIL 2

**Frozen `LogEntry` (`core/models/log-entry.model.ts:8-16`) is NOT modified.**
No `httpMethod/httpStatusCode/stacktrace` fields are added in this delta.

### 4a. Pure parsers (new `src/app/features/logs/log-format.ts`, unit-tested)

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export function parseHttpMethod(message: string): HttpMethod | null;
export function parseHttpStatus(message: string): number | null;
export function statusTone(status: number): 'ok' | 'warn' | 'err';
```

- `parseHttpMethod`: `/\b(GET|POST|PUT|DELETE|PATCH)\b/` (first match, uppercase
  only — sim messages are uppercase by construction).
- `parseHttpStatus`: `/\b([1-5]\d\d)\b(?![\ds])/` — the negative lookahead is
  load-bearing: current outage text `"Node outage: ledger throughput 0 (500s
surging)"` must NOT yield `500`. Only standalone 3-digit codes match
  (`"GET /api/ledger 500 212ms"` → `500`; `"(500s surging)"` → null).
- `statusTone`: `200-299 → ok` (green), `400-499 → warn` (amber),
  `500-599 → err` (red). Method tones: `GET` blue, `POST` emerald,
  `PUT` amber, `DELETE` rose, `PATCH` violet (all `/10` bg + `/20` border dark
  recipe matching `LEVEL_BADGE`).
- Row rendering: badges render **inline before the message** inside the existing
  message cell (no new grid columns, `itemSize=28` preserved):
  `@if (method(entry.message)) { <span data-testid="log-method">…` +
  `@if (status(entry.message)) { <span data-testid="log-status">…`.
  Helpers are pure functions of `message` (memoization unnecessary at ≤5000 rows;
  filter recompute stays <50 ms per NFR-L1).

### 4b. Simulator message augmentation (text only, no contract change)

`stochastic-sim.service.ts:logsFor` keeps returning `LogEntry` with the same
shape; only `message` strings gain embeddable HTTP patterns so badges have
somethingipp to parse in dev/E2E:

- Outage ERROR: `` `Node outage: ${serviceId} throughput 0 — GET /api/${serviceId} 500 (${traceId})` ``
  (replaces `"(500s surging)"` which poisoned the status regex).
- CPU-spike WARN: `` `CPU spike ${v}% on ${svc} — POST /api/${svc}/scale 429` ``
  when a service context exists, else keep cluster text without code.
- Latency WARN: `` `High latency ${v}ms on ${svc} — GET /api/${svc} 200 ${v}ms` ``.
- Seeded determinism preserved (`createState(seed)`, no new randomness);
  existing BDD (`CPU spike → WARN`, `outage → ERROR with matching traceId`)
  still holds — assertions match on `level` + `serviceId` + `traceId`, and
  message assertions use `toContain` on the stable prefix.

## 5. Deterministic UTC timestamp formatting — REQUIRED DETAIL 3

New helpers in `core/utils/format-metric.ts` (charts) reused by logs where shown:

```ts
export function formatAxisTick(epochSec: number): string; // 'HH:MM:SS' UTC
export function formatTooltipTimestamp(epochMs: number): string; // 'HH:MM:SS.mmm UTC · YYYY-MM-DD'
export function formatLogTime(epochMs: number): string; // existing 'HH:MM:SS.mmm' UTC (kept)
```

- Implementation MUST use `getUTC*` accessors (or `toISOString().slice(...)`)
  — never `getHours()`/`toLocaleTimeString()` (timezone-dependent). Axis keeps
  current `toISOString().slice(11,19)` behavior, factored into `formatAxisTick`
  for testability.
- Tooltip format locked: `` `${HH}:${MM}:${SS}.${mmm} UTC · ${YYYY}-${MO}-${DD}` ``
  e.g. `"14:03:22.140 UTC · 2026-09-13"`. Human-readable on hover, byte-stable in
  tests (`TZ` irrelevant). Unit tests pin 3 fixed epochs (midnight, leap-second
  neighbor, millis `.007` padding).
- Log row time (`formatTime` in `log-viewer.component.ts:25-27`) keeps
  `slice(11,23)` output; drawer shows full `new Date(ts).toISOString()`.

## 6. Log pills + detail drawer

### 6a. Quick severity pills

Above the existing toolbar (`log-viewer.component.ts:63-98`), add:

```html
<div role="group" aria-label="Quick severity filter" data-testid="log-quick-filters">
  <button data-testid="pill-all" [attr.aria-pressed]="levelSet().size === 0" (click)="selectAll()">
    All
  </button>
  <button
    data-testid="pill-errors"
    [attr.aria-pressed]="isOnly('ERROR')"
    (click)="selectOnly('ERROR')"
  >
    Errors Only ({{ errorCount() }})
  </button>
  <button
    data-testid="pill-warnings"
    [attr.aria-pressed]="isOnly('WARN')"
    (click)="selectOnly('WARN')"
  >
    Warnings ({{ warnCount() }})
  </button>
</div>
```

- `errorCount = computed(() => store.logs().filter(l => l.level === 'ERROR').length)`
  (same for WARN); existing `LEVELS` toggle buttons + search + service select stay
  (FR-L2). `selectAll()` → `levelSet.set(new Set())`; `selectOnly(l)` →
  `levelSet.set(new Set([l]))`. Pill active state derives from `levelSet`
  (single source of truth). Counts update reactively via the `logs` signal.

### 6b. Inline aside drawer

```ts
readonly selectedId = signal<string | null>(null);
readonly selectedEntry: Signal<LogEntry | undefined> = computed(() =>
  this.rows().find(l => l.id === this.selectedId()) ?? this.store.logs().find(l => l.id === this.selectedId()));
select(entry: LogEntry): void; closeDetail(): void;
```

- Row becomes `<div role="button" tabindex="0" (click)="select(entry)"
(keydown.enter)="select(entry)" (keydown.space)="select(entry)">` (keeps
  `trackLog`, `copyTrace` button with `stopPropagation`).
- Drawer: `@if (selectedEntry(); as sel)` → `<aside role="dialog"
aria-modal="false" aria-label="Log details" data-testid="log-detail">` with
  metadata table (Time full ISO, Service, Level badge, TraceId + copy button),
  `<p data-testid="log-detail-message">`, stacktrace block:
  `<pre data-testid="log-detail-stack">No stacktrace captured for this entry.</pre>`
  (honest placeholder — no `stacktrace` field exists; see §4). Close button
  `data-testid="log-detail-close"` + `Escape` handler (`(keydown.escape)` on the
  section). No CDK Overlay import (bundle flat); no list mutation (VirtualScroll
  - tail-follow `effect` untouched). Mobile: stacks below viewport; desktop:
    `lg:grid-cols-[1fr_320px]` split.

## 7. Topology edges + legend, a11y, reduced-motion — REQUIRED DETAIL 4

### 7a. Health-colored animated edges

Extend both edge types (full map + widget stay structurally identical):

```ts
export interface TopologyEdge {
  from: ServiceNode;
  to: ServiceNode;
  dimmed: boolean;
  health: HealthState;
}
```

- `edges = computed(...)`: `health = worst(from.health, to.health)` with
  `down > degraded > healthy`; `dimmed` unchanged
  (`from.health === 'down' || to.health === 'down'`).
- Stroke map (shared with nodes): `healthy → #10b981` (emerald-500),
  `degraded → #f59e0b` (amber-500), `down → #ef4444` (red-500). Replaces static
  `#334155` on `<line>`; arrow `marker-end` fill follows the same per-edge color
  (one `<marker>` per health tone: `#arrow-ok|warn|err`, selected via
  `marker-end="url(#arrow-…)"` binding).
- Flow animation (CSS only, no JS per-frame loop — FR-P5 preserved):

```css
.edge-flow {
  stroke-dasharray: 6 6;
  animation: dash-flow 1.1s linear infinite;
}
@keyframes dash-flow {
  to {
    stroke-dashoffset: -24;
  }
}
```

Applied to non-`dimmed` edges (`[class.edge-flow]="!edge.dimmed"`); dimmed
edges keep `.edge-dim{opacity:.2}` static. Dash direction + arrowhead jointly
convey request direction (`from → to` along `dependencies`).

### 7b. Legend overlay

Map container becomes `relative`; legend is an absolute bottom-left card:

```html
<div
  data-testid="topology-legend"
  aria-label="Map legend"
  class="absolute bottom-3 left-3 rounded-md border border-slate-800 bg-slate-950/90 px-2.5 py-2 font-mono text-[11px] leading-5 text-slate-300 backdrop-blur"
>
  <span class="mr-2"><i class="dot" style="background:#10b981"></i>healthy</span>
  <span class="mr-2"><i class="dot" style="background:#f59e0b"></i>degraded</span>
  <span class="mr-3"><i class="dot" style="background:#ef4444"></i>down</span>
  <span class="mr-2"><i class="edge-sample edge-ok"></i>normal</span>
  <span><i class="edge-sample edge-err"></i>failing</span>
</div>
```

Full page required; dashboard widget gets the same block in compact form
(`data-testid="dash-topology-legend"`). `pointer-events-none` so it never blocks
node clicks; never covers the `preserveAspectRatio="xMidYMid slice"` graph on
narrow widths (wraps, max-width 70%).

### 7c. Accessibility contracts (locked)

- Charts: each chart host `role="img"` + `aria-label="<Title> chart, <summary>"`
  (summary text mirrors the visible header); tooltip div `aria-hidden="true"`
  (hover-only, never SR-announced); threshold lines additionally described in the
  `aria-label` (`"warn 90%, crit 95%"` / `"(low-is-bad)"` for throughput).
- Logs: toolbar group `role="group" aria-label="Quick severity filter"`; pills
  expose `aria-pressed`; counts are plain text (SR reads on demand, no live
  region); viewport keeps `role="log" aria-live="off"`; rows `role="button"`
  with `aria-label="<LEVEL> <service> <time>"`; drawer `role="dialog"`
  `aria-label="Log details"`, focus moves to close button on open, `Escape`
  closes and returns focus to the originating row (store last-focused id).
- Topology: nodes keep `tabindex="0" role="button"`
  `aria-label="<name>, health <state>"` + `Enter/Space` select; edges
  `aria-hidden="true"` (decorative — health is in node labels + legend text);
  legend is a plain labelled group (NOT `role="img"`); detail aside keeps
  `aria-label="Node details"`.
- Motion: global kill-switch (in each topology component's `styles` + any new
  chart/tooltip transition):

```css
@media (prefers-reduced-motion: reduce) {
  .edge-flow,
  .node-down,
  .node-degraded {
    animation: none !important;
  }
}
```

No JS motion detection needed; CSS-only honors OS setting. E2E/unit assert the
media block exists (string match on component styles) rather than simulating
OS prefs.

## 8. Budgets & reactivity (non-negotiable)

- Store commits ≤10 Hz (`sampleTime(100)` upstream, untouched); chart paints ≤60 fps
  (rAF path untouched); `RingBuffer` 300/series, `MAX_METRICS` 1200,
  `MAX_LOGS` 5000; logs stay in CDK VirtualScroll (no >100 mounted rows);
  `@defer (on viewport)` boundaries unchanged; `derived from market stream`
  footnotes stay.
- Signals only in UI: new state is `signal`/`computed` (`thresholds`, `summary`,
  `errorCount/warnCount`, `selectedId/selectedEntry`, `edges.health`);
  `effect()` only for tooltip-DOM/drawer-focus/scroll side-effects; no component
  `subscribe()`, no `BehaviorSubject` for filter state, no `setInterval` in
  components, no `NgZone.run()`/`tick()` hacks.
- Strict TS (`strict`, `noUncheckedIndexedAccess`, `strictTemplates`,
  `no-explicit-any: error`); explicit return types on all new public APIs;
  standalone `OnPush`; `@if/@for(track id)`; Prettier singleQuote/printWidth 100;
  new utils live in `core/` (no component deps), features never import
  cross-feature.

## 9. Test contracts (BDD → file)

| Criterion                                                                                                                        | Spec                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Threshold defaults + rule override + throughput invariant + `isBreach` both directions                                           | `core/models/metric-thresholds.spec.ts` (new)                                                                   |
| `formatValue`/`formatAxisTick`/`formatTooltipTimestamp` UTC pins + `summarizeWindow` arrows                                      | `core/utils/format-metric.spec.ts` (new)                                                                        |
| Directive draws warn/crit dashed lines; null skips; threshold-only change repaints; tooltip div shows UTC + units on `setCursor` | `shared/ui/metric-chart/metric-chart.directive.spec.ts` (extend; `vi.mock('uplot')`, rAF stub)                  |
| Widget/telemetry headers `GIVEN seeded series WHEN rendered THEN summary-<kind> shows current+delta`                             | `dashboard-metric-widget.spec.ts`, `telemetry-page.spec.ts` (extend)                                            |
| Log parsers (method/status incl. `500s` guard) + tone map                                                                        | `features/logs/log-format.spec.ts` (new)                                                                        |
| Pills filter + counts; badges render; drawer open/Esc/empty-stack                                                                | `features/logs/log-viewer.spec.ts` (extend)                                                                     |
| Edge `health=worst()`, stroke/marker per tone, legend present, reduced-motion block                                              | `features/topology/topology-map.spec.ts` + `dashboard-topology-widget.spec.ts` (extend)                         |
| E2E hermetic: thresholds visible; pills filter; drawer opens; legend + red failing edge on `scenario=outage`                     | `e2e/telemetry-logs.spec.ts`, `e2e/topology-alerts-dashboard.spec.ts` (extend; `liveUrl=ws://127.0.0.1:9/dead`) |

Component specs MUST `import '../../test-helpers'` (relative side-effect),
zoneless `BrowserTestingModule` harness, signal-state hosts (`.set()`), seeded
`createState(<seed>)` + fixed `now`, open/`BehaviorSubject` streams for timing
tests (never bare `of()`), fake timers for timing. No `describe.skip` without a
linked ticket. Coverage gate ≥80% lines+branches+functions+statements holds.
