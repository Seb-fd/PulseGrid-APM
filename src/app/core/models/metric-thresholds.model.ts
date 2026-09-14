/**
 * MetricThresholds — visual Warning/Critical levels per metric kind.
 * Static defaults + active alert-rule override (design §1–§2).
 * Pure helpers; no Angular deps. Frozen direction per kind:
 * `high` = breach when value >= line, `low` (throughput) = breach when <= line.
 */
import type { AlertRule } from './alert-rule.model';
import type { MetricKind } from './telemetry-metric.model';

export type ThresholdDirection = 'high' | 'low';

export interface MetricThresholds {
  warn: number;
  crit: number;
  direction: ThresholdDirection;
}

export const METRIC_THRESHOLDS: Record<MetricKind, MetricThresholds> = {
  cpu: { warn: 75, crit: 90, direction: 'high' },
  memory: { warn: 75, crit: 90, direction: 'high' },
  latency: { warn: 200, crit: 500, direction: 'high' },
  throughput: { warn: 500, crit: 100, direction: 'low' },
};

/**
 * Resolve effective thresholds: static defaults overridden by enabled rules
 * for the same metric kind (`warning` → warn slot, `critical` → crit slot,
 * `info` ignored). Most-sensitive wins (high: min, low: max). Overrides that
 * break the directional invariant (high: warn < crit, low: warn > crit) or are
 * non-finite are discarded slot-wise, falling back to the static default.
 */
export function resolveThresholds(kind: MetricKind, rules: readonly AlertRule[]): MetricThresholds {
  const base = METRIC_THRESHOLDS[kind];
  let warn: number | null = null;
  let crit: number | null = null;
  for (const rule of rules) {
    if (!rule.enabled || rule.metric !== kind) continue;
    if (!Number.isFinite(rule.threshold)) continue;
    if (rule.severity === 'warning') {
      warn = warn === null ? rule.threshold : mostSensitive(base.direction, warn, rule.threshold);
    } else if (rule.severity === 'critical') {
      crit = crit === null ? rule.threshold : mostSensitive(base.direction, crit, rule.threshold);
    }
  }
  const resolved: MetricThresholds = {
    warn: warn ?? base.warn,
    crit: crit ?? base.crit,
    direction: base.direction,
  };
  if (!isValidPair(resolved)) {
    // Slot-wise fallback: keep whichever slot is valid, restore the other.
    const warnOk = Number.isFinite(resolved.warn);
    const critOk = Number.isFinite(resolved.crit);
    const warnCandidate = warnOk ? resolved.warn : base.warn;
    const critCandidate = critOk ? resolved.crit : base.crit;
    const withWarn: MetricThresholds = { ...resolved, warn: base.warn, crit: critCandidate };
    const withCrit: MetricThresholds = { ...resolved, warn: warnCandidate, crit: base.crit };
    if (isValidPair(withWarn) && !isValidPair(withCrit)) return withWarn;
    if (isValidPair(withCrit) && !isValidPair(withWarn)) return withCrit;
    if (warn !== null && crit === null && isValidPair({ ...resolved, crit: base.crit })) {
      return { ...resolved, crit: base.crit };
    }
    if (crit !== null && warn === null && isValidPair({ ...resolved, warn: base.warn })) {
      return { ...resolved, warn: base.warn };
    }
    return { ...base };
  }
  return resolved;
}

function mostSensitive(direction: ThresholdDirection, a: number, b: number): number {
  // Most-sensitive = fires first from the healthy side.
  // high: healthy is low values, so the LOWER line fires first → min.
  // low: healthy is high values, so the HIGHER line fires first → max.
  return direction === 'high' ? Math.min(a, b) : Math.max(a, b);
}

function isValidPair(t: MetricThresholds): boolean {
  if (!Number.isFinite(t.warn) || !Number.isFinite(t.crit)) return false;
  return t.direction === 'high' ? t.warn < t.crit : t.warn > t.crit;
}

/** Direction-aware breach test: warning-level (true) vs healthy (false). */
export function isWarnBreach(value: number, t: MetricThresholds): boolean {
  return t.direction === 'high' ? value >= t.warn : value <= t.warn;
}

/** Direction-aware breach test: critical-level (true) vs not-critical (false). */
export function isCritBreach(value: number, t: MetricThresholds): boolean {
  return t.direction === 'high' ? value >= t.crit : value <= t.crit;
}

/** Generic breach test at the requested severity level. */
export function isBreach(value: number, t: MetricThresholds, level: 'warn' | 'crit'): boolean {
  return level === 'warn' ? isWarnBreach(value, t) : isCritBreach(value, t);
}
