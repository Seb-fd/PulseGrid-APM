/**
 * AlertRule & AlertIncident — alerting engine contracts.
 * Frozen contract: changes/001-initial-architecture/design.md §4
 */
import type { MetricKind } from './telemetry-metric.model';

export type AlertOperator = '>' | '<' | '>=' | '<=' | '==';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type IncidentStatus = 'firing' | 'resolved';

export interface AlertRule {
  id: string;
  /** min 3 chars */
  name: string;
  metric: MetricKind;
  operator: AlertOperator;
  /** finite; cpu/memory 0–100 */
  threshold: number;
  /** 5–300 int */
  durationSec: number;
  enabled: boolean;
  severity: AlertSeverity;
  createdAt: number;
}

export interface AlertIncident {
  id: string;
  ruleId: string;
  triggeredAt: number;
  resolvedAt?: number;
  status: IncidentStatus;
  /** Value that breached */
  observedValue: number;
}

export type ConnectionStatus = 'live' | 'simulated' | 'reconnecting';

function compare(value: number, operator: AlertOperator, threshold: number): boolean {
  switch (operator) {
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
    case '==':
      return value === threshold;
  }
}

/**
 * Sustained-breach semantics: true iff EVERY sample satisfies the predicate
 * and window is non-empty. Prevents flapping on transient spikes.
 */
export function evaluateRule(window: readonly number[], rule: AlertRule): boolean {
  if (window.length === 0) return false;
  return window.every((v) => compare(v, rule.operator, rule.threshold));
}

export function validateRuleDraft(draft: Omit<AlertRule, 'id' | 'createdAt'>): string[] {
  const errors: string[] = [];
  if (draft.name.trim().length < 3) errors.push('Name must be at least 3 characters.');
  if (!Number.isFinite(draft.threshold)) errors.push('Threshold must be a finite number.');
  if (
    (draft.metric === 'cpu' || draft.metric === 'memory') &&
    (draft.threshold < 0 || draft.threshold > 100)
  ) {
    errors.push('CPU/Memory threshold must be 0–100.');
  }
  if (!Number.isInteger(draft.durationSec) || draft.durationSec < 5 || draft.durationSec > 300) {
    errors.push('Duration must be an integer 5–300s.');
  }
  return errors;
}
