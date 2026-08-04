import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// Redis (Cache Layer Tier 2 AI Result), bukan lagi file data/council_cache.json.
// File itu gagal ditulis DIAM-DIAM di Vercel (filesystem read-only, error di-
// swallow try/catch) - artinya cache council TIDAK PERNAH benar-benar menyala di
// production, setiap request bayar penuh ke Gemini. Signature fungsi (nama,
// parameter) dipertahankan sama supaya pemanggil (councilFinal.ts, council/route.ts)
// cuma perlu ditambah `await`, bukan ditulis ulang.

export async function getCouncilCache(symbol: string, date: string): Promise<any | null> {
  return cacheGet(`sahamlens:cache:computed:ai-result:council:${symbol}:${date}`);
}

export async function setCouncilCache(symbol: string, date: string, councilData: any): Promise<void> {
  // `_computedAt` distempel di sini (temuan M-14) - satu-satunya cara pemanggil/UI tahu
  // analisa yang sedang dibaca dihitung kapan. Tanpa ini, hasil berumur 90 menit tampil
  // identik dengan yang baru saja dihitung.
  const payload = councilData && typeof councilData === 'object' && !Array.isArray(councilData)
    ? { ...councilData, _computedAt: new Date().toISOString() }
    : councilData;
  await cacheSet(`sahamlens:cache:computed:ai-result:council:${symbol}:${date}`, payload, CACHE_TTL_SEC.AI_COUNCIL);
}
