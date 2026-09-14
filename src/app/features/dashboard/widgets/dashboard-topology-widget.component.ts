import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { CoreStore } from '../../../core/store/core-store.service';
import type { HealthState, ServiceNode } from '../../../core/models/service-node.model';

export interface DashboardTopologyEdge {
  from: ServiceNode;
  to: ServiceNode;
  dimmed: boolean;
  health: HealthState;
}

const EDGE_STROKE: Record<HealthState, string> = {
  healthy: '#10b981',
  degraded: '#f59e0b',
  down: '#ef4444',
};

/** Worst-of-endpoints health: down wins over degraded over healthy. */
export function worstDashboardEdgeHealth(a: HealthState, b: HealthState): HealthState {
  if (a === 'down' || b === 'down') return 'down';
  if (a === 'degraded' || b === 'degraded') return 'degraded';
  return 'healthy';
}

const HEALTH_FILL: Record<HealthState, string> = {
  healthy: '#10b981',
  degraded: '#f59e0b',
  down: '#ef4444',
};

/**
 * Dashboard topology widget — compact SVG health graph.
 * Reads `store.healthNodes` only; no detail aside, no inner `@defer`
 * (the parent grid defers). No cross-feature imports.
 */
@Component({
  selector: 'app-dashboard-topology-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      @keyframes pulse-red {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.35;
        }
      }
      .node-down {
        animation: pulse-red 1.2s ease-in-out infinite;
      }
      .node-degraded {
        animation: pulse-amber 1.8s ease-in-out infinite;
      }
      .edge-dim {
        opacity: 0.2;
      }
      .edge-flow {
        stroke-dasharray: 6 6;
        animation: dash-flow 1.1s linear infinite;
      }
      @keyframes dash-flow {
        to {
          stroke-dashoffset: -24;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .edge-flow,
        .node-down,
        .node-degraded {
          animation: none !important;
        }
      }
    `,
  ],
  template: `
    <p
      data-testid="dash-topology-summary"
      class="mb-2 font-mono text-[11px] leading-4 text-slate-400"
      aria-live="off"
    >
      {{ downCount() }} nodes down
    </p>
    <div class="relative">
      <svg
        viewBox="0 0 800 500"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Microservice topology compact"
        data-testid="dash-topology-svg"
        class="h-[200px] w-full rounded-md bg-[#030712] ring-1 ring-white/5"
      >
        @for (edge of edges(); track edge.from.id + '->' + edge.to.id) {
          <line
            [attr.x1]="edge.from.position.x"
            [attr.y1]="edge.from.position.y"
            [attr.x2]="edge.to.position.x"
            [attr.y2]="edge.to.position.y"
            [attr.stroke]="edgeStroke(edge.health)"
            stroke-width="1.5"
            stroke-linecap="round"
            [class.edge-dim]="edge.dimmed"
            [class.edge-flow]="!edge.dimmed"
            aria-hidden="true"
            [attr.data-testid]="'dash-edge-' + edge.from.id + '-' + edge.to.id"
          />
        }
        @for (node of nodes(); track node.id) {
          <g
            tabindex="0"
            role="button"
            [attr.aria-pressed]="selectedId() === node.id"
            class="cursor-pointer transition-opacity hover:opacity-90"
            [attr.aria-label]="node.name + ', health ' + node.health"
            [attr.data-testid]="'dash-node-' + node.id"
            [attr.transform]="'translate(' + node.position.x + ',' + node.position.y + ')'"
            (click)="select(node.id)"
            (keydown.enter)="select(node.id)"
            (keydown.space)="select(node.id); $event.preventDefault()"
          >
            <title>{{ node.name }} · {{ node.health }}</title>
            <circle
              r="22"
              [attr.fill]="healthFill(node.health)"
              [attr.stroke]="selectedId() === node.id ? '#22d3ee' : '#030712'"
              [attr.stroke-width]="selectedId() === node.id ? 3 : 2"
              [class.node-down]="node.health === 'down'"
              [class.node-degraded]="node.health === 'degraded'"
            />
            <text y="4" text-anchor="middle" font-size="10" fill="#030712" font-weight="700">
              {{ node.id.slice(0, 2).toUpperCase() }}
            </text>
            <text y="38" text-anchor="middle" font-size="12" fill="#e2e8f0" font-weight="600">
              {{ node.name }}
            </text>
          </g>
        }
      </svg>
      <div
        data-testid="dash-topology-legend"
        role="group"
        aria-label="Map legend"
        class="pointer-events-none absolute bottom-2 left-2 flex max-w-[80%] flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-slate-800 bg-slate-950/90 px-2 py-1 font-mono text-[10px] leading-4 text-slate-300 backdrop-blur"
      >
        <span class="inline-flex items-center gap-1">
          <i
            aria-hidden="true"
            class="inline-block h-2 w-2 rounded-full"
            style="background:#10b981"
          ></i
          >healthy
        </span>
        <span class="inline-flex items-center gap-1">
          <i
            aria-hidden="true"
            class="inline-block h-2 w-2 rounded-full"
            style="background:#f59e0b"
          ></i
          >degraded
        </span>
        <span class="inline-flex items-center gap-1">
          <i
            aria-hidden="true"
            class="inline-block h-2 w-2 rounded-full"
            style="background:#ef4444"
          ></i
          >down
        </span>
      </div>
    </div>
  `,
})
export class DashboardTopologyWidgetComponent {
  private readonly store = inject(CoreStore);

  readonly nodes: Signal<readonly ServiceNode[]> = this.store.healthNodes;

  readonly downCount: Signal<number> = computed(
    () => this.nodes().filter((n) => n.health === 'down').length,
  );

  /** Compact selection (toggle): keyboard/mouse parity with the full map; no detail pane here. */
  readonly selectedId = signal<string | null>(null);

  readonly edges: Signal<readonly DashboardTopologyEdge[]> = computed(() => {
    const nodes = this.nodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out: DashboardTopologyEdge[] = [];
    for (const from of nodes) {
      for (const dep of from.dependencies) {
        const to = byId.get(dep);
        if (to !== undefined)
          out.push({
            from,
            to,
            dimmed: from.health === 'down' || to.health === 'down',
            health: worstDashboardEdgeHealth(from.health, to.health),
          });
      }
    }
    return out;
  });

  healthFill(health: HealthState): string {
    return HEALTH_FILL[health];
  }

  select(id: string): void {
    this.selectedId.update((cur) => (cur === id ? null : id));
  }

  edgeStroke(health: HealthState): string {
    return EDGE_STROKE[health];
  }
}
