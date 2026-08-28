import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeComputeBudget } from '../compute-budget';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('compute budget', () => {
  it('accounts weighted cost rather than request count', async () => {
    const actor = `test:${Date.now()}:${Math.random()}`;
    const first = await consumeComputeBudget(actor, 10, 'public', 1_000_000);
    const second = await consumeComputeBudget(actor, 5, 'public', 1_000_001);
    expect(first.used).toBe(10);
    expect(second.used).toBe(15);
    expect(second.allowed).toBe(true);
  });

  it('fails closed for resource budget after the public allowance is consumed', async () => {
    const actor = `test:${Date.now()}:${Math.random()}`;
    await consumeComputeBudget(actor, 25, 'public', 2_000_000);
    const result = await consumeComputeBudget(actor, 20, 'public', 2_000_001);
    expect(result.allowed).toBe(false);
  expect(result.remaining).toBe(0);
});

it('production menolak komputasi mahal saat Redis tidak tersedia', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('REDIS_URL', '');

  const result = await consumeComputeBudget('guest-security-test', 10, 'public', 3_000_000);

  expect(result).toEqual(expect.objectContaining({
    allowed: false,
    unavailable: true,
  }));
});
});
