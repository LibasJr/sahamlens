import { fetchScreenerUniverse, rankScreener, type RiskProfile } from '@/modules/market/service/screener.service';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { getSession } from '@/modules/user';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';
import { runController } from '@/shared/http/next-response.adapter';
import { apiOk } from '@/shared/http/api-response';
import { getLensScoreValidationStatus } from '@/modules/validation';

export const dynamic = 'force-dynamic';
// 120 (bukan 60) - disamakan dengan app/api/cron/screener-scan yang mengerjakan
// pekerjaan yang persis sama. Saat cache dingin, request inilah yang menanggung scan
// 200 ticker; batas 60 detik lebih pendek dari yang dibutuhkan warmer-nya sendiri,
// jadi visitor pertama terputus di tengah jalan alih-alih menerima data.
export const maxDuration = 120;

const CACHE_KEY = COMPUTED_CACHE_KEY.SCREENER_UNIVERSE;

function parsePositiveParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  return runController(async () => {
    const { searchParams } = new URL(request.url);
    const profile = (searchParams.get('profile') || 'Moderat') as RiskProfile;
    if (!['Konservatif', 'Moderat', 'Agresif'].includes(profile)) {
      return {
        status: 400,
        body: { error: 'profile harus Konservatif/Moderat/Agresif', code: 'INVALID_RISK_PROFILE' },
      };
    }

    const sectorParam = searchParams.get('sector');
    const sector = sectorParam && sectorParam.trim() ? sectorParam.trim() : undefined;
    const maxPrice = parsePositiveParam(searchParams.get('maxPrice'));
    const minMarketCap = parsePositiveParam(searchParams.get('minMarketCap'));
    const minLiquidity = parsePositiveParam(searchParams.get('minLiquidity'));

    // Sesi dibaca SEBELUM budget, bukan sesudah. Dulu budget dipotong lebih dulu dengan
    // aktor dari IP dan tier 'public' selalu - artinya pengguna yang sudah login ikut
    // berbagi ember tamu dan batas tier 'authenticated' (160) tidak pernah tercapai.
    const session = await getSession().catch(() => null);
    const isGuest = !session || typeof session.id !== 'string';

    // Untuk tamu, aktor diambil dari cookie trial anonim yang ditandatangani server,
    // BUKAN dari IP (pola yang sama dipakai /api/chat dan /api/backtest). Dengan
    // TRUSTED_PROXY_MODE=direct, getTrustedClientIp() mengembalikan literal 'unknown'
    // untuk SETIAP pengunjung, sehingga seluruh deployment berbagi satu ember 40 unit -
    // habis setelah 8 request per 10 menit dan LensScanner tampil kosong untuk semua
    // orang. Cookie trial memberi tiap browser embernya sendiri.
    const anonTrial = isGuest ? await readOrIssueAnonymousTrial() : null;
    // Cookie WAJIB ikut di setiap response (termasuk 429). Tanpa itu tamu baru selalu
    // menerima firstSeenAt baru tiap request, dan rate limit tidak membatasi apa pun.
    const trialCookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;
    const cookiesToSet = trialCookie ? [trialCookie] : undefined;

    const ttlBefore = await getCacheTtlRemaining(CACHE_KEY);
    const budget = await consumeComputeBudget(
      isGuest ? `guest-screener:${anonTrial!.firstSeenAt}` : computeActorFromRequest(request, session!.id),
      ttlBefore && ttlBefore > 0 ? 1 : 5,
      isGuest ? 'public' : 'authenticated',
    );
    if (!budget.allowed) {
      return {
        status: 429,
        headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined,
        cookiesToSet,
        body: {
          error: 'Screener terlalu sering diminta dalam waktu singkat. Coba lagi sebentar.',
          code: 'COMPUTE_BUDGET_EXCEEDED',
        },
      };
    }

    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.SCREENER_UNIVERSE, fetchScreenerUniverse);
    const top10 = rankScreener(universe, profile, { sector, maxPrice, minMarketCap, minLiquidity });

    const visibleStocks = isGuest ? top10.slice(0, 2) : top10;
    const lockedCount = isGuest ? Math.max(0, top10.length - 2) : 0;

    const availableSectors = Array.from(new Set(universe.map((stock) => stock.sector)))
      .sort((a, b) => a.localeCompare(b, 'id'));

    // Selama jam bursa, vol_ratio SENGAJA di-null-kan untuk seluruh emiten (volume sesi
    // masih parsial - lihat Zero Dummy Policy di screener.service.ts), sehingga komponen
    // momentum dikeluarkan dari skor dan bobot sisanya dinormalisasi ulang. Profil Agresif
    // dengan demikian TIDAK diperingkat memakai momentum 30% seperti yang tertulis di UI.
    // Diturunkan dari universe yang benar-benar dipakai, bukan dari jam browser: universe
    // bisa saja hasil cache yang dibuat saat bursa masih buka.
    const momentumScored = universe.some((stock) => stock.vol_ratio != null);

    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.SCREENER_UNIVERSE);
    const modelValidation = getLensScoreValidationStatus();
    const data = {
      profile,
      analysis: {
        top_10_stocks: visibleStocks,
        total_count: top10.length,
        locked_count: lockedCount,
        is_guest_limited: isGuest,
      },
      availableSectors,
      momentumScored,
      modelValidation,
      _meta,
    };

    return {
      status: 200,
      cookiesToSet,
      body: {
        ...apiOk(data, {
          source: 'screener-universe-cache',
          staleness: _meta.freshness.toLowerCase(),
          modelVersion: modelValidation.reasonCode,
        }),
        // Backward-compatible top-level fields while clients migrate to
        // the standard { ok, data, meta } response contract.
        ...data,
      },
    };
  }, request);
}