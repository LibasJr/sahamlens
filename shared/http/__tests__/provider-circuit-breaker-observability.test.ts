import { afterEach, describe, expect, it } from 'vitest';
import {
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
} from '../provider-circuit-breaker';
import {
  currentRequestLogContext,
  runWithRequestObservability,
} from '@/shared/observability/request-context';

const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalRedisUrl == null) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
});

describe('provider circuit observability', () => {
  it('records failures, open circuits, and recovery in the request context', async () => {
    delete process.env.REDIS_URL;
    const provider = `TEST_PROVIDER_${Date.now()}`;

    const context = await runWithRequestObservability({ requestId: 'req-provider' }, async () => {
      await recordProviderFailure(provider, { immediateOpen: true });
      expect(await isProviderCircuitOpen(provider)).toBe(true);
      await recordProviderSuccess(provider);
      return currentRequestLogContext();
    });

    expect(context).toEqual(expect.objectContaining({
      provider: [
        `${provider}:failure`,
        `${provider}:circuit-open`,
        `${provider}:success`,
      ],
    }));
  });
});
