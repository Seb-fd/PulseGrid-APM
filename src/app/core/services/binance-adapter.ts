/**
 * Binance → domain adapter (pure, fully tested).
 * Synthetic mapping is DOCUMENTED as derived, not real infra telemetry.
 */
import type { BinanceMiniTicker, TelemetryMetric } from '../models/telemetry-metric.model';
import { METRIC_UNITS } from '../models/telemetry-metric.model';

export const BINANCE_MINI_TICKER_URL = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
export const BINANCE_TICKER_URL = 'wss://stream.binance.com:9443/ws/!ticker@arr';

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Derives pseudo infra metrics from market microstructure:
 * - volatility (mean |c-o|/o) → cpu + latency
 * - quote-volume (log-scaled) → throughput
 * - blended → memory
 * Deterministic: same frames+now → same output (no Math.random).
 */
export function adaptBinanceToMetrics(frames: BinanceMiniTicker[], now: number): TelemetryMetric[] {
  if (frames.length === 0) return [];
  let volSum = 0;
  let quoteSum = 0;
  let valid = 0;
  for (const f of frames) {
    const o = num(f.o);
    const c = num(f.c);
    const q = num(f.q);
    if (o > 0 && c > 0) {
      volSum += Math.abs(c - o) / o;
      valid += 1;
    }
    quoteSum += q;
  }
  const volatility = valid > 0 ? volSum / valid : 0;
  const cpu = clamp(22 + volatility * 900, 2, 98);
  const latency = clamp(28 + volatility * 2600, 5, 2000);
  const throughput = clamp(150 + Math.log10(1 + quoteSum) * 160, 0, 8000);
  const memory = clamp(48 + volatility * 220 + (Math.log10(1 + quoteSum) % 7), 10, 96);

  const mk = (kind: TelemetryMetric['kind'], value: number, idx: number): TelemetryMetric => ({
    id: `${kind}:global:${now}:${idx}`,
    kind,
    value: Math.round(value * 100) / 100,
    unit: METRIC_UNITS[kind],
    timestamp: now,
    source: 'live',
  });

  return [
    mk('cpu', cpu, 0),
    mk('memory', memory, 1),
    mk('latency', latency, 2),
    mk('throughput', throughput, 3),
  ];
}
