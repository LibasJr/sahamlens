import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimitShared } from '../rate-limiter';

const config = {
  windowMs: 60_000,
  maxPerWindow: 2,
  blockMs: 30_000,
};

describe('checkRateLimitShared degraded policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the compatibility memory fallback when Redis is not configured', async () => {
    vi.stubEnv('REDIS_URL', '');

    const result = await checkRateLimitShared(
      `test-memory-${Math.random()}`,
      Date.now(),
      config,
    );

    expect(result).toEqual(expect.objectContaining({
      allowed: true,
      backend: 'memory',
      degraded: true,
    }));
    expect(result.unavailable).toBeUndefined();
  });

  it('fails closed when a sensitive caller requires distributed enforcement', async () => {
    vi.stubEnv('REDIS_URL', '');

    const result = await checkRateLimitShared(
      `test-deny-${Math.random()}`,
      Date.now(),
      config,
      { degradedPolicy: 'deny' },
    );

    expect(result).toEqual({
      allowed: false,
      backend: 'unavailable',
      degraded: true,
      unavailable: true,
    });
  });
});
