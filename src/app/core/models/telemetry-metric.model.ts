/**
 * TelemetryMetric — normalized time-series point.
 * Frozen contract: changes/001-initial-architecture/design.md §1
 * Footnote (delta 008): live throughput is REAL Wikimedia edits/sec and live
 * latency is REAL event-time lag; cpu/memory stay DERIVED load indicators,
 * not real infrastructure probes. UI must label them as such.
 */

export type MetricKind = 'cpu' | 'memory' | 'latency' | 'throughput';

export type MetricSource = 'live' | 'simulated';

export type MetricUnit = '%' | 'ms' | 'rps';

export interface TelemetryMetric {
  /** Stable key: `${kind}:${serviceId ?? 'global'}:${timestamp}:${seq}` */
  id: string;
  kind: MetricKind;
  /** Normalized display value. cpu/memory 0–100, latency ≥0, throughput ≥0. */
  value: number;
  unit: MetricUnit;
  /** Unix epoch ms */
  timestamp: number;
  source: MetricSource;
  /** Owning service; undefined = global/cluster aggregate */
  serviceId?: string;
}

/** Subset of Binance `!miniTicker@arr` frames we consume. */
export interface BinanceMiniTicker {
  /** Symbol, e.g. BTCUSDT */
  s: string;
  /** Close price (string in WS payload) */
  c: string;
  /** Open price */
  o: string;
  /** High */
  h: string;
  /** Low */
  l: string;
  /** Base volume */
  v: string;
  /** Quote volume */
  q: string;
}

export const METRIC_UNITS: Record<MetricKind, MetricUnit> = {
  cpu: '%',
  memory: '%',
  latency: 'ms',
  throughput: 'rps',
};

export function isTelemetryMetric(value: unknown): value is TelemetryMetric {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    (v['kind'] === 'cpu' ||
      v['kind'] === 'memory' ||
      v['kind'] === 'latency' ||
      v['kind'] === 'throughput') &&
    typeof v['value'] === 'number' &&
    Number.isFinite(v['value']) &&
    typeof v['timestamp'] === 'number' &&
    (v['source'] === 'live' || v['source'] === 'simulated')
  );
}
