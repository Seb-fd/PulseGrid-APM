# 005 — Enterprise Dark-Theme Visual Upgrade — Design

> Styling-only delta. No domain types changed. No `data-testid` or ARIA role changes.

## 1. Global tokens / utilities (`src/styles.css`)

Extend `@theme` with monospace stack and add utility class keyframes after
uPlot import.

```css
@theme {
  --color-pulse-bg: #090e1a;
  --color-pulse-panel: #0f172a;
  --color-pulse-accent: #22d3ee;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

Tailwind already ships `font-mono` to system stack; this only overrides the stack.

Keyframes:

```css
@keyframes pulse-dot {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.55);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(34, 211, 238, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 211, 238, 0);
  }
}
.pulse-dot {
  animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

Global uPlot overrides to blend chart canvas into `bg-slate-950/40` wells:

```css
.uplot canvas {
  display: block;
}
.u-legend.u-off,
.u-title.u-off {
  display: none;
}
```

Custom scrollbar + selection tint.

## 2. Shell (`app.component.ts`)

```html
<header class="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
  <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
    <span
      class="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300
                 ring-1 ring-cyan-500/20"
    >
      <svg>…</svg>
    </span>
    <h1 class="text-base font-bold tracking-tight text-slate-100">
      PulseGrid <span class="font-light text-slate-400">APM</span>
    </h1>
    <app-connection-pulse />
    <nav class="ml-auto flex items-center gap-1 text-sm">
      <a
        class="rounded-md px-3 py-1.5 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-100"
        routerLinkActive="bg-cyan-500/10 text-cyan-300"
        ...
        >Dashboard</a
      >
    </nav>
  </div>
</header>
```

`app-connection-pulse` component reads `store.connectionStatus` and renders a dot:

- `live` → `bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]` with ping
- `simulated` → `bg-amber-400`
- `reconnecting` → `bg-rose-500`

`StatusBannerComponent` stays below header but fills become translucent (`bg-emerald-500/10`, etc.) with bottom border accent.

## 3. Shared card recipe

Used by dashboard cards, telemetry cards, topology aside, rule-builder/incident-list cards:

```
rounded-xl border border-slate-800/80 bg-slate-900/80 shadow-[inset_0_1px_0_rgba(148,163,184,0.08),0_8px_24px_rgba(2,6,23,0.45)] backdrop-blur-md
```

Body panels (chart/log wells):

```
rounded-lg bg-slate-950/40 ring-1 ring-slate-800/60
```

## 4. Dashboard

### Grid chrome

- Toolbar: page title + subtitle tag + `dashboard-reset` button styled as ghost button.
- Card header row: drag handle = `cursor-grab active:cursor-grabbing`, grip icon, hover ring.
- Move/hide buttons = icon-only rounded buttons with `hover:bg-slate-800/80`.
- Title = `font-sans text-sm font-semibold text-slate-100`.

### Metric widget

- Chart well recipe.
- Loading placeholder uses subtle shimmer on the well instead of flat `bg-slate-800`.

### Log widget

- Count badge pill `bg-slate-800/80 text-slate-300 border border-slate-700/60`.
- Rows: `font-mono text-xs hover:bg-slate-800/60 transition-colors`.
- Badges translucent (`bg-sky-500/10 text-sky-300 border-sky-500/20`, amber, rose).

### Topology widget

- SVG well recipe.
- Edges: `stroke-linecap="round"`, dim class opacity 0.2.
- Nodes: `<g class="cursor-pointer transition-opacity hover:opacity-90">`.
- Degraded node pulse keyframe reused from global CSS.

### Incident widget

- Firing badge/row badge → `bg-rose-500/10 text-rose-400 border-rose-500/20`.
- Resolved badge → `bg-emerald-500/10 text-emerald-300 border-emerald-500/20`.
- Banner → same translucent fill + left accent border.

## 5. Feature pages

Apply the same recipes:

- Telemetry: cards get glass recipe, chart wells get dark well, window buttons use cyan pill active state.
- Logs: toolbar inputs `bg-slate-950 border-slate-800/80 focus:border-cyan-500/50`, filter badges translucent.
- Topology: SVG card + aside card glass recipe, detail health text color-coded.
- Alerts: rule-builder inputs and cards glass recipe, error messages rose, save button cyan emphasis.

## 6. Crosshair (`MetricChartDirective`)

`darkOptions` cursor:

```ts
cursor: {
  show: true,
  x: true,
  y: false,
  drag: { x: false, y: false },
  points: { show: false },
  sync: { key: 'pulsegrid' },
}
```

Crosshair stroke and focus lines set to cyan at low alpha. Keep legend off.

## 7. Test contracts

No E2E DOM selectors change. Only unit impact is `metric-chart.directive.spec.ts`:
assert `cursor.show === true` and `drag.x === false` in first `MockUPlot` call args.

## 8. Verification

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test -- --run --coverage` (95/95, ≥80%)
4. `npm run build`
5. `npm run e2e`
