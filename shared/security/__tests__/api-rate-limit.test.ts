import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAiAccountBudget, rateLimitResult } from '../api-rate-limit';
import {
  currentRequestLogContext,
  runWithRequestObservability,
} from '@/shared/observability/request-context';

describe('sensitive API rate-limit degraded behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed for AI account budgets in production when Redis is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REDIS_URL', '');

    const result = await checkAiAccountBudget(`user-${Math.random()}`, 'test-ai');

    expect(result).toEqual(expect.objectContaining({
      allowed: false,
      backend: 'unavailable',
      degraded: true,
      unavailable: true,
    }));
  });

  it('keeps memory fallback outside production for local development and tests', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REDIS_URL', '');

    const result = await checkAiAccountBudget(`user-${Math.random()}`, 'test-ai');

    expect(result).toEqual(expect.objectContaining({
      allowed: true,
      backend: 'memory',
      degraded: true,
    }));
  });

  it('records the low-cardinality degraded mode without account identifiers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REDIS_URL', '');
    const userId = `private-user-${Math.random()}`;

    await runWithRequestObservability({ requestId: 'req-rate-limit' }, async () => {
      await checkAiAccountBudget(userId, 'lens-ai');
      const context = currentRequestLogContext();

      expect(context).toEqual(expect.objectContaining({
        degraded: true,
        degradedReason: ['rate-limit-backend-unavailable'],
      }));
      expect(JSON.stringify(context)).not.toContain(userId);
    });
  });

  it('maps limiter unavailability to service unavailable instead of quota exceeded', () => {
    expect(rateLimitResult({ unavailable: true })).toEqual({
      status: 503,
      body: { error: 'Layanan pembatas penggunaan sementara tidak tersedia. Coba lagi nanti.' },
      headers: { 'Retry-After': '30' },
    });
  });

  it('preserves normal 429 quota behavior', () => {
    expect(rateLimitResult({ retryAfterSec: 12 }, 'quota')).toEqual({
      status: 429,
      body: { error: 'quota' },
      headers: { 'Retry-After': '12' },
    });
  });
});
