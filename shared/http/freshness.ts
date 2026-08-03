// Klasifikasi kesegaran data (TAHAP 15 - audit integritas data 2026-08-03, temuan M-07).
//
// SEBELUMNYA aplikasi ini tidak pernah mengukur umur data yang sebenarnya - endpoint
// seperti /api/live/[ticker] mencatat `lastUpdate: new Date().toISOString()` yaitu
// WAKTU SERVER MERESPONS, bukan waktu bar harga yang sebenarnya (`meta.regularMarketTime`
// dari Yahoo). Selisihnya bisa belasan menit saat jam bursa, atau berhari-hari di akhir
// pekan/libur bursa, tapi selalu ditampilkan seolah "baru saja". Label `delay: '15m'` juga
// klaim tetap yang tidak pernah diverifikasi terhadap timestamp sesungguhnya.
//
// Yahoo Finance gratis (tanpa API key berbayar) TIDAK PERNAH benar-benar realtime untuk
// bursa IDX - selalu ada delay minimal (dijadikan referensi 15 menit di UI). Karena itu
// klasifikasi di sini SENGAJA tidak punya nilai 'REALTIME' sama sekali - hanya DELAYED
// (intraday, delay wajar), EOD (data penutupan/di luar jam bursa), atau STALE (lebih tua
// dari 1 hari bursa - kemungkinan Yahoo belum refresh atau simbol tidak aktif).
export type Freshness = 'DELAYED' | 'EOD' | 'STALE' | 'UNKNOWN';

export interface FreshnessInfo {
  freshness: Freshness;
  dataTimestamp: string | null;
  ageSeconds: number | null;
}

const DELAYED_THRESHOLD_SEC = 20 * 60;      // ~20 menit - toleransi di atas delay 15m yang didokumentasikan
const EOD_THRESHOLD_SEC = 24 * 60 * 60;     // 1 hari - di luar ini dianggap basi, bukan sekadar "tutup bursa"

/** `marketTimeSec` = `meta.regularMarketTime` dari Yahoo Finance chart API (Unix
 * seconds, waktu bar harga SESUNGGUHNYA - bukan `Date.now()` di server). */
export function classifyFreshness(marketTimeSec: number | null | undefined): FreshnessInfo {
  if (typeof marketTimeSec !== 'number' || !Number.isFinite(marketTimeSec) || marketTimeSec <= 0) {
    return { freshness: 'UNKNOWN', dataTimestamp: null, ageSeconds: null };
  }
  const marketTimeMs = marketTimeSec * 1000;
  const ageSeconds = Math.max(0, Math.round((Date.now() - marketTimeMs) / 1000));

  let freshness: Freshness;
  if (ageSeconds < DELAYED_THRESHOLD_SEC) freshness = 'DELAYED';
  else if (ageSeconds < EOD_THRESHOLD_SEC) freshness = 'EOD';
  else freshness = 'STALE';

  return { freshness, dataTimestamp: new Date(marketTimeMs).toISOString(), ageSeconds };
}

// Klasifikasi umur CACHE (BUKAN umur data pasar per-simbol seperti classifyFreshness
// di atas) - untuk endpoint yang meng-cache HASIL HITUNGAN BATCH (Screener/
// Recommendations/Market Summary/Compare), bukan satu quote. Dipakai bersama
// shared/cache/redis-cache.ts:getCacheTtlRemaining() - audit BUILD 001 2026-08-03,
// item "timestamp & data freshness": endpoint2 ini sebelumnya TIDAK melaporkan sama
// sekali seberapa lama hasilnya sudah dihitung, jadi user tidak tahu bedanya "baru saja
// dihitung" vs "cache 29 menit lagi".
export type CacheFreshness = 'FRESH' | 'CACHED' | 'STALE';

export interface CacheAgeInfo {
  freshness: CacheFreshness;
  cachedAgeSec: number;
  cacheTtlSec: number;
}

/** `ttlRemainingSec` dari getCacheTtlRemaining() - null berarti key baru saja
 * dihitung ulang (cache miss) ATAU Redis tidak dikonfigurasi, diperlakukan sebagai
 * umur 0 (bukan error/STALE), sesuai kontrak getCacheTtlRemaining(). */
export function describeCacheAge(ttlRemainingSec: number | null, cacheTtlSec: number): CacheAgeInfo {
  const cachedAgeSec = ttlRemainingSec !== null ? Math.max(0, cacheTtlSec - ttlRemainingSec) : 0;
  const freshness: CacheFreshness = cachedAgeSec < 60 ? 'FRESH' : cachedAgeSec < cacheTtlSec ? 'CACHED' : 'STALE';
  return { freshness, cachedAgeSec, cacheTtlSec };
}
