import { Redis } from '../cache/redis-local';

const MAX_RESET_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

type LocalEntry = { count: number; expiresAt: number };
const local = new Map<string, LocalEntry>();
let redis: Redis | null | undefined;

function key(email: string) {
  return `sahamlens:security:reset-otp-attempts:${email.trim().toLowerCase()}`;
}

function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  redis = url ? new Redis({ url }) : null;
  return redis;
}

function localCount(k: string): number {
  const now = Date.now();
  const entry = local.get(k);
  if (!entry || entry.expiresAt <= now) {
    local.delete(k);
    return 0;
  }
  return entry.count;
}

export async function isResetOtpAttemptBlocked(email: string): Promise<boolean> {
  const k = key(email);
  const r = client();
  if (r) {
    try {
      return Number(await r.get<number>(k) ?? 0) >= MAX_RESET_ATTEMPTS;
    } catch { /* fall through to local guard */ }
  }
  return localCount(k) >= MAX_RESET_ATTEMPTS;
}

export async function recordResetOtpFailure(email: string): Promise<void> {
  const k = key(email);
  const r = client();
  if (r) {
    try {
      const count = await r.incr(k);
      if (count === 1) await r.expire(k, WINDOW_SECONDS);
      return;
    } catch { /* use local fallback */ }
  }
  const now = Date.now();
  const current = local.get(k);
  if (!current || current.expiresAt <= now) {
    local.set(k, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
  } else {
    current.count += 1;
  }
}

export async function clearResetOtpAttempts(email: string): Promise<void> {
  const k = key(email);
  local.delete(k);
  const r = client();
  if (r) {
    try { await r.del(k); } catch { /* best effort */ }
  }
}

export const RESET_OTP_MAX_ATTEMPTS = MAX_RESET_ATTEMPTS;


// Signup verification OTP: ruang kode hanya 900.000 kombinasi. Batasi percobaan
// per email agar endpoint /api/auth/verify tidak bergantung hanya pada limiter IP.
const MAX_VERIFY_ATTEMPTS = 5;

function verifyKey(email: string) {
  return `sahamlens:security:verify-otp-attempts:${email.trim().toLowerCase()}`;
}

export async function isVerifyOtpAttemptBlocked(email: string): Promise<boolean> {
  const k = verifyKey(email);
  const r = client();
  if (r) {
    try {
      return Number(await r.get<number>(k) ?? 0) >= MAX_VERIFY_ATTEMPTS;
    } catch { /* fall through to local guard */ }
  }
  return localCount(k) >= MAX_VERIFY_ATTEMPTS;
}

export async function recordVerifyOtpFailure(email: string): Promise<void> {
  const k = verifyKey(email);
  const r = client();
  if (r) {
    try {
      const count = await r.incr(k);
      if (count === 1) await r.expire(k, WINDOW_SECONDS);
      return;
    } catch { /* use local fallback */ }
  }
  const now = Date.now();
  const current = local.get(k);
  if (!current || current.expiresAt <= now) {
    local.set(k, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
  } else {
    current.count += 1;
  }
}

export async function clearVerifyOtpAttempts(email: string): Promise<void> {
  const k = verifyKey(email);
  local.delete(k);
  const r = client();
  if (r) {
    try { await r.del(k); } catch { /* best effort */ }
  }
}

export const VERIFY_OTP_MAX_ATTEMPTS = MAX_VERIFY_ATTEMPTS;
