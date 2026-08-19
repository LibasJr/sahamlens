import { runController } from '@/shared/http/next-response.adapter';
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
    if (!(await hasOpenOrProAccess(session))) {
      return { status: 402, body: { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' } };
    }

    const { searchParams } = new URL(request.url);
    const capital = Number(searchParams.get('capital'));
    const targetMonthly = Number(searchParams.get('targetMonthly'));

    if (!Number.isFinite(capital) || capital <= 0) {
      return { status: 400, body: { error: 'Modal awal harus lebih dari 0' } };
    }
    if (!Number.isFinite(targetMonthly) || targetMonthly < 0) {
      return { status: 400, body: { error: 'Target pasif bulanan tidak valid' } };
    }

    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.DIVIDEND_UNIVERSE, fetchDividendUniverse);
    if (!Array.isArray(universe) || universe.length === 0) {
      return { status: 503, body: { error: 'Data dividend universe tidak tersedia dari provider; proyeksi tidak dihitung.', code: 'DIVIDEND_DATA_UNAVAILABLE' } };
    }
    const quant = buildDividendPlan(universe, capital, targetMonthly);
    return { status: 200, body: { quant } };
  }, request);
}
