// PulseGrid zoneless Vitest setup.
// Constitution §1: zone.js is FORBIDDEN — do NOT import it here.
//
// 1. Angular TestBed is initialized WITHOUT zones via platform-browser/testing
//    (AOT testing platform; zone-agnostic). Component specs add
//    `provideZonelessChangeDetection()` per TestBed module.
// 2. jsdom gaps required by @angular/cdk are stubbed below.
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

(globalThis as unknown as { __pgSetupRan?: boolean }).__pgSetupRan = true;

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
