import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../../test-helpers';
import { PageHeaderComponent } from './page-header.component';

describe('GIVEN PageHeader', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create(props: { title: string; subtitle?: string }): HTMLElement {
    TestBed.runInInjectionContext(() => undefined);
    const fixture = TestBed.createComponent(PageHeaderComponent);
    fixture.componentRef.setInput('title', props.title);
    fixture.componentRef.setInput('subtitle', props.subtitle ?? '');
    fixture.detectChanges();
    TestBed.tick();
    return fixture.nativeElement as HTMLElement;
  }

  it('WHEN title set THEN heading renders title', () => {
    const el = create({ title: 'Logs' });
    expect(el.querySelector('h2')?.textContent).toContain('Logs');
  });

  it('WHEN subtitle set THEN subtitle paragraph renders', () => {
    const el = create({ title: 'Logs', subtitle: 'Live tail from ingestion stream' });
    expect(el.querySelector('p')?.textContent).toContain('Live tail');
  });

  it('WHEN subtitle empty THEN no subtitle paragraph renders', () => {
    const el = create({ title: 'Logs' });
    expect(el.querySelector('p')).toBeNull();
  });
});
