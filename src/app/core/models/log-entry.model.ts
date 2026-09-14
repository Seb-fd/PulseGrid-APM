/**
 * LogEntry — single console row.
 * Frozen contract: changes/001-initial-architecture/design.md §2
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  /** `${timestamp}:${seq}:${serviceId}` */
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  serviceId: string;
  traceId?: string;
}

export interface LogFilter {
  /** Substring over message|serviceId|traceId, case-insensitive */
  query: string;
  /** Empty set = all levels */
  levels: Set<LogLevel>;
  /** Service id, or 'all' for every service */
  serviceId: string;
}

export const EMPTY_LOG_FILTER: LogFilter = {
  query: '',
  levels: new Set(),
  serviceId: 'all',
};

export function matchesLogFilter(entry: LogEntry, filter: LogFilter): boolean {
  if (filter.levels.size > 0 && !filter.levels.has(entry.level)) return false;
  if (filter.serviceId !== 'all' && entry.serviceId !== filter.serviceId) return false;
  const q = filter.query.trim().toLowerCase();
  if (q.length === 0) return true;
  return (
    entry.message.toLowerCase().includes(q) ||
    entry.serviceId.toLowerCase().includes(q) ||
    (entry.traceId ?? '').toLowerCase().includes(q)
  );
}
