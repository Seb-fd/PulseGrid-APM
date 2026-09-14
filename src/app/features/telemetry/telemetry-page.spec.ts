import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import '../../../test-helpers';
import { CoreStore } from '../../core/store/core-store.service';
import type { TelemetryMetric } from '../../core/models/telemetry-metric.model';
import { TelemetryPageComponent } from './telemetry-page.component';

function metric(kind: TelemetryMetric['kind'], value: number, ts: number): TelemetryMetric {
  return {
    id: `${kind}:${String(ts)}`,
    kind,
    value,
    unit: kind === 'latency' ? 'ms' : kind === 'throughput' ? 'rps' : '%',
    timestamp: ts,
    source: 'simulated',
  };
}

describe('GIVEN TelemetryPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  function seed(store: CoreStore): void {
    const batch: TelemetryMetric[] = [];
    for (const kind of ['cpu', 'memory', 'latency', 'throughput'] as const) {
      for (let i = 0; i < 5; i++) batch.push(metric(kind, 10 + i, i));
    }
    store.ingestMetrics(batch);
  }

  it('WHEN rendered THEN shows 4 chart cards with units and no inline footnote', () => {
    const store = TestBed.inject(CoreStore);
    seed(store);
    const fixture = TestBed.createComponent(TelemetryPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    const el = fixture.nativeElement as HTMLElement;
    for (const testId of ['chart-cpu', 'chart-memory', 'chart-latency', 'chart-throughput']) {
      expect(el.querySelector(`[data-testid="${testId}"]`)).not.toBeNull();
    }
    // Footnote lives once in the AppComponent footer (single source of truth).
    expect(el.textContent).not.toContain('Values derived from Wikimedia');
    expect(el.textContent).not.toContain('Metrics and telemetry derived');
  });

  it('GIVEN seeded series WHEN rendered THEN per-card summaries show current plus avg', () => {
    const store = TestBed.inject(CoreStore);
    seed(store);
    const fixture = TestBed.createComponent(TelemetryPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    const el = fixture.nativeElement as HTMLElement;
    for (const kind of ['cpu', 'memory', 'latency', 'throughput']) {
      const node = el.querySelector(`[data-testid="summary-${kind}"]`);
      expect(node).not.toBeNull();
      expect(node?.textContent).toContain('avg');
    }
    expect(fixture.componentInstance.summaries().cpu).toContain('avg');
  });

  it('WHEN window changes THEN selection persists to localStorage and button reflects it', () => {
    const fixture = TestBed.createComponent(TelemetryPageComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.windowSec()).toBe(30);
    cmp.setWindow(60);
    expect(cmp.windowSec()).toBe(60);
    // Effects flush on the change-detection pipeline (as in prod ticks).
    fixture.detectChanges();
    expect(localStorage.getItem('pg.telemetry.window')).toBe('60');
    // The pressed button (not a native select value binding) reflects state —
    // immune to native-control creation-order timing in every renderer.
    const el = fixture.nativeElement as HTMLElement;
    const pressed = el.querySelector('button[aria-pressed="true"]');
    expect(pressed).not.toBeNull();
    if (pressed === null) throw new Error('expected pressed window button');
    expect(pressed.textContent.trim()).toBe('60s');
  });

  it('WHEN reloaded with stored window THEN restores selection', () => {
    localStorage.setItem('pg.telemetry.window', '10');
    const cmp = TestBed.createComponent(TelemetryPageComponent).componentInstance;
    expect(cmp.windowSec()).toBe(10);
  });

  it('WHEN setWindow receives valid input THEN it applies (invalid ignored by types)', () => {
    const cmp = TestBed.createComponent(TelemetryPageComponent).componentInstance;
    cmp.setWindow(10);
    expect(cmp.windowSec()).toBe(10);
  });

  it('GIVEN seeded series WHEN rendered THEN each card exposes a hidden data summary', () => {
    const store = TestBed.inject(CoreStore);
    seed(store);
    const fixture = TestBed.createComponent(TelemetryPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    expect(cmp.altTexts().cpu).toContain('Latest 14 percent');
    expect(cmp.altTexts().cpu).toContain('window average');
    const node = el.querySelector('[data-testid="chart-alt-cpu"]');
    expect(node?.className).toContain('sr-only');
    expect(node?.textContent).toContain('Latest 14 percent');
  });

  it('GIVEN an empty stream WHEN rendered THEN summaries report no data', () => {
    const fixture = TestBed.createComponent(TelemetryPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    const cmp = fixture.componentInstance;
    expect(cmp.altTexts().latency).toBe('Latency: no data yet.');
  });
});
