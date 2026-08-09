import { describe, expect, it } from 'vitest';
import { runWithJobConcurrencyGuard } from '../job-concurrency-guard';

describe('job concurrency guard', () => {
  it('skips an overlapping execution of the same job', async () => {
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
});
