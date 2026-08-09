import { Redis } from '@upstash/redis';

const g = globalThis as unknown as {
  __sahamlensJobGuardRedis?: Redis;
  __sahamlensLocalJobLocks?: Set<string>;
};
if (!g.__sahamlensLocalJobLocks) g.__sahamlensLocalJobLocks = new Set();

function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!g.__sahamlensJobGuardRedis) g.__sahamlensJobGuardRedis = new Redis({ url, token });
  return g.__sahamlensJobGuardRedis;
}

export type GuardedJobResult<T> =
  | { executed: true; value: T }
  | { executed: false; reason: 'job_already_running' };

/**
 * Prevent the same expensive scheduled job from overlapping across Vercel
 * instances. The lock is released after normal completion/failure; TTL is the
 * crash-safety net if an invocation is killed before finally executes.
 */
export async function runWithJobConcurrencyGuard<T>(
  jobName: string,
  fn: () => Promise<T>,
  ttlSec = 15 * 60,
): Promise<GuardedJobResult<T>> {
  const client = redisClient();
  const lockKey = `sahamlens:job-lock:${jobName}`;
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  if (client) {
    try {
      const acquired = await client.set(lockKey, token, { nx: true, ex: ttlSec });
      if (!acquired) return { executed: false, reason: 'job_already_running' };
      try {
        return { executed: true, value: await fn() };
      } finally {
        // Delete only our own lock; never release a lock that has expired and
        // been acquired by a newer invocation.
        const current = await client.get<string>(lockKey).catch(() => null);
        if (current === token) await client.del(lockKey).catch(() => 0);
      }
    } catch {
      // Redis unavailable: degrade to per-instance overlap protection.
    }
  }

  const local = g.__sahamlensLocalJobLocks!;
  if (local.has(jobName)) return { executed: false, reason: 'job_already_running' };
  local.add(jobName);
  try {
    return { executed: true, value: await fn() };
  } finally {
    local.delete(jobName);
  }
}
