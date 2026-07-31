// Rate limiter in-memory per-IP, dipakai dari middleware.ts (Edge Runtime).
//
// KETERBATASAN YANG SUDAH DIKETAHUI (temuan H3 di audit backend): Edge Runtime
// Vercel menjalankan banyak isolate V8 tersebar geografis, masing-masing dengan
// globalThis sendiri - jadi limit "20/hari" ini efektifnya "20/hari per isolate",
// bukan benar-benar global. Perbaikan sesungguhnya butuh Redis/Upstash sebagai
// penyimpanan bersama (roadmap Fase 1). File ini sengaja diekstrak jadi fungsi
// murni supaya swap ke implementasi Redis nanti tidak menyentuh middleware.ts.

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
