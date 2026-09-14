/**
 * ServiceNode — topology graph vertex.
 * Frozen contract: changes/001-initial-architecture/design.md §3
 */

export type HealthState = 'healthy' | 'degraded' | 'down';

export interface ServiceNode {
  /** e.g. 'payments-api' */
  id: string;
  /** Display label */
  name: string;
  /** Derived via computed(), never set by view */
  health: HealthState;
  /** Ids this node calls */
  dependencies: string[];
  /** Curated SVG coords (viewBox 800x500) */
  position: { x: number; y: number };
  lastLatencyMs?: number;
}

/** Curated Phase-1 seed: gateway → services → backends. */
export const TOPOLOGY_SEED: readonly ServiceNode[] = [
  {
    id: 'frontend',
    name: 'Frontend',
    health: 'healthy',
    dependencies: ['api-gateway'],
    position: { x: 80, y: 250 },
  },
  {
    id: 'api-gateway',
    name: 'API Gateway',
    health: 'healthy',
    dependencies: ['auth', 'payments-api', 'search'],
    position: { x: 220, y: 250 },
  },
  {
    id: 'auth',
    name: 'Auth',
    health: 'healthy',
    dependencies: ['postgres', 'redis'],
    position: { x: 380, y: 120 },
  },
  {
    id: 'payments-api',
    name: 'Payments API',
    health: 'healthy',
    dependencies: ['ledger', 'kafka'],
    position: { x: 380, y: 250 },
  },
  {
    id: 'ledger',
    name: 'Ledger',
    health: 'healthy',
    dependencies: ['postgres'],
    position: { x: 540, y: 250 },
  },
  {
    id: 'search',
    name: 'Search',
    health: 'healthy',
    dependencies: ['redis'],
    position: { x: 380, y: 380 },
  },
  {
    id: 'notifications',
    name: 'Notifications',
    health: 'healthy',
    dependencies: ['kafka'],
    position: { x: 540, y: 380 },
  },
  {
    id: 'postgres',
    name: 'Postgres',
    health: 'healthy',
    dependencies: [],
    position: { x: 700, y: 160 },
  },
  { id: 'redis', name: 'Redis', health: 'healthy', dependencies: [], position: { x: 700, y: 280 } },
  { id: 'kafka', name: 'Kafka', health: 'healthy', dependencies: [], position: { x: 700, y: 400 } },
];

export function deriveHealth(args: {
  outageActive: boolean;
  p95LatencyMs: number | null;
  errorRate: number | null;
}): HealthState {
  if (args.outageActive) return 'down';
  if ((args.p95LatencyMs ?? 0) > 200 || (args.errorRate ?? 0) > 0.05) return 'degraded';
  return 'healthy';
}
