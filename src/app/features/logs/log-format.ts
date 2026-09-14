/**
 * log-format — display-only HTTP parsing for log rows (delta 001-ux-legibility).
 * Frozen `LogEntry` is NOT modified; these are pure views over `message`.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type StatusTone = 'ok' | 'warn' | 'err';

const METHOD_RE = /\b(GET|POST|PUT|DELETE|PATCH)\b/;
const STATUS_RE = /\b([1-5]\d\d)\b(?![\ds])/;

/** First uppercase HTTP method token, or null. */
export function parseHttpMethod(message: string): HttpMethod | null {
  const m = METHOD_RE.exec(message);
  if (m === null) return null;
  const token = m[1];
  if (
    token === 'GET' ||
    token === 'POST' ||
    token === 'PUT' ||
    token === 'DELETE' ||
    token === 'PATCH'
  ) {
    return token;
  }
  return null;
}

/**
 * First standalone 3-digit status code, or null.
 * The `(?![\ds])` guard rejects `500s`-style durations so
 * `"(500s surging)"` does not false-positive as a 500 badge.
 */
export function parseHttpStatus(message: string): number | null {
  const m = STATUS_RE.exec(message);
  if (m === null) return null;
  const raw = m[1];
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Tone map: 2xx ok (green), 4xx warn (amber), 500+ err (red); 1xx/3xx → ok. */
export function statusTone(status: number): StatusTone {
  if (status >= 400 && status <= 499) return 'warn';
  if (status >= 500) return 'err';
  return 'ok';
}
