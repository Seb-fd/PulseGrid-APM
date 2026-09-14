---
name: create-canvas-directive
description: Wrap high-frequency Canvas charts (uPlot) outside Angular change detection for PulseGrid APM. Use when building metric-chart directives, 60 FPS telemetry visualizers, rAF batching loops, auditTime/sampleTime stream-to-canvas bridges, or fixing chart jank.
---

# Create Canvas Directive (PulseGrid APM, uPlot + rAF)

Charts render at up to 60 FPS from streams emitting far faster than the UI can paint. The directive is the ONLY place allowed to batch frames imperatively.

## Contract

- Input: `Signal<readonly TelemetryMetric[]>` window (from `CoreStore.selectWindow(kind, n)`) or an `Observable` already capped by `auditTime(16)` / `sampleTime(100)` upstream.
- Rendering runs OUTSIDE Angular change detection; signals notify only on committed frames.
- Library: **uPlot** (locked decision, ~40 kB). Do not introduce ECharts/lightweight-charts without a `changes/` amendment + bundle-budget proof (`ng build` transfer size must stay <250 kB total).

## Directive shape

```ts
import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import uPlot from 'uplot';
import type { TelemetryMetric } from '../../core/models/telemetry-metric.model';

@Directive({ selector: '[appMetricChart]', standalone: true })
export class MetricChartDirective implements OnDestroy {
  readonly data = input.required<readonly TelemetryMetric[]>();
  private chart: uPlot | null = null;
  private raf = 0;
  private pending: readonly TelemetryMetric[] | null = null;

  constructor() {
    // Coalesce signal notifications into one paint per frame.
    effect(() => {
      this.pending = this.data();
      if (!this.raf) this.raf = requestAnimationFrame(() => this.paint());
    });
  }

  private paint(): void {
    this.raf = 0;
    const batch = this.pending;
    this.pending = null;
    if (!batch || batch.length === 0) return;
    const xs = batch.map((m) => m.timestamp / 1000);
    const ys = batch.map((m) => m.value);
    if (!this.chart)
      this.chart = new uPlot(optsFor(batch[0]?.unit), [xs, ys], this.el.nativeElement);
    else this.chart.setData([xs, ys]);
  }

  ngOnDestroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.chart?.destroy();
    this.chart = null;
  }
}
```

## Rules

1. NEVER `setData`/mutate the chart directly from a subscription callback — always via the rAF-coalesced `effect`.
2. `RingBuffer.toArray()` / `last(n)` snapshots feed the directive; never hand it a live-growing array.
3. Handle resize via `ResizeObserver` → `chart.setSize()`; destroy observer in `ngOnDestroy`.
4. Dark-theme uPlot opts (grid/stroke colors for `bg-slate-950`); axes labeled with metric `unit`.
5. Empty input renders an empty plot + "awaiting stream" caption — never throw.
6. Unit-test with fake uPlot (mock `uplot` module). Test-host state MUST be signals
   (plain-field mutation between `detectChanges()` throws NG0100 in zoneless
   TestBed — see `src/test-helpers.ts`). Assert behaviorally: latest batch painted
   (last-write-wins makes raw paint counts unobservable by design), `setData` on
   updates, cancel-then-flush paints nothing, empty-data no-op. rAF stubs must
   model cancellation (cancelled ids never fire) because Angular's own zoneless
   scheduler shares the global rAF.
