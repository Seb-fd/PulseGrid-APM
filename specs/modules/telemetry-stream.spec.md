# Telemetry Stream — Functional Specification

> Feature 1: System Health & Telemetry Stream (60 FPS Visualizer)
> Sources: Wikimedia EventStreams `recentchange` → adapter + Stochastic Sim | State: Signals CoreStore | View: Zoneless Canvas

## 1. Overview

Real-time charts for CPU (%), Memory (%), Latency (ms), Throughput (RPS) aggregated from hybrid ingestion. Must sustain 60 FPS visual updates without zoneless CD thrash.

## 2. Functional Requirements

- FR-T1: Display 4 live charts (CPU, Memory, Latency, Throughput) with last N seconds window (default 30s, selectable 10s/30s/60s).
- FR-T2: Ingest Wikimedia EventStreams `recentchange` events (WebSocket primary,
  SSE fallback), adapt to `TelemetryMetric[]` (real edits/sec throughput, real
  event-time-lag latency, synthetic cpu/memory load); sample to ≤10 Hz UI-safe rate.
- FR-T3: Support simulated fault injection (CPU spike to 95%, memory leak ramp, latency burst >200ms, throughput drop).
- FR-T4: Show connection status banner (`Live Status: Connected to Wikimedia Global
Event Stream` / `SIMULATED` amber / `RECONNECTING` red pulsing) + "Retry Live" action.
- FR-T5: Charts MUST render via Canvas directive with `requestAnimationFrame` batching; footnote `Values derived from Wikimedia Global Event Stream + simulator`.
- FR-T6: Persist selected time window in `linkedSignal` + `localStorage`.

## 3. BDD Acceptance Criteria

```gherkin
Scenario: Live stream renders within budget
  GIVEN ingestion is LIVE and browser is at 60Hz
  WHEN 30s window is selected
  THEN all 4 charts update at least every 200ms AND frame drops do not block input AND no Zone.js tick occurs

Scenario: Backpressure protects UI
  GIVEN Wikimedia bursts at high edit rates
  WHEN sampleTime(100ms) is applied
  THEN CoreStore receives ≤10 updates/s AND RingBuffer caps at 300 points per metric

Scenario: Disconnect falls back to simulator
  GIVEN WS closes unexpectedly
  WHEN watchdog detects 10s silence or close event
  THEN status becomes RECONNECTING then SIMULATED AND banner appears within 1s AND charts continue from sim stream

Scenario: Manual retry
  GIVEN status is SIMULATED after failure
  WHEN user clicks "Retry Live"
  THEN ingestion attempts reconnect with backoff AND on success status returns to LIVE

Scenario: Fault injection visible
  GIVEN simulator CPU-spike scenario is armed
  WHEN spike fires for 10s
  THEN CPU chart exceeds 90% AND correlated WARN log appears in Log Viewer
```

## 4. Non-Functional

- NFR-T1: Initial chart paint <500ms after data; interaction (hover/tooltip) <50ms.
- NFR-T2: Memory bounded: ≤300 points/series, GC-friendly ring buffer.
- NFR-T3: Unit coverage of adapter + ring-buffer 100%; ingestion service ≥85%.

## 5. Out of Scope

- Real infra scraping (Prometheus/OTel) — Phase 2.
- Historical persistence / backend — in-memory only.
