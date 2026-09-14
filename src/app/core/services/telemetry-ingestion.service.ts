import { Injectable, signal } from '@angular/core';
import { catchError, map, sampleTime, shareReplay, tap, type Observable } from 'rxjs';
import type { ConnectionStatus } from '../models/alert-rule.model';
import type { TelemetryMetric } from '../models/telemetry-metric.model';
import { WIKIMEDIA_RECENTCHANGE_URL, adaptWikimediaToMetrics } from './wikimedia-adapter';
import { WikimediaStreamService } from './wikimedia-stream.service';
import { StochasticSimService } from './stochastic-sim.service';

/* eslint-disable @angular-eslint/prefer-inject -- manually constructed in specs with deterministic fakes (new TelemetryIngestionService(live, sim)); inject() would break that harness */

/**
 * Hybrid ingestion: Wikimedia live → adapter → backpressure → shareReplay,
 * with seamless fallback to the stochastic simulator.
 *
 * Delta 008: Wikimedia Global Event Stream replaced Binance as the default
 * live source (constitution §6 amendment note in
 * changes/008-live-wikimedia-telemetry/proposal.md §2). Throughput is real
 * edits/sec and latency is real event-time lag; cpu/memory stay synthetic
 * load indicators derived from throughput intensity.
 *
 * Backpressure: `sampleTime(100)` caps store commits at ~10Hz (well under the
 * 60 FPS / 16ms render budget; charts batch further via rAF in Phase 3).
 * Status transitions: reconnecting → live (first frame) | reconnecting → simulated (live fails).
 */
@Injectable({ providedIn: 'root' })
export class TelemetryIngestionService {
  readonly connectionStatus = signal<ConnectionStatus>('reconnecting');
  readonly lastError = signal<string | null>(null);

  constructor(
    private readonly live: WikimediaStreamService,
    private readonly sim: StochasticSimService,
  ) {}

  /**
   * @param liveUrl override for tests/E2E (points at mock WS server).
   * @param simSeed deterministic sim seed (tests).
   */
  metrics$(
    liveUrl: string = WIKIMEDIA_RECENTCHANGE_URL,
    simSeed = Date.now() % 2_147_483_647,
  ): Observable<TelemetryMetric[]> {
    const live$ = this.live.frames$(liveUrl).pipe(
      map((events) => adaptWikimediaToMetrics(events, Date.now())),
      tap({
        next: () => {
          this.connectionStatus.set('live');
          this.lastError.set(null);
        },
      }),
    );

    const fallback$ = this.sim.metrics$(simSeed).pipe(
      tap({
        subscribe: () => {
          if (this.connectionStatus() === 'reconnecting') this.connectionStatus.set('simulated');
        },
      }),
    );

    // Live first; on terminal failure (after stream-service retries + SSE
    // fallback) fall back to the cold simulator stream.
    return live$.pipe(
      catchError((err: unknown) => {
        this.connectionStatus.set('simulated');
        this.lastError.set(err instanceof Error ? err.message : String(err));
        return fallback$;
      }),
      // Cap commit rate: raw WS bursts (100–1000 msg/s) → ≤10 store writes/s.
      sampleTime(100),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  retryLive(liveUrl?: string): void {
    // Invalidate the cached socket so the next metrics$() opens a fresh
    // connection (AppComponent rebinds immediately after this call).
    this.live.disconnect(liveUrl);
    this.connectionStatus.set('reconnecting');
    this.lastError.set(null);
  }
}
