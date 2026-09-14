import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';
import { interval, type Subscription } from 'rxjs';
import { validateRuleDraft, type AlertRule } from '../models/alert-rule.model';
import { CoreStore } from './core-store.service';

export const ALERT_RULES_KEY = 'pg.alerts.rules';

/**
 * AlertEngineService — 1s evaluation driver over CoreStore.tickAlerts().
 * Design: changes/003b-topology-alerts-dashboard/design.md §2
 * Constitution §3/§4.7: the RxJS `interval` lives here (service), never in components.
 */
@Injectable({ providedIn: 'root' })
export class AlertEngineService implements OnDestroy {
  private readonly store = inject(CoreStore);
  private sub: Subscription | null = null;

  readonly running = signal(false);

  constructor() {
    this.loadRules();
    // Persist enabled/rule edits (side-effect only — never derives state).
    effect(() => {
      this.persistRules(this.store.rules());
    });
  }

  /** Start the 1s tick loop (idempotent). */
  start(): void {
    if (this.sub !== null) return;
    this.sub = interval(1000).subscribe(() => {
      this.tick();
    });
    this.running.set(true);
  }

  /** Stop the tick loop (idempotent). */
  stop(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    this.running.set(false);
  }

  /** Evaluate all enabled rules at `now` (explicit param keeps specs deterministic). */
  tick(now?: number): void {
    this.store.tickAlerts(now ?? Date.now());
  }

  /** Explicit persist after CRUD — deterministic in specs (effect timing varies). */
  syncRules(): void {
    this.persistRules(this.store.rules());
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private loadRules(): void {
    try {
      const raw = localStorage.getItem(ALERT_RULES_KEY);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (!isAlertRule(item)) continue;
        if (validateRuleDraft(item).length > 0) continue;
        this.store.upsertRule(item);
      }
    } catch {
      // Corrupt/blocked storage → start with an empty rule set.
    }
  }

  private persistRules(rules: readonly AlertRule[]): void {
    try {
      localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(rules));
    } catch {
      // Storage blocked — engine still evaluates for the session.
    }
  }
}

function isAlertRule(value: unknown): value is AlertRule {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    (v['metric'] === 'cpu' ||
      v['metric'] === 'memory' ||
      v['metric'] === 'latency' ||
      v['metric'] === 'throughput') &&
    (v['operator'] === '>' ||
      v['operator'] === '<' ||
      v['operator'] === '>=' ||
      v['operator'] === '<=' ||
      v['operator'] === '==') &&
    typeof v['threshold'] === 'number' &&
    typeof v['durationSec'] === 'number' &&
    typeof v['enabled'] === 'boolean' &&
    (v['severity'] === 'info' || v['severity'] === 'warning' || v['severity'] === 'critical') &&
    typeof v['createdAt'] === 'number'
  );
}
