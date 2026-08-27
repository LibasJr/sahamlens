import { describe, expect, it, vi } from 'vitest';
import { runController } from '../next-response.adapter';
import { logger } from '@/shared/logger/logger';

describe('runController raw Response support', () => {
  it('preserves streaming/raw body and adds X-Request-Id', async () => {
    const raw = new Response('chunk-1\nchunk-2\n', {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
    const response = await runController(async () => raw, new Request('http://localhost/api/chat'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson');
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    expect(await response.text()).toBe('chunk-1\nchunk-2\n');
  });

  it('still injects request id into JSON object bodies', async () => {
    const response = await runController(async () => ({ status: 200, body: { ok: true } }));
    const json = await response.json();
    expect(json).toEqual(expect.objectContaining({ ok: true, meta: expect.objectContaining({ requestId: expect.any(String) }) }));
  });

  it('mencatat completion terstruktur dengan requestId, latency, status, dan metadata riset', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const response = await runController(async () => ({
      status: 200,
      body: {
        ok: true,
        meta: {
          source: 'YAHOO_CHART',
          dataAsOf: '2026-08-27T09:00:00.000Z',
          modelVersion: 'lens-score-v1.5.0',
        },
      },
    }), new Request('http://localhost/api/stock/BBCA.JK'));

    expect(info).toHaveBeenCalledWith('HTTP request completed', expect.objectContaining({
      requestId: response.headers.get('X-Request-Id'),
      route: '/api/stock/BBCA.JK',
      method: 'GET',
      userClass: 'unknown',
      statusCode: 200,
      durationMs: expect.any(Number),
      source: 'YAHOO_CHART',
      dataAsOf: '2026-08-27T09:00:00.000Z',
      modelVersion: 'lens-score-v1.5.0',
    }));
    info.mockRestore();
  });
});
