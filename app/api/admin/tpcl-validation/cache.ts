import { cacheDel, cacheSet, getOrCompute } from '@/shared/cache/redis-cache';
import {
  getTpclValidationDashboard,
  type TpclValidationDashboard,
} from '@/modules/recommendation/service/tpcl-validation.service';

const TPCL_VALIDATION_CACHE_KEY = 'sahamlens:cache:admin:tpcl-validation:v2';
const TPCL_VALIDATION_CACHE_TTL_SEC = 30 * 60;

/**
 * Dashboard TP/CL cukup berat karena membaca histori LensRadar dan OHLC harian.
 * GET admin memakai cache supaya membuka halaman berulang tidak memukul Postgres
 * + provider harga setiap kali. Redis tetap best-effort; kalau tidak tersedia,
 * helper cache aplikasi akan menghitung langsung tanpa menggagalkan halaman.
 */
export async function getCachedTpclValidationDashboard(): Promise<TpclValidationDashboard> {
  return getOrCompute(
    TPCL_VALIDATION_CACHE_KEY,
    TPCL_VALIDATION_CACHE_TTL_SEC,
    () => getTpclValidationDashboard(),
  );
}

/** Force recompute: dipakai tombol admin dan sengaja melewati cache lama. */
export async function recomputeTpclValidationDashboard(): Promise<TpclValidationDashboard> {
  const dashboard = await getTpclValidationDashboard();
  await cacheSet(TPCL_VALIDATION_CACHE_KEY, dashboard, TPCL_VALIDATION_CACHE_TTL_SEC);
  return dashboard;
}

/** Hanya menghapus hasil cache riset, tidak menghapus histori/scoring produksi. */
export async function clearTpclValidationDashboardCache(): Promise<void> {
  await cacheDel(TPCL_VALIDATION_CACHE_KEY);
}

export const TPCL_VALIDATION_CACHE_TTL_MINUTES = TPCL_VALIDATION_CACHE_TTL_SEC / 60;
