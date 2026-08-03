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
  calculateConsensus,
} from '@/modules/technical';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal, analyzeBandarmology } from '@/modules/market';
import { estimateFullDayVolume, isIdxMarketHoursNow, todayDateKeyWIB } from '@/shared/market/trading-session';

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
    // AdjClose (disesuaikan dividen, temuan M-01 - lihat yahoo-history.service.ts).
    const adjcloseArr: (number | null)[] | undefined = result.indicators.adjclose?.[0]?.adjclose;

    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] !== null) {
        const adj = adjcloseArr?.[i];
        history.push({
          Date: new Date(timestamps[i] * 1000).toISOString(),
          Open: quote.open[i],
          High: quote.high[i],
          Low: quote.low[i],
          Close: quote.close[i],
          Volume: quote.volume[i],
          AdjClose: typeof adj === 'number' ? adj : quote.close[i],
        });
      }
    }

    if (history.length < 30) return null;

    // BUG FIX (audit integritas data 2026-08-03, temuan M-02): bar terakhir selama jam
    // bursa masih volume PARSIAL (baru sebagian sesi terkumpul) - dibandingkan mentah
    // dengan rata-rata harian PENUH di bawah (avgVolume/volRatio), rasio volume bias ke
    // bawah sepanjang hari. Array terpisah dipakai KHUSUS untuk analyzer yang membaca
    // Volume (analyzeVolume/analyzeMarketFlow) - lihat shared/market/trading-session.ts
    // dan pola yang sama di app/api/stock/[ticker]/route.ts.
    const lastBar = history[history.length - 1];
    const isLiveFormingBar = !!lastBar && lastBar.Date.split('T')[0] === todayDateKeyWIB() && isIdxMarketHoursNow();
    const volumeAdjustedHistory = isLiveFormingBar
      ? [...history.slice(0, -1), { ...lastBar, Volume: estimateFullDayVolume(lastBar.Volume) }]
      : history;

    const analyzersResult = await Promise.all([
      Promise.resolve(analyzeEma(history, currentPrice)),
      Promise.resolve(analyzeRsi(history, currentPrice)),
      Promise.resolve(analyzeMacd(history, currentPrice)),
      Promise.resolve(analyzeVolume(volumeAdjustedHistory, currentPrice)),
      Promise.resolve(analyzeTrend(history, currentPrice)),
      Promise.resolve(analyzeVolatility(history, currentPrice)),
      Promise.resolve(analyzeMomentum(history, currentPrice)),
      Promise.resolve(analyzeSupport(history, currentPrice)),
      Promise.resolve(analyzeSma(history, currentPrice)),
      Promise.resolve(analyzeMarketFlow(volumeAdjustedHistory, currentPrice))
    ]);

    // BUG FIX (audit integritas data 2026-08-03, temuan M-04): blok ini SEBELUMNYA
    // menghitung ULANG persentase vote bullish/bearish dari 10 analyzer yang SAMA
    // persis dipakai calculateConsensus() (modules/technical/service/consensus.service.ts)
    // - tapi dengan ambang batas BERBEDA (70/50/30 di sini vs 80/60 di sana) untuk
    // KUANTITAS YANG IDENTIK (persentase vote). Akibatnya saham yang sama bisa
    // dilabeli "STRONG BUY" di halaman Rekomendasi (cukup 70% vote bullish) tapi cuma
    // "BUY" di halaman Detail Saham (butuh 80%) - bukan karena datanya beda, murni
    // karena dua salinan logika yang lupa disinkronkan. Dihapus, dipanggil satu fungsi
    // yang sama supaya kedua halaman selalu sepakat untuk saham yang sama.
    const consensusVote = calculateConsensus(analyzersResult);
    const bullish = consensusVote.bull_count;
    const bearish = consensusVote.bear_count;
    const consensus = consensusVote.kategori;
    const confidence = consensus.includes('SELL')
      ? consensusVote.bear_pct
      : consensus === 'HOLD'
        ? Math.max(consensusVote.bull_pct, consensusVote.bear_pct)
        : consensusVote.bull_pct;

    const prevClose = quote.close[quote.close.length - 2];
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    // Volume yang SUDAH disesuaikan (lihat volumeAdjustedHistory di atas, temuan M-02) -
    // dipakai konsisten untuk volRatio/avgVolume di bawah, sama seperti analyzeVolume/
    // analyzeMarketFlow di atas.
    const volume = volumeAdjustedHistory[volumeAdjustedHistory.length - 1]?.Volume || 0;

    const sentimentScore = Math.min(100, Math.max(0, 50 + (changePct * 3) + (bullish - bearish) * 2.5));
    let sentimentLabel = 'Neutral';
    if (sentimentScore >= 70) sentimentLabel = 'Sangat Positif';
    else if (sentimentScore >= 55) sentimentLabel = 'Positif';
    else if (sentimentScore <= 30) sentimentLabel = 'Sangat Negatif';
    else if (sentimentScore <= 45) sentimentLabel = 'Negatif';

    const avgVolume = history.reduce((sum, h) => sum + h.Volume, 0) / history.length;
    const volRatio = volume / (avgVolume || 1);

    // BUG FIX (audit integritas data 2026-08-03, temuan H-03): `foreignFlow` di sini
    // SEBELUMNYA murni arah perubahan harga hari ini (`changePct`/`volRatio`) yang
    // di-relabel "STRONG NET BUY/SELL" - tidak ada komponen arus dana sama sekali,
    // persis logika biner yang sudah ditinggalkan di foreign-flow-proxy.ts (lihat
    // komentar di file itu: "sebelumnya netValueBillion cuma biner ... Diganti Chaikin
    // Money Flow"). Rewrite itu tidak pernah sampai ke sini, sehingga saham yang cuma
    // naik harga (bukan berdasar posisi close dalam range/volume) diklaim "Asing STRONG
    // NET BUY" ke calculateScore() dan ke Council AI. Disamakan sekarang dengan
    // app/api/stock/[ticker]/route.ts: status dari analyzeAccumulationSignal (CMF20 +
    // CLV 3 hari + volume spike + tren MFM, konfirmasi 4-lapis), bukan arah harga.
    const dailyHistory = history.map(h => ({ date: h.Date.split('T')[0], high: h.High, low: h.Low, close: h.Close, volume: h.Volume }));
    const dailyFlow = computeDailyNetFlow(dailyHistory).slice(-20);
    const buyStreak = computeAccumulationStreak(dailyFlow);
    let sellStreak = 0;
    for (let i = dailyFlow.length - 1; i >= 0; i--) {
      if (dailyFlow[i].netValueBillion < 0) sellStreak++;
      else break;
    }
    const accumulation = analyzeAccumulationSignal(dailyHistory.slice(-20));
    // Dari history yang sama (bukan fetch tambahan) - dikirim ke scoreBandar() sebagai
    // dimensi terpisah dari volRatio/foreignFlow, lihat temuan H-07 di audit.
    const bandarmology = analyzeBandarmology(dailyHistory.slice(-20));

    let foreignFlow: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
    if (accumulation.status === 'AKUMULASI') foreignFlow = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
    else if (accumulation.status === 'DISTRIBUSI') foreignFlow = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';

    const foreignAccumStreak = buyStreak;

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
        modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'price']
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

      // BUG FIX (audit integritas data 2026-08-03, temuan C-07): defaultKeyStatistics
      // .priceToBook untuk emiten pelapor USD (ADRO, ITMG, dst.) membandingkan harga IDR
      // dengan book value USD mentah - diverifikasi empiris menghasilkan PBV s/d 14.529x
      // (seharusnya ~0,89x). Nilai ini langsung mempengaruhi scoreValuasi() di
      // calculateScore() - saham yang diperdagangkan DI BAWAH nilai buku dilabeli
      // "premium" dan kehilangan skor valuasi. Dikoreksi dengan pola yang sama seperti
      // modules/fundamental/service/dcf-valuation.service.ts: hitung ulang PBV dari
      // bookValue x kurs USD/IDR untuk emiten yang mismatch mata uangnya.
      const priceCurrency = quoteSummary?.price?.currency || 'IDR';
      const finCurrencyForPbv = quoteSummary?.financialData?.financialCurrency || 'IDR';
      const bookValueRaw = quoteSummary?.defaultKeyStatistics?.bookValue;
      if (priceCurrency === 'IDR' && finCurrencyForPbv === 'USD' && bookValueRaw) {
        try {
          const fx = await yahooFinance.quote('USDIDR=X');
          const rate = fx?.regularMarketPrice || 15500;
          pbv = currentPrice / (bookValueRaw * rate);
        } catch {
          pbv = null; // kurs gagal diambil - lebih baik N/A daripada PBV yang salah satuan
        }
      }
    } catch (err) {
      // Ignore errors to not break the whole recommendation scan
    }

    // Filter keras market cap >= Rp500M (permintaan eksplisit) - kalau data cap gagal
    // diambil (marketCap null), TIDAK di-exclude (jangan buang saham cuma karena satu
    // field gagal fetch), hanya di-exclude kalau angkanya diketahui pasti di bawah ambang.
    if (marketCap !== null && marketCap < MIN_MARKET_CAP) {
      return null;
    }

    // AdjClose (temuan M-01) - konsisten dengan analyzer tren di atas (analyzeEma/
    // analyzeTrend/dst. yang menerima `history` yang sama dan sudah membaca AdjClose).
    const closes = history.map(h => h.AdjClose ?? h.Close);
    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, Math.min(200, closes.length));

    // BUG FIX (audit integritas data 2026-08-03, temuan M-03): sama seperti app/api/stock/
    // [ticker]/route.ts - dulu parse string `value`, sekarang pakai `raw` (angka asli).
    const rsiResult = analyzersResult.find((r: any) => r.label?.includes('RSI')) as any;
    const rsiVal = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : 50;

    const macdResult = analyzersResult.find((r: any) => r.label?.includes('MACD')) as any;
    const macdLineVal = typeof macdResult?.raw?.macdLine === 'number' ? macdResult.raw.macdLine : 0;
    const macdSigVal = typeof macdResult?.raw?.macdSignal === 'number' ? macdResult.raw.macdSignal : 0;
    const macdHistVal = typeof macdResult?.raw?.macdHist === 'number' ? macdResult.raw.macdHist : 0;

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
        consecutiveBuyDays: buyStreak,
        consecutiveSellDays: sellStreak,
        volRatio,
        cmf20: bandarmology.cmf20,
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
