import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  DASHBOARD_LAYOUT_KEY,
  DEFAULT_DASHBOARD_LAYOUT,
  parseDashboardLayout,
  readDashboardLayout,
  writeDashboardLayout,
} from './dashboard-layout.model';

describe('GIVEN DashboardLayout model', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('WHEN reading defaults THEN 7 visible widgets with version 1', () => {
    expect(DEFAULT_DASHBOARD_LAYOUT.version).toBe(1);
    expect(DEFAULT_DASHBOARD_LAYOUT.widgets).toHaveLength(7);
    expect(DEFAULT_DASHBOARD_LAYOUT.widgets.map((w) => w.id)).toEqual([
      'cpu',
      'memory',
      'latency',
      'throughput',
      'logs',
      'topology',
      'incidents',
    ]);
    expect(DEFAULT_DASHBOARD_LAYOUT.widgets.every((w) => w.visible)).toBe(true);
  });

  it('WHEN parsing a valid layout THEN it round-trips', () => {
    const parsed = parseDashboardLayout(
      JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_LAYOUT)) as unknown,
    );
    expect(parsed).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it('WHEN parsing garbage THEN null guards the version boundary', () => {
    expect(parseDashboardLayout(null)).toBeNull();
    expect(parseDashboardLayout({})).toBeNull();
    expect(parseDashboardLayout({ version: 2, widgets: [] })).toBeNull();
    expect(parseDashboardLayout({ version: 1, widgets: [] })).toBeNull();
    expect(parseDashboardLayout({ version: 1, widgets: [{ id: 'cpu' }] })).toBeNull();
    expect(
      parseDashboardLayout({
        version: 1,
        widgets: [{ id: 'x', col: 1, row: 1, w: 3, h: 1, visible: true }],
      }),
    ).toBeNull();
  });

  it('WHEN storage is empty THEN read falls back to DEFAULT', () => {
    expect(readDashboardLayout()).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it('WHEN a layout is written THEN read restores the same order', () => {
    const custom = {
      version: 1 as const,
      widgets: [...DEFAULT_DASHBOARD_LAYOUT.widgets].reverse(),
    };
    writeDashboardLayout(custom);
    expect(localStorage.getItem(DASHBOARD_LAYOUT_KEY)).not.toBeNull();
    expect(readDashboardLayout()).toEqual(custom);
  });

  it('WHEN storage holds corrupt JSON THEN read falls back to DEFAULT', () => {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, '{not-json');
    expect(readDashboardLayout()).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });
});
