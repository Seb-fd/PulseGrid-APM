import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import '../../../../test-helpers';
import { CoreStore } from '../../../core/store/core-store.service';
import { StatusBannerComponent } from './status-banner.component';

describe('GIVEN StatusBanner state', () => {
  it('WHEN live unreachable THEN store reports simulated (banner contract)', () => {
    const store = new CoreStore();
    store.setConnectionStatus('simulated');
    expect(store.connectionStatus()).toBe('simulated');
  });

  it('WHEN reconnect orchestrated by AppComponent THEN store passes through reconnecting', () => {
    const store = new CoreStore();
    store.setConnectionStatus('simulated');
    // AppComponent.retryLiveConnection() sets this after emitting retry.
    store.setConnectionStatus('reconnecting');
    expect(store.connectionStatus()).toBe('reconnecting');
  });
});

describe('GIVEN StatusBannerComponent pill (delta 009)', () => {
  function create(): { el: HTMLElement; fixture: ComponentFixture<StatusBannerComponent> } {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(StatusBannerComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { el: fixture.nativeElement as HTMLElement, fixture };
  }

  /** Zoneless: signal mutations need a CD pass before the DOM settles. */
  function settle(fixture: ComponentFixture<StatusBannerComponent>): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  function pill(el: HTMLElement): HTMLElement {
    const root = el.querySelector('[data-testid="status-pill"]');
    if (root === null) throw new Error('status pill root missing');
    return root as HTMLElement;
  }

  it('WHEN live THEN pill shows compact desktop + mobile labels with full title', () => {
    const { el, fixture } = create();
    TestBed.inject(CoreStore).setConnectionStatus('live');
    settle(fixture);
    const root = pill(el);
    expect(root.getAttribute('data-status')).toBe('live');
    expect(root.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('Live: Wikimedia EventStreams');
    expect(el.textContent).toContain('LIVE');
    expect(root.getAttribute('title')).toContain('Connected to Wikimedia Global Event Stream');
    expect(root.getAttribute('aria-label')).toContain('Connected to Wikimedia Global Event Stream');
    expect(root.className).toContain('rounded-full');
    expect(root.className).toContain('inline-flex');
    expect(root.className).not.toContain('border-b');
    expect(el.querySelector('button')).toBeNull();
  });

  it('WHEN simulated THEN pill shows fallback text with retry', () => {
    const { el, fixture } = create();
    TestBed.inject(CoreStore).setConnectionStatus('simulated');
    settle(fixture);
    const root = pill(el);
    expect(root.getAttribute('data-status')).toBe('simulated');
    expect(el.textContent).toContain('Simulated fallback');
    expect(el.textContent).toContain('SIMULATED');
    expect(root.getAttribute('aria-label')).toContain('SIMULATED');
    expect(el.querySelector('button')?.textContent).toContain('Retry Live');
  });

  it('WHEN retry clicked THEN retry output emits and store is untouched (AppComponent owns rebind)', () => {
    const { el, fixture } = create();
    TestBed.inject(CoreStore).setConnectionStatus('simulated');
    settle(fixture);
    let emitted = 0;
    fixture.componentInstance.retry.subscribe(() => {
      emitted += 1;
    });
    const button = el.querySelector('button');
    if (button === null) throw new Error('Retry Live button missing');
    button.click();
    settle(fixture);
    expect(emitted).toBe(1);
    // Delegation contract: the banner never flips the signal itself, so a
    // broken orchestration cannot leave the pill stuck in reconnecting.
    expect(TestBed.inject(CoreStore).connectionStatus()).toBe('simulated');
  });

  it('WHEN onRetry called THEN retry output emits', () => {
    const { fixture } = create();
    let emitted = 0;
    fixture.componentInstance.retry.subscribe(() => {
      emitted += 1;
    });
    fixture.componentInstance.onRetry();
    expect(emitted).toBe(1);
  });

  it('WHEN reconnecting THEN pill shows reconnecting labels with retry', () => {
    const { el, fixture } = create();
    TestBed.inject(CoreStore).setConnectionStatus('reconnecting');
    settle(fixture);
    const root = pill(el);
    expect(root.getAttribute('data-status')).toBe('reconnecting');
    expect(el.textContent).toContain('Reconnecting');
    expect(el.textContent).toContain('RECONNECTING');
    expect(el.querySelector('button')?.textContent).toContain('Retry Live');
  });
});
