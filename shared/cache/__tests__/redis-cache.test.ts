import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOrCompute } from '../redis-cache';
import {
  currentRequestLogContext,
  runWithRequestObservability,
} from '@/shared/observability/request-context';

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

/**
 * Single-flight di atas hanya menyatukan request yang TUMPANG TINDIH. Request yang datang
 * berurutan tidak tertolong olehnya, dan tanpa Redis dulu tidak ada apa pun yang menyimpan
 * hasilnya - jadi "Redis belum dipasang" sama dengan "aplikasi ini tanpa cache sama sekali".
 *
 * Terukur 21 Agustus 2026 pada build produksi tanpa REDIS_URL: /api/compare?symbol1=BBCA.JK
 * memakan 17,14 detik, lalu 17,27 detik saat diulang - kunjungan kedua tidak lebih murah
 * sedikit pun.
 *
 * Cache memori ini BUKAN pengganti Redis: isinya per proses, jadi ia tidak menyatukan
 * beban lintas instance dan hilang setiap deploy. Ia hanya menahan degradasi supaya
 * Redis yang mati/belum dipasang tidak berarti nol cache.
 */
describe('getOrCompute memory fallback saat Redis tidak tersedia', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('memakai ulang hasil untuk request berurutan pada key yang sama', async () => {
    delete process.env.REDIS_URL;
    const compute = vi.fn(async () => ({ value: 'mahal' }));

    const pertama = await getOrCompute('test:memory-fallback:reuse', 60, compute);
    const kedua = await getOrCompute('test:memory-fallback:reuse', 60, compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(kedua).toEqual(pertama);
  });

  it('menghitung ulang setelah TTL lewat, bukan menyajikan yang basi selamanya', async () => {
    delete process.env.REDIS_URL;
    vi.useFakeTimers();
    const compute = vi.fn(async () => ({ value: Date.now() }));

    await getOrCompute('test:memory-fallback:ttl', 60, compute);
    vi.advanceTimersByTime(61_000);
    await getOrCompute('test:memory-fallback:ttl', 60, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('mencatat memory miss/hit dan Redis degraded tanpa menaruh cache key di telemetry', async () => {
    delete process.env.REDIS_URL;
    const context = await runWithRequestObservability({ requestId: 'cache-observe' }, async () => {
      const key = `test:observability:${Date.now()}`;
      await getOrCompute(key, 60, async () => ({ value: 1 }));
      await getOrCompute(key, 60, async () => ({ value: 2 }));
      return currentRequestLogContext();
    });

    expect(context).toMatchObject({
      cacheState: expect.arrayContaining(['memory-miss', 'memory-write', 'memory-hit']),
      degraded: true,
      degradedReason: ['redis-not-configured'],
    });
    expect(JSON.stringify(context)).not.toContain('test:observability:');
  });
});
