import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, EMPTY, NEVER, Observable, Subject, throwError } from 'rxjs';
import { WIKIMEDIA_CONNECT_TIMEOUT_MS, WikimediaStreamService } from './wikimedia-stream.service';
import type { WikimediaRecentChange } from './wikimedia-adapter';

function edit(title: string): WikimediaRecentChange {
  return {
    wiki: 'enwiki',
    title,
    type: 'edit',
    user: 'Alice',
    bot: false,
    minor: false,
    timestamp: 1_700_000_000,
    eventDt: '2023-11-14T22:13:20Z',
    comment: 'fix typo',
    serverName: 'en.wikipedia.org',
    lengthOld: 1000,
    lengthNew: 1010,
  };
}

describe('GIVEN WikimediaStreamService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('WHEN WS events flow THEN they batch into 1s windows', () => {
    vi.useFakeTimers();
    const svc = new WikimediaStreamService();
    const subject = new Subject<WikimediaRecentChange>();
    const batches: WikimediaRecentChange[][] = [];
    const sub = svc
      .frames$(
        'wss://mock/batch',
        () => subject.asObservable(),
        () => EMPTY,
      )
      .subscribe((b) => {
        batches.push(b);
      });
    try {
      subject.next(edit('Albert Einstein'));
      subject.next(edit('Paris'));
      vi.advanceTimersByTime(1000);
      expect(batches).toHaveLength(1);
      expect(batches[0]?.map((e) => e.title).sort()).toEqual(['Albert Einstein', 'Paris']);
      // Quiet windows still emit (empty batch → baseline metrics downstream).
      vi.advanceTimersByTime(1000);
      expect(batches).toHaveLength(2);
      expect(batches[1]).toEqual([]);
    } finally {
      sub.unsubscribe();
    }
  });

  it('WHEN WS fails terminally THEN SSE fallback emits', () => {
    vi.useFakeTimers();
    const svc = new WikimediaStreamService();
    // Count subscriptions (initial + 3 backoff retries): `retry` resubscribes
    // to the source observable, so the factory itself is invoked once.
    let wsSubscriptions = 0;
    const wsFactory = (): Observable<WikimediaRecentChange> =>
      new Observable<WikimediaRecentChange>((subscriber) => {
        wsSubscriptions += 1;
        subscriber.error(new Error('ws dead'));
      });
    const sseFactory = vi.fn(() => new BehaviorSubject(edit('Fallback Page')).asObservable());
    const batches: WikimediaRecentChange[][] = [];
    const errors: unknown[] = [];
    const sub = svc.frames$('wss://mock/fallback', wsFactory, sseFactory).subscribe({
      next: (b) => {
        batches.push(b);
      },
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    try {
      // Exhaust WS retries (backoff 1s + 2s + 4s), then SSE subscribes and
      // its synchronous emission lands in the next 1s buffer window.
      vi.advanceTimersByTime(20_000);
      expect(wsSubscriptions).toBe(4);
      expect(sseFactory).toHaveBeenCalledTimes(1);
      expect(errors).toHaveLength(0);
      expect(batches.some((b) => b.some((e) => e.title === 'Fallback Page'))).toBe(true);
    } finally {
      sub.unsubscribe();
    }
  });

  it('WHEN both transports fail THEN the error propagates (ingestion falls back to sim)', () => {
    vi.useFakeTimers();
    const svc = new WikimediaStreamService();
    const batches: WikimediaRecentChange[][] = [];
    const errors: unknown[] = [];
    const sub = svc
      .frames$(
        'wss://mock/dual-fail',
        () => throwError(() => new Error('ws dead')),
        () => throwError(() => new Error('sse dead')),
      )
      .subscribe({
        next: (b) => {
          batches.push(b);
        },
        error: (e: unknown) => {
          errors.push(e);
        },
      });
    try {
      vi.advanceTimersByTime(20_000);
      expect(errors).toHaveLength(1);
      expect(String(errors[0])).toContain('sse dead');
    } finally {
      sub.unsubscribe();
    }
  });

  it('WHEN custom factories share a URL THEN streams stay isolated (no cache bleed)', () => {
    vi.useFakeTimers();
    const svc = new WikimediaStreamService();
    const subjectA = new Subject<WikimediaRecentChange>();
    const subjectB = new Subject<WikimediaRecentChange>();
    const batchesA: WikimediaRecentChange[][] = [];
    const batchesB: WikimediaRecentChange[][] = [];
    const subA = svc
      .frames$(
        'wss://mock/shared',
        () => subjectA.asObservable(),
        () => EMPTY,
      )
      .subscribe((b) => {
        batchesA.push(b);
      });
    const subB = svc
      .frames$(
        'wss://mock/shared',
        () => subjectB.asObservable(),
        () => EMPTY,
      )
      .subscribe((b) => {
        batchesB.push(b);
      });
    try {
      subjectA.next(edit('Only A'));
      vi.advanceTimersByTime(1000);
      expect(batchesA[0]).toHaveLength(1);
      expect(batchesB[0]).toEqual([]);
    } finally {
      subA.unsubscribe();
      subB.unsubscribe();
    }
  });

  it('WHEN handshake guard configured THEN connect timeout is 5s', () => {
    expect(WIKIMEDIA_CONNECT_TIMEOUT_MS).toBe(5_000);
  });

  it('WHEN disconnect(url) called THEN the cached socket is evicted (fresh retry opens a new socket)', () => {
    const svc = new WikimediaStreamService();
    // No subscription yet, so no real socket opens — identity proves caching.
    const first = svc.frames$('wss://mock/disconnect-me');
    const cached = svc.frames$('wss://mock/disconnect-me');
    expect(cached).toBe(first);
    svc.disconnect('wss://mock/disconnect-me');
    const fresh = svc.frames$('wss://mock/disconnect-me');
    expect(fresh).not.toBe(first);
    svc.disconnect();
  });

  it('WHEN disconnect() called without URL THEN all cached connections are evicted', () => {
    const svc = new WikimediaStreamService();
    const a = svc.frames$('wss://mock/disconnect-a');
    const b = svc.frames$('wss://mock/disconnect-b');
    svc.disconnect();
    expect(svc.frames$('wss://mock/disconnect-a')).not.toBe(a);
    expect(svc.frames$('wss://mock/disconnect-b')).not.toBe(b);
    svc.disconnect();
  });

  it('WHEN WS hangs silently THEN the 5s handshake timeout triggers a retry (not 10s)', () => {
    vi.useFakeTimers();
    const svc = new WikimediaStreamService();
    let wsSubscriptions = 0;
    const wsFactory = (): Observable<WikimediaRecentChange> =>
      new Observable<WikimediaRecentChange>(() => {
        wsSubscriptions += 1;
        // Hung handshake: never emits, never errors, never completes.
        return undefined;
      });
    const sub = svc.frames$('wss://mock/hang', wsFactory, () => EMPTY).subscribe();
    try {
      expect(wsSubscriptions).toBe(1);
      // 5s handshake timeout fires, then the 1s backoff elapses → resubscribe.
      vi.advanceTimersByTime(5_000);
      vi.advanceTimersByTime(1_000);
      expect(wsSubscriptions).toBe(2);
    } finally {
      sub.unsubscribe();
    }
  });

  it('WHEN SSE hangs after WS failure THEN the 5s guard fails fast to error (ingestion falls back to sim)', () => {
    vi.useFakeTimers();
    const svc = new WikimediaStreamService();
    const errors: unknown[] = [];
    const sub = svc
      .frames$(
        'wss://mock/sse-hang',
        () => throwError(() => new Error('ws dead')),
        () => NEVER,
      )
      .subscribe({
        error: (e: unknown) => {
          errors.push(e);
        },
      });
    try {
      // WS retries back off 1s + 2s + 4s, then SSE hangs → 5s guard errors.
      vi.advanceTimersByTime(20_000);
      expect(errors).toHaveLength(1);
      expect(String(errors[0])).toMatch(/Timeout/i);
    } finally {
      sub.unsubscribe();
    }
  });
});
