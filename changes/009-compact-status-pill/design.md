# 009 — Compact Status Pill — Design

> Frozen contracts for delta 009. No domain-type changes. No constitution
> changes. Detailed copy stays in the dashboard overview banner.

## 1. StatusBanner pill contract

```ts
// src/app/shared/ui/status-banner/status-banner.component.ts
export class StatusBannerComponent {
  private readonly store = inject(CoreStore);
  readonly status = this.store.connectionStatus; // Signal<ConnectionStatus>
  readonly shortLabel: Signal<string>; // pill-visible text per breakpoint span
  readonly fullLabel: Signal<string>; // title + aria-label per status
  retry(): void; // setConnectionStatus('reconnecting')
}
```

- Root element: `role="status"`, `[attr.data-status]="status()"`,
  `data-testid="status-pill"`, `[attr.title]="fullLabel()"`,
  `[attr.aria-label]="fullLabel()"`.
- Root classes (inline pill, never a block bar):
  `inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap`
  plus per-status `border-*/bg-*/text-*` (emerald live, amber simulated,
  rose reconnecting — same palette as today).
- Pulsing dot: `span aria-hidden="true"` with
  `h-2 w-2 rounded-full bg-current animate-pulse` (subtle pulse, no custom
  keyframes, no layout shift).
- Labels:
  - `fullLabel()`: live → `Connected to Wikimedia Global Event Stream`;
    simulated → `SIMULATED — fallback generator (live unreachable)`;
    reconnecting → `RECONNECTING — attempting live stream…`.
  - Desktop span (`hidden sm:inline`): live → `Live: Wikimedia EventStreams`;
    simulated → `Simulated fallback`; reconnecting → `Reconnecting…`.
  - Mobile span (`sm:hidden truncate`): live → `LIVE`; simulated →
    `SIMULATED`; reconnecting → `RECONNECTING`.
- Retry button (only when `status() !== 'live'`): `type="button"`,
  text `Retry Live`, compact pill classes
  (`ml-1 rounded-full border border-current px-1.5 py-px text-[11px] hover:bg-white/10`).
- Purity: pure signal reader, no `subscribe()`, no timers, `OnPush`,
  standalone. Explicit return types on all public APIs.

## 2. Header integration contract

```html
<!-- src/app/app.component.ts header -->
<h1>PulseGrid APM</h1>
<app-status-banner class="ml-2 min-w-0 max-w-[48vw] sm:ml-3 sm:max-w-none" />
<nav class="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 text-xs">
  …
</nav>
```

- Delete the standalone `<app-status-banner />` row below `<header>`.
- Delete `<app-connection-pulse />` import + element (pill owns the dot).
- Host classes on `<app-status-banner>` give left spacing, allow the pill
  to shrink (`min-w-0`), and cap it at `48vw` on mobile so long states
  (`SIMULATED` + Retry) truncate instead of pushing `<nav>` off-screen.
- Header container and `<nav>` gain `flex-wrap` so the 5 nav links wrap to a
  second line below 768px instead of forcing page-level horizontal overflow.
  Desktop (≥1024px) is unchanged — everything still fits one row.
- Footer footnote (`Values derived from Wikimedia…`) unchanged.

## 3. Dashboard overview contract (unchanged)

- `DashboardGridComponent.liveStatusText()` + `<p
data-testid="dashboard-live-status">` inside `What is PulseGrid APM?`
  remain the detailed explanation. This delta does not edit that copy.

## 4. Test contracts

| Criterion                                                                                                                                              | Spec                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Live → desktop span `Live: Wikimedia EventStreams`, mobile span `LIVE`, root `title`/`aria-label` = full string, `data-status="live"`, no retry button | `status-banner.spec.ts`                                         |
| Simulated → spans `Simulated fallback` / `SIMULATED`, retry button present; click → `reconnecting`                                                     | `status-banner.spec.ts`                                         |
| Reconnecting → spans `Reconnecting…` / `RECONNECTING`, pill classes (no `border-b`/block bar)                                                          | `status-banner.spec.ts`                                         |
| Mock WS live → overview line keeps full string; pill `role=status` shows compact desktop text with full `aria-label`                                   | `e2e/wikimedia-live.spec.ts`                                    |
| Dead-port → pill `role=status` shows `SIMULATED` + `Retry Live` visible                                                                                | `e2e/wikimedia-live.spec.ts`                                    |
| Mobile 375px → pill shows `LIVE`, full string in `title`, no horizontal overflow (`scrollWidth <= innerWidth`)                                         | `e2e/wikimedia-live.spec.ts` (new test, `test.use({viewport})`) |
| Shell boots with `header app-status-banner` + `PulseGrid APM` heading                                                                                  | `e2e/app.spec.ts`                                               |
