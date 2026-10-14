import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { fetchYahooHistory } from '@/modules/technical';
import { calculateBeta } from '@/modules/market';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { checkPublicComputeBudget, rateLimitResult } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { isNativeBearerRequest } from '@/shared/auth/admin-session';
import { logger } from '@/shared/logger/logger';

// BUG FIX (2026-08-14, audit "semua menu harus ada cache") - histori 1 tahun
// dipakai untuk menghitung beta. Baris portofolio itu sendiri personal (beda per
// pengguna, tidak masuk akal di-cache sebagai satu payload), TAPI histori HARGA
// per ticker-nya BUKAN personal - IHSG, USDIDR=X, dan ticker populer (BBCA, TLKM,
// dst.) diminta ULANG oleh banyak pengguna berbeda yang portofolionya kebetulan
// beririsan. Sebelumnya setiap panggilan /api/risk-analysis menembak Yahoo LANGSUNG
// untuk tiap ticker, tanpa cache sama sekali. Dibungkus per ticker+range di sini
// (bukan di modules/technical/service/yahoo-history.service.ts - fungsi itu juga
// dipakai jalur cron/precompute/screener yang sudah punya lapisan cache sendiri di
// atasnya, menambah cache di dalamnya berisiko dobel-cache tanpa manfaat jelas).
function cachedYahooHistory(ticker: string, range: string) {
  return getOrCompute(
    `sahamlens:cache:computed:yahoo-history:${ticker}:${range}`,
    CACHE_TTL_SEC.TECHNICAL,
    () => fetchYahooHistory(ticker, range),
  );
}

// Backend REAL untuk Risk Matrix & Stress Testing (/risk) - audit integritas data
// 2026-08-03, temuan M-09. Halaman itu SEBELUMNYA menampilkan 4 angka stress test tetap
// ("IHSG Drops -5% -> -5.75%", dst.) yang tidak pernah dihitung dari portofolio pengguna
// sama sekali (disclaimer di halaman sudah jujur mengakui ini, tapi angkanya sendiri
// tetap karangan). Endpoint ini menghitung BETA HISTORIS (1 tahun) tiap saham di
// portofolio terhadap IHSG (^JKSE) dan terhadap kurs USD/IDR (USDIDR=X, keduanya data
// Yahoo Finance riil), lalu shock = beta portofolio (dibobot alokasi) x persentase
// pergerakan skenario - regresi linear standar, bukan tebakan.
//
// BI Rate SENGAJA tidak dihitung - aplikasi ini tidak punya sumber data historis BI
// Rate (lihat modules/macro/ - hanya kurs USD/IDR yang tersinkronkan), jadi endpoint ini
// mengembalikan `biRateAvailable: false` alih-alih mengarang sensitivitas BI Rate.

interface PortfolioPosition {
  ticker: string;
  normalizedTicker: string;
  weight: number;
}

const MAX_POSITIONS = 20;

export async function POST(request: Request) {
  return runController(async () => {
    if (!isNativeBearerRequest(request)) {
      assertTrustedSameOrigin(request);
    }

    const budget = await checkPublicComputeBudget(request.headers, 'risk-analysis');
    if (!budget.allowed) {
      return rateLimitResult(budget, 'Terlalu banyak permintaan analisis risiko. Coba lagi nanti.');
    }

    try {
      const body = await request.json().catch(() => null);
      const rawPortfolio = Array.isArray(body?.portfolio) ? body.portfolio : [];
      const portfolio: PortfolioPosition[] = rawPortfolio
        .map((p: unknown): PortfolioPosition | null => {
          if (!p || typeof p !== 'object') return null;
          const rec = p as Record<string, unknown>;
          if (typeof rec.ticker !== 'string' || typeof rec.weight !== 'number' || !Number.isFinite(rec.weight) || rec.weight <= 0) {
            return null;
          }
          const normalizedTicker = normalizeIdxTickerParam(rec.ticker);
          if (!normalizedTicker) return null;
          return {
            ticker: rec.ticker.trim().toUpperCase(),
            normalizedTicker,
            weight: rec.weight,
          };
        })
        .filter((p: PortfolioPosition | null): p is PortfolioPosition => p !== null)
        .slice(0, MAX_POSITIONS);

      if (portfolio.length === 0) {
        return { status: 400, body: { error: 'Portofolio kosong atau tidak valid' } };
      }

      const totalWeight = portfolio.reduce((sum, p) => sum + p.weight, 0);

      const [ihsgData, usdIdrData] = await Promise.all([
        cachedYahooHistory('^JKSE', '1y'),
        cachedYahooHistory('USDIDR=X', '1y'),
      ]);

      if (!ihsgData) {
        return { status: 503, body: { error: 'Data historis IHSG tidak tersedia saat ini' } };
      }

      const perStock = await Promise.all(
        portfolio.map(async (pos) => {
          const history = await cachedYahooHistory(pos.normalizedTicker, '1y');
          if (!history) return { ticker: pos.ticker, weight: pos.weight, betaIhsg: null, betaUsdIdr: null };

          const betaIhsg = calculateBeta(history.history, ihsgData.history);
          const betaUsdIdr = usdIdrData ? calculateBeta(history.history, usdIdrData.history) : null;

          return {
            ticker: pos.ticker,
            weight: pos.weight,
            betaIhsg: betaIhsg ? parseFloat(betaIhsg.beta.toFixed(2)) : null,
            betaUsdIdr: betaUsdIdr ? parseFloat(betaUsdIdr.beta.toFixed(2)) : null,
          };
        })
      );

      // Portfolio beta = rata-rata beta per saham dibobot alokasi (%), HANYA dari saham
      // yang beta-nya berhasil dihitung - saham yang gagal fetch/data kurang dikeluarkan
      // dan bobotnya dinormalisasi ulang dari sisanya (bukan diam-diam dianggap beta 0/1).
      const weightedPortfolioBeta = (field: 'betaIhsg' | 'betaUsdIdr'): number | null => {
        const withBeta = perStock.filter((s) => s[field] != null);
        if (withBeta.length === 0) return null;
        const weightSum = withBeta.reduce((sum, s) => sum + s.weight, 0);
        if (weightSum === 0) return null;
        const weighted = withBeta.reduce((sum, s) => sum + (s[field] as number) * (s.weight / weightSum), 0);
        return parseFloat(weighted.toFixed(2));
      };

      const portfolioBetaIhsg = weightedPortfolioBeta('betaIhsg');
      const portfolioBetaUsdIdr = weightedPortfolioBeta('betaUsdIdr');

      return {
        status: 200,
        body: {
          totalWeight: parseFloat(totalWeight.toFixed(1)),
          perStock,
          portfolioBetaIhsg,
          portfolioBetaUsdIdr,
          // Skenario turunan dari beta riil - shock = beta x persentase pergerakan skenario.
          scenarios: {
            ihsgDrop5Pct: portfolioBetaIhsg != null ? parseFloat((portfolioBetaIhsg * -5).toFixed(2)) : null,
            ihsgDrop10Pct: portfolioBetaIhsg != null ? parseFloat((portfolioBetaIhsg * -10).toFixed(2)) : null,
            usdIdrWeaken1Pct: portfolioBetaUsdIdr != null ? parseFloat((portfolioBetaUsdIdr * 1).toFixed(2)) : null,
          },
          biRateAvailable: false,
        },
      };
    } catch (error: any) {
      logger.error('Risk analysis API error', { err: error });
      return { status: 500, body: { error: 'Internal Server Error' } };
    }
  }, request);
}
