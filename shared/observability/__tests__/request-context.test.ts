import { describe, expect, it } from 'vitest';
import {
  currentRequestLogContext,
  recordCacheState,
  recordDegradedMode,
  recordProviderOutcome,
  runWithRequestObservability,
  setRequestUserClass,
} from '../request-context';

describe('request observability context', () => {
  it('menggabungkan request, user class, cache, provider, dan degraded tanpa PII', async () => {
    const context = await runWithRequestObservability({
      requestId: 'req-123',
      route: '/api/stock/BBCA.JK',
      method: 'GET',
    }, async () => {
      setRequestUserClass('pro');
      recordCacheState('redis-miss');
      recordProviderOutcome('YAHOO_CHART', 'success');
      recordDegradedMode('stale-fallback');
      await Promise.resolve();
      return currentRequestLogContext();
    });

    expect(context).toEqual({
      requestId: 'req-123',
      route: '/api/stock/BBCA.JK',
      method: 'GET',
      userClass: 'pro',
      cacheState: ['redis-miss'],
      provider: ['YAHOO_CHART:success'],
      degraded: true,
      degradedReason: ['stale-fallback'],
    });
    expect(context).not.toHaveProperty('userId');
    expect(context).not.toHaveProperty('cookie');
  });

  it('mengisolasi request paralel', async () => {
    const [first, second] = await Promise.all([
      runWithRequestObservability({ requestId: 'first' }, async () => {
        recordCacheState('redis-hit');
        await new Promise((resolve) => setTimeout(resolve, 5));
        return currentRequestLogContext();
      }),
      runWithRequestObservability({ requestId: 'second' }, async () => {
        recordCacheState('memory-miss', 'redis-not-configured');
        return currentRequestLogContext();
      }),
    ]);

    expect(first).toMatchObject({ requestId: 'first', cacheState: ['redis-hit'], degraded: false });
    expect(second).toMatchObject({ requestId: 'second', cacheState: ['memory-miss'], degraded: true });
  });
});
