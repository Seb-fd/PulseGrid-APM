import { describe, expect, it } from 'vitest';
import {
  adaptWikimediaToLogs,
  adaptWikimediaToMetrics,
  normalizeRecentChange,
  wikiPath,
  WIKIMEDIA_LOGS_PER_BATCH,
  WIKIMEDIA_QUIET_LATENCY_MS,
  WIKIMEDIA_RECENTCHANGE_URL,
  WIKIMEDIA_SSE_URL,
  type WikimediaRecentChange,
} from './wikimedia-adapter';

const NOW = 1_700_000_000_000;

function edit(overrides: Partial<WikimediaRecentChange> = {}): WikimediaRecentChange {
  return {
    wiki: 'enwiki',
    title: 'Albert Einstein',
    type: 'edit',
    user: 'Alice',
    bot: false,
    minor: false,
    timestamp: NOW / 1000 - 1,
    eventDt: new Date(NOW - 1000).toISOString(),
    comment: 'fix typo',
    serverName: 'en.wikipedia.org',
    lengthOld: 1000,
    lengthNew: 1010,
    ...overrides,
  };
}

describe('GIVEN Wikimedia recentchange payloads', () => {
  it('WHEN normalized THEN known fields map and unknown payloads are null', () => {
    const raw = {
      wiki: 'dewiki',
      title: 'Berlin',
      type: 'new',
      user: 'Bob',
      bot: false,
      minor: true,
      timestamp: 1700000000,
      meta: { dt: '2023-11-14T22:13:20Z' },
      comment: 'neuer Artikel',
      server_name: 'de.wikipedia.org',
      length: { old: null, new: 500 },
    };
    const out = normalizeRecentChange(raw);
    expect(out).toMatchObject({
      wiki: 'dewiki',
      title: 'Berlin',
      type: 'new',
      user: 'Bob',
      timestamp: 1700000000,
      eventDt: '2023-11-14T22:13:20Z',
      lengthNew: 500,
    });
    expect(normalizeRecentChange(null)).toBeNull();
    expect(normalizeRecentChange('nope')).toBeNull();
    expect(normalizeRecentChange(42)).toBeNull();
    expect(normalizeRecentChange({ unrelated: true })).toBeNull();
  });

  it('WHEN fields missing THEN safe defaults apply and never throw', () => {
    const out = normalizeRecentChange({ title: 'X' });
    expect(out).toMatchObject({ wiki: 'wikimedia', title: 'X', type: 'edit', bot: false });
    expect(out?.timestamp).toBeNaN();
  });
});

describe('GIVEN Wikimedia metric batches', () => {
  it('WHEN adapted THEN emits 4 live metrics with units and stable ids', () => {
    const out = adaptWikimediaToMetrics([edit(), edit({ title: 'Paris' })], NOW);
    expect(out).toHaveLength(4);
    expect(out.map((m) => m.kind).sort()).toEqual(['cpu', 'latency', 'memory', 'throughput']);
    for (const m of out) {
      expect(m.source).toBe('live');
      expect(m.timestamp).toBe(NOW);
      expect(Number.isFinite(m.value)).toBe(true);
    }
    expect(out.find((m) => m.kind === 'throughput')?.value).toBe(2);
    expect(out.find((m) => m.kind === 'cpu')?.unit).toBe('%');
    expect(out.find((m) => m.kind === 'latency')?.unit).toBe('ms');
    expect(out.find((m) => m.kind === 'throughput')?.unit).toBe('rps');
  });

  it('WHEN throughput rises THEN cpu and memory load indicators rise', () => {
    const idle = adaptWikimediaToMetrics([], NOW);
    const busy = adaptWikimediaToMetrics(
      Array.from({ length: 10 }, (_, i) => edit({ title: `Page ${String(i)}` })),
      NOW,
    );
    const cpuIdle = idle.find((m) => m.kind === 'cpu')?.value ?? 0;
    const cpuBusy = busy.find((m) => m.kind === 'cpu')?.value ?? 0;
    expect(cpuBusy).toBeGreaterThan(cpuIdle);
    expect(busy.find((m) => m.kind === 'throughput')?.value).toBe(10);
  });

  it('WHEN event lag grows THEN latency tracks the real round-trip lag', () => {
    const fresh = adaptWikimediaToMetrics([edit({ timestamp: NOW / 1000 })], NOW);
    const stale = adaptWikimediaToMetrics([edit({ timestamp: NOW / 1000 - 5 })], NOW);
    const freshLat = fresh.find((m) => m.kind === 'latency')?.value ?? 0;
    const staleLat = stale.find((m) => m.kind === 'latency')?.value ?? 0;
    expect(staleLat).toBeGreaterThan(freshLat);
    expect(staleLat).toBeLessThanOrEqual(2000);
  });

  it('WHEN batch empty THEN baseline metrics keep charts alive', () => {
    const out = adaptWikimediaToMetrics([], NOW);
    expect(out).toHaveLength(4);
    expect(out.find((m) => m.kind === 'throughput')?.value).toBe(0);
    expect(out.find((m) => m.kind === 'latency')?.value).toBe(WIKIMEDIA_QUIET_LATENCY_MS);
  });

  it('WHEN deterministic THEN same input yields same output', () => {
    const batch = [edit(), edit({ bot: true, user: 'Bot1' })];
    expect(adaptWikimediaToMetrics(batch, NOW)).toEqual(adaptWikimediaToMetrics(batch, NOW));
  });
});

describe('GIVEN Wikimedia log batches', () => {
  it('WHEN standard edit THEN GET /wiki/{Title} 200 INFO', () => {
    const out = adaptWikimediaToLogs([edit()], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.level).toBe('INFO');
    expect(out[0]?.message).toContain('GET /wiki/Albert_Einstein 200');
    expect(out[0]?.message).toContain('enwiki edit by Alice');
    expect(out[0]?.serviceId).toBe('enwiki');
  });

  it('WHEN bot edit THEN 429 WARN', () => {
    const out = adaptWikimediaToLogs([edit({ bot: true, user: 'ClueBot' })], NOW);
    expect(out[0]?.level).toBe('WARN');
    expect(out[0]?.message).toContain('429');
    expect(out[0]?.message).toContain('(bot)');
  });

  it('WHEN log action or revert THEN 403 WARN', () => {
    const logged = adaptWikimediaToLogs([edit({ type: 'log' })], NOW);
    expect(logged[0]?.message).toContain('403');
    const reverted = adaptWikimediaToLogs([edit({ lengthOld: 2000, lengthNew: 100 })], NOW);
    expect(reverted[0]?.message).toContain('403');
    expect(reverted[0]?.level).toBe('WARN');
  });

  it('WHEN batch oversized THEN capped to protect the log ring', () => {
    const big = Array.from({ length: WIKIMEDIA_LOGS_PER_BATCH + 10 }, (_, i) =>
      edit({ title: `Page ${String(i)}` }),
    );
    expect(adaptWikimediaToLogs(big, NOW)).toHaveLength(WIKIMEDIA_LOGS_PER_BATCH);
  });

  it('WHEN deterministic THEN same input yields same output', () => {
    const batch = [edit(), edit({ bot: true, user: 'Bot1' })];
    expect(adaptWikimediaToLogs(batch, NOW)).toEqual(adaptWikimediaToLogs(batch, NOW));
  });
});

describe('GIVEN Wikimedia URL and path helpers', () => {
  it('WHEN read THEN stream URLs use the public EventStreams endpoint', () => {
    expect(WIKIMEDIA_RECENTCHANGE_URL).toBe('wss://stream.wikimedia.org/v2/stream/recentchange');
    expect(WIKIMEDIA_SSE_URL).toBe('https://stream.wikimedia.org/v2/stream/recentchange');
  });

  it('WHEN title has spaces THEN wiki path encodes deterministically', () => {
    expect(wikiPath('Albert Einstein')).toBe('/wiki/Albert_Einstein');
    expect(wikiPath('Albert Einstein')).toBe(wikiPath('Albert Einstein'));
  });
});
