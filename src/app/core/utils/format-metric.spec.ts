import { describe, expect, it } from 'vitest';
import {
  describeSeriesForScreenReader,
  formatAxisTick,
  formatLogTime,
  formatSummary,
  formatTooltipTimestamp,
  formatValue,
  summarizeWindow,
} from './format-metric';
import type { TelemetryMetric } from '../models/telemetry-metric.model';

function point(value: number, timestamp = 1000): TelemetryMetric {
  return {
    id: `cpu:global:${String(timestamp)}:${String(value)}`,
    kind: 'cpu',
    value,
    unit: '%',
    timestamp,
    source: 'simulated',
  };
}

describe('GIVEN formatValue', () => {
  it('THEN formats percent, ms, and rps with trimmed decimals', () => {
    expect(formatValue(42, '%')).toBe('42%');
    expect(formatValue(42.55, '%')).toBe('42.6%');
    expect(formatValue(140, 'ms')).toBe('140 ms');
    expect(formatValue(820, 'rps')).toBe('820 rps');
  });

  it('WHEN rps >= 10000 THEN uses k-format', () => {
    expect(formatValue(12400, 'rps')).toBe('12.4k rps');
    expect(formatValue(10000, 'rps')).toBe('10k rps');
  });
});

describe('GIVEN UTC timestamp helpers', () => {
  it('THEN axis tick is HH:MM:SS in UTC', () => {
    // 2026-09-13T00:00:00Z
    expect(formatAxisTick(1786579200)).toBe('00:00:00');
    // 2026-09-13T14:03:22Z
    expect(formatAxisTick(1786629802)).toBe('14:03:22');
  });

  it('THEN tooltip stamp is human-readable and date-qualified in UTC', () => {
    expect(formatTooltipTimestamp(Date.parse('2026-09-13T14:03:22.140Z'))).toBe(
      '14:03:22.140 UTC · 2026-09-13',
    );
    // Midnight pin
    expect(formatTooltipTimestamp(Date.parse('2026-09-13T00:00:00.000Z'))).toBe(
      '00:00:00.000 UTC · 2026-09-13',
    );
    // Millis padding pin (.007)
    expect(formatTooltipTimestamp(Date.parse('2026-09-13T00:00:00.007Z'))).toBe(
      '00:00:00.007 UTC · 2026-09-13',
    );
  });

  it('THEN log time keeps HH:MM:SS.mmm row contract', () => {
    expect(formatLogTime(Date.parse('2026-09-13T14:03:22.140Z'))).toBe('14:03:22.140');
  });
});

describe('GIVEN summarizeWindow (last vs window-avg)', () => {
  it('WHEN series rises THEN arrow is up with positive delta', () => {
    const s = summarizeWindow([point(40, 1), point(40, 2), point(46, 3)]);
    expect(s.current).toBe(46);
    expect(s.avg).toBeCloseTo(42, 9);
    expect(s.delta).toBeCloseTo(4, 9);
    expect(s.arrow).toBe('↑');
  });

  it('WHEN series falls THEN arrow is down', () => {
    const s = summarizeWindow([point(46, 1), point(40, 2), point(40, 3)]);
    expect(s.arrow).toBe('↓');
    expect(s.delta).toBeLessThan(0);
  });

  it('WHEN flat THEN arrow is neutral', () => {
    expect(summarizeWindow([point(42, 1), point(42, 2)]).arrow).toBe('→');
  });

  it('WHEN empty THEN zeros with neutral arrow', () => {
    expect(summarizeWindow([])).toEqual({ current: 0, avg: 0, delta: 0, arrow: '→' });
  });

  it('THEN formatSummary renders current plus absolute delta', () => {
    expect(formatSummary(42, -3, '↑', '%')).toBe('42% (↑ 3% avg)');
    expect(formatSummary(140, 12.5, '↑', 'ms')).toBe('140 ms (↑ 12.5 ms avg)');
  });
});

describe('GIVEN describeSeriesForScreenReader (delta 003)', () => {
  it('WHEN the series is empty THEN names the chart with no data', () => {
    expect(describeSeriesForScreenReader('CPU', '%', [], { warn: 75, crit: 90 })).toBe(
      'CPU: no data yet.',
    );
  });

  it('WHEN points stream THEN latest, average, range and thresholds read out', () => {
    const text = describeSeriesForScreenReader(
      'CPU',
      '%',
      [point(40, 1), point(40, 2), point(46, 3)],
      { warn: 75, crit: 90 },
    );
    expect(text).toContain('Latest 46 percent');
    expect(text).toContain('window average 42 percent');
    expect(text).toContain('range 40 percent to 46 percent');
    expect(text).toContain('Warning at 75 percent, critical at 90 percent');
  });

  it('WHEN thresholds are absent THEN no threshold sentence renders', () => {
    const text = describeSeriesForScreenReader('Latency', 'ms', [point(42, 1)], null);
    expect(text).toContain('42 ms');
    expect(text).not.toContain('Warning');
  });
});
