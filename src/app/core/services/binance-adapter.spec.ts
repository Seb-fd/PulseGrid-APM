import { describe, expect, it } from 'vitest';
import { adaptBinanceToMetrics } from './binance-adapter';

describe('GIVEN Binance miniTicker frames', () => {
  const frames = [
    { s: 'BTCUSDT', c: '50000', o: '49000', h: '51000', l: '48000', v: '1000', q: '50000000' },
    { s: 'ETHUSDT', c: '3000', o: '2950', h: '3050', l: '2900', v: '50000', q: '150000000' },
  ];

  it('WHEN adapted THEN emits 4 live metrics with units and stable ids', () => {
    const out = adaptBinanceToMetrics(frames, 123);
    expect(out).toHaveLength(4);
    expect(out.map((m) => m.kind).sort()).toEqual(['cpu', 'latency', 'memory', 'throughput']);
    for (const m of out) {
      expect(m.source).toBe('live');
      expect(m.timestamp).toBe(123);
      expect(Number.isFinite(m.value)).toBe(true);
    }
    expect(out.find((m) => m.kind === 'cpu')?.unit).toBe('%');
    expect(out.find((m) => m.kind === 'latency')?.unit).toBe('ms');
    expect(out.find((m) => m.kind === 'throughput')?.unit).toBe('rps');
  });

  it('WHEN empty THEN returns empty (no crash)', () => {
    expect(adaptBinanceToMetrics([], 1)).toEqual([]);
  });

  it('WHEN malformed numbers THEN clamps to finite values', () => {
    const bad = [{ s: 'X', c: 'NaN', o: 'oops', h: '', l: '', v: '', q: '' }];
    const out = adaptBinanceToMetrics(bad, 7);
    expect(out).toHaveLength(4);
    for (const m of out) expect(Number.isFinite(m.value)).toBe(true);
  });

  it('WHEN deterministic THEN same input yields same output', () => {
    expect(adaptBinanceToMetrics(frames, 99)).toEqual(adaptBinanceToMetrics(frames, 99));
  });
});
