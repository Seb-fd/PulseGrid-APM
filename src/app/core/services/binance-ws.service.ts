import { Injectable } from '@angular/core';
import { Observable, retry, timeout, timer } from 'rxjs';
import { webSocket, type WebSocketSubjectConfig } from 'rxjs/webSocket';
import type { BinanceMiniTicker } from '../models/telemetry-metric.model';
import { BINANCE_MINI_TICKER_URL } from './binance-adapter';

/** Injection-friendly factory so unit tests never open a real socket. */
export type FrameSourceFactory = (url: string) => Observable<BinanceMiniTicker[]>;

export function defaultFrameSource(url: string): Observable<BinanceMiniTicker[]> {
  const config: WebSocketSubjectConfig<BinanceMiniTicker[]> = {
    url,
    deserializer: (msg) => {
      const raw: unknown = msg.data;
      return JSON.parse(typeof raw === 'string' ? raw : '[]') as BinanceMiniTicker[];
    },
  };
  return webSocket<BinanceMiniTicker[]>(config).asObservable();
}

export const LIVE_SILENCE_TIMEOUT_MS = 10_000;
export const LIVE_RETRY_ATTEMPTS = 3;

/**
 * Binance WS access with watchdog + exponential backoff.
 * RxJS-only (no Signals): constitution §3 — ingestion layer.
 */
@Injectable({ providedIn: 'root' })
export class BinanceWsService {
  frames$(
    url: string = BINANCE_MINI_TICKER_URL,
    factory: FrameSourceFactory = defaultFrameSource,
  ): Observable<BinanceMiniTicker[]> {
    return factory(url).pipe(
      // No frame for 10s → treat as dead connection.
      timeout({ each: LIVE_SILENCE_TIMEOUT_MS }),
      retry({
        count: LIVE_RETRY_ATTEMPTS,
        delay: (_error: unknown, retryCount: number) =>
          timer(Math.min(1000 * 2 ** (retryCount - 1), 30_000)),
      }),
    );
  }
}
