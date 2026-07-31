import { Redis } from '@upstash/redis';

// Rate limiter in-memory per-IP, dipakai dari middleware.ts (Edge Runtime).
//
// KETERBATASAN YANG SUDAH DIKETAHUI (temuan H3 di audit backend, sebagian
// diperbaiki BUILD 008): Edge Runtime Vercel menjalankan banyak isolate V8
// tersebar geografis, masing-masing dengan globalThis sendiri - jadi limit
// "20/hari" versi in-memory di bawah ini efektifnya "20/hari PER ISOLATE",
// bukan benar-benar global. checkRateLimitShared() di bagian bawah file
// memperbaikinya dengan counter Redis (Upstash, REST-based - aman dipakai dari
// Edge Runtime, sama seperti @upstash/qstash yang sudah dipakai di middleware
// lain) dan degradasi otomatis ke fungsi in-memory ini kalau Redis belum
// dikonfigurasi/sedang down - request pengguna TIDAK PERNAH gagal karena
// rate-limiter, paling buruk kembali ke perilaku lama (per-isolate).

export interface RateLimitConfig {
  windowMs: number;
  maxPerWindow: number;
  blockMs: number;
}

interface IpEntry {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

const g = globalThis as unknown as { __sahamlensIpStore?: Map<string, IpEntry>; __sahamlensIpStoreLastSweep?: number };
if (!g.__sahamlensIpStore) g.__sahamlensIpStore = new Map();
const ipStore = g.__sahamlensIpStore;

// Eviction oportunistik (bukan setInterval - semantiknya tidak jelas di serverless
// yang instance-nya bisa dibekukan di antara invocation). Disapu setiap ~10 menit
// SEKALIAN saat ada request masuk, bukan timer terpisah. Tanpa ini, ipStore
// bertambah satu entry PERMANEN untuk setiap IP unik yang pernah lewat middleware,
// tidak pernah berkurang selama instance hidup (temuan Performance Roadmap Fase 1).
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function sweepStaleEntries(now: number, config: RateLimitConfig) {
  const lastSweep = g.__sahamlensIpStoreLastSweep || 0;
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  g.__sahamlensIpStoreLastSweep = now;

  // forEach, bukan for...of - target tsconfig ini es5, iterasi Map native butuh
  // --downlevelIteration/target es2015+.
  ipStore.forEach((entry, ip) => {
    const windowExpired = now - entry.windowStart > config.windowMs;
    const blockExpired = entry.blockedUntil <= now;
    if (windowExpired && blockExpired) {
      ipStore.delete(ip);
    }
  });
}

export function checkRateLimit(ip: string, now: number, config: RateLimitConfig): RateLimitResult {
  sweepStaleEntries(now, config);
  let entry = ipStore.get(ip);
  if (!entry) {
    entry = { count: 0, windowStart: now, blockedUntil: 0 };
    ipStore.set(ip, entry);
  }

  if (entry.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000) };
  }

  if (now - entry.windowStart > config.windowMs) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  if (entry.count > config.maxPerWindow) {
    entry.blockedUntil = now + config.blockMs;
    return { allowed: false, retryAfterSec: Math.ceil(config.blockMs / 1000) };
  }

  return { allowed: true };
}

const gRedis = globalThis as unknown as { __sahamlensRateLimitRedis?: Redis };

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!gRedis.__sahamlensRateLimitRedis) {
    gRedis.__sahamlensRateLimitRedis = new Redis({ url, token });
  }
  return gRedis.__sahamlensRateLimitRedis;
}

// Fixed-window counter di Redis (INCR + EXPIRE sekali di hit pertama jendela) +
// key blokir terpisah untuk periode blockMs setelah limit terlampaui - satu
// counter global dipakai SEMUA isolate/region, bukan lagi per-instance.
export async function checkRateLimitShared(ip: string, now: number, config: RateLimitConfig): Promise<RateLimitResult> {
  const client = getRedisClient();
  if (!client) return checkRateLimit(ip, now, config);

  const windowIndex = Math.floor(now / config.windowMs);
  const windowKey = `sahamlens:ratelimit:${ip}:${windowIndex}`;
  const blockKey = `sahamlens:ratelimit:block:${ip}`;

  try {
    const blockedUntil = await client.get<number>(blockKey);
    if (blockedUntil && blockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((blockedUntil - now) / 1000) };
    }

    const count = await client.incr(windowKey);
    if (count === 1) {
      await client.expire(windowKey, Math.ceil(config.windowMs / 1000));
    }

    if (count > config.maxPerWindow) {
      const newBlockedUntil = now + config.blockMs;
      await client.set(blockKey, newBlockedUntil, { px: config.blockMs });
      return { allowed: false, retryAfterSec: Math.ceil(config.blockMs / 1000) };
    }

    return { allowed: true };
  } catch {
    // Redis error di tengah jalan - degradasi ke in-memory, jangan pernah gagalkan request.
    return checkRateLimit(ip, now, config);
  }
}
