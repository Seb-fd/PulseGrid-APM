import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import '../../../test-helpers';
import { CoreStore } from '../../core/store/core-store.service';
import {
  DASHBOARD_LAYOUT_KEY,
  DEFAULT_DASHBOARD_LAYOUT,
} from '../../core/models/dashboard-layout.model';
import { DASHBOARD_OVERVIEW_KEY, DashboardGridComponent } from './dashboard-grid.component';

const announcer = { announce: vi.fn() };

describe('GIVEN DashboardGrid with default layout', () => {
  beforeEach(() => {
    localStorage.clear();
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  function create(): {
    cmp: DashboardGridComponent;
    el: HTMLElement;
    fixture: ComponentFixture<DashboardGridComponent>;
  } {
    const fixture = TestBed.createComponent(DashboardGridComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, fixture };
  }

  /** Zoneless: signal mutations need a CD pass before DOM + persist effects settle. */
  function settle(fixture: ComponentFixture<DashboardGridComponent>): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  function order(cmp: DashboardGridComponent): string[] {
    return cmp.visibleWidgets().map((w) => w.id);
  }

  it('WHEN rendered THEN all 7 widgets show with drag handles', () => {
    const { cmp, el } = create();
    expect(order(cmp)).toEqual([
      'cpu',
      'memory',
      'latency',
      'throughput',
      'logs',
      'topology',
      'incidents',
    ]);
    for (const id of order(cmp)) {
      expect(el.querySelector(`[data-testid="widget-${id}"]`)).not.toBeNull();
      expect(el.querySelector(`[data-testid="drag-${id}"]`)).not.toBeNull();
    }
  });

  it('WHEN latency is dragged above cpu THEN order updates AND reload restores it', () => {
    const { cmp, fixture } = create();
    cmp.drop({ previousIndex: 2, currentIndex: 0 } as never);
    settle(fixture);
    expect(order(cmp)[0]).toBe('latency');
    const stored = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_KEY) ?? '{}') as {
      widgets: { id: string }[];
    };
    expect(stored.widgets[0]?.id).toBe('latency');
    // Reload path: a fresh component reads the persisted snapshot.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fresh = TestBed.createComponent(DashboardGridComponent).componentInstance;
    expect(fresh.visibleWidgets().map((w) => w.id)[0]).toBe('latency');
  });

  it('WHEN topology is hidden THEN the grid reflows AND reset restores it', () => {
    const { cmp, el, fixture } = create();
    cmp.toggleVisibility('topology');
    settle(fixture);
    expect(order(cmp)).not.toContain('topology');
    expect(el.querySelector('[data-testid="widget-topology"]')).toBeNull();
    expect(el.querySelector('[data-testid="show-topology"]')).not.toBeNull();
    cmp.resetLayout();
    settle(fixture);
    expect(order(cmp)).toEqual(DEFAULT_DASHBOARD_LAYOUT.widgets.map((w) => w.id));
  });

  it('WHEN keyboard move is used THEN widgets reorder without pointer drag', () => {
    const { cmp } = create();
    cmp.moveWidget('latency', -1);
    expect(order(cmp)[1]).toBe('latency');
    cmp.moveWidget('latency', 1);
    expect(order(cmp)[2]).toBe('latency');
    // Out-of-bounds moves are no-ops.
    cmp.moveWidget('cpu', -1);
    expect(order(cmp)[0]).toBe('cpu');
  });

  it('WHEN rendered THEN widget kinds resolve to visual hosts (no text summaries)', () => {
    const { cmp, el } = create();
    // Metric kinds map to chart units; unknown ids fall back safely.
    expect(cmp.isMetric('cpu')).toBe(true);
    expect(cmp.isMetric('logs')).toBe(false);
    expect(cmp.unit('cpu')).toBe('%');
    expect(cmp.unit('latency')).toBe('ms');
    expect(cmp.unit('throughput')).toBe('rps');
    expect(cmp.metricKind('memory')).toBe('memory');
    expect(cmp.metricKind('unknown')).toBe('cpu');
    expect(cmp.title('unknown')).toBe('unknown');
    expect(
      cmp.trackWidget(
        0,
        cmp.visibleWidgets()[0] ?? { id: 'cpu', col: 1, row: 1, w: 1, h: 1, visible: true },
      ),
    ).toBe('cpu');
    // @defer bodies stay placeholders in jsdom — one shimmer per widget.
    for (const id of order(cmp)) {
      expect(el.querySelector(`[data-testid="placeholder-${id}"]`)).not.toBeNull();
    }
    expect(el.textContent).not.toContain('metric points in window');
    expect(el.textContent).not.toContain('log rows buffered');
  });

  it('GIVEN icon-only controls WHEN rendered THEN every control exposes an accessible name', () => {
    const { cmp, el } = create();
    for (const id of ['cpu', 'memory', 'latency', 'throughput', 'logs', 'topology', 'incidents']) {
      expect(el.querySelector(`[data-testid="hide-${id}"]`)?.getAttribute('aria-label')).toBe(
        `Hide ${cmp.title(id)}`,
      );
      expect(
        el.querySelector(`[data-testid="move-${id}-up"]`)?.getAttribute('aria-label'),
      ).toContain('Move');
    }
    expect(el.querySelector('[data-testid="dashboard-board"]')?.getAttribute('aria-label')).toBe(
      'Dashboard widgets, reorderable',
    );
  });

  it('WHEN widgets reorder or hide THEN polite announcements fire', () => {
    const { cmp, fixture } = create();
    cmp.drop({ previousIndex: 2, currentIndex: 0 } as never);
    expect(announcer.announce).toHaveBeenCalledWith('Latency moved to position 1 of 7');
    cmp.toggleVisibility('topology');
    settle(fixture);
    expect(announcer.announce).toHaveBeenCalledWith('Topology hidden');
    cmp.toggleVisibility('topology');
    expect(announcer.announce).toHaveBeenCalledWith('Topology shown');
  });
});

describe('GIVEN DashboardGrid overview banner (delta 007)', () => {
  beforeEach(() => {
    localStorage.clear();
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  function create(): {
    cmp: DashboardGridComponent;
    el: HTMLElement;
    fixture: ComponentFixture<DashboardGridComponent>;
  } {
    const fixture = TestBed.createComponent(DashboardGridComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, fixture };
  }

  /** Zoneless: signal mutations need a CD pass before DOM + persist effects settle. */
  function settle(fixture: ComponentFixture<DashboardGridComponent>): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  it('WHEN rendered with fresh storage THEN overview banner shows legend and thresholds', () => {
    const { el } = create();
    const banner = el.querySelector('[data-testid="dashboard-overview"]');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('region');
    expect(banner?.getAttribute('aria-label')).toBe('About PulseGrid APM');
    expect(banner?.textContent).toContain('enterprise-grade observability platform');
    expect(banner?.textContent).toContain('Wikimedia EventStreams');
    expect(banner?.textContent).toContain('network latency, throughput (RPS)');
    expect(banner?.textContent).toContain('HTTP log entries');
    expect(banner?.textContent).toContain('60fps');
    expect(banner?.textContent).toContain('Emerald — Healthy');
    expect(banner?.textContent).toContain('Amber — Degraded');
    expect(banner?.textContent).toContain('Red — Critical / Down');
    const thresholds = el.querySelector('[data-testid="overview-thresholds"]');
    expect(thresholds?.textContent).toContain('CPU 75/90%');
    expect(thresholds?.textContent).toContain('Latency 200/500ms');
    expect(thresholds?.textContent).toContain('low-is-bad');
    expect(el.querySelector('[data-testid="overview-show"]')).toBeNull();
  });

  it('WHEN dismissed THEN banner hides AND reload stays hidden', () => {
    const { cmp, el, fixture } = create();
    cmp.dismissOverview();
    settle(fixture);
    expect(el.querySelector('[data-testid="dashboard-overview"]')).toBeNull();
    expect(el.querySelector('[data-testid="overview-show"]')).not.toBeNull();
    expect(localStorage.getItem(DASHBOARD_OVERVIEW_KEY)).toBe('0');
    fixture.destroy();

    // Reload path: a fresh component reads the persisted dismissal.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const freshFixture = TestBed.createComponent(DashboardGridComponent);
    freshFixture.detectChanges();
    TestBed.tick();
    freshFixture.detectChanges();
    const freshEl = freshFixture.nativeElement as HTMLElement;
    expect(freshEl.querySelector('[data-testid="dashboard-overview"]')).toBeNull();
    expect(freshEl.querySelector('[data-testid="overview-show"]')).not.toBeNull();
    freshFixture.destroy();
  });

  it('WHEN restored after dismissal THEN banner re-shows AND persists visible', () => {
    const { cmp, el, fixture } = create();
    cmp.dismissOverview();
    settle(fixture);
    expect(localStorage.getItem(DASHBOARD_OVERVIEW_KEY)).toBe('0');
    cmp.restoreOverview();
    settle(fixture);
    expect(el.querySelector('[data-testid="dashboard-overview"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="overview-show"]')).toBeNull();
    expect(localStorage.getItem(DASHBOARD_OVERVIEW_KEY)).toBe('1');
    fixture.destroy();
  });

  it('GIVEN icon-only dismiss WHEN rendered THEN controls expose accessible names', () => {
    const { el } = create();
    expect(el.querySelector('[data-testid="overview-dismiss"]')?.getAttribute('aria-label')).toBe(
      'Dismiss overview',
    );
    expect(el.querySelector('[aria-label="Status legend"]')).not.toBeNull();
  });
});

describe('GIVEN DashboardGrid live status line (delta 008)', () => {
  beforeEach(() => {
    localStorage.clear();
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  function create(): {
    cmp: DashboardGridComponent;
    el: HTMLElement;
    fixture: ComponentFixture<DashboardGridComponent>;
  } {
    const fixture = TestBed.createComponent(DashboardGridComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, fixture };
  }

  /** Zoneless: signal mutations need a CD pass before DOM + persist effects settle. */
  function settle(fixture: ComponentFixture<DashboardGridComponent>): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  it('WHEN store is live THEN overview shows the Wikimedia connected status', () => {
    const { el, fixture } = create();
    TestBed.inject(CoreStore).setConnectionStatus('live');
    settle(fixture);
    expect(el.querySelector('[data-testid="dashboard-live-status"]')?.textContent).toContain(
      'Live Status: Connected to Wikimedia Global Event Stream',
    );
  });

  it('WHEN store is simulated or reconnecting THEN overview reflects it', () => {
    const { el, fixture } = create();
    const store = TestBed.inject(CoreStore);
    store.setConnectionStatus('simulated');
    settle(fixture);
    expect(el.querySelector('[data-testid="dashboard-live-status"]')?.textContent).toContain(
      'Simulated fallback',
    );
    store.setConnectionStatus('reconnecting');
    settle(fixture);
    expect(el.querySelector('[data-testid="dashboard-live-status"]')?.textContent).toContain(
      'Reconnecting',
    );
  });
});

describe('GIVEN DashboardGrid drag preview (delta 011)', () => {
  beforeEach(() => {
    localStorage.clear();
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function create(): {
    cmp: DashboardGridComponent;
    el: HTMLElement;
    fixture: ComponentFixture<DashboardGridComponent>;
  } {
    const fixture = TestBed.createComponent(DashboardGridComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, fixture };
  }

  function settle(fixture: ComponentFixture<DashboardGridComponent>): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  function mockBoard(el: HTMLElement): void {
    const board = el.querySelector('[data-testid="dashboard-board"]');
    if (board !== null) {
      board.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 600, 800);
    }
  }

  function dragEvent(left: number, top: number): never {
    return {
      source: {
        getRootElement: () => ({
          getBoundingClientRect: () => ({ left, top, width: 280, height: 180 }),
        }),
      },
    } as never;
  }

  it('WHEN drag starts THEN active card is marked AND release clears it', () => {
    const { cmp, fixture } = create();
    expect(cmp.draggedWidgetId()).toBeNull();
    cmp.onDragStarted('cpu');
    expect(cmp.draggedWidgetId()).toBe('cpu');
    expect(cmp.isDragging('cpu')).toBe(true);
    expect(cmp.isDragging('memory')).toBe(false);
    settle(fixture);
    cmp.onDragEnded();
    expect(cmp.draggedWidgetId()).toBeNull();
    expect(cmp.dropPreviewIndex()).toBeNull();
  });

  it('WHEN preview index is set THEN cell position renders with Grid Column/Row', () => {
    const { cmp, el, fixture } = create();
    expect(el.querySelector('[data-testid="drop-preview-position"]')).toBeNull();
    // Index 5 in a 2-column board → row 3, column 2.
    cmp.dropPreviewIndex.set(5);
    settle(fixture);
    expect(cmp.dropPreviewPosition()).toEqual({ row: 3, col: 2 });
    const badge = el.querySelector('[data-testid="drop-preview-position"]');
    expect(badge?.textContent).toContain('row 3');
    expect(badge?.textContent).toContain('column 2');
    expect(cmp.isPreview(5)).toBe(true);
    expect(cmp.isPreview(0)).toBe(false);
  });

  it('WHEN dragged element moves THEN centroid snaps preview AND rapid moves throttle', () => {
    const { cmp, el } = create();
    mockBoard(el);
    const now = vi.spyOn(performance, 'now');
    // Centroid of (left 320, width 280) → x=460 → col 1; (top 20, height 180) → y=110 → row 0 → index 1.
    now.mockReturnValue(1000);
    cmp.onDragMoved(dragEvent(320, 20));
    expect(cmp.dropPreviewIndex()).toBe(1);
    // Same timestamp → throttled, even though the centroid moved cells.
    cmp.onDragMoved(dragEvent(10, 610));
    expect(cmp.dropPreviewIndex()).toBe(1);
    // Past the throttle window → recalculates to row 3 col 0 → index 6.
    now.mockReturnValue(1000 + 64);
    cmp.onDragMoved(dragEvent(10, 610));
    expect(cmp.dropPreviewIndex()).toBe(6);
  });

  it('WHEN drop completes THEN preview state clears AND order still persists', () => {
    const { cmp, fixture } = create();
    cmp.onDragStarted('latency');
    cmp.dropPreviewIndex.set(3);
    cmp.drop({ previousIndex: 2, currentIndex: 0 } as never);
    settle(fixture);
    expect(cmp.draggedWidgetId()).toBeNull();
    expect(cmp.dropPreviewIndex()).toBeNull();
    expect(cmp.visibleWidgets().map((w) => w.id)[0]).toBe('latency');
  });
});
