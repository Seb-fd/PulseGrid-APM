import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY, type Observable } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../test-helpers';
import { WIKIMEDIA_RECENTCHANGE_URL } from './core/services/wikimedia-adapter';
import { WikimediaStreamService } from './core/services/wikimedia-stream.service';
import { LogIngestionService } from './core/services/log-ingestion.service';
import { StochasticSimService } from './core/services/stochastic-sim.service';
import { TelemetryIngestionService } from './core/services/telemetry-ingestion.service';
import { CoreStore } from './core/store/core-store.service';
import type { ConnectionStatus } from './core/models/alert-rule.model';
import type { LogEntry } from './core/models/log-entry.model';
import type { TelemetryMetric } from './core/models/telemetry-metric.model';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

/** TestBed-free shell contract (E2E covers rendering). */
describe('GIVEN app routes', () => {
  it('WHEN loaded THEN lazy feature routes exist', () => {
    const paths = routes.map((r) => r.path);
    for (const p of ['dashboard', 'telemetry', 'logs', 'topology', 'alerts']) {
      expect(paths).toContain(p);
    }
  });

  it('WHEN unknown path THEN redirects to dashboard', () => {
    expect(routes.find((r) => r.path === '**')).toMatchObject({ redirectTo: 'dashboard' });
  });
});

describe('GIVEN AppComponent wiring (delta 002)', () => {
  const fakeTelemetry = {
    connectionStatus: signal<ConnectionStatus>('reconnecting'),
    metrics$: vi.fn((_liveUrl: string): Observable<TelemetryMetric[]> => EMPTY),
  };
  const fakeLogs = {
    status: signal<ConnectionStatus>('reconnecting'),
    logs$: vi.fn((_liveUrl: string): Observable<LogEntry[]> => EMPTY),
  };

  function configure(): void {
    fakeTelemetry.connectionStatus.set('reconnecting');
    fakeTelemetry.metrics$.mockClear();
    fakeLogs.status.set('reconnecting');
    fakeLogs.logs$.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: TelemetryIngestionService, useValue: fakeTelemetry },
        { provide: LogIngestionService, useValue: fakeLogs },
      ],
    });
  }

  /** Point jsdom at a query string without navigating (hermetic seam). */
  function withSearch(search: string): void {
    window.history.replaceState(null, '', `/${search}`);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('WHEN initialized with defaults THEN binds live URL and arms no timers', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    try {
      withSearch('');
      configure();
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      TestBed.tick();
      expect(fakeTelemetry.metrics$).toHaveBeenCalledWith(WIKIMEDIA_RECENTCHANGE_URL);
      expect(fakeLogs.logs$).toHaveBeenCalledWith(WIKIMEDIA_RECENTCHANGE_URL);
      // The former AppComponent timer ticked at 1000ms; the framework's own
      // scheduler (~16.6ms) is unrelated and ignored here.
      const appTimers = setIntervalSpy.mock.calls.filter((args) => args[1] === 1000);
      expect(appTimers).toHaveLength(0);
      expect('timer' in fixture.componentInstance).toBe(false);
    } finally {
      setIntervalSpy.mockRestore();
      withSearch('');
    }
  });

  it('WHEN liveUrl and scenario params present THEN forces fallback and arms the scenario', () => {
    withSearch('?liveUrl=ws://127.0.0.1:9/dead&scenario=cpu-spike');
    try {
      configure();
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      TestBed.tick();
      expect(fakeTelemetry.metrics$).toHaveBeenCalledWith('ws://127.0.0.1:9/dead');
      expect(TestBed.inject(StochasticSimService).scenario()).toBe('cpu-spike');
    } finally {
      withSearch('');
    }
  });

  it('WHEN ingestion status flips THEN the store mirrors it with no polling', () => {
    withSearch('');
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    TestBed.tick();
    const store = TestBed.inject(CoreStore);
    expect(store.connectionStatus()).toBe('reconnecting');
    fakeLogs.status.set('simulated');
    fixture.detectChanges();
    TestBed.tick();
    expect(store.connectionStatus()).toBe('simulated');
  });
});

describe('GIVEN AppComponent manual reconnect (Retry Live)', () => {
  function withSearch(search: string): void {
    window.history.replaceState(null, '', `/${search}`);
  }

  function configureReconnect(): {
    fakeTelemetry: {
      connectionStatus: ReturnType<typeof signal<ConnectionStatus>>;
      metrics$: ReturnType<typeof vi.fn>;
      retryLive: ReturnType<typeof vi.fn>;
    };
    fakeLogs: {
      status: ReturnType<typeof signal<ConnectionStatus>>;
      logs$: ReturnType<typeof vi.fn>;
    };
    fakeStream: { disconnect: ReturnType<typeof vi.fn> };
  } {
    const fakeTelemetry = {
      connectionStatus: signal<ConnectionStatus>('simulated'),
      metrics$: vi.fn((_liveUrl: string): Observable<TelemetryMetric[]> => EMPTY),
      retryLive: vi.fn((_liveUrl?: string): void => undefined),
    };
    const fakeLogs = {
      status: signal<ConnectionStatus>('simulated'),
      logs$: vi.fn((_liveUrl: string): Observable<LogEntry[]> => EMPTY),
    };
    const fakeStream = { disconnect: vi.fn((_url?: string): void => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: TelemetryIngestionService, useValue: fakeTelemetry },
        { provide: LogIngestionService, useValue: fakeLogs },
        { provide: WikimediaStreamService, useValue: fakeStream },
      ],
    });
    return { fakeTelemetry, fakeLogs, fakeStream };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('WHEN retryLiveConnection called THEN it disconnects, resets ingestion, and rebinds fresh streams', () => {
    withSearch('?liveUrl=ws://127.0.0.1:9/dead');
    try {
      const { fakeTelemetry, fakeLogs, fakeStream } = configureReconnect();
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      TestBed.tick();
      expect(fakeTelemetry.metrics$).toHaveBeenCalledWith('ws://127.0.0.1:9/dead');
      fakeTelemetry.metrics$.mockClear();
      fakeLogs.logs$.mockClear();
      fixture.componentInstance.retryLiveConnection();
      fixture.detectChanges();
      TestBed.tick();
      expect(fakeStream.disconnect).toHaveBeenCalledWith('ws://127.0.0.1:9/dead');
      expect(fakeTelemetry.retryLive).toHaveBeenCalledWith('ws://127.0.0.1:9/dead');
      expect(fakeTelemetry.metrics$).toHaveBeenCalledWith('ws://127.0.0.1:9/dead');
      expect(fakeLogs.logs$).toHaveBeenCalledWith('ws://127.0.0.1:9/dead');
      expect(TestBed.inject(CoreStore).connectionStatus()).toBe('reconnecting');
    } finally {
      withSearch('');
    }
  });

  it('WHEN liveUrl changes before retry THEN rebind uses the new URL (dynamic re-read)', () => {
    withSearch('?liveUrl=ws://127.0.0.1:9/dead');
    try {
      const { fakeTelemetry, fakeStream } = configureReconnect();
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      TestBed.tick();
      expect(fakeTelemetry.metrics$).toHaveBeenCalledWith('ws://127.0.0.1:9/dead');
      withSearch('');
      fakeTelemetry.metrics$.mockClear();
      fixture.componentInstance.retryLiveConnection();
      fixture.detectChanges();
      TestBed.tick();
      expect(fakeStream.disconnect).toHaveBeenCalledWith(WIKIMEDIA_RECENTCHANGE_URL);
      expect(fakeTelemetry.retryLive).toHaveBeenCalledWith(WIKIMEDIA_RECENTCHANGE_URL);
      expect(fakeTelemetry.metrics$).toHaveBeenCalledWith(WIKIMEDIA_RECENTCHANGE_URL);
    } finally {
      withSearch('');
    }
  });
});

describe('GIVEN the mobile navigation drawer', () => {
  const fakeTelemetry = {
    connectionStatus: signal<ConnectionStatus>('reconnecting'),
    metrics$: vi.fn((_liveUrl: string): Observable<TelemetryMetric[]> => EMPTY),
  };
  const fakeLogs = {
    status: signal<ConnectionStatus>('reconnecting'),
    logs$: vi.fn((_liveUrl: string): Observable<LogEntry[]> => EMPTY),
  };

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: TelemetryIngestionService, useValue: fakeTelemetry },
        { provide: LogIngestionService, useValue: fakeLogs },
      ],
    });
  }

  function withInnerWidth(width: number): () => void {
    const previous = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    return () => {
      Object.defineProperty(window, 'innerWidth', { value: previous, configurable: true });
    };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    window.history.replaceState(null, '', '/');
  });

  it('WHEN created THEN the drawer defaults to closed', () => {
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.isMobileMenuOpen()).toBe(false);
  });

  it('WHEN toggleMobileMenu is called THEN the drawer flips open and closed', () => {
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(false);
  });

  it('WHEN closeMobileMenu is called on an open drawer THEN it resets to closed', () => {
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);
    component.closeMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(false);
  });

  it('WHEN the window resizes to desktop width with the drawer open THEN it auto-closes', () => {
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);
    const restore = withInnerWidth(1024);
    try {
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(component.isMobileMenuOpen()).toBe(false);
    } finally {
      restore();
    }
  });

  it('WHEN the window resizes below the desktop breakpoint THEN an open drawer stays open', () => {
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.toggleMobileMenu();
    const restore = withInnerWidth(375);
    try {
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(component.isMobileMenuOpen()).toBe(true);
    } finally {
      restore();
    }
  });

  it('WHEN Escape is pressed with the drawer open THEN it closes', () => {
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(component.isMobileMenuOpen()).toBe(false);
  });
});

describe('GIVEN the AppComponent footer disclaimer (single source of truth)', () => {
  const fakeTelemetry = {
    connectionStatus: signal<ConnectionStatus>('reconnecting'),
    metrics$: vi.fn((_liveUrl: string): Observable<TelemetryMetric[]> => EMPTY),
  };
  const fakeLogs = {
    status: signal<ConnectionStatus>('reconnecting'),
    logs$: vi.fn((_liveUrl: string): Observable<LogEntry[]> => EMPTY),
  };

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: TelemetryIngestionService, useValue: fakeTelemetry },
        { provide: LogIngestionService, useValue: fakeLogs },
      ],
    });
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    window.history.replaceState(null, '', '/');
  });

  it('WHEN rendered THEN a single footer shows the unified disclaimer copy', () => {
    configure();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const footers = el.querySelectorAll('[data-testid="app-footer"]');
    expect(footers).toHaveLength(1);
    expect(footers[0]?.textContent).toContain(
      'Metrics and telemetry derived from the live Wikimedia EventStreams feed',
    );
    expect(footers[0]?.textContent).toContain('local simulator fallback');
  });
});
