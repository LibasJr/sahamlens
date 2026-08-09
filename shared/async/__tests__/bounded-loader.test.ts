import { describe, expect, it } from 'vitest';
import { createBoundedLoader } from '../bounded-loader';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createBoundedLoader', () => {
  it('enforces concurrency ceiling', async () => {
    let active = 0;
    let peak = 0;

    const loader = createBoundedLoader(
      async (key: number) => {
        active++;
        peak = Math.max(peak, active);
        await sleep(10);
        active--;
        return key * 2;
      },
      String,
      { concurrency: 3, ttlMs: 0, timeoutMs: 1000 },
    );

    const values = await Promise.all(Array.from({ length: 12 }, (_, i) => loader.get(i)));
    expect(values).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('deduplicates identical in-flight keys', async () => {
    let calls = 0;
    const loader = createBoundedLoader(
      async (key: string) => {
        calls++;
        await sleep(10);
        return key.toUpperCase();
      },
      (key) => key,
      { concurrency: 2, ttlMs: 0, timeoutMs: 1000 },
    );

    const [a, b, c] = await Promise.all([
      loader.get('bbca'),
      loader.get('bbca'),
      loader.get('bbca'),
    ]);

    expect([a, b, c]).toEqual(['BBCA', 'BBCA', 'BBCA']);
    expect(calls).toBe(1);
  });

  it('does not cache rejected requests', async () => {
    let calls = 0;
    const loader = createBoundedLoader(
      async (key: string) => {
        calls++;
        if (calls === 1) throw new Error('temporary');
        return key;
      },
      (key) => key,
      { concurrency: 1, ttlMs: 10_000, timeoutMs: 1000 },
    );

    await expect(loader.get('A')).rejects.toThrow('temporary');
    await expect(loader.get('A')).resolves.toBe('A');
    await expect(loader.get('A')).resolves.toBe('A');
    expect(calls).toBe(2);
  });

  it('does not cache sentinel failure values rejected by shouldCache', async () => {
    let calls = 0;
    const loader = createBoundedLoader(
      async () => {
        calls++;
        return calls === 1 ? null : 'ok';
      },
      () => 'same',
      {
        concurrency: 1,
        ttlMs: 10_000,
        timeoutMs: 1000,
        shouldCache: (value) => value !== null,
      },
    );

    await expect(loader.get('A')).resolves.toBeNull();
    await expect(loader.get('A')).resolves.toBe('ok');
    await expect(loader.get('A')).resolves.toBe('ok');
    expect(calls).toBe(2);
  });
});
