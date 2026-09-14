import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import '../../../test-helpers';
import { AlertEngineService } from '../../core/store/alert-engine.service';
import { AlertsPageComponent } from './alerts-page.component';

describe('GIVEN AlertsPage host', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('WHEN the page initializes THEN the engine starts AND stops on destroy', () => {
    const engine = TestBed.inject(AlertEngineService);
    expect(engine.running()).toBe(false);
    const fixture = TestBed.createComponent(AlertsPageComponent);
    fixture.detectChanges();
    expect(engine.running()).toBe(true);
    fixture.destroy();
    expect(engine.running()).toBe(false);
  });

  it('WHEN rendered THEN builder and incident placeholder are present', () => {
    const fixture = TestBed.createComponent(AlertsPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-rule-builder')).not.toBeNull();
    // Incident list is @defer-red in jsdom → placeholder guards the bundle.
    expect(
      el.querySelector('app-incident-list, [data-testid="incident-placeholder"]'),
    ).not.toBeNull();
  });
});
