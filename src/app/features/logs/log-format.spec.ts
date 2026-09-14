import { describe, expect, it } from 'vitest';
import { parseHttpMethod, parseHttpStatus, statusTone } from './log-format';

describe('GIVEN log HTTP parsers (display-only)', () => {
  it('WHEN message embeds method THEN first uppercase token wins', () => {
    expect(parseHttpMethod('GET /api/ledger 500')).toBe('GET');
    expect(parseHttpMethod('CPU spike 95% on cluster — POST /api/ledger/scale 429')).toBe('POST');
    expect(parseHttpMethod('Node outage: ledger throughput 0')).toBeNull();
    expect(parseHttpMethod('get /api lower is ignored')).toBeNull();
  });

  it('WHEN message embeds status THEN standalone code parses but 500s does not', () => {
    expect(parseHttpStatus('GET /api/ledger 500 (sim-1)')).toBe(500);
    expect(parseHttpStatus('High latency 250ms on auth — GET /api/auth 200 250ms')).toBe(200);
    expect(parseHttpStatus('Node outage: ledger throughput 0 (500s surging)')).toBeNull();
    expect(parseHttpStatus('no code here')).toBeNull();
  });

  it('THEN statusTone maps 2xx/4xx/5xx to ok/warn/err', () => {
    expect(statusTone(200)).toBe('ok');
    expect(statusTone(201)).toBe('ok');
    expect(statusTone(429)).toBe('warn');
    expect(statusTone(404)).toBe('warn');
    expect(statusTone(500)).toBe('err');
    expect(statusTone(503)).toBe('err');
  });
});
