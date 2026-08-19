import { describe, expect, it } from 'vitest';
import { runCronRoute } from '../cron-route.adapter';

describe('runCronRoute', () => {
  it('preserves cron response status/body/headers and adds request id', async () => {
    const request = new Request('http://localhost/api/cron/example', {
      headers: { authorization: 'Bearer scheduler-token' },
    });
    const response = await runCronRoute(request, async () => new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }));

    expect(response.status).toBe(202);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
