import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import '../../../../test-helpers';
import { CoreStore } from '../../../core/store/core-store.service';
import { ConnectionPulseComponent } from './connection-pulse.component';

describe('GIVEN ConnectionPulse', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create(): { cmp: ConnectionPulseComponent; el: HTMLElement } {
    const fixture = TestBed.createComponent(ConnectionPulseComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('WHEN status is live THEN the dot carries the live tone and no title', () => {
    const { cmp, el } = create();
    const store = TestBed.inject(CoreStore);
    store.setConnectionStatus('live');
    TestBed.tick();
    expect(cmp.status()).toBe('live');
    expect(el.querySelector('span')?.getAttribute('title')).toBeNull();
    expect(el.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('WHEN status changes to reconnecting THEN the tone follows', () => {
    const { cmp, el } = create();
    const store = TestBed.inject(CoreStore);
    store.setConnectionStatus('reconnecting');
    TestBed.tick();
    expect(cmp.status()).toBe('reconnecting');
    expect(el.querySelector('span')?.className).toContain('bg-rose-500');
  });
});
