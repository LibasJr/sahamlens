import { cacheDel, cacheSet, getOrCompute } from '@/shared/cache/redis-cache';
import {
  DEFAULT_TPCL_HISTORY_RANGE,
  getTpclValidationDashboard,
  TPCL_HISTORY_RANGES,
  type TpclHistoryRange,
  type TpclValidationDashboard,
} from '@/modules/recommendation/service/tpcl-validation.service';

const TPCL_VALIDATION_CACHE_KEY_PREFIX = 'sahamlens:cache:admin:tpcl-validation:v3';
const TPCL_VALIDATION_CACHE_TTL_SEC = 30 * 60;

function cacheKey(historyRange: TpclHistoryRange): string {
  return `${TPCL_VALIDATION_CACHE_KEY_PREFIX}:${historyRange}`;
}

/**
 * Dashboard TP/CL cukup berat karena membaca histori LensRadar dan OHLC harian.
 * Cache dipisahkan per history range supaya hasil 1y/3y/5y/10y tidak pernah tertukar.
 * Redis tetap best-effort; kalau tidak tersedia helper cache aplikasi akan menghitung
 * langsung tanpa menggagalkan halaman admin.
 */
export async function getCachedTpclValidationDashboard(
  historyRange: TpclHistoryRange = DEFAULT_TPCL_HISTORY_RANGE,
): Promise<TpclValidationDashboard> {
  return getOrCompute(
    cacheKey(historyRange),
    TPCL_VALIDATION_CACHE_TTL_SEC,
    () => getTpclValidationDashboard(historyRange),
  );
}

/** Force recompute range tertentu: dipakai tombol admin dan sengaja melewati cache lama. */
export async function recomputeTpclValidationDashboard(
  historyRange: TpclHistoryRange = DEFAULT_TPCL_HISTORY_RANGE,
): Promise<TpclValidationDashboard> {
  const dashboard = await getTpclValidationDashboard(historyRange);
  await cacheSet(cacheKey(historyRange), dashboard, TPCL_VALIDATION_CACHE_TTL_SEC);
  return dashboard;
}

/**
 * Tanpa argumen: hapus seluruh cache range. Dengan argumen: hanya range itu.
 * Tidak pernah menghapus histori/scoring/parameter production.
 */
export async function clearTpclValidationDashboardCache(historyRange?: TpclHistoryRange): Promise<void> {
  if (historyRange) {
    await cacheDel(cacheKey(historyRange));
    return;
  }
  await Promise.all(TPCL_HISTORY_RANGES.map((range) => cacheDel(cacheKey(range))));
}

export const TPCL_VALIDATION_CACHE_TTL_MINUTES = TPCL_VALIDATION_CACHE_TTL_SEC / 60;
