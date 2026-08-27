import { Redis } from './redis-local';
import { recordCacheState } from '@/shared/observability/request-context';

// Konvensi key: sahamlens:cache:{tier}:{domain}:{identifier} (Cache Layer
// Strategy poin 2) - dipanggil dengan key lengkap oleh caller, helper ini generik.
//
// Redis di sini MURNI cache - kalau REDIS_URL belum diset, atau Redis sedang down,
// semua fungsi di bawah degrade dengan aman (cache miss / no-op), TIDAK PERNAH
// melempar error yang menggagalkan request pengguna.

const g = globalThis as unknown as {
  __sahamlensRedis?: Redis;
  __sahamlensCacheInflight?: Map<string, Promise<unknown>>;
  __sahamlensMemoryCache?: Map<string, { value: unknown; expiresAt: number }>;
};

const LOCAL_INFLIGHT = g.__sahamlensCacheInflight ??= new Map<string, Promise<unknown>>();
const LOCK_TTL_SEC = 60;
const LOCK_WAIT_MAX_MS = 15_000;
const LOCK_POLL_MIN_MS = 150;
const LOCK_POLL_JITTER_MS = 200;

/**
 * ====== Cache memori, cadangan saat Redis tidak tersedia ======
 *
 * Sebelum ini, `REDIS_URL` yang belum diset berarti aplikasi berjalan TANPA CACHE SAMA
 * SEKALI - bukan "cache lebih lambat", melainkan nol. Single-flight di bawah hanya
 * menyatukan request yang tumpang tindih; request yang datang berurutan tidak
 * tertolong olehnya. Terukur 21 Agustus 2026 pada build produksi tanpa Redis:
 * /api/compare?symbol1=BBCA.JK 17,14 detik, lalu 17,27 detik saat diulang.
 *
 * Ini BUKAN pengganti Redis dan tidak boleh diperlakukan begitu:
 *   - isinya per proses, jadi ia tidak menyatukan beban lintas instance;
 *   - hilang setiap restart/deploy;
 *   - dibatasi jumlah entri, jadi key yang jarang dipakai memang akan terbuang.
 * Fungsinya cuma satu: menahan degradasi supaya Redis mati bukan berarti nol cache.
 *
 * SENGAJA hanya menopang cacheGet/cacheSet. incrWithExpiry (kuota harian) TIDAK ikut:
 * hitungan per proses akan mengalikan kuota sebanyak jumlah instance, dan fail-open
 * yang sekarang - sengaja longgar - lebih jujur daripada batas yang terlihat berlaku
 * padahal bocor.
 */
const MEMORY_CACHE_MAX_ENTRIES = 500;
const MEMORY_CACHE = g.__sahamlensMemoryCache ??= new Map<string, { value: unknown; expiresAt: number }>();

function memoryGet<T>(key: string): T | null {
  const hit = MEMORY_CACHE.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    MEMORY_CACHE.delete(key);
    return null;
  }
  return hit.value as T;
}

function memoryTtlRemaining(key: string): number | null {
  const hit = MEMORY_CACHE.get(key);
  if (!hit) return null;
  const remaining = Math.ceil((hit.expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : null;
}

function memorySet<T>(key: string, value: T, ttlSec: number): void {
  // Map di JavaScript mempertahankan urutan penyisipan, jadi key pertama adalah yang
  // paling lama masuk. Pembuangan paling sederhana yang benar - bukan LRU, dan memang
  // tidak perlu: ini cadangan, bukan lapisan cache utama.
  if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX_ENTRIES && !MEMORY_CACHE.has(key)) {
    const oldest = MEMORY_CACHE.keys().next().value;
    if (oldest !== undefined) MEMORY_CACHE.delete(oldest);
  }
  MEMORY_CACHE.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!g.__sahamlensRedis) {
    g.__sahamlensRedis = new Redis({ url });
  }
  return g.__sahamlensRedis;
}

// Dipakai /api/health - beda dari cacheGet/cacheSet yang sengaja tidak pernah
// melempar (supaya cache tidak pernah menggagalkan request pengguna). Health
// check justru PERLU tahu kalau Redis benar-benar bermasalah, bukan disembunyikan.
export async function pingRedis(): Promise<'ok' | 'not_configured' | 'error'> {
  const client = getClient();
  if (!client) return 'not_configured';
  try {
    await client.ping();
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getClient();
  if (!client) {
    const value = memoryGet<T>(key);
    recordCacheState(value == null ? 'memory-miss' : 'memory-hit', 'redis-not-configured');
    return value;
  }
  try {
    const value = await client.get<T>(key);
    recordCacheState(value == null ? 'redis-miss' : 'redis-hit');
    return value;
  } catch {
    const value = memoryGet<T>(key);
    recordCacheState(value == null ? 'memory-miss' : 'memory-hit', 'redis-read-failed');
    return value;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSec: number): Promise<void> {
  const client = getClient();
  if (!client) {
    memorySet(key, value, ttlSec);
    recordCacheState('memory-write', 'redis-not-configured');
    return;
  }
  try {
    await client.set(key, value, { ex: ttlSec });
    recordCacheState('redis-write');
  } catch {
    // Redis gagal tulis - request tetap lanjut dengan data yang baru dihitung, tapi
    // hasilnya disimpan di memori supaya request berikutnya di proses yang sama tidak
    // membayar komputasi yang sama lagi selama Redis masih bermasalah.
    memorySet(key, value, ttlSec);
    recordCacheState('memory-write', 'redis-write-failed');
  }
}

/**
 * INCR atomik + EXPIRE (dipasang cuma sekali, saat hitungan baru jadi 1 - INCR
 * di call berikutnya tidak mereset TTL) - dipakai untuk kuota harian (mis. limit
 * analisa gratis/hari). Kalau Redis tidak dikonfigurasi/gagal, return null supaya
 * caller tahu harus fail-open (jangan pernah mengunci user gratis gara-gara Redis
 * down - ini kuota bisnis, bukan gerbang keamanan).
 */
export async function incrWithExpiry(key: string, ttlSec: number): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, ttlSec);
    return count;
  } catch {
    return null;
  }
}

/** SADD + EXPIRE (dipasang tiap kali, aman - SET kecil per hari per user) - dipakai
 * mencatat simbol apa saja yang sudah dianalisa hari ini untuk pesan paywall. */
export async function addToSetWithExpiry(key: string, member: string, ttlSec: number): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.sadd(key, member);
    await client.expire(key, ttlSec);
  } catch {
    // no-op - daftar simbol cuma kosmetik untuk pesan paywall, tidak boleh gagalkan request.
  }
}

export async function getSetMembers(key: string): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  try {
    return await client.smembers(key);
  } catch {
    return [];
  }
}

/** Sisa TTL (detik) key cache - dipakai turunkan "berapa lama data ini sudah
 * dihitung" TANPA mengubah bentuk value yang di-cache (tidak menyentuh kontrak
 * getOrCompute yang dipakai banyak caller). Null kalau key tidak ada (baru saja
 * dihitung ulang lewat compute(), atau memang belum pernah di-cache) - caller
 * memperlakukan null sebagai "anggap baru saja dihitung", BUKAN error.
 *
 * Tanpa Redis, TTL dibaca dari cache memori - BUKAN null. Sejak cadangan memori
 * ada, `REDIS_URL` kosong tidak lagi berarti "tidak ada cache": cacheGet melayani
 * dari MEMORY_CACHE, jadi mengembalikan null di sini membuat caller menyimpulkan
 * dua hal yang salah sekaligus - chip kesegaran selalu menulis "baru saja
 * dihitung" untuk entri berumur 29 menit, dan /api/screener selalu menagih biaya
 * cache-miss (5) padahal tidak menghitung apa pun. */
export async function getCacheTtlRemaining(key: string): Promise<number | null> {
  const client = getClient();
  if (!client) return memoryTtlRemaining(key);
  try {
    const ttl = await client.ttl(key);
    return ttl >= 0 ? ttl : null; // -2 = key tidak ada, -1 = key ada tanpa TTL (tidak dipakai app ini)
  } catch {
    return memoryTtlRemaining(key); // sejalan dengan cacheGet yang juga jatuh ke memori saat Redis error
  }
}

export async function cacheDel(keyOrPattern: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.del(keyOrPattern);
  } catch {
    // no-op
  }
}

/** SCAN penuh (paginasi sampai cursor balik ke 0) - dipakai untuk key dengan jumlah
 * kecil (mis. presence user aktif), BUKAN untuk pattern yang bisa cocok ribuan key. */
export async function scanKeys(pattern: string): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  try {
    let cursor = 0;
    const keys: string[] = [];
    do {
      const result: [string | number, string[]] = await client.scan(cursor, { match: pattern, count: 100 });
      keys.push(...result[1]);
      cursor = Number(result[0]);
    } while (cursor !== 0);
    return keys;
  } catch {
    return [];
  }
}

export async function cacheMGet<T>(keys: string[]): Promise<(T | null)[]> {
  const client = getClient();
  if (!client || keys.length === 0) return [];
  try {
    return await client.mget<T[]>(...keys);
  } catch {
    return keys.map(() => null);
  }
}

/**
 * Single-flight getOrCompute (Cache Layer Strategy poin 4 - proteksi stampede).
 *
 * Dua lapis dedupe:
 * 1. Map Promise per proses mencegah request paralel di server instance yang sama.
 * 2. Redis lock bertoken mencegah provider dipanggil bersamaan lintas instance.
 *
 * Waiter melakukan polling bounded hingga 15 detik. Kalau compute yang memegang lock
 * memang lebih lama dari itu, request tetap fail-open dan menghitung sendiri daripada
 * menggantung sampai timeout platform. Lock 60 detik menutup mayoritas provider call
 * mahal dan dilepas dengan compare-and-delete atomik agar lock baru tidak ikut terhapus.
 */
async function computeWithDistributedLock<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
  const client = getClient();
  if (!client) {
    const value = await compute();
    await cacheSet(key, value, ttlSec);
    return value;
  }

  const lockKey = `sahamlens:cache:lock:${key}`;
  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MAX_MS;

  while (Date.now() < deadline) {
    let gotLock = false;
    try {
      gotLock = (await client.set(lockKey, lockToken, { nx: true, ex: LOCK_TTL_SEC })) === 'OK';
    } catch {
      // Redis degraded: fail-open ke compute, tapi tetap coba cacheSet agar recovery
      // Redis di tengah request dapat menyimpan hasilnya.
      const value = await compute();
      await cacheSet(key, value, ttlSec);
      return value;
    }

    if (gotLock) {
      try {
        // Cache bisa terisi di sela initial miss dan lock acquisition. Re-check agar
        // request ini tidak menghitung ulang hasil yang baru saja ditulis request lain.
        const raced = await cacheGet<T>(key);
        if (raced !== null && raced !== undefined) return raced;

        const value = await compute();
        await cacheSet(key, value, ttlSec);
        return value;
      } finally {
        try {
          await client.compareAndDelete(lockKey, lockToken);
        } catch {
          // Lock punya TTL, jadi kegagalan unlock tidak boleh menggagalkan response.
        }
      }
    }

    const cached = await cacheGet<T>(key);
    if (cached !== null && cached !== undefined) return cached;

    const jitter = Math.floor(Math.random() * LOCK_POLL_JITTER_MS);
    await sleep(LOCK_POLL_MIN_MS + jitter);
  }

  // Bounded fail-open untuk provider yang benar-benar lambat. Re-check terakhir
  // menghindari duplicate compute bila pemegang lock selesai persis di deadline.
  const lastChance = await cacheGet<T>(key);
  if (lastChance !== null && lastChance !== undefined) return lastChance;

  const value = await compute();
  await cacheSet(key, value, ttlSec);
  return value;
}

export async function getOrCompute<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null && cached !== undefined) return cached;

  const existing = LOCAL_INFLIGHT.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = computeWithDistributedLock(key, ttlSec, compute);
  LOCAL_INFLIGHT.set(key, pending as Promise<unknown>);

  try {
    return await pending;
  } finally {
    if (LOCAL_INFLIGHT.get(key) === pending) LOCAL_INFLIGHT.delete(key);
  }
}
