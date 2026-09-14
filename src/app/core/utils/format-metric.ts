/**
 * format-metric — pure display helpers for charts, headers, tooltips, logs.
 * All timestamps use UTC accessors (deterministic across TZ). No Angular deps.
 */
import type { MetricUnit, TelemetryMetric } from '../models/telemetry-metric.model';

export type SummaryArrow = '↑' | '↓' | '→';

export interface WindowSummary {
  current: number;
  avg: number;
  delta: number;
  arrow: SummaryArrow;
}

const ARROW_EPSILON = 1e-9;

function trimOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Human-readable value + unit: `42%`, `140 ms`, `820 rps`, `12.4k rps`. */
export function formatValue(value: number, unit: MetricUnit): string {
  if (unit === '%') return `${trimOneDecimal(value)}%`;
  if (unit === 'ms') return `${trimOneDecimal(value)} ms`;
  const abs = Math.abs(value);
  if (abs >= 10000) {
    const sign = value < 0 ? '-' : '';
    return `${sign}${trimOneDecimal(abs / 1000)}k rps`;
  }
  return `${trimOneDecimal(value)} rps`;
}

/** Axis tick `HH:MM:SS` in UTC from epoch seconds (uPlot x values). */
export function formatAxisTick(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(11, 19);
}

/** Tooltip stamp `HH:MM:SS.mmm UTC · YYYY-MM-DD` in UTC from epoch ms. */
export function formatTooltipTimestamp(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  return `${iso.slice(11, 23)} UTC · ${iso.slice(0, 10)}`;
}

/** Log row time `HH:MM:SS.mmm` in UTC from epoch ms (row contract kept). */
export function formatLogTime(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(11, 23);
}

/** Last-vs-window-avg summary; empty series → zeros with `→`. O(n). */
export function summarizeWindow(series: readonly TelemetryMetric[]): WindowSummary {
  if (series.length === 0) return { current: 0, avg: 0, delta: 0, arrow: '→' };
  const last = series[series.length - 1];
  if (last === undefined) return { current: 0, avg: 0, delta: 0, arrow: '→' };
  let sum = 0;
  for (const m of series) sum += m.value;
  const avg = sum / series.length;
  const delta = last.value - avg;
  const arrow: SummaryArrow = delta > ARROW_EPSILON ? '↑' : delta < -ARROW_EPSILON ? '↓' : '→';
  return { current: last.value, avg, delta, arrow };
}

/** Full header copy: `42% (↓ 3% avg)`. Absolute delta, arrow preserved. */
export function formatSummary(
  current: number,
  delta: number,
  arrow: SummaryArrow,
  unit: MetricUnit,
): string {
  return `${formatValue(current, unit)} (${arrow} ${formatValue(Math.abs(delta), unit)} avg)`;
}

/**
 * Screen-reader data alternative for one chart window (delta 003).
 * Plain sentence, no symbols: `CPU, percent. Latest 46%, window average 42%,
 * range 40 to 46 percent. Warning at 75 percent, critical at 90 percent.`
 * Empty series → `CPU: no data yet.`
 */
export function describeSeriesForScreenReader(
  title: string,
  unit: MetricUnit,
  series: readonly TelemetryMetric[],
  thresholds: { warn: number; crit: number } | null,
): string {
  if (series.length === 0) return `${title}: no data yet.`;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const m of series) {
    if (m.value < min) min = m.value;
    if (m.value > max) max = m.value;
    sum += m.value;
  }
  const last = series[series.length - 1];
  const current = last === undefined ? max : last.value;
  const avg = sum / series.length;
  const unitWord =
    unit === '%' ? 'percent' : unit === 'ms' ? 'milliseconds' : 'requests per second';
  const fmt = (v: number): string =>
    unit === '%' ? `${trimOneDecimal(v)} percent` : formatValue(v, unit);
  let out =
    `${title}, ${unitWord}. Latest ${fmt(current)}, ` +
    `window average ${fmt(avg)}, range ${fmt(min)} to ${fmt(max)}.`;
  if (thresholds !== null) {
    out += ` Warning at ${fmt(thresholds.warn)}, critical at ${fmt(thresholds.crit)}.`;
  }
  return out;
}
