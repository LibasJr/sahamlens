import { runController } from '@/shared/http/next-response.adapter';
import { ServiceUnavailableError } from '@/shared/errors/app-error';
import { fetchPublicMacroDashboard } from '@/modules/macro/service/public-macro-dashboard.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC, CDN_FRESHNESS_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

const CACHE_KEY = COMPUTED_CACHE_KEY.MACRO_DASHBOARD;

export async function GET() {
  return runController(async () => {
    // 503 dipertahankan sebagai ServiceUnavailableError, bukan dibiarkan jatuh jadi 500
    // generik: sumber makro eksternal yang sedang tidak terjangkau itu kondisi fana, dan
    // klien perlu bisa membedakannya dari kerusakan aplikasi supaya bisa menawarkan
    // "muat ulang" alih-alih menyerah. Detail error aslinya tetap masuk log server
    // lengkap dengan X-Request-Id lewat runController - dulu hanya console.error.
    let data;
    try {
      data = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.MACRO_DASHBOARD, fetchPublicMacroDashboard);
    } catch (error) {
      throw new ServiceUnavailableError('Data makro publik belum dapat dimuat', { cause: error });
    }
    return {
      status: 200,
      body: data,
      headers: publicCacheHeaders(CDN_FRESHNESS_SEC.MACRO, CACHE_TTL_SEC.MACRO_DASHBOARD),
    };
  });
}
