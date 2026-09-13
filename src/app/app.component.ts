import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BINANCE_MINI_TICKER_URL } from './core/services/binance-adapter';
import { TelemetryIngestionService } from './core/services/telemetry-ingestion.service';
import { StochasticSimService, type SimScenario } from './core/services/stochastic-sim.service';
import { CoreStore } from './core/store/core-store.service';
import { StatusBannerComponent } from './shared/ui/status-banner/status-banner.component';
import { ConnectionPulseComponent } from './shared/ui/connection-pulse/connection-pulse.component';

const SCENARIOS: readonly SimScenario[] = [
  'normal',
  'cpu-spike',
  'memory-leak',
  'outage',
  'latency-burst',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    StatusBannerComponent,
    ConnectionPulseComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-[#05070b] font-sans text-slate-200">
      <header class="sticky top-0 z-50 border-b border-slate-800 bg-[#05070b]/80 backdrop-blur-md">
        <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
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
          <h1 class="text-base font-bold tracking-tight text-slate-100">
            PulseGrid <span class="font-light text-slate-400">APM</span>
          </h1>
          <app-connection-pulse />
          <nav class="ml-auto flex items-center gap-1 text-xs" aria-label="Primary">
            <a
              routerLink="/dashboard"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              class="rounded-md px-3 py-1.5 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >Dashboard</a
            >
            <a
              routerLink="/telemetry"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              class="rounded-md px-3 py-1.5 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >Telemetry</a
            >
            <a
              routerLink="/logs"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              class="rounded-md px-3 py-1.5 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >Logs</a
            >
            <a
              routerLink="/topology"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              class="rounded-md px-3 py-1.5 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >Topology</a
            >
            <a
              routerLink="/alerts"
              routerLinkActive="bg-cyan-500/10 text-cyan-300"
              ariaCurrentWhenActive="page"
              class="rounded-md px-3 py-1.5 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >Alerts</a
            >
          </nav>
        </div>
      </header>
      <app-status-banner />
      <main class="mx-auto max-w-7xl px-4 py-6">
        <router-outlet />
      </main>
      <footer class="mx-auto max-w-7xl px-4 pb-6 font-mono text-[11px] leading-4 text-slate-400">
        Values derived from Binance market stream + local simulator — not real infrastructure
        probes.
      </footer>
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly ingestion = inject(TelemetryIngestionService);
  private readonly sim = inject(StochasticSimService);
  private readonly store = inject(CoreStore);
  private readonly document = inject(DOCUMENT);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly simState = this.sim.createState(20260913);

  ngOnInit(): void {
    // Deterministic overrides for E2E/demos (documented seam; inert by default):
    //   ?liveUrl=ws://127.0.0.1:9/dead  → force simulator fallback (hermetic CI)
    //   ?scenario=outage                → arm a fault-injection scenario
    const params = new URLSearchParams(this.document.location.search);
    const liveUrl = params.get('liveUrl') ?? BINANCE_MINI_TICKER_URL;
    const scenario = params.get('scenario');
    if (scenario !== null && (SCENARIOS as readonly string[]).includes(scenario)) {
      this.sim.setScenario(scenario as SimScenario);
    }
    // Sole ingestion→store wiring (signals bridge). Components never subscribe.
    this.store.bindIngestion(this.ingestion.metrics$(liveUrl));
    // Mirror connection status into the store + synthesize correlated demo logs.
    this.timer = setInterval(() => {
      this.store.setConnectionStatus(this.ingestion.connectionStatus());
      if (this.ingestion.connectionStatus() === 'simulated') {
        const now = Date.now();
        const batch = this.sim.generateBatch(this.simState, this.sim.scenario(), now);
        this.store.appendLogs(this.sim.logsFor(batch, now));
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.store.unbind();
  }
}
