import { NextResponse } from 'next/server';
import {
  checkRateLimitShared,
  type RateLimitConfig,
  type RateLimitResult,
} from '@/shared/middleware/rate-limiter';
import { getTrustedClientIp } from '@/shared/http/client-ip';
import type { HttpResult } from '@/shared/types/http-result.types';
import { recordDegradedMode } from '@/shared/observability/request-context';

function observeRateLimitDegradation(result: RateLimitResult): RateLimitResult {
  if (!result.degraded) return result;
  recordDegradedMode(
    result.unavailable
      ? 'rate-limit-backend-unavailable'
      : 'rate-limit-memory-fallback',
  );
  return result;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

export function publicComputeRateLimitConfig(): RateLimitConfig {
  const windowSec = envInt('PUBLIC_COMPUTE_RATE_WINDOW_SEC', 300, 60, 86_400);
  return {
    windowMs: windowSec * 1000,
    maxPerWindow: envInt('PUBLIC_COMPUTE_RATE_MAX', 40, 1, 10_000),
    blockMs: envInt('PUBLIC_COMPUTE_RATE_BLOCK_SEC', 300, 30, 86_400) * 1000,
  };
}

export function aiAccountRateLimitConfig(): RateLimitConfig {
  const windowSec = envInt('AI_ACCOUNT_RATE_WINDOW_SEC', 3600, 60, 86_400);
  return {
    windowMs: windowSec * 1000,
    maxPerWindow: envInt('AI_ACCOUNT_RATE_MAX', 30, 1, 10_000),
    blockMs: envInt('AI_ACCOUNT_RATE_BLOCK_SEC', 900, 30, 86_400) * 1000,
  };
}

export async function checkPublicComputeBudget(headers: Headers, scope: string) {
  const ip = getTrustedClientIp(headers);
  const result = await checkRateLimitShared(
    `public-compute:${scope}:${ip}`,
    Date.now(),
    publicComputeRateLimitConfig(),
    { degradedPolicy: process.env.NODE_ENV === 'production' ? 'deny' : 'memory' },
  );
  return observeRateLimitDegradation(result);
}

export async function checkAiAccountBudget(userId: string, scope: string) {
  const result = await checkRateLimitShared(
    `ai-account:${scope}:${userId}`,
    Date.now(),
    aiAccountRateLimitConfig(),
    {
      // Production AI usage is account-sensitive and potentially provider-costly.
      // Never silently replace the global counter with a per-instance counter there.
      degradedPolicy: process.env.NODE_ENV === 'production' ? 'deny' : 'memory',
    },
  );
  return observeRateLimitDegradation(result);
}

export function rateLimitResult(
  result: Pick<RateLimitResult, 'retryAfterSec' | 'unavailable'>,
  message = 'Terlalu banyak permintaan. Coba lagi nanti.',
): HttpResult<{ error: string }> {
  if (result.unavailable) {
    return {
      status: 503,
      body: { error: 'Layanan pembatas penggunaan sementara tidak tersedia. Coba lagi nanti.' },
      headers: { 'Retry-After': '30' },
    };
  }

  return {
    status: 429,
    body: { error: message },
    headers: result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : undefined,
  };
}

// Compatibility helper for legacy routes that have not migrated to runController yet.
export function rateLimitExceeded(result: Pick<RateLimitResult, 'retryAfterSec' | 'unavailable'>, message = 'Terlalu banyak permintaan. Coba lagi nanti.') {
  const mapped = rateLimitResult(result, message);
  return NextResponse.json(mapped.body, { status: mapped.status, headers: mapped.headers });
}
