import { Injectable, signal } from '@angular/core';
import { interval, map, type Observable } from 'rxjs';
import type { LogEntry } from '../models/log-entry.model';
import type { TelemetryMetric } from '../models/telemetry-metric.model';
import { clamp, mulberry32, noise } from '../utils/prng';

export type SimScenario = 'normal' | 'cpu-spike' | 'memory-leak' | 'outage' | 'latency-burst';

export const SIM_TICK_MS = 250;
const SERVICES = ['payments-api', 'ledger', 'auth'] as const;

interface SimState {
  tick: number;
  memDrift: number;
  rand: () => number;
}

/**
 * Deterministic stochastic simulator (RxJS stream).
 * Seeded PRNG → reproducible fault injection for specs/E2E.
 */
@Injectable({ providedIn: 'root' })
export class StochasticSimService {
  readonly scenario = signal<SimScenario>('normal');

  /** Create a fresh deterministic state (tests use fixed seeds). */
  createState(seed = 42): SimState {
    return { tick: 0, memDrift: 0, rand: mulberry32(seed) };
  }

  /** Pure batch generator — no timers, fully unit-testable. */
  generateBatch(state: SimState, scenario: SimScenario, now: number): TelemetryMetric[] {
    const { rand } = state;
    state.tick += 1;
    const seq = state.tick;
    const out: TelemetryMetric[] = [];
    const mk = (
      kind: TelemetryMetric['kind'],
      value: number,
      unit: TelemetryMetric['unit'],
      serviceId?: string,
    ): void => {
      out.push({
        id: `${kind}:${serviceId ?? 'global'}:${now}:${seq}`,
        kind,
        value: Math.round(value * 100) / 100,
        unit,
        timestamp: now,
        source: 'simulated',
        ...(serviceId ? { serviceId } : {}),
      });
    };

    switch (scenario) {
      case 'cpu-spike':
        mk('cpu', clamp(92 + noise(rand, 4), 0, 100), '%');
        mk('memory', clamp(60 + noise(rand, 4), 0, 100), '%');
        mk('latency', clamp(120 + noise(rand, 20), 0, 2000), 'ms');
        mk('throughput', clamp(700 + noise(rand, 80), 0, 8000), 'rps');
        break;
      case 'memory-leak':
        state.memDrift = Math.min(state.memDrift + 1.2, 38);
        mk('cpu', clamp(35 + noise(rand, 6), 0, 100), '%');
        mk('memory', clamp(58 + state.memDrift + noise(rand, 1.5), 0, 99), '%');
        mk('latency', clamp(60 + state.memDrift + noise(rand, 8), 0, 2000), 'ms');
        mk('throughput', clamp(750 + noise(rand, 60), 0, 8000), 'rps');
        break;
      case 'outage': {
        const victim = SERVICES[state.tick % SERVICES.length] as string;
        mk('cpu', clamp(8 + noise(rand, 3), 0, 100), '%', victim);
        mk('latency', 2000, 'ms', victim);
        mk('throughput', 0, 'rps', victim);
        mk('throughput', clamp(300 + noise(rand, 40), 0, 8000), 'rps');
        break;
      }
      case 'latency-burst':
        mk('cpu', clamp(45 + noise(rand, 8), 0, 100), '%');
        mk('memory', clamp(58 + noise(rand, 4), 0, 100), '%');
        mk('latency', clamp(250 + noise(rand, 30), 0, 2000), 'ms');
        mk('throughput', clamp(600 + noise(rand, 70), 0, 8000), 'rps');
        break;
      case 'normal':
      default:
        mk('cpu', clamp(26 + noise(rand, 9), 2, 98), '%');
        mk('memory', clamp(55 + noise(rand, 4), 10, 96), '%');
        mk('latency', clamp(42 + noise(rand, 14), 5, 2000), 'ms');
        mk('throughput', clamp(820 + noise(rand, 140), 0, 8000), 'rps');
        for (const svc of SERVICES) {
          mk('latency', clamp(40 + noise(rand, 12), 5, 2000), 'ms', svc);
        }
        break;
    }
    return out;
  }

  /**
   * Correlated logs for a batch (WARN on cpu>90, ERROR on outage/500-shape).
   * Delta 001-ux-legibility: message text embeds HTTP patterns
   * (`METHOD /api/<svc> <status>`) for display-only badge parsing.
   * `LogEntry` shape unchanged; seeded determinism preserved.
   */
  logsFor(batch: readonly TelemetryMetric[], now: number): LogEntry[] {
    const logs: LogEntry[] = [];
    for (const m of batch) {
      if (m.kind === 'cpu' && m.value > 90) {
        const svc = m.serviceId ?? 'cluster';
        const suffix = m.serviceId ? ` — POST /api/${svc}/scale 429` : '';
        logs.push({
          id: `${now}:warn:${m.serviceId ?? 'global'}`,
          level: 'WARN',
          message: `CPU spike ${m.value}% on ${svc}${suffix}`,
          timestamp: now,
          serviceId: svc,
          traceId: `sim-${now}`,
        });
      }
      if (m.kind === 'throughput' && m.value === 0 && m.serviceId) {
        logs.push({
          id: `${now}:err:${m.serviceId}`,
          level: 'ERROR',
          message: `Node outage: ${m.serviceId} throughput 0 — GET /api/${m.serviceId} 500 (sim-${now})`,
          timestamp: now,
          serviceId: m.serviceId,
          traceId: `sim-${now}`,
        });
      }
      if (m.kind === 'latency' && m.value > 200) {
        const svc = m.serviceId ?? 'cluster';
        logs.push({
          id: `${now}:warn-lat:${m.serviceId ?? 'global'}`,
          level: 'WARN',
          message: `High latency ${m.value}ms on ${svc} — GET /api/${svc} 200 ${m.value}ms`,
          timestamp: now,
          serviceId: svc,
          traceId: `sim-${now}`,
        });
      }
    }
    return logs;
  }

  /** Live timer stream honouring the current scenario signal. */
  metrics$(seed = Date.now() % 2_147_483_647): Observable<TelemetryMetric[]> {
    const state = this.createState(seed);
    return interval(SIM_TICK_MS).pipe(
      map(() => this.generateBatch(state, this.scenario(), Date.now())),
    );
  }

  setScenario(s: SimScenario): void {
    this.scenario.set(s);
  }
}
