import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiErrorMessage, apiRequest, apiSupportReference } from '../api-client';

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns parsed JSON for successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(apiRequest<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true });
  });

  it('maps typed API errors with request id and retry-after', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Pelan-pelan', code: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-123', 'Retry-After': '17' },
    })));

    try {
      await apiRequest('/api/test');
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', category: 'THROTTLE', requestId: 'req-123', retryAfterSec: 17 });
    }
  });

  it('falls back to status taxonomy for legacy responses without code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Harus login' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(apiRequest('/api/test')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', category: 'AUTH' });
  });

  it('formats a support reference from request id without changing the typed error', () => {
    const error = new ApiClientError({
      message: 'Data provider sedang bermasalah',
      status: 503,
      code: 'PROVIDER_UNAVAILABLE',
      requestId: 'req-support-42',
    });

    expect(apiSupportReference(error)).toBe('ID request: req-support-42');
    expect(apiErrorMessage(error, 'fallback', true)).toBe(
      'Data provider sedang bermasalah (ID request: req-support-42)',
    );
  });

});
