import { Injectable, type Signal } from '@angular/core';
import { EMPTY, catchError, interval, map, merge, tap, type Observable } from 'rxjs';
import type { ConnectionStatus } from '../models/alert-rule.model';
import type { LogEntry } from '../models/log-entry.model';
import { CoreStore } from '../store/core-store.service';
import { StochasticSimService } from './stochastic-sim.service';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { WIKIMEDIA_RECENTCHANGE_URL, adaptWikimediaToLogs } from './wikimedia-adapter';
import { WikimediaStreamService } from './wikimedia-stream.service';

/* eslint-disable @angular-eslint/prefer-inject -- manually constructed in specs with deterministic fakes (new LogIngestionService(sim, telemetry, store, wikimedia)); inject() would break that harness */

/** Correlated-log cadence: matches the 1s rhythm of the `AppComponent` timer this service replaces. */
export const LOG_TICK_MS = 1000;

/** Deterministic sim seed (carried over from the former `AppComponent` timer). */
export const LOG_SIM_SEED = 20260913;

/**
 * Correlated demo-log ingestion (RxJS-only, constitution §3).
 *
 * Delta 008: live Wikimedia edit events flow as HTTP-style log entries while
 * the stream is healthy (`GET /wiki/{Title} 200`, bot → `429`, reverted →
 * `403`); the simulator path only emits after failover. The store subscribes
 * via `CoreStore.bindLogs()` — components never subscribe.
 */
@Injectable({ providedIn: 'root' })
export class LogIngestionService {
  /** Read-only mirror source for the store bridge (no polling in components). */
  readonly status: Signal<ConnectionStatus>;

  constructor(
    private readonly sim: StochasticSimService,
    private readonly telemetry: TelemetryIngestionService,
    private readonly store: CoreStore,
    private readonly wikimedia: WikimediaStreamService,
  ) {
    this.status = this.telemetry.connectionStatus;
  }

  /**
   * Live Wikimedia logs merged with the 1Hz correlated sim-log clock.
   * @param liveUrl override for tests/E2E (shares the stream-service cache,
   * so metrics + logs reuse a single socket for the same URL).
   */
  logs$(liveUrl: string = WIKIMEDIA_RECENTCHANGE_URL): Observable<LogEntry[]> {
    const liveLogs$ = this.wikimedia.frames$(liveUrl).pipe(
      map((events): LogEntry[] => {
        if (this.telemetry.connectionStatus() !== 'live') return [];
        return adaptWikimediaToLogs(events, Date.now());
      }),
      catchError(() => EMPTY),
    );
    return merge(liveLogs$, this.simTicks$());
  }

  private simTicks$(): Observable<LogEntry[]> {
    const state = this.sim.createState(LOG_SIM_SEED);
    return interval(LOG_TICK_MS).pipe(
      map((): LogEntry[] => {
        if (this.telemetry.connectionStatus() !== 'simulated') return [];
        const now = Date.now();
        return this.sim.logsFor(this.sim.generateBatch(state, this.sim.scenario(), now), now);
      }),
      // Drive health-outage expiry on the same 1Hz clock (replaces commit-only expiry).
      tap((): void => {
        this.store.bumpHealthTick();
      }),
    );
  }
}
