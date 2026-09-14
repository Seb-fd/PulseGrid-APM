# Alert Engine — Functional Specification

> Feature 4: Rule Builder & Incident Alerting Engine
> Form: Reactive Forms | Eval: signal-window polling in `AlertEngineService`

## 1. Overview

Users define threshold-over-duration rules (e.g., Latency >200ms for 10s). Engine evaluates against `CoreStore` windows and raises/resolves incidents.

## 2. Functional Requirements

- FR-A1: Rule builder form fields: name, metric (`cpu/memory/latency/throughput`), operator (`> < >= <= ==`), threshold (number + unit hint), durationSec (5–300), severity (`info/warning/critical`), enabled toggle. Full Reactive Forms validation.
- FR-A2: Rule CRUD + persist to `localStorage`; enabled state hot-toggles evaluation.
- FR-A3: Evaluation: every 1s, for each enabled rule, check `chartWindow(metric, durationSec)` satisfies predicate for entire window → fire `AlertIncident(firing)`; when predicate false for `durationSec` → `resolved`.
- FR-A4: Incident list shows firing/resolved, observed value, timestamps; critical firing shows toast + banner badge.
- FR-A5: Simulator must be able to deterministically trigger a rule (e.g., latency burst 250ms/15s fires `Latency >200ms for 10s`).

## 3. BDD Acceptance Criteria

```gherkin
Scenario: Create valid rule
  GIVEN user opens Rule Builder
  WHEN they enter name "High Latency", metric latency, operator >, threshold 200, duration 10s, severity critical and Save
  THEN rule appears in list as enabled AND persists after reload

Scenario: Reject invalid rule
  GIVEN builder is open
  WHEN threshold is empty or duration <5
  THEN Save is disabled AND inline errors explain constraints

Scenario: Rule fires on sustained breach
  GIVEN rule "Latency >200ms for 10s" is enabled
  WHEN simulator emits latency 250ms for 12s
  THEN an incident with status firing appears within 2s of the 10s mark with observedValue ≥200

Scenario: No fire on transient spike
  GIVEN same rule
  WHEN latency spikes to 300ms for only 3s then recovers
  THEN no incident is created

Scenario: Resolve on recovery
  GIVEN a firing incident exists
  WHEN metric recovers below threshold for durationSec
  THEN incident transitions to resolved with resolvedAt set
```

## 4. Non-Functional

- NFR-A1: Eval loop O(rules × window) with windows ≤300 points; 50 rules <10ms per tick.
- NFR-A2: No duplicate firing per continuous breach (single incident until resolved).

## 5. Out of Scope

- Notifications (Slack/PagerDuty/webhook) — UI toast + list only.
- Alert silencing / maintenance windows — Phase 2.
