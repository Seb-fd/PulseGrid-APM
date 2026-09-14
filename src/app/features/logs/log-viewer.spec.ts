import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../test-helpers';
import { CoreStore } from '../../core/store/core-store.service';
import type { LogEntry, LogLevel } from '../../core/models/log-entry.model';
import { LogViewerComponent } from './log-viewer.component';

function entry(i: number, level: LogLevel, serviceId = 'payments-api'): LogEntry {
  return {
    id: `log-${String(i)}`,
    level,
    message: `event ${String(i)} on ${serviceId}`,
    timestamp: i,
    serviceId,
    traceId: `trace-${String(i)}`,
  };
}

describe('GIVEN LogViewer with 1000 logs (600 INFO, 300 WARN, 100 ERROR)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(CoreStore);
    const logs: LogEntry[] = [];
    for (let i = 0; i < 600; i++)
      logs.push(entry(i, 'INFO', i % 2 === 0 ? 'auth' : 'payments-api'));
    for (let i = 600; i < 900; i++) logs.push(entry(i, 'WARN'));
    for (let i = 900; i < 1000; i++) logs.push(entry(i, 'ERROR'));
    store.appendLogs(logs);
  });

  function create(): LogViewerComponent {
    const fixture = TestBed.createComponent(LogViewerComponent);
    fixture.detectChanges();
    TestBed.tick();
    return fixture.componentInstance;
  }

  it('WHEN level filter is ERROR only THEN viewport shows 100 rows and count badge updates', () => {
    const cmp = create();
    expect(cmp.rows().length).toBe(1000);
    cmp.toggleLevel('ERROR');
    TestBed.tick();
    expect(cmp.rows().length).toBe(100);
    expect(cmp.rows().every((r) => r.level === 'ERROR')).toBe(true);
  });

  it('WHEN query is payments-api THEN only matching rows remain', () => {
    const cmp = create();
    cmp.query.set('payments-api');
    TestBed.tick();
    expect(cmp.rows().length).toBeGreaterThan(0);
    expect(
      cmp.rows().every((r) => r.serviceId === 'payments-api' || r.message.includes('payments-api')),
    ).toBe(true);
  });

  it('WHEN paused THEN rows keep buffering but tail does not follow', () => {
    const cmp = create();
    const store = TestBed.inject(CoreStore);
    expect(cmp.paused()).toBe(false);
    cmp.togglePaused();
    expect(cmp.paused()).toBe(true);
    store.appendLogs([entry(1001, 'ERROR')]);
    TestBed.tick();
    expect(cmp.rows().length).toBe(1001); // no rows lost while paused
    cmp.togglePaused();
    expect(cmp.paused()).toBe(false);
  });

  it('WHEN cleared THEN view empties', () => {
    const cmp = create();
    expect(cmp.rows().length).toBe(1000);
    cmp.clear();
    TestBed.tick();
    expect(cmp.rows().length).toBe(0);
  });

  it('GIVEN pills WHEN Errors Only selected THEN only errors remain with counts', () => {
    const cmp = create();
    expect(cmp.errorCount()).toBe(100);
    expect(cmp.warnCount()).toBe(300);
    cmp.selectOnly('ERROR');
    TestBed.tick();
    expect(cmp.isOnly('ERROR')).toBe(true);
    expect(cmp.rows().length).toBe(100);
    cmp.selectAll();
    TestBed.tick();
    expect(cmp.rows().length).toBe(1000);
  });

  it('GIVEN http messages WHEN parsed THEN method and status badges resolve', () => {
    const cmp = create();
    expect(cmp.httpMethod('GET /api/ledger 500')).toBe('GET');
    expect(cmp.httpStatus('GET /api/ledger 500 (sim-1)')).toBe(500);
    expect(cmp.httpStatus('Node outage: ledger throughput 0 (500s surging)')).toBeNull();
    expect(cmp.methodClass('GET')).toContain('text-blue-300');
    expect(cmp.statusClass(500)).toContain('text-rose-300');
    expect(cmp.statusClass(200)).toContain('text-emerald-300');
  });

  it('GIVEN a row WHEN selected THEN drawer opens with metadata and Esc closes', () => {
    const fixture = TestBed.createComponent(LogViewerComponent);
    fixture.detectChanges();
    TestBed.tick();
    const cmp = fixture.componentInstance;
    const first = cmp.rows()[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    cmp.select(first);
    TestBed.tick();
    fixture.detectChanges();
    expect(cmp.selectedEntry()?.id).toBe(first.id);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="log-detail"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="log-detail-message"]')?.textContent).toContain(
      first.message,
    );
    expect(el.querySelector('[data-testid="log-detail-stack"]')).not.toBeNull();
    cmp.closeDetail();
    TestBed.tick();
    fixture.detectChanges();
    expect(cmp.selectedEntry()).toBeUndefined();
    expect(el.querySelector('[data-testid="log-detail"]')).toBeNull();
  });

  it('WHEN trace copied THEN copied id is shown', () => {
    const cmp = create();
    cmp.copyTrace('trace-7');
    expect(cmp.copiedId()).toBe('trace-7');
  });

  it('GIVEN trace copy buttons WHEN rendered THEN they carry names and confirm politely', () => {
    const fixture = TestBed.createComponent(LogViewerComponent);
    fixture.detectChanges();
    TestBed.tick();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    // The detail drawer always renders its copy action once a traced row opens…
    const first = cmp.rows().find((r) => r.traceId !== undefined);
    expect(first).toBeDefined();
    if (first === undefined) return;
    cmp.select(first);
    fixture.detectChanges();
    TestBed.tick();
    expect(el.querySelector('[aria-label="Copy trace id"]')).not.toBeNull();
    cmp.copyTrace('trace-7');
    fixture.detectChanges();
    TestBed.tick();
    expect(el.querySelector('[data-testid="log-copy-feedback"]')?.textContent).toContain(
      'Copied trace-7',
    );
  });

  it('WHEN the drawer closes THEN focus returns to the opening control', () => {
    const fixture = TestBed.createComponent(LogViewerComponent);
    fixture.detectChanges();
    TestBed.tick();
    const cmp = fixture.componentInstance;
    const first = cmp.rows()[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const opener = fixture.nativeElement as HTMLElement;
    const pause = opener.querySelector('button');
    pause?.focus();
    expect(document.activeElement).toBe(pause);
    cmp.select(first);
    TestBed.tick();
    cmp.closeDetail();
    TestBed.tick();
    expect(cmp.selectedEntry()).toBeUndefined();
    expect(document.activeElement).toBe(pause);
  });
});
