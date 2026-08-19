import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { SubscriptionRequiredError, ServiceUnavailableError } from '@/shared/errors/app-error';
import { z } from 'zod';

// Dua pemeriksaan Number.isFinite yang ditulis tangan diganti satu skema. `coerce`
// mengerjakan konversi string->number yang dulu dilakukan Number() di route, dan
// pesannya tetap sama persis supaya UI yang menampilkannya tidak berubah.
const dividendPlanQuerySchema = z.object({
  capital: z.coerce.number().finite().positive('Modal awal harus lebih dari 0'),
  targetMonthly: z.coerce.number().finite().min(0, 'Target pasif bulanan tidak valid'),
});
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { fetchDividendUniverse, buildDividendPlan } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

// Menggantikan pemanggilan /api/live/[ticker] di app/dividend/page.tsx (endpoint itu
// cuma balikin harga+volume, tidak pernah punya field quant.* yang dibutuhkan halaman
// itu - lihat modules/fundamental/service/dividend-plan.service.ts untuk detail).
export const maxDuration = 60;

const CACHE_KEY = COMPUTED_CACHE_KEY.DIVIDEND_UNIVERSE;

export async function GET(request: Request) {
  return runController(async () => {
  // Tamu (session null) dapat akses PENUH tanpa perlu login - keputusan produk
  // 2026-08-13, lihat hasOpenOrProAccess(). Akun terdaftar tetap lewat gerbang
  // trial/Pro seperti sebelumnya (Pro yang baru diaktifkan admin langsung berlaku
  // tanpa menunggu JWT diperbarui, karena hasOpenOrProAccess memanggil versi live).
  const session = await getSession();
  if (!(await hasOpenOrProAccess(session))) throw new SubscriptionRequiredError();

  const { searchParams } = new URL(request.url);
  const { capital, targetMonthly } = parseOrThrow(dividendPlanQuerySchema, {
    capital: searchParams.get('capital'),
    targetMonthly: searchParams.get('targetMonthly'),
  });

  {
    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.DIVIDEND_UNIVERSE, fetchDividendUniverse);
    if (!Array.isArray(universe) || universe.length === 0) {
      // `code: 'DIVIDEND_DATA_UNAVAILABLE'` di luar katalog ErrorCode diganti
      // SERVICE_UNAVAILABLE. Statusnya tetap 503 dan pesannya tetap menjelaskan bahwa
      // proyeksinya TIDAK dihitung - itu yang penting supaya UI tidak menampilkan nol
      // sebagai hasil perhitungan.
      throw new ServiceUnavailableError(
        'Data dividend universe tidak tersedia dari provider; proyeksi tidak dihitung.',
      );
    }
    const quant = buildDividendPlan(universe, capital, targetMonthly);
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return { status: 200, body: { quant } };
  }
  });
}
