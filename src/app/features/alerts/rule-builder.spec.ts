import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import '../../../test-helpers';
import { CoreStore } from '../../core/store/core-store.service';
import { ALERT_RULES_KEY } from '../../core/store/alert-engine.service';
import { RuleBuilderComponent } from './rule-builder.component';

describe('GIVEN RuleBuilder form', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    localStorage.clear();
  });

  function create(): RuleBuilderComponent {
    const fixture = TestBed.createComponent(RuleBuilderComponent);
    fixture.detectChanges();
    TestBed.tick();
    return fixture.componentInstance;
  }

  function fillValid(cmp: RuleBuilderComponent): void {
    cmp.form.controls.name.setValue('High Latency');
    cmp.form.controls.metric.setValue('latency');
    cmp.form.controls.operator.setValue('>');
    cmp.form.controls.threshold.setValue(200);
    cmp.form.controls.durationSec.setValue(10);
    cmp.form.controls.severity.setValue('critical');
    cmp.form.controls.enabled.setValue(true);
  }

  it('WHEN a valid rule is saved THEN it appears enabled AND persists after reload', () => {
    const store = TestBed.inject(CoreStore);
    const cmp = create();
    fillValid(cmp);
    expect(cmp.form.valid).toBe(true);
    cmp.save();
    TestBed.tick();
    expect(store.rules()).toHaveLength(1);
    expect(store.rules()[0]?.enabled).toBe(true);
    const raw = localStorage.getItem(ALERT_RULES_KEY);
    expect(raw).not.toBeNull();
    expect((JSON.parse(raw ?? '[]') as unknown[]).length).toBe(1);
    expect(cmp.form.controls.name.value).toBe('');
  });

  it('WHEN threshold is empty or duration <5 THEN save is blocked with inline errors', () => {
    const store = TestBed.inject(CoreStore);
    const cmp = create();
    cmp.form.controls.name.setValue('ab');
    cmp.form.controls.threshold.setValue(null);
    cmp.form.controls.durationSec.setValue(3);
    cmp.form.markAllAsTouched();
    expect(cmp.form.invalid).toBe(true);
    cmp.save();
    expect(store.rules()).toHaveLength(0);
    // Error predicates (independent of template timing):
    expect(cmp.form.controls.name.invalid).toBe(true);
    expect(cmp.form.controls.durationSec.invalid).toBe(true);
  });

  it('WHEN cpu threshold exceeds 100 THEN the cross-field range guard rejects it', () => {
    const cmp = create();
    fillValid(cmp);
    cmp.form.controls.metric.setValue('cpu');
    cmp.form.controls.threshold.setValue(150);
    expect(cmp.form.hasError('thresholdRange')).toBe(true);
    expect(cmp.form.invalid).toBe(true);
  });

  it('WHEN a rule is toggled THEN enabled flips hot AND persists', () => {
    const store = TestBed.inject(CoreStore);
    const cmp = create();
    fillValid(cmp);
    cmp.save();
    const rule = store.rules()[0];
    if (rule === undefined) throw new Error('rule missing');
    expect(rule.enabled).toBe(true);
    cmp.toggleEnabled(rule);
    expect(store.rules()[0]?.enabled).toBe(false);
  });

  it('WHEN a rule is removed THEN it leaves the list AND storage', () => {
    const store = TestBed.inject(CoreStore);
    const cmp = create();
    fillValid(cmp);
    cmp.save();
    const id = store.rules()[0]?.id ?? '';
    cmp.remove(id);
    TestBed.tick();
    expect(store.rules()).toHaveLength(0);
  });

  it('GIVEN invalid fields WHEN errors render THEN inputs link to their messages', () => {
    const fixture = TestBed.createComponent(RuleBuilderComponent);
    fixture.detectChanges();
    TestBed.tick();
    const cmp = fixture.componentInstance;
    cmp.form.controls.name.setValue('ab');
    cmp.form.markAllAsTouched();
    fixture.detectChanges();
    TestBed.tick();
    const el = fixture.nativeElement as HTMLElement;
    const nameInput = el.querySelector('[data-testid="rule-name"]');
    expect(nameInput?.getAttribute('aria-describedby')).toBe('error-name-text');
    expect(nameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#error-name-text')).not.toBeNull();
  });
});
