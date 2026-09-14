/**
 * DashboardLayout — customizable widget grid persistence contract.
 * Design: changes/003b-topology-alerts-dashboard/design.md §1
 */

export interface DashboardWidgetLayout {
  id: string;
  col: number;
  row: number;
  w: 1 | 2;
  h: 1 | 2;
  visible: boolean;
}

export interface DashboardLayout {
  version: 1;
  widgets: DashboardWidgetLayout[];
}

export const DASHBOARD_LAYOUT_KEY = 'pg.dashboard.layout.v1';

const WIDGET_IDS = [
  'cpu',
  'memory',
  'latency',
  'throughput',
  'logs',
  'topology',
  'incidents',
] as const;

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  version: 1,
  widgets: WIDGET_IDS.map((id, i) => ({
    id,
    col: (i % 2) + 1,
    row: Math.floor(i / 2) + 1,
    w: 1,
    h: 1,
    visible: true,
  })),
};

function isWidgetLayout(value: unknown): value is DashboardWidgetLayout {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['col'] === 'number' &&
    typeof v['row'] === 'number' &&
    (v['w'] === 1 || v['w'] === 2) &&
    (v['h'] === 1 || v['h'] === 2) &&
    typeof v['visible'] === 'boolean'
  );
}

/** Null on any shape/version mismatch — caller falls back to DEFAULT. */
export function parseDashboardLayout(raw: unknown): DashboardLayout | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (v['version'] !== 1) return null;
  if (!Array.isArray(v['widgets'])) return null;
  const widgets = v['widgets'];
  if (widgets.length === 0) return null;
  if (!widgets.every(isWidgetLayout)) return null;
  // `every` passed → `filter` narrows without assertion and preserves order.
  return { version: 1, widgets: widgets.filter(isWidgetLayout) };
}

/** Storage-guarded read: blocked/missing storage → DEFAULT. */
export function readDashboardLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (raw === null) return DEFAULT_DASHBOARD_LAYOUT;
    return parseDashboardLayout(JSON.parse(raw) as unknown) ?? DEFAULT_DASHBOARD_LAYOUT;
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT;
  }
}

/** Storage-guarded write: failures are swallowed (session still works). */
export function writeDashboardLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Storage blocked — layout still works for the session.
  }
}
