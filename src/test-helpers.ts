// Shared Vitest bootstrap for component specs (zoneless).
// NOTE: `test.setupFiles` does not execute in this workspace's Vitest runner
// (verified by probe 2026-09-13), so specs import this module for its
// side-effect instead. Keep `setupFiles: ['src/test-setup.ts']` as well —
// this helper tolerates double initialization either way.
//
// HARNESS RULE (zoneless TestBed, verified 2026-09-13): fixture.detectChanges()
// runs ApplicationRef.tick(), which honors view dirtiness. Mutating a PLAIN
// host field does not mark the view dirty, so the update pass skips it while
// the dev check pass still evaluates → NG0100. Therefore TEST HOST STATE MUST
// BE SIGNALS (mutate via .set()). Component internals already are.
//
// Constitution §1: no `zone.js` imports here or in any spec.
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll } from 'vitest';

let environmentReady = false;

/** Idempotent TestBed platform init (zone-free, AOT testing platform). */
export function ensureTestEnvironment(): void {
  if (environmentReady) return;
  try {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (err) {
    // `setupFiles` may have beaten us to it in other runners — that is fine.
    // Vitest 3 threw "...already initialized twice"; Angular 22 throws
    // "Cannot set base providers because it has already been called".
    if (
      !(err instanceof Error) ||
      (!err.message.includes('twice') && !err.message.includes('already been called'))
    )
      throw err;
  } finally {
    environmentReady = true;
  }
}

if (typeof window.matchMedia !== 'function') {
  const stub = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      dispatchEvent: (): boolean => false,
    }) as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: stub });
}

if (typeof window.IntersectionObserver !== 'function') {
  // @defer (on viewport) blocks stay placeholders in jsdom — that is fine;
  // the stub only prevents ReferenceErrors during component creation.
  class IntersectionObserverStub implements IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe(): void {
      // No-op in jsdom.
    }
    unobserve(): void {
      // No-op in jsdom.
    }
    disconnect(): void {
      // No-op in jsdom.
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserverStub,
  });
}

ensureTestEnvironment();

// Single-fork workers share one process across spec files: tear down the
// platform after each file so the next file can initialize its own (NG0400).
afterAll(() => {
  TestBed.resetTestingModule();
  getTestBed().platform.destroy();
  environmentReady = false;
});
