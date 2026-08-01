import { Redis } from '@upstash/redis';

// Konvensi key: sahamlens:cache:{tier}:{domain}:{identifier} (Cache Layer
// Strategy poin 2) - dipanggil dengan key lengkap oleh caller, helper ini generik.
//
// Redis di sini MURNI cache - kalau UPSTASH_REDIS_REST_URL/TOKEN belum diset,
// atau Redis sedang down, semua fungsi di bawah degrade dengan aman (cache miss
// / no-op), TIDAK PERNAH melempar error yang menggagalkan request pengguna.

const g = globalThis as unknown as { __sahamlensRedis?: Redis };

function getClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!g.__sahamlensRedis) {
    g.__sahamlensRedis = new Redis({ url, token });
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
  if (!client) return null;
  try {
    return await client.get<T>(key);
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSec: number): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.set(key, value, { ex: ttlSec });
  } catch {
    // Redis gagal tulis - diamkan, request tetap lanjut dengan data yang baru dihitung.
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
 * Single-flight getOrCompute (Cache Layer Strategy poin 4 - proteksi stampede):
 * kalau banyak request bersamaan cache-miss di key yang sama, cuma SATU yang
 * benar-benar menjalankan `compute()`; yang lain menunggu sebentar lalu ikut
 * membaca hasilnya dari cache, alih-alih semuanya memanggil provider eksternal
 * (Yahoo/Gemini) bersamaan.
 */
export async function getOrCompute<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null && cached !== undefined) return cached;

  const client = getClient();
  if (!client) return compute();

  const lockKey = `sahamlens:cache:lock:${key}`;
  let gotLock = false;
  try {
    gotLock = (await client.set(lockKey, '1', { nx: true, ex: 10 })) === 'OK';
  } catch {
    gotLock = false;
  }

  if (gotLock) {
    try {
      const value = await compute();
      await cacheSet(key, value, ttlSec);
      return value;
    } finally {
      await cacheDel(lockKey);
    }
  }

  // Lock dipegang request lain - tunggu sebentar, coba baca ulang, fallback ke
  // compute() sendiri kalau masih miss (lebih baik dobel hitung daripada gagal).
  await new Promise((resolve) => setTimeout(resolve, 400));
  const retried = await cacheGet<T>(key);
  if (retried !== null && retried !== undefined) return retried;
  return compute();
}
