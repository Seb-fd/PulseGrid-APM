/**
 * Wikimedia EventStreams → domain adapter (pure, fully tested).
 * Delta 008: replaces Binance as the default live source (constitution §6
 * amendment note in changes/008-live-wikimedia-telemetry/proposal.md §2).
 *
 * Live values are DERIVED from the public Wikipedia recentchange stream, not
 * real infrastructure probes — except where noted, UI must label them as such:
 * - throughput is REAL (edits/sec counted from 1s batches),
 * - latency is REAL event-time lag (`now − event timestamp`),
 * - cpu/memory are SYNTHETIC load indicators derived from throughput intensity.
 */
import type { LogEntry } from '../models/log-entry.model';
import { METRIC_UNITS } from '../models/telemetry-metric.model';
import type { TelemetryMetric } from '../models/telemetry-metric.model';

/** Default live WebSocket URL (primary transport). */
export const WIKIMEDIA_RECENTCHANGE_URL = 'wss://stream.wikimedia.org/v2/stream/recentchange';

/** SSE fallback URL (official EventStreams transport). */
export const WIKIMEDIA_SSE_URL = 'https://stream.wikimedia.org/v2/stream/recentchange';

/** Max log rows produced per 1s batch (protects the MAX_LOGS ring + VirtualScroll). */
export const WIKIMEDIA_LOGS_PER_BATCH = 25;

/** Baseline latency shown for quiet windows with no measurable lag. */
export const WIKIMEDIA_QUIET_LATENCY_MS = 35;

/** Length delta below which an edit reads as a revert/blanking (→ 403). */
export const WIKIMEDIA_REVERT_DELTA = -500;

/**
 * Minimal subset of the EventStreams `recentchange` schema we consume.
 * Full schema: https://stream.wikimedia.org/v2/stream/recentchange
 */
export interface WikimediaRecentChange {
  /** Wiki id, e.g. 'enwiki'. */
  wiki: string;
  /** Page title, e.g. 'Albert Einstein'. */
  title: string;
  /** 'edit' | 'new' | 'log' | 'categorize'. */
  type: string;
  /** Editing user name. */
  user: string;
  bot: boolean;
  minor: boolean;
  /** Unix epoch seconds (payload `timestamp`). NaN when absent/unparseable. */
  timestamp: number;
  /** ISO instant (payload `meta.dt`), '' when absent. */
  eventDt: string;
  comment: string;
  serverName: string;
  lengthOld: number | null;
  lengthNew: number | null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function epochSec(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function lengthValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Narrow an `unknown` WS/SSE payload into a `WikimediaRecentChange`.
 * Never throws; returns `null` for malformed events (callers drop them —
 * a single bad event must never kill the stream).
 */
export function normalizeRecentChange(value: unknown): WikimediaRecentChange | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const meta = v['meta'];
  const metaRec: Record<string, unknown> =
    typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : {};
  const length = v['length'];
  const lengthRec: Record<string, unknown> =
    typeof length === 'object' && length !== null ? (length as Record<string, unknown>) : {};
  const title = str(v['title'], 'Unknown');
  // A payload with no recognisable recentchange fields is not an event.
  if (
    v['wiki'] === undefined &&
    v['title'] === undefined &&
    v['type'] === undefined &&
    v['user'] === undefined &&
    metaRec['dt'] === undefined &&
    v['timestamp'] === undefined
  ) {
    return null;
  }
  return {
    wiki: str(v['wiki'], 'wikimedia'),
    title,
    type: str(v['type'], 'edit'),
    user: str(v['user'], 'anonymous'),
    bot: bool(v['bot']),
    minor: bool(v['minor']),
    timestamp: epochSec(v['timestamp']),
    eventDt: str(metaRec['dt'], ''),
    comment: str(v['comment'], str(v['parsedcomment'], '')),
    serverName: str(v['server_name'], str(v['server_url'], '')),
    lengthOld: lengthValue(lengthRec['old']),
    lengthNew: lengthValue(lengthRec['new']),
  };
}

/**
 * Map a 1s batch of recentchange events to the four domain metrics.
 * Deterministic: same batch+now → same output (no Math.random).
 *
 * - throughput: REAL edits/sec (batch length; the service buffers 1s windows).
 * - latency: REAL mean event-time lag `now − timestamp` (browsers expose no
 *   WebSocket ping/pong, so per-event arrival lag is the honest RTT proxy).
 * - cpu/memory: SYNTHETIC load indicators derived from throughput intensity.
 */
export function adaptWikimediaToMetrics(
  events: readonly WikimediaRecentChange[],
  now: number,
): TelemetryMetric[] {
  const rps = events.length;
  let lagSum = 0;
  let lagCount = 0;
  for (const e of events) {
    if (!Number.isFinite(e.timestamp)) continue;
    const lag = now - e.timestamp * 1000;
    if (Number.isFinite(lag) && lag >= 0) {
      lagSum += lag;
      lagCount += 1;
    }
  }
  const avgLag = lagCount > 0 ? lagSum / lagCount : WIKIMEDIA_QUIET_LATENCY_MS;
  const latency = clamp(avgLag, 5, 2000);
  const throughput = clamp(rps, 0, 8000);
  const cpu = clamp(12 + rps * 5 + Math.min(avgLag / 100, 8), 2, 98);
  const memory = clamp(52 + rps * 0.8, 10, 96);

  const mk = (kind: TelemetryMetric['kind'], value: number, idx: number): TelemetryMetric => ({
    id: `${kind}:wikimedia:${String(now)}:${String(idx)}`,
    kind,
    value: Math.round(value * 100) / 100,
    unit: METRIC_UNITS[kind],
    timestamp: now,
    source: 'live',
  });

  return [
    mk('cpu', cpu, 0),
    mk('memory', memory, 1),
    mk('latency', latency, 2),
    mk('throughput', throughput, 3),
  ];
}

/** Encode a page title into a `/wiki/...` path segment (deterministic). */
export function wikiPath(title: string): string {
  return `/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/**
 * Map a 1s batch of recentchange events to HTTP-style log entries.
 * Standard edits → `GET /wiki/{Title} 200` (INFO); bot edits → `429` (WARN);
 * log/categorize actions and reverts/blankings → `403` (WARN). Statuses parse
 * with the existing display-only `parseHttpMethod`/`parseHttpStatus` helpers.
 */
export function adaptWikimediaToLogs(
  events: readonly WikimediaRecentChange[],
  now: number,
): LogEntry[] {
  const out: LogEntry[] = [];
  const capped = events.slice(0, WIKIMEDIA_LOGS_PER_BATCH);
  for (const [i, e] of capped.entries()) {
    const path = wikiPath(e.title);
    let status = 200;
    let level: LogEntry['level'] = 'INFO';
    const delta = e.lengthOld !== null && e.lengthNew !== null ? e.lengthNew - e.lengthOld : null;
    if (e.bot) {
      status = 429;
      level = 'WARN';
    } else if (e.type === 'log' || e.type === 'categorize') {
      status = 403;
      level = 'WARN';
    } else if (delta !== null && delta < WIKIMEDIA_REVERT_DELTA) {
      status = 403;
      level = 'WARN';
    }
    const actor = e.bot ? `${e.user} (bot)` : e.user;
    out.push({
      id: `${String(now)}:live:${e.wiki}:${String(i)}`,
      level,
      message: `GET ${path} ${String(status)} — ${e.wiki} ${e.type} by ${actor}`,
      timestamp: now,
      serviceId: e.wiki,
      traceId: `live-${String(now)}-${String(i)}`,
    });
  }
  return out;
}
