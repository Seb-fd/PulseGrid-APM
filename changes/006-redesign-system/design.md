# 006 — UI/UX Redesign & Systemization — Design

> Styling + bounded markup delta. No domain types changed. No `data-testid`/ARIA/form bindings changed.

## 1. Locked parameters (user-approved)

- `--color-root: #05070b`, `--color-surface: #0d1117`, `--color-well: #030712`,
  `--color-line: #1f293d`, `--color-pulse-accent: #22d3ee`.
- Logs: flex-fill viewport inside `h-[calc(100vh-140px)]`.
- Topology SVG: `preserveAspectRatio="xMidYMid slice"`.

## 2. Global tokens (`src/styles.css`)

```css
@import 'tailwindcss';
@import 'uplot/dist/uPlot.min.css';

@theme {
  --color-root: #05070b;
  --color-surface: #0d1117;
  --color-well: #030712;
  --color-line: #1f293d;
  --color-pulse-bg: #05070b;
  --color-pulse-panel: #0d1117;
  --color-pulse-accent: #22d3ee;
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

`html, body { background: var(--color-root); }`,
`body { font-family: var(--font-sans); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }`.
Scrollbar track `rgba(13,17,23,.6)`, thumb `rgba(31,41,61,.9)` -> hover `rgba(51,65,85,.9)`.
Keep `pulse-dot` / `pulse-amber` / `node-degraded` / uPlot / CDK keyframes as-is.

## 3. Fonts (`src/index.html`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
```

## 4. Type scale

- Page header (`PageHeaderComponent` + dashboard custom header):
  `text-lg font-semibold tracking-tight text-slate-100`, subtitle
  `font-mono text-[11px] leading-4 text-slate-400`.
- Card titles: `text-xs font-semibold uppercase tracking-wider text-slate-400`.
- Data readouts: `font-mono text-sm font-medium text-slate-200`.
- Micro/badges/timestamps: `font-mono text-[11px] leading-4 text-slate-400`.
- Mono strictly on: log rows, timestamps, traceIds, metric numbers, thresholds,
  unit pills, observed values. Sans everywhere else.

## 5. Chromium contracts

- Card: `rounded-lg border border-slate-800 bg-[#0d1117] shadow-sm`.
  (Uses literal hex so the surface reads even before `@theme` color utilities
  resolve in older Tailwind v4 snapshots; migrates to `bg-surface border-line`.)
- Well (chart/log/map inset): `rounded-md bg-[#030712] ring-1 ring-white/5`.
- Header shell keeps the only `backdrop-blur-md` (`bg-[#05070b]/80`).
  All other `backdrop-blur-md` + inset-glow shadows removed.
- Buttons: Primary `bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-3 py-1.5 rounded-md text-xs`;
  Secondary `bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-md text-xs`;
  Destructive `bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30`.
- Inputs/selects: `h-8 w-full px-2.5 text-xs bg-[#030712] border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500`.
- Toggle OFF: `border-slate-600 bg-slate-800 after:bg-slate-400`;
  ON: `border-cyan-500/50 bg-cyan-500/20 after:bg-cyan-300`;
  focus: `peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500/40`.
- Icons: 14px stroke `currentColor` inline SVGs (activity, cpu, gauge, throughput,
  terminal, share-2, alert-triangle, grip-vertical, chevron-up/down, x). Deletes
  `WIDGET_ICONS` unicode map.

## 6. Semantics

- `HEALTH_FILL` (topology map + dashboard widget): healthy `#10b981`,
  degraded `#f59e0b`, down `#ef4444`.
- Log `INFO` badge: `border-blue-500/20 bg-blue-500/10 text-blue-300`
  (was sky, clashed with brand cyan). WARN amber, ERROR rose keep.
- Cyan `#22d3ee` reserved for: active nav pill, chart stroke, primary focus,
  Save primary, live crosshair.

## 7. Pages

- Dashboard grid: `grid-cols-1 md:grid-cols-2 gap-4`; card header
  `p-3 border-b border-slate-800`; body `p-3`; metric/log/topology wells
  uniform `h-[200px]`; directive default `height` 180 -> 200.
- Telemetry: same card/well; chart well `h-[200px]`; window buttons `h-7`.
- Logs: section `flex flex-col min-h-0`; toolbar card `rounded-lg`; header row
  `Time/Level/Service/Message`; viewport `flex-1 min-h-[320px] h-[calc(100vh-140px)]`
  (replaces `100vh-280px` + `max-h-[640px]`).
- Topology: map card `p-2`; SVG `h-[420px] md:h-[480px] w-full ... slice`;
  node initials `fill #030712 font-size 10`, names `fill #e2e8f0 font-size 12`;
  edges `stroke #334155`; aside `lg:sticky lg:top-16 self-start min-h-[420px]`.
- Alerts: grid `xl:grid-cols-5` (builder `xl:col-span-3`, incidents `xl:col-span-2`);
  form `sm:grid-cols-2 gap-3`; Save primary.

## 8. Test contracts

Preserve: all `data-testid`, `aria-*`, `role`, `formControlName`,
`[height]`/`[data]`/`[unit]` inputs, `itemSize=28`, `@defer` + placeholders
(heights updated only), CDK drag/drop + virtual-scroll structure.
Directive spec asserts cursor/drag only; axis font change is cursor-adjacent,
no spec update needed unless asserting `font`.
