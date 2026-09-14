import {
  ChangeDetectionStrategy,
  Component,
  type Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CoreStore } from '../../core/store/core-store.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import type { LogEntry } from '../../core/models/log-entry.model';
import type { HealthState, ServiceNode } from '../../core/models/service-node.model';

export interface TopologyEdge {
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

const EDGE_MARKER: Record<HealthState, string> = {
  healthy: 'url(#arrow-ok)',
  degraded: 'url(#arrow-warn)',
  down: 'url(#arrow-err)',
};

/** Worst-of-endpoints health: down wins over degraded over healthy. */
export function worstEdgeHealth(a: HealthState, b: HealthState): HealthState {
  if (a === 'down' || b === 'down') return 'down';
  if (a === 'degraded' || b === 'degraded') return 'degraded';
  return 'healthy';
}

const HEALTH_FILL: Record<HealthState, string> = {
  healthy: '#10b981',
  degraded: '#f59e0b',
  down: '#ef4444',
};

const HEALTH_TEXT: Record<HealthState, string> = {
  healthy: 'text-emerald-300',
  degraded: 'text-amber-300',
  down: 'text-rose-300',
};

/**
 * Topology Map — interactive SVG service graph with computed health.
 * FR-P1..P6: curated positions, health from CoreStore, click detail, @defer, CSS pulse.
 */
@Component({
  selector: 'app-topology-map',
  standalone: true,
  imports: [PageHeaderComponent],
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
    <section aria-label="Microservice topology">
      <app-page-header title="Topology" subtitle="Live service graph from derived health signals">
        <span
          id="topology-summary"
          class="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] leading-4 text-slate-200"
        >
          {{ nodes().length }} services · {{ downCount() }} down
        </span>
        @if (selectedNode(); as sel) {
          <button
            type="button"
            (click)="clearSelection()"
            data-testid="topology-clear"
            class="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Clear selection
          </button>
        }
      </app-page-header>
      @defer (on viewport; prefetch on idle) {
        <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <div
            class="relative rounded-lg border border-slate-800 bg-[#0d1117] p-2 shadow-sm lg:col-span-2"
          >
            <svg
              viewBox="0 0 800 500"
              preserveAspectRatio="xMidYMid slice"
              role="img"
              aria-label="Microservice topology"
              aria-describedby="topology-summary"
              data-testid="topology-svg"
              class="h-[420px] w-full rounded-md bg-[#030712] ring-1 ring-white/5 md:h-[480px]"
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
                  [attr.marker-end]="edgeMarker(edge.health)"
                  [class.edge-dim]="edge.dimmed"
                  [class.edge-flow]="!edge.dimmed"
                  aria-hidden="true"
                  [attr.data-testid]="'edge-' + edge.from.id + '-' + edge.to.id"
                />
              }
              <defs>
                <marker
                  id="arrow-ok"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
                <marker
                  id="arrow-warn"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
                <marker
                  id="arrow-err"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
              </defs>
              @for (node of nodes(); track node.id) {
                <g
                  tabindex="0"
                  role="button"
                  class="cursor-pointer transition-opacity hover:opacity-90"
                  [attr.aria-label]="node.name + ', health ' + node.health"
                  [attr.data-testid]="'node-' + node.id"
                  [attr.transform]="'translate(' + node.position.x + ',' + node.position.y + ')'"
                  (click)="select(node.id)"
                  (keydown.enter)="select(node.id)"
                  (keydown.space)="select(node.id); $event.preventDefault()"
                >
                  <title>
                    {{ node.name }} · {{ node.health }}@if (node.lastLatencyMs !== undefined) { ·
                    {{ node.lastLatencyMs }}ms }
                  </title>
                  <circle
                    r="22"
                    [attr.fill]="healthFill(node.health)"
                    [class.node-down]="node.health === 'down'"
                    [class.node-degraded]="node.health === 'degraded'"
                    stroke="#030712"
                    stroke-width="2"
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
              data-testid="topology-legend"
              role="group"
              aria-label="Map legend"
              class="pointer-events-none absolute bottom-4 left-4 max-w-[70%] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-800 bg-slate-950/90 px-2.5 py-2 font-mono text-[11px] leading-5 text-slate-300 backdrop-blur"
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
              <span class="inline-flex items-center gap-1">
                <i
                  aria-hidden="true"
                  class="inline-block h-4 w-6 rounded-sm"
                  style="background:linear-gradient(#10b981,#10b981)"
                ></i
                >normal
              </span>
              <span class="inline-flex items-center gap-1">
                <i
                  aria-hidden="true"
                  class="inline-block h-4 w-6 rounded-sm"
                  style="background:repeating-linear-gradient(90deg,#ef4444 0 4px,transparent 4px 8px)"
                ></i
                >failing
              </span>
            </div>
          </div>
          <aside
            data-testid="topology-detail"
            aria-label="Node details"
            class="min-h-[420px] self-start rounded-lg border border-slate-800 bg-[#0d1117] p-4 shadow-sm lg:sticky lg:top-16"
          >
            @if (selectedNode(); as sel) {
              <div class="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="inline-block h-2.5 w-2.5 rounded-full"
                  [style.background]="healthFill(sel.health)"
                  [style.boxShadow]="'0 0 10px ' + healthFill(sel.health)"
                ></span>
                <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  {{ sel.name }}
                </h3>
              </div>
              <p
                class="mt-2 font-mono text-[11px] leading-5 text-slate-400"
                data-testid="topology-health"
              >
                Health:
                <span class="font-semibold" [class]="healthText(sel.health)">{{ sel.health }}</span>
                @if (sel.lastLatencyMs !== undefined) {
                  · Latency <span class="text-slate-200">{{ sel.lastLatencyMs }}ms</span>
                }
              </p>
              <p class="mt-1 font-mono text-[11px] leading-5 text-slate-400">
                Depends on: <span class="text-slate-200">{{ depLabel(sel) }}</span>
              </p>
              <h4
                class="mt-4 border-t border-slate-800 pt-3 text-xs font-semibold tracking-wider text-slate-400 uppercase"
              >
                Recent logs
              </h4>
              <ul class="mt-2 divide-y divide-slate-800">
                @for (log of selectedLogs(); track log.id) {
                  <li class="truncate py-1.5 font-mono text-[11px] leading-5 text-slate-400">
                    <span
                      class="mr-1 font-semibold"
                      [class]="healthText(log.level === 'ERROR' ? 'down' : 'healthy')"
                      >{{ log.level }}</span
                    >
                    {{ log.message }}
                  </li>
                } @empty {
                  <li class="py-1.5 font-mono text-[11px] leading-4 text-slate-400">
                    No recent logs for this service.
                  </li>
                }
              </ul>
            } @else {
              <div
                class="flex h-full min-h-[160px] flex-col items-center justify-center gap-1 text-center"
              >
                <p class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  No node selected
                </p>
                <p class="font-mono text-[11px] leading-4 text-slate-400">
                  Select a node to view metrics and logs.
                </p>
              </div>
            }
          </aside>
        </div>
      } @placeholder {
        <div
          data-testid="topology-placeholder"
          class="h-[420px] animate-pulse rounded-lg bg-slate-800/40 ring-1 ring-white/5 motion-reduce:animate-none"
          aria-hidden="true"
        ></div>
      }
    </section>
  `,
})
export class TopologyMapComponent {
  private readonly store = inject(CoreStore);

  /** Live health view from the store (pure computed — updates with the stream, no writes). */
  readonly nodes: Signal<readonly ServiceNode[]> = this.store.healthNodes;
  readonly selectedId = signal<string | null>(null);

  readonly downCount: Signal<number> = computed(
    () => this.nodes().filter((n) => n.health === 'down').length,
  );

  readonly selectedNode: Signal<ServiceNode | undefined> = computed(() => {
    const id = this.selectedId();
    if (id === null) return undefined;
    return this.nodes().find((n) => n.id === id);
  });

  readonly selectedLogs: Signal<readonly LogEntry[]> = computed(() => {
    const id = this.selectedId();
    if (id === null) return [];
    return this.store
      .logs()
      .filter((l) => l.serviceId === id)
      .slice(-20)
      .reverse();
  });

  readonly edges: Signal<readonly TopologyEdge[]> = computed(() => {
    const nodes = this.nodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out: TopologyEdge[] = [];
    for (const from of nodes) {
      for (const dep of from.dependencies) {
        const to = byId.get(dep);
        if (to !== undefined)
          out.push({
            from,
            to,
            dimmed: from.health === 'down' || to.health === 'down',
            health: worstEdgeHealth(from.health, to.health),
          });
      }
    }
    return out;
  });

  edgeStroke(health: HealthState): string {
    return EDGE_STROKE[health];
  }

  edgeMarker(health: HealthState): string {
    return EDGE_MARKER[health];
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  clearSelection(): void {
    this.selectedId.set(null);
  }

  healthFill(health: HealthState): string {
    return HEALTH_FILL[health];
  }

  healthText(health: HealthState): string {
    return HEALTH_TEXT[health];
  }

  depLabel(node: ServiceNode): string {
    return node.dependencies.length > 0 ? node.dependencies.join(', ') : 'none';
  }
}
