import { afterEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  set: vi.fn(),
  compareAndDelete: vi.fn(),
}));

vi.mock('../../cache/redis-local', () => ({
  Redis: class {
    set = redis.set;
    compareAndDelete = redis.compareAndDelete;
  },
}));

import { runWithJobConcurrencyGuard } from '../job-concurrency-guard';

const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  redis.set.mockReset();
  redis.compareAndDelete.mockReset();
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
});

describe('job concurrency guard', () => {
  it('skips an overlapping execution of the same job', async () => {
    delete process.env.REDIS_URL;
    const name = `test-job-${Date.now()}-${Math.random()}`;
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const first = runWithJobConcurrencyGuard(name, async () => { await wait; return 'first'; });
    await Promise.resolve();
    const second = await runWithJobConcurrencyGuard(name, async () => 'second');
    expect(second.executed).toBe(false);
    release();
    const completed = await first;
    expect(completed.executed).toBe(true);
  });

  it('tidak menjalankan ulang callback yang gagal setelah lock Redis didapat', async () => {
    process.env.REDIS_URL = 'redis://test';
    redis.set.mockResolvedValue('OK');
    redis.compareAndDelete.mockResolvedValue(true);
    const job = vi.fn(async () => { throw new Error('business failure'); });

    await expect(runWithJobConcurrencyGuard(`failing-${Date.now()}`, job)).rejects.toThrow('business failure');
    expect(job).toHaveBeenCalledTimes(1);
    expect(redis.compareAndDelete).toHaveBeenCalledTimes(1);
  });

  it('melepas lock secara compare-and-delete atomik', async () => {
    process.env.REDIS_URL = 'redis://test';
    redis.set.mockResolvedValue('OK');
    redis.compareAndDelete.mockResolvedValue(false);

    await expect(runWithJobConcurrencyGuard(`atomic-${Date.now()}`, async () => 'ok'))
      .resolves.toMatchObject({ executed: true, value: 'ok' });
    expect(redis.compareAndDelete).toHaveBeenCalledTimes(1);
  });
});
