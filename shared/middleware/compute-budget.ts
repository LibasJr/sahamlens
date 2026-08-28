import { Redis } from '../cache/redis-local';
import { getTrustedClientIp } from '../http/client-ip';

export type ComputeTier = 'public' | 'authenticated';

export interface ComputeBudgetResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  retryAfterSec?: number;
  unavailable?: boolean;
}

const WINDOW_SEC = 10 * 60;
const LIMITS: Record<ComputeTier, number> = {
  public: 40,
  authenticated: 160,
};

type LocalEntry = { used: number; expiresAt: number };
const g = globalThis as unknown as {
  __sahamlensComputeBudgetRedis?: Redis;
  __sahamlensComputeBudgetLocal?: Map<string, LocalEntry>;
};
if (!g.__sahamlensComputeBudgetLocal) g.__sahamlensComputeBudgetLocal = new Map();

function redisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!g.__sahamlensComputeBudgetRedis) g.__sahamlensComputeBudgetRedis = new Redis({ url });
  return g.__sahamlensComputeBudgetRedis;
}

export function computeActorFromRequest(request: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  return `ip:${getTrustedClientIp(request.headers)}`;
}

function localConsume(actor: string, cost: number, tier: ComputeTier, now: number): ComputeBudgetResult {
  const limit = LIMITS[tier];
  const key = `${tier}:${actor}`;
  const store = g.__sahamlensComputeBudgetLocal!;
  let entry = store.get(key);
  if (!entry || entry.expiresAt <= now) {
    entry = { used: 0, expiresAt: now + WINDOW_SEC * 1000 };
    store.set(key, entry);
  }
  entry.used += cost;
  const allowed = entry.used <= limit;
  return {
    allowed,
    used: entry.used,
    limit,
    remaining: Math.max(0, limit - entry.used),
    retryAfterSec: allowed ? undefined : Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
  };
}

/**
 * Weighted resource guard. This is NOT a product quota and does not change Pro
 * entitlement. It only prevents repeated expensive operations from monopolising
 * serverless CPU. Redis makes it global across instances; local fallback keeps
 * the app available if Redis is not configured.
 */
export async function consumeComputeBudget(
  actor: string,
  cost: number,
  tier: ComputeTier,
  now = Date.now(),
): Promise<ComputeBudgetResult> {
  const safeCost = Math.max(1, Math.min(25, Math.floor(cost)));
  const limit = LIMITS[tier];
  const client = redisClient();
  if (!client) {
    if (process.env.NODE_ENV === 'production') return { allowed: false, used: 0, limit, remaining: limit, unavailable: true };
    return localConsume(actor, safeCost, tier, now);
  }

  const windowIndex = Math.floor(now / (WINDOW_SEC * 1000));
  const key = `sahamlens:compute-budget:${tier}:${actor}:${windowIndex}`;
  try {
    const used = await client.incrby(key, safeCost);
    if (used === safeCost) await client.expire(key, WINDOW_SEC);
    const allowed = used <= limit;
    return {
      allowed,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      retryAfterSec: allowed ? undefined : WINDOW_SEC,
    };
  } catch {
    if (process.env.NODE_ENV === 'production') return { allowed: false, used: 0, limit, remaining: limit, unavailable: true };
    return localConsume(actor, safeCost, tier, now);
  }
}
