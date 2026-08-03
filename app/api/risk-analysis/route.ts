import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { fetchYahooHistory } from '@/modules/technical';
import { calculateBeta } from '@/modules/market';

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
  weight: number;
}

const MAX_POSITIONS = 20;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawPortfolio = Array.isArray(body?.portfolio) ? body.portfolio : [];
    const portfolio: PortfolioPosition[] = rawPortfolio
      .filter((p: any) => p && typeof p.ticker === 'string' && typeof p.weight === 'number' && p.weight > 0)
      .slice(0, MAX_POSITIONS);

    if (portfolio.length === 0) {
      return NextResponse.json({ error: 'Portofolio kosong atau tidak valid' }, { status: 400 });
    }

    const totalWeight = portfolio.reduce((sum, p) => sum + p.weight, 0);

    const [ihsgData, usdIdrData] = await Promise.all([
      fetchYahooHistory('^JKSE', '1y'),
      fetchYahooHistory('USDIDR=X', '1y'),
    ]);

    if (!ihsgData) {
      return NextResponse.json({ error: 'Data historis IHSG tidak tersedia saat ini' }, { status: 503 });
    }

    const perStock = await Promise.all(
      portfolio.map(async (pos) => {
        const ticker = pos.ticker.includes('.') ? pos.ticker : `${pos.ticker}.JK`;
        const history = await fetchYahooHistory(ticker, '1y');
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

    return NextResponse.json({
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
    });
  } catch (error: any) {
    console.error('Risk analysis API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
