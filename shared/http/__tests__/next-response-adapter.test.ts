import { describe, expect, it } from 'vitest';
import { runController } from '../next-response.adapter';

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
});
