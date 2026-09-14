import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  effect,
  inject,
  signal,
  DOCUMENT,
} from '@angular/core';

import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { WIKIMEDIA_RECENTCHANGE_URL } from './core/services/wikimedia-adapter';
import { WikimediaStreamService } from './core/services/wikimedia-stream.service';
import { LogIngestionService } from './core/services/log-ingestion.service';
import { TelemetryIngestionService } from './core/services/telemetry-ingestion.service';
import { StochasticSimService, type SimScenario } from './core/services/stochastic-sim.service';
import { CoreStore } from './core/store/core-store.service';
import { StatusBannerComponent } from './shared/ui/status-banner/status-banner.component';

const SCENARIOS: readonly SimScenario[] = [
  'normal',
  'cpu-spike',
  'memory-leak',
  'outage',
  'latency-burst',
];

/** Viewport width (px) at which the inline desktop nav replaces the drawer. */
const DESKTOP_NAV_BREAKPOINT = 768;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, StatusBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-[#05070b] font-sans text-slate-200">
      <a
        href="#main"
        class="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-2 focus:rounded-md focus:bg-cyan-500/10 focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-cyan-300 focus:outline-none"
        >Skip to content</a
      >
      <header class="sticky top-0 z-50 border-b border-slate-800 bg-[#05070b]/80 backdrop-blur-md">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <span
            class="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/20"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <h1 class="shrink-0 text-sm font-bold tracking-tight text-slate-100 md:text-base">
            PulseGrid <span class="font-light text-slate-400">APM</span>
          </h1>
          <app-status-banner
            (retry)="retryLiveConnection()"
            class="ml-1 min-w-0 max-w-[38vw] md:ml-3 md:max-w-none"
          />
          <button
            type="button"
            (click)="toggleMobileMenu()"
            [attr.aria-expanded]="isMobileMenuOpen()"
            aria-controls="primary-navigation"
            aria-label="Toggle navigation menu"
            class="ml-auto inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 md:hidden"
          >
            @if (isMobileMenuOpen()) {
              <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="2"
                  fill="none"
                  stroke-linecap="round"
                />
              </svg>
            } @else {
              <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  stroke-width="2"
                  fill="none"
                  stroke-linecap="round"
                />
              </svg>
            }
          </button>
          <!-- Mobile drawer overlays content (the sticky header is its positioning
            context). Never add 'relative' to the header element: it would
            override 'sticky'. -->
          <nav
            id="primary-navigation"
            data-testid="primary-nav"
            [class.hidden]="!isMobileMenuOpen()"
            class="absolute inset-x-0 top-full z-50 order-3 flex max-h-[70dvh] w-full min-w-0 flex-col gap-1 overflow-y-auto border-b border-slate-800 bg-slate-950/95 px-4 py-2 text-sm shadow-lg shadow-black/50 backdrop-blur-md md:static md:order-none md:z-auto md:ml-auto md:flex md:max-h-none md:w-auto md:flex-row md:items-center md:gap-1 md:overflow-visible md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:text-xs md:shadow-none"
            aria-label="Primary"
          >
            <a
              routerLink="/dashboard"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              (click)="closeMobileMenu()"
              class="inline-flex min-h-[44px] w-full items-center rounded-md px-3 py-2 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 md:w-auto md:min-h-0 md:py-1.5"
              >Dashboard</a
            >
            <a
              routerLink="/telemetry"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              (click)="closeMobileMenu()"
              class="inline-flex min-h-[44px] w-full items-center rounded-md px-3 py-2 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 md:w-auto md:min-h-0 md:py-1.5"
              >Telemetry</a
            >
            <a
              routerLink="/logs"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              (click)="closeMobileMenu()"
              class="inline-flex min-h-[44px] w-full items-center rounded-md px-3 py-2 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 md:w-auto md:min-h-0 md:py-1.5"
              >Logs</a
            >
            <a
              routerLink="/topology"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              (click)="closeMobileMenu()"
              class="inline-flex min-h-[44px] w-full items-center rounded-md px-3 py-2 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 md:w-auto md:min-h-0 md:py-1.5"
              >Topology</a
            >
            <a
              routerLink="/alerts"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              (click)="closeMobileMenu()"
              class="inline-flex min-h-[44px] w-full items-center rounded-md px-3 py-2 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 md:w-auto md:min-h-0 md:py-1.5"
              >Alerts</a
            >
          </nav>
        </div>
      </header>
      <main id="main" class="mx-auto max-w-7xl px-4 py-6">
        <router-outlet />
      </main>
      <footer
        data-testid="app-footer"
        class="mx-auto max-w-7xl px-4 pb-6 font-mono text-[11px] leading-4 text-slate-400"
      >
        Metrics and telemetry derived from the live Wikimedia EventStreams feed + local simulator
        fallback.
      </footer>
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly ingestion = inject(TelemetryIngestionService);
  private readonly logIngestion = inject(LogIngestionService);
  private readonly sim = inject(StochasticSimService);
  private readonly store = inject(CoreStore);
  private readonly stream = inject(WikimediaStreamService);
  private readonly document = inject(DOCUMENT);
  private unbindIngestion: (() => void) | null = null;
  private unbindLogs: (() => void) | null = null;

  /** Mobile drawer state (UI signal; zoneless-safe, no subscriptions). */
  readonly isMobileMenuOpen = signal(false);

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    // Keep aria-expanded honest when growing into the md: inline nav.
    const width = this.document.defaultView?.innerWidth ?? 0;
    if (width >= DESKTOP_NAV_BREAKPOINT && this.isMobileMenuOpen()) {
      this.isMobileMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeMobileMenu();
  }

  constructor() {
    // Continuous one-way mirror of ingestion status into the store
    // (side-effect only). Replaces the 1s setInterval poll — constitution §3
    // forbids timers in components.
    effect(() => {
      this.store.setConnectionStatus(this.logIngestion.status());
    });
  }

  ngOnInit(): void {
    // Deterministic overrides for E2E/demos (documented seam; inert by default):
    //   ?liveUrl=ws://127.0.0.1:9/dead  → force simulator fallback (hermetic CI)
    //   ?scenario=outage                → arm a fault-injection scenario
    const liveUrl = this.currentLiveUrl();
    const params = new URLSearchParams(this.document.location.search);
    const scenario = params.get('scenario');
    if (scenario !== null && (SCENARIOS as readonly string[]).includes(scenario)) {
      this.sim.setScenario(scenario as SimScenario);
    }
    // Sole ingestion→store wiring (signals bridge). Components never subscribe;
    // correlated demo logs flow from LogIngestionService (RxJS interval there).
    this.bindStreams(liveUrl);
  }

  /**
   * Manual reconnect for `Retry Live`: teardown old sockets, evict the
   * shared-stream cache, re-read `liveUrl` (dynamic per approved plan), and
   * rebind fresh streams. The 5s handshake guard in `WikimediaStreamService`
   * fails fast to `simulated` with an error instead of sticking in
   * `reconnecting`.
   */
  retryLiveConnection(): void {
    const liveUrl = this.currentLiveUrl();
    // Unsubscribe first so the refCounted shared socket closes (client
    // close 1000) before the cache entry is evicted.
    this.unbindIngestion?.();
    this.unbindIngestion = null;
    this.unbindLogs?.();
    this.unbindLogs = null;
    this.stream.disconnect(liveUrl);
    this.ingestion.retryLive(liveUrl);
    this.bindStreams(liveUrl);
    // Set after bind: bindIngestion mirrors the (possibly stale) status
    // signal once, so the explicit reconnecting wins until live/sim resolves.
    this.store.setConnectionStatus('reconnecting');
  }

  private currentLiveUrl(): string {
    const params = new URLSearchParams(this.document.location.search);
    return params.get('liveUrl') ?? WIKIMEDIA_RECENTCHANGE_URL;
  }

  private bindStreams(liveUrl: string): void {
    this.unbindIngestion = this.store.bindIngestion(
      this.ingestion.metrics$(liveUrl),
      this.logIngestion.status,
    );
    this.unbindLogs = this.store.bindLogs(this.logIngestion.logs$(liveUrl));
  }

  ngOnDestroy(): void {
    this.unbindIngestion?.();
    this.unbindIngestion = null;
    this.unbindLogs?.();
    this.unbindLogs = null;
  }
}
