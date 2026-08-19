import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { NotFoundError } from '@/shared/errors/app-error';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';
import { checkPublicComputeBudget, rateLimitExceeded } from '@/shared/security/api-rate-limit';
import { calculateDcfModel } from '@/modules/fundamental';
import { getMarketAwareCacheHeaders, CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { getSession } from '@/modules/user';

// /dcf sengaja publik (alat gratis, konsisten dengan /api/intrinsic/[ticker]) - lihat
// catatan di app/api/intrinsic/[ticker]/route.ts. Sebelumnya app/dcf/page.tsx memanggil
// /api/live/[ticker] (cuma quote harga) yang tidak pernah punya field quant/analysis,
// jadi WACC/FCF projections/sensitivity table selalu tampil "-". Endpoint ini mengisi
// data itu dari model DCF nyata di modules/fundamental/service/dcf-valuation.service.ts.
//
// BUG FIX (2026-08-14, audit "semua menu harus ada cache") - `getMarketAwareCacheHeaders`
// di bawah cuma header HTTP (Cache-Control/CDN-Cache-Control) yang HANYA berguna kalau
// ada CDN yang membacanya di depan origin. Production pindah ke VPS + Cloudflare Tunnel
// (2026-08-13) - bukan mode CDN cache Cloudflare - jadi header itu kemungkinan besar
// tidak dibaca siapa pun; tiap buka /dcf untuk ticker yang sama tetap hitung ulang model
// DCF live. getOrCompute (cache Redis server-side, sama pola dengan /api/fundamental/
// [ticker]) ditambahkan supaya cache-nya benar-benar terjadi di lapisan yang production
// ini pakai, bukan bergantung CDN yang sudah tidak ada.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const budget = await checkPublicComputeBudget(request.headers, 'dcf');
  if (!budget.allowed) return rateLimitExceeded(budget);

  return runController(async () => {
    const { ticker: rawTicker } = await params;
    const ticker = parseOrThrow(idxTickerParamSchema, rawTicker);
    // Dibungkus jadi { notFound: true } sebelum di-cache - getOrCompute memperlakukan
    // `null` sebagai cache-miss (selalu dihitung ulang), jadi tanpa pembungkus ini
    // ticker yang datanya memang tidak tersedia akan tetap menembak live tiap request.
    const wrapped = await getOrCompute(
      `sahamlens:cache:computed:dcf:${ticker}`,
      CACHE_TTL_SEC.TECHNICAL,
      async () => {
        const result = await calculateDcfModel(ticker);
        return result ?? { notFound: true as const };
      },
    );
    if ('notFound' in wrapped) {
      throw new NotFoundError('Data DCF tidak tersedia untuk simbol ini');
    }

    const session = await getSession().catch(() => null);
    const isGuest = !session || typeof session.id !== 'string';

    if (isGuest) {
      const rawQuant = wrapped.quant || {};
      const rawProjections = rawQuant.fcf_projections || [];
      return { status: 200, headers: getMarketAwareCacheHeaders(), body:
        {
          ...wrapped,
          quant: {
            ...rawQuant,
            fcf_projections: rawProjections.slice(0, 2),
            fcf_locked_count: Math.max(0, rawProjections.length - 2),
            sensitivity_table: [],
            is_guest_limited: true,
          },
          is_guest_limited: true,
        } };
    }

    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return {
      status: 200,
      body: { ...wrapped, is_guest_limited: false },
      headers: getMarketAwareCacheHeaders(),
    };
  });
}
