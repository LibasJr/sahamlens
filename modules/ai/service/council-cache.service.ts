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
  await cacheSet(`sahamlens:cache:computed:ai-result:council:${symbol}:${date}`, councilData, CACHE_TTL_SEC.AI_COUNCIL);
}
