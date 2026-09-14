import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { LOG_TICK_MS, LogIngestionService } from './log-ingestion.service';
import { StochasticSimService } from './stochastic-sim.service';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import type { WikimediaRecentChange } from './wikimedia-adapter';
import { WikimediaStreamService } from './wikimedia-stream.service';
import { CoreStore } from '../store/core-store.service';
import type { LogEntry } from '../models/log-entry.model';

function liveEdit(title: string): WikimediaRecentChange {
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

function makeService(): {
  svc: LogIngestionService;
  telemetry: TelemetryIngestionService;
  sim: StochasticSimService;
  store: CoreStore;
  wikimedia: WikimediaStreamService;
} {
  const sim = new StochasticSimService();
  const wikimedia = new WikimediaStreamService();
  // Offline by default: unit tests never open a real socket.
  vi.spyOn(wikimedia, 'frames$').mockReturnValue(EMPTY);
  const telemetry = new TelemetryIngestionService(wikimedia, sim);
  const store = new CoreStore();
  return {
    svc: new LogIngestionService(sim, telemetry, store, wikimedia),
    telemetry,
    sim,
    store,
    wikimedia,
  };
}

/** Collect N 1Hz emissions with fake timers (deterministic, no sockets). */
function collectTicks(
  svc: LogIngestionService,
  ticks: number,
  liveUrl = 'ws://mock',
): LogEntry[][] {
  const out: LogEntry[][] = [];
  const sub = svc.logs$(liveUrl).subscribe((batch) => {
    out.push(batch);
  });
  for (let i = 0; i < ticks; i++) vi.advanceTimersByTime(LOG_TICK_MS);
  sub.unsubscribe();
  return out;
}

describe('GIVEN LogIngestionService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('WHEN live is healthy and quiet THEN ticks emit empty batches', () => {
    vi.useFakeTimers();
    const { svc, telemetry } = makeService();
    telemetry.connectionStatus.set('live');
    const out = collectTicks(svc, 2);
    expect(out).toHaveLength(2);
    expect(out.every((b) => b.length === 0)).toBe(true);
  });

  it('WHEN live Wikimedia events flow THEN HTTP log entries emit', () => {
    vi.useFakeTimers();
    const { svc, telemetry, wikimedia } = makeService();
    telemetry.connectionStatus.set('live');
    vi.spyOn(wikimedia, 'frames$').mockReturnValue(
      new BehaviorSubject([liveEdit('Albert Einstein'), liveEdit('Paris')]),
    );
    const seen: LogEntry[][] = [];
    const sub = svc.logs$('ws://mock-live').subscribe((batch) => {
      seen.push(batch);
    });
    try {
      vi.advanceTimersByTime(LOG_TICK_MS);
      const liveBatches = seen.filter((b) => b.length > 0);
      expect(liveBatches.length).toBeGreaterThan(0);
      const first = liveBatches[0]?.[0];
      expect(first?.message).toContain('GET /wiki/Albert_Einstein 200');
      expect(first?.serviceId).toBe('enwiki');
      expect(seen.flat().every((e) => e.serviceId.length > 0)).toBe(true);
    } finally {
      sub.unsubscribe();
    }
  });

  it('WHEN live fails over to sim THEN outage scenario emits correlated ERROR logs', () => {
    vi.useFakeTimers();
    const { svc, telemetry, sim } = makeService();
    telemetry.connectionStatus.set('simulated');
    sim.setScenario('outage');
    const out = collectTicks(svc, 2);
    expect(out).toHaveLength(2);
    for (const batch of out) {
      // Outage batches carry the zero-throughput ERROR plus its latency WARN.
      expect(batch.length).toBeGreaterThan(0);
      expect(batch.some((e) => e.level === 'ERROR')).toBe(true);
      expect(batch.every((e) => e.serviceId.length > 0)).toBe(true);
    }
  });

  it('WHEN seeded identically THEN batches are deterministic', () => {
    vi.useFakeTimers();
    const fixedNow = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      const first = makeService();
      first.telemetry.connectionStatus.set('simulated');
      first.sim.setScenario('outage');
      const a = collectTicks(first.svc, 2);
      const second = makeService();
      second.telemetry.connectionStatus.set('simulated');
      second.sim.setScenario('outage');
      const b = collectTicks(second.svc, 2);
      expect(a).toEqual(b);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('WHEN read THEN status mirrors the telemetry connection signal', () => {
    const { svc, telemetry } = makeService();
    expect(svc.status()).toBe('reconnecting');
    telemetry.connectionStatus.set('simulated');
    expect(svc.status()).toBe('simulated');
  });

  it('WHEN ticks flow THEN the store health clock advances', () => {
    vi.useFakeTimers();
    const { svc, store } = makeService();
    expect(store.healthTick()).toBe(0);
    collectTicks(svc, 3);
    expect(store.healthTick()).toBe(3);
  });
});
