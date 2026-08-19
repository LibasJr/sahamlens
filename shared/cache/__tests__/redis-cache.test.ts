import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOrCompute } from '../redis-cache';

const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
});

describe('getOrCompute local single-flight', () => {
  it('menjalankan compute sekali untuk request paralel pada key yang sama tanpa Redis', async () => {
    delete process.env.REDIS_URL;
    const compute = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { value: 42 };
    });

    const [a, b, c] = await Promise.all([
      getOrCompute('test:single-flight', 60, compute),
      getOrCompute('test:single-flight', 60, compute),
      getOrCompute('test:single-flight', 60, compute),
    ]);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ value: 42 });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
