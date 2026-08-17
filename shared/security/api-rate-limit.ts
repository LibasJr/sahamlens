import { NextResponse } from 'next/server';
import { checkRateLimitShared, type RateLimitConfig } from '@/shared/middleware/rate-limiter';
import { getTrustedClientIp } from '@/shared/http/client-ip';

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
  return checkRateLimitShared(`public-compute:${scope}:${ip}`, Date.now(), publicComputeRateLimitConfig());
}

export async function checkAiAccountBudget(userId: string, scope: string) {
  return checkRateLimitShared(`ai-account:${scope}:${userId}`, Date.now(), aiAccountRateLimitConfig());
}

export function rateLimitExceeded(result: { retryAfterSec?: number }, message = 'Terlalu banyak permintaan. Coba lagi nanti.') {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : undefined },
  );
}
