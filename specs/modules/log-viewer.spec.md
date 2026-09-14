# Log Stream Viewer — Functional Specification

> Feature 2: High-Performance Console
> Engine: `@angular/cdk/scrolling` VirtualScroll + `computed()` filters | Cap 5000 entries

## 1. Overview

Real-time `INFO/WARN/ERROR` feed correlated with telemetry faults. Must handle 10k+ rows over session without DOM overhead.

## 2. Functional Requirements

- FR-L1: Append logs at up to ~20/s sustained without jank; auto-scroll (tail) by default with Pause/Resume toggle.
- FR-L2: Filters: text query (message/serviceId/traceId), level multi-select (`INFO/WARN/ERROR`), service selector — ALL derived via `computed()` from `logs` signal + filter signals. No manual subscribe.
- FR-L3: Virtual scrolling via `cdk-virtual-scroll-viewport` (`itemSize ~28px`), max ~30 DOM rows mounted.
- FR-L4: Row shows timestamp, level badge (color-coded), service, message, traceId (copy on click).
- FR-L5: Pause freezes viewport (buffer continues, capped); Resume jumps to tail. Clear button empties view (store keeps last 5000).
- FR-L6: Correlated fault logs: simulator CPU spike → WARN, outage/500 → ERROR with matching `traceId`.

## 3. BDD Acceptance Criteria

```gherkin
Scenario: Filter by level using computed signals
  GIVEN 1000 logs (600 INFO, 300 WARN, 100 ERROR) are in store
  WHEN user toggles level filter to ERROR only
  THEN viewport shows only ERROR rows within 100ms AND no extra WS traffic occurs

Scenario: Text search narrows results
  GIVEN logs contain serviceId "payments-api"
  WHEN user types "payments-api" in search
  THEN computed filteredLogs contains only matching rows AND count badge updates reactively

Scenario: Virtual scroll bounds DOM
  GIVEN 5000 logs buffered
  WHEN user scrolls to middle
  THEN mounted DOM rows are <50 AND scroll remains at 60fps

Scenario: Pause and resume tail
  GIVEN live logs are streaming
  WHEN user clicks Pause THEN Resume after 5s
  THEN no rows were lost (buffer grew) AND on Resume viewport jumps to newest

Scenario: Correlated error on outage
  GIVEN simulator triggers node outage
  WHEN outage starts
  THEN an ERROR log with serviceId of down node appears within 1s
```

## 4. Non-Functional

- NFR-L1: Filter recompute <50ms for 5000 rows (memoized `computed`, no regex DoS — escape input).
- NFR-L2: A11y: `role=log aria-live=off` (avoid SR spam), keyboard scrollable viewport.

## 5. Out of Scope

- Full-text indexing / server-side search — client filter only in Phase 1.
- Log export (CSV) — Phase 2.
