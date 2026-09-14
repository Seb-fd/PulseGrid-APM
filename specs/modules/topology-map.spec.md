# Topology Map — Functional Specification

> Feature 3: Interactive Microservice Topology Map
> View: SVG + `@defer(on viewport)` | State: `computed()` health derived from live metrics

## 1. Overview

Node graph of microservices (`api-gateway → auth, payments-api, ledger, search, notifications → postgres, redis, kafka`). Node color reflects live health.

## 2. Functional Requirements

- FR-P1: Render 8–12 default nodes with static layout positions + dependency edges (SVG lines/arrows).
- FR-P2: Health derivation: `healthy` (green) / `degraded` (amber) / `down` (red) computed from latest `TelemetryMetric` per `serviceId` + simulator outage events. Update ≤1s latency.
- FR-P3: Interaction: click node → side detail (metrics spark, recent logs for serviceId, dependencies); hover tooltip (name, health, latency).
- FR-P4: Lazy load via `@defer (on viewport; prefetch on idle)` with placeholder skeleton.
- FR-P5: Animate health transitions (CSS, no JS per-frame loop); pulse `down` nodes.
- FR-P6: Simulator outage sets target node `down` + greys incident edges.

## 3. BDD Acceptance Criteria

```gherkin
Scenario: Health reacts to stream
  GIVEN payments-api latency >200ms for 5s in CoreStore
  WHEN health computed re-evaluates
  THEN payments-api node turns amber within 1s AND detail panel shows latency value

Scenario: Outage isolates node
  GIVEN simulator fires outage on "ledger"
  WHEN outage is active
  THEN ledger node is red with pulse AND incoming edges dim AND ERROR log is linked

Scenario: Node selection shows context
  GIVEN topology is rendered
  WHEN user clicks "auth" node
  THEN detail panel opens with auth metrics + last 20 logs filtered by serviceId=auth

Scenario: Deferred loading
  GIVEN topology is below fold
  WHEN page loads
  THEN topology bundle is not fetched until viewport near AND placeholder is shown
```

## 4. Non-Functional

- NFR-P1: SVG node count ≤50 without perf work; beyond that requires canvas migration (out of scope).
- NFR-P2: Keyboard navigable nodes (`tabindex`, Enter to select).

## 5. Out of Scope

- Auto-layout / force graph — fixed curated positions Phase 1.
- Real K8s discovery — static seed + sim-driven health.
