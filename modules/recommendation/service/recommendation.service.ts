import YahooFinanceClass from 'yahoo-finance2';
import {
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolume,
  analyzeTrend,
  analyzeVolatility,
  analyzeMomentum,
  analyzeSupport,
  analyzeSma,
  analyzeMarketFlow,
  calculateScore,
} from '@/modules/technical';
import { computeDailyNetFlow, computeAccumulationStreak } from '@/modules/market';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

const MIN_MARKET_CAP = 500_000_000_000; // Rp 500 miliar - permintaan eksplisit, sama
// ambang batas dengan universe 250 saham di market-summary.service.ts.

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// BUILD 002 (Refactor Domain) - dipindah dari app/api/recommendations/route.ts.
// REWRITE (2026-08-01): sebelumnya "Bandar Flow Logic Override for Sentiment" memakai
// seedRandom(ticker) MURNI (net5D/volBuy/volSell acak, deterministik per ticker tapi
// tidak pernah benar-benar mencerminkan pasar) - ditemukan saat audit permintaan
// "kriteria AI Pick" pengguna, dihapus total. Sekarang scoring komposit
// (technical+fundamental+flow, sama seperti Detail Saham/Council AI) dihitung dari
// calculateScore(), dan proxy arus dana dari modules/market/service/foreign-flow-proxy.ts
// (definisi SAMA dipakai Bandar Flow & kategori "Akumulasi Asing" di AI Pick).
// Market cap >= Rp500M ditambahkan sebagai filter keras sesuai permintaan eksplisit.
export async function analyzeStock(ticker: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: controller.signal
    }).catch(e => {
      clearTimeout(timeoutId);
      throw e;
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data = await res.json();
    const result = data.chart.result?.[0];
    if (!result) return null;

    const currentPrice = result.meta.regularMarketPrice;
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];

    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] !== null) {
        history.push({
          Date: new Date(timestamps[i] * 1000).toISOString(),
          Open: quote.open[i],
          High: quote.high[i],
          Low: quote.low[i],
          Close: quote.close[i],
          Volume: quote.volume[i]
        });
      }
    }

    if (history.length < 30) return null;

    const analyzersResult = await Promise.all([
      Promise.resolve(analyzeEma(history, currentPrice)),
      Promise.resolve(analyzeRsi(history, currentPrice)),
      Promise.resolve(analyzeMacd(history, currentPrice)),
      Promise.resolve(analyzeVolume(history, currentPrice)),
      Promise.resolve(analyzeTrend(history, currentPrice)),
      Promise.resolve(analyzeVolatility(history, currentPrice)),
      Promise.resolve(analyzeMomentum(history, currentPrice)),
      Promise.resolve(analyzeSupport(history, currentPrice)),
      Promise.resolve(analyzeSma(history, currentPrice)),
      Promise.resolve(analyzeMarketFlow(history, currentPrice))
    ]);

    let bullish = 0;
    let bearish = 0;

    analyzersResult.forEach(res => {
      if (res.decision === 'BULLISH') bullish++;
      else if (res.decision === 'BEARISH') bearish++;
    });

    const totalVotes = bullish + bearish;
    let consensus = 'NEUTRAL';
    let confidence = 0;

    if (totalVotes > 0) {
      const bullPct = (bullish / totalVotes) * 100;
      if (bullPct >= 70) { consensus = 'STRONG BUY'; confidence = bullPct; }
      else if (bullPct >= 50) { consensus = 'BUY'; confidence = bullPct; }
      else if (bullPct <= 30) { consensus = 'STRONG SELL'; confidence = 100 - bullPct; }
      else if (bullPct <= 50) { consensus = 'SELL'; confidence = 100 - bullPct; }
      else { consensus = 'HOLD'; confidence = Math.max(bullPct, 100 - bullPct); }
    }

    const prevClose = quote.close[quote.close.length - 2];
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    const volume = quote.volume[quote.volume.length - 1] || 0;

    const sentimentScore = Math.min(100, Math.max(0, 50 + (changePct * 3) + (bullish - bearish) * 2.5));
    let sentimentLabel = 'Neutral';
    if (sentimentScore >= 70) sentimentLabel = 'Sangat Positif';
    else if (sentimentScore >= 55) sentimentLabel = 'Positif';
    else if (sentimentScore <= 30) sentimentLabel = 'Sangat Negatif';
    else if (sentimentScore <= 45) sentimentLabel = 'Negatif';

    const avgVolume = history.reduce((sum, h) => sum + h.Volume, 0) / history.length;
    const volRatio = volume / (avgVolume || 1);

    let foreignFlow = 'NEUTRAL';
    if (changePct > 0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET BUY';
    else if (changePct > 0) foreignFlow = 'NET BUY';
    else if (changePct < -0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET SELL';
    else if (changePct < 0) foreignFlow = 'NET SELL';

    // Proxy akumulasi berkelanjutan - definisi SAMA dipakai Bandar Flow (/api/flow) &
    // kategori "Akumulasi Asing" di AI Pick, dihitung dari history yang sama (bukan
    // fetch tambahan).
    const dailyHistory = history.map(h => ({ date: h.Date.split('T')[0], close: h.Close, volume: h.Volume }));
    const dailyFlow = computeDailyNetFlow(dailyHistory).slice(-20);
    const foreignAccumStreak = computeAccumulationStreak(dailyFlow);

    let sector = 'Umum';
    let marketCap: number | null = null;
    let per: number | null = null;
    let pbv: number | null = null;
    let roe: number | null = null;
    let der: number | null = null;
    let currentRatio: number | null = null;
    let revenueGrowth: number | null = null;
    try {
      const quoteSummary = await yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
      });
      if (quoteSummary?.assetProfile?.sector) {
        sector = quoteSummary.assetProfile.sector;
      }
      marketCap = quoteSummary?.summaryDetail?.marketCap || quoteSummary?.defaultKeyStatistics?.marketCap || null;
      per = quoteSummary?.summaryDetail?.trailingPE || quoteSummary?.summaryDetail?.forwardPE || null;
      pbv = quoteSummary?.defaultKeyStatistics?.priceToBook || null;
      roe = quoteSummary?.financialData?.returnOnEquity != null ? quoteSummary.financialData.returnOnEquity * 100 : null;
      der = quoteSummary?.financialData?.debtToEquity != null ? quoteSummary.financialData.debtToEquity / 100 : null;
      currentRatio = quoteSummary?.financialData?.currentRatio || null;
      revenueGrowth = quoteSummary?.financialData?.revenueGrowth != null ? quoteSummary.financialData.revenueGrowth * 100 : null;
    } catch (err) {
      // Ignore errors to not break the whole recommendation scan
    }

    // Filter keras market cap >= Rp500M (permintaan eksplisit) - kalau data cap gagal
    // diambil (marketCap null), TIDAK di-exclude (jangan buang saham cuma karena satu
    // field gagal fetch), hanya di-exclude kalau angkanya diketahui pasti di bawah ambang.
    if (marketCap !== null && marketCap < MIN_MARKET_CAP) {
      return null;
    }

    const closes = history.map(h => h.Close);
    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, Math.min(200, closes.length));

    const rsiResult = analyzersResult.find((r: any) => r.label?.includes('RSI'));
    const rsiVal = rsiResult ? parseFloat(rsiResult.value?.replace('RSI: ', '') || '50') : 50;

    const macdResult = analyzersResult.find((r: any) => r.label?.includes('MACD'));
    let macdLineVal = 0, macdSigVal = 0, macdHistVal = 0;
    if (macdResult?.value) {
      const macdMatch = macdResult.value.match(/MACD: ([\-\d.]+), Sig: ([\-\d.]+), Hist: ([\-\d.]+)/);
      if (macdMatch) {
        macdLineVal = parseFloat(macdMatch[1]);
        macdSigVal = parseFloat(macdMatch[2]);
        macdHistVal = parseFloat(macdMatch[3]);
      }
    }

    const volAvg20 = closes.length >= 20
      ? history.slice(-20).reduce((s, h) => s + h.Volume, 0) / 20
      : avgVolume;

    const scoring = calculateScore(
      ticker.replace('.JK', ''),
      {
        currentPrice,
        ma20: ma20 ?? 0,
        ma50: ma50 ?? 0,
        ma200: ma200 ?? 0,
        rsi: rsiVal,
        macdHist: macdHistVal,
        macdLine: macdLineVal,
        macdSignal: macdSigVal,
        volToday: volume,
        volAvg20,
      },
      { per, pbv, roe, der, currentRatio, revenueGrowth },
      {
        foreignFlow,
        consecutiveBuyDays: foreignFlow.includes('BUY') ? foreignAccumStreak : 0,
        consecutiveSellDays: 0,
        volRatio,
      },
    );

    return {
      ticker: ticker.replace('.JK', ''),
      sector: sector,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      volume: volume,
      consensus,
      confidence: parseFloat(confidence.toFixed(0)),
      bullishVotes: bullish,
      bearishVotes: bearish,
      sentimentScore: parseFloat(sentimentScore.toFixed(0)),
      sentimentLabel,
      foreignFlow,
      // Baru (2026-08-01) - kriteria fundamental/valuasi/market cap yang diminta eksplisit,
      // dihitung dari scoring engine yang sama dipakai Detail Saham/Council AI.
      marketCap,
      fundamentalScore: scoring.fundamental_score,
      valuationScore: scoring.detail.valuasi,
      totalScore: scoring.total_score,
      scoringKategori: scoring.kategori,
      foreignAccumStreak,
    };
  } catch (e) {
    return null;
  }
}
