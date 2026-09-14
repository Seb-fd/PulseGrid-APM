import { Injectable } from '@angular/core';
import { bufferTime, catchError, filter, map, retry, timeout, timer, type Observable } from 'rxjs';
import { webSocket, type WebSocketSubjectConfig } from 'rxjs/webSocket';
import { Observable as RxObservable } from 'rxjs';
import { shareReplay } from 'rxjs';
import {
  normalizeRecentChange,
  WIKIMEDIA_RECENTCHANGE_URL,
  type WikimediaRecentChange,
} from './wikimedia-adapter';

/** Injection-friendly factories so unit tests never open a real socket. */
export type WsEventSourceFactory = (url: string) => Observable<WikimediaRecentChange>;
export type SseEventSourceFactory = (url: string) => Observable<WikimediaRecentChange>;

export const WIKIMEDIA_SILENCE_TIMEOUT_MS = 10_000;
export const WIKIMEDIA_RETRY_ATTEMPTS = 3;

/**
 * Handshake guard for manual reconnect: if the transport emits nothing
 * (no open frame / no event / no error) within 5s, fail fast so ingestion
 * falls back to `simulated` instead of sticking in `reconnecting`.
 */
export const WIKIMEDIA_CONNECT_TIMEOUT_MS = 5_000;

/** 1s event batches: batch length == real edits/sec (throughput). */
export const WIKIMEDIA_FRAME_WINDOW_MS = 1000;

function parseWsPayload(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  return raw;
}

export function defaultWsEvents(url: string): Observable<WikimediaRecentChange> {
  const config: WebSocketSubjectConfig<unknown> = {
    url,
    deserializer: (msg) => parseWsPayload(msg.data),
  };
  return webSocket<unknown>(config)
    .asObservable()
    .pipe(
      map((payload) => normalizeRecentChange(payload)),
      filter((e): e is WikimediaRecentChange => e !== null),
    );
}

function toHttpUrl(url: string): string {
  if (url.startsWith('wss:')) return `https:${url.slice(4)}`;
  if (url.startsWith('ws:')) return `http:${url.slice(3)}`;
  return url;
}

/**
 * Official EventStreams transport wrapped as an Observable.
 * Emits one normalized event per SSE `message`; malformed payloads are
 * dropped; source errors propagate so ingestion can fall back to sim.
 */
export function defaultSseEvents(url: string): Observable<WikimediaRecentChange> {
  return new RxObservable<WikimediaRecentChange>((subscriber) => {
    const httpUrl = toHttpUrl(url);
    let source: EventSource | null = null;
    try {
      source = new EventSource(httpUrl);
    } catch (err) {
      subscriber.error(err instanceof Error ? err : new Error(String(err)));
      return undefined;
    }
    source.onmessage = (ev: MessageEvent): void => {
      try {
        const parsed: unknown = JSON.parse(ev.data as string);
        const event = normalizeRecentChange(parsed);
        if (event !== null) subscriber.next(event);
      } catch {
        // Drop malformed SSE payloads — never fatal.
      }
    };
    source.onerror = (): void => {
      subscriber.error(new Error(`Wikimedia SSE error (${httpUrl})`));
    };
    return (): void => {
      source.close();
    };
  });
}

/**
 * Wikimedia EventStreams access: WebSocket primary + SSE fallback.
 * RxJS-only (no Signals): constitution §3 — ingestion layer.
 */
@Injectable({ providedIn: 'root' })
export class WikimediaStreamService {
  /** Shared connections per URL (single socket for metrics + logs). */
  private readonly shared = new Map<string, Observable<WikimediaRecentChange[]>>();

  frames$(
    url: string = WIKIMEDIA_RECENTCHANGE_URL,
    wsFactory: WsEventSourceFactory = defaultWsEvents,
    sseFactory: SseEventSourceFactory = defaultSseEvents,
  ): Observable<WikimediaRecentChange[]> {
    const custom = wsFactory !== defaultWsEvents || sseFactory !== defaultSseEvents;
    if (!custom) {
      const hit = this.shared.get(url);
      if (hit !== undefined) return hit;
    }
    const events$ = wsFactory(url).pipe(
      // No first frame within 5s (hung handshake) or no event for 10s
      // (dead connection) → treat as a failed connection.
      timeout({ first: WIKIMEDIA_CONNECT_TIMEOUT_MS, each: WIKIMEDIA_SILENCE_TIMEOUT_MS }),
      retry({
        count: WIKIMEDIA_RETRY_ATTEMPTS,
        delay: (_error: unknown, retryCount: number) =>
          timer(Math.min(1000 * 2 ** (retryCount - 1), 30_000)),
      }),
      // Terminal WS failure → official SSE transport before sim fallback.
      // Bound with the same 5s first-emission guard so a hung SSE endpoint
      // also fails fast to the simulator instead of sticking in reconnecting.
      catchError(() => sseFactory(url).pipe(timeout({ first: WIKIMEDIA_CONNECT_TIMEOUT_MS }))),
    );
    const batched$ = events$.pipe(
      bufferTime(WIKIMEDIA_FRAME_WINDOW_MS),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    if (!custom) this.shared.set(url, batched$);
    return batched$;
  }

  /**
   * Teardown/eviction for manual reconnect (`Retry Live`).
   * Drops the cached shared connection so the next `frames$()` for the URL
   * opens a fresh socket. Callers must unsubscribe the previous
   * `frames$`/`metrics$`/`logs$` subscription first (AppComponent unbinds
   * before disconnecting) — the refCounted `shareReplay` teardown then
   * closes the underlying `WebSocketSubject` (client close `1000`) and the
   * SSE `EventSource` before the new connection is created.
   * @param url evict a single URL; omit to evict all cached connections.
   */
  disconnect(url?: string): void {
    if (url === undefined) {
      this.shared.clear();
    } else {
      this.shared.delete(url);
    }
  }

  /** Test helper: drop cached shared connections. */
  clearCache(): void {
    this.disconnect();
  }
}
