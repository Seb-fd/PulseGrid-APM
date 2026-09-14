import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, firstValueFrom, throwError } from 'rxjs';
import { StochasticSimService } from './stochastic-sim.service';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import type { WikimediaRecentChange } from './wikimedia-adapter';
import { WikimediaStreamService } from './wikimedia-stream.service';

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

function makeService(
  opts: {
    live?: WikimediaStreamService;
    sim?: StochasticSimService;
  } = {},
): TelemetryIngestionService {
  const live = opts.live ?? new WikimediaStreamService();
  const sim = opts.sim ?? new StochasticSimService();
  return new TelemetryIngestionService(live, sim);
}

describe('GIVEN TelemetryIngestionService', () => {
  it('WHEN live succeeds THEN status becomes live and metrics flow', async () => {
    const batch = [edit('Albert Einstein'), edit('Paris')];
    const live = new WikimediaStreamService();
    // BehaviorSubject stays open so sampleTime(100) can emit on its tick.
    vi.spyOn(live, 'frames$').mockReturnValue(new BehaviorSubject(batch));
    const svc = makeService({ live });
    const out = await firstValueFrom(svc.metrics$('ws://mock', 1));
    expect(out).toHaveLength(4);
    expect(out.map((m) => m.kind).sort()).toEqual(['cpu', 'latency', 'memory', 'throughput']);
    expect(out.every((m) => m.source === 'live')).toBe(true);
    expect(out.find((m) => m.kind === 'throughput')?.value).toBe(2);
    expect(svc.connectionStatus()).toBe('live');
  });

  it('WHEN live fails THEN falls back to simulated with banner status', async () => {
    const live = new WikimediaStreamService();
    vi.spyOn(live, 'frames$').mockReturnValue(throwError(() => new Error('socket hangup')));
    const svc = makeService({ live });
    const out = await firstValueFrom(svc.metrics$('ws://dead', 7));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.source).toBe('simulated');
    expect(svc.connectionStatus()).toBe('simulated');
    expect(svc.lastError()).toContain('socket hangup');
  });

  it('WHEN retryLive called THEN status resets to reconnecting and cache is evicted', () => {
    const live = new WikimediaStreamService();
    const disconnectSpy = vi.spyOn(live, 'disconnect');
    const svc = makeService({ live });
    svc.connectionStatus.set('simulated');
    svc.retryLive('ws://mock/retry');
    expect(svc.connectionStatus()).toBe('reconnecting');
    expect(svc.lastError()).toBeNull();
    expect(disconnectSpy).toHaveBeenCalledWith('ws://mock/retry');
  });

  it('WHEN retryLive called without URL THEN all cached streams are evicted', () => {
    const live = new WikimediaStreamService();
    const disconnectSpy = vi.spyOn(live, 'disconnect');
    const svc = makeService({ live });
    svc.retryLive();
    expect(disconnectSpy).toHaveBeenCalledWith(undefined);
    expect(svc.connectionStatus()).toBe('reconnecting');
  });

  it('WHEN retry after failure THEN a fresh metrics$ recovers to live', async () => {
    const live = new WikimediaStreamService();
    const framesSpy = vi
      .spyOn(live, 'frames$')
      .mockReturnValueOnce(throwError(() => new Error('socket hangup')))
      .mockReturnValue(new BehaviorSubject([edit('Recovered Page')]));
    const svc = makeService({ live });
    const failed = await firstValueFrom(svc.metrics$('ws://dead', 7));
    expect(failed[0]?.source).toBe('simulated');
    expect(svc.connectionStatus()).toBe('simulated');
    svc.retryLive('ws://mock');
    expect(svc.connectionStatus()).toBe('reconnecting');
    const recovered = await firstValueFrom(svc.metrics$('ws://mock', 7));
    expect(recovered.every((m) => m.source === 'live')).toBe(true);
    expect(svc.connectionStatus()).toBe('live');
    expect(framesSpy).toHaveBeenCalledTimes(2);
  });
});

describe('GIVEN StochasticSimService', () => {
  it('WHEN scenarios run THEN shapes match contracts', () => {
    const sim = new StochasticSimService();
    const now = 1_700_000_000_000;
    for (const s of ['normal', 'cpu-spike', 'memory-leak', 'outage', 'latency-burst'] as const) {
      const batch = sim.generateBatch(sim.createState(11), s, now);
      expect(batch.length).toBeGreaterThan(0);
      for (const m of batch) expect(m.source).toBe('simulated');
    }
    const spike = sim.generateBatch(sim.createState(3), 'cpu-spike', now);
    expect(spike.find((m) => m.kind === 'cpu')?.value ?? 0).toBeGreaterThan(85);

    const outage = sim.generateBatch(sim.createState(0), 'outage', now);
    const logs = sim.logsFor(outage, now);
    expect(logs.some((l) => l.level === 'ERROR')).toBe(true);
  });

  it('WHEN deterministic seed THEN reproducible', () => {
    const sim = new StochasticSimService();
    const a = sim.generateBatch(sim.createState(99), 'normal', 5);
    const b = sim.generateBatch(sim.createState(99), 'normal', 5);
    expect(a).toEqual(b);
  });
});
