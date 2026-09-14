import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../../test-helpers';
import { CoreStore } from '../../../core/store/core-store.service';
import type { LogEntry } from '../../../core/models/log-entry.model';
import { DashboardLogWidgetComponent } from './dashboard-log-widget.component';

function entry(i: number): LogEntry {
  return {
    id: `log-${String(i)}`,
    level: i % 10 === 0 ? 'ERROR' : 'INFO',
    message: `event ${String(i)}`,
    timestamp: i,
    serviceId: 'payments-api',
  };
}

describe('GIVEN DashboardLogWidget (compact)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create(): { cmp: DashboardLogWidgetComponent; el: HTMLElement } {
    const fixture = TestBed.createComponent(DashboardLogWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('WHEN no logs exist THEN the count badge shows 0 rows', () => {
    const { cmp, el } = create();
    expect(cmp.rows()).toHaveLength(0);
    expect(el.querySelector('[data-testid="dash-log-count"]')?.textContent).toContain('0 rows');
  });

  it('WHEN 150 logs arrive THEN only the last 100 render in the tail', () => {
    const store = TestBed.inject(CoreStore);
    store.appendLogs(Array.from({ length: 150 }, (_, i) => entry(i)));
    const { cmp, el } = create();
    expect(cmp.rows()).toHaveLength(100);
    expect(cmp.count()).toBe(150);
    expect(cmp.rows()[0]?.id).toBe('log-50');
    expect(el.querySelector('[data-testid="dash-log-count"]')?.textContent).toContain('150 rows');
  });

  it('WHEN trackLog is used THEN rows key by stable entry id', () => {
    const { cmp } = create();
    expect(cmp.trackLog(0, entry(7))).toBe('log-7');
    expect(cmp.badgeClass('ERROR')).toContain('rose');
    expect(cmp.badgeClass('WARN')).toContain('amber');
    expect(cmp.badgeClass('INFO')).toContain('blue');
  });
});
