import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
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
import { getSession, checkProAccessLive } from '@/modules/user';
import { evaluateMinimalEligibility, toAdvisoryDecision } from '@/modules/eligibility';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeBandarmology, analyzeAccumulationSignal } from '@/modules/market';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { recordAnalisaHit } from '@/lib/serverStats';
import { FREE_LIMITS } from '@/lib/limits';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import { peekDailyAnalisaUsed, recordDailyAnalisa, getUsedSymbolsToday } from '@/shared/usage/daily-analisa-quota';
import { classifyFreshness } from '@/shared/http/freshness';
import { correctPbvForUsdReporter } from '@/shared/market/usd-idr-rate';
import { estimateFullDayVolume, isIdxMarketHoursNow, todayDateKeyWIB } from '@/shared/market/trading-session';
import { PRICE_ADJUSTMENT_VERSION, RETURN_PRICE_BASIS } from '@/shared/market/price-basis';
import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// Redis (Cache Layer Tier 2 Technical), bukan lagi Map in-memory - temuan H3/M10
// lama: Map per-instance tidak konsisten lintas instance serverless dan tidak
// pernah membersihkan entry basi (memory leak lambat). Kalau Redis belum
// dikonfigurasi / sedang down, cacheGet/cacheSet degrade aman ke cache-miss/no-op
// (lihat shared/cache/redis-cache.ts) - endpoint tetap jalan, cuma tanpa cache.
const CACHE_TTL_SEC = TTL.TECHNICAL;

// Kuota TIDAK ikut disimpan di cacheKey (dia dibagi semua requester, lintas user) -
// dicatat & ditempel terpisah setiap kali payload (cache hit ATAU compute baru)
// benar-benar dikembalikan ke user non-Pro, supaya "sisa jatah hari ini" akurat
// per user, bukan ikut ke-cache dari user pertama yang memicu komputasi.
async function withQuotaInfo(payload: any, ticker: string, userId: string | undefined, hasPro: boolean, isInternal: boolean) {
  if (hasPro || isInternal || !userId) return payload;
  await recordDailyAnalisa(userId, ticker);
  const used = await peekDailyAnalisaUsed(userId);
  const usedSymbols = await getUsedSymbolsToday(userId);
  return { ...payload, _quota: { used, limit: FREE_LIMITS.analisaPerHari, remaining: Math.max(0, FREE_LIMITS.analisaPerHari - used), usedSymbols } };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker: rawTicker } = await params;
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();
    if (!isInternal && !session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const hasPro = isInternal ? true : await checkProAccessLive(session);
    if (!hasPro) {
      // Bukan langsung 402 - user gratis dapat jatah FREE_LIMITS.analisaPerHari/hari
      // dulu (dulu di sini blok total di percobaan PERTAMA, lihat catatan di
      // shared/usage/daily-analisa-quota.ts). session pasti ada di titik ini (baris
      // di atas sudah 401 kalau tidak).
      const used = await peekDailyAnalisaUsed(session!.id);
      if (used >= FREE_LIMITS.analisaPerHari) {
        // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
        const usedSymbols = await getUsedSymbolsToday(session!.id);
        return NextResponse.json(
          { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED', usedToday: used, limit: FREE_LIMITS.analisaPerHari, usedSymbols },
          { status: 402 }
        );
      }
    }
    let ticker = rawTicker.toUpperCase();
    if (!ticker.includes('.')) {
      ticker = `${ticker}.JK`;
    }

    if (!isInternal) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
      recordAnalisaHit(ip, ticker);
    }

    // Parameter range OPSIONAL (Performance Roadmap Fase 2 poin 7, samakan pola
    // dengan public-chart/[ticker]) - default TETAP 20y kalau tidak diisi, supaya
    // caller lama (dashboard/portfolio yang belum kirim ?range=) tidak berubah
    // perilakunya. Caller baru bisa minta rentang lebih kecil = payload lebih kecil.
    const ALLOWED_RANGES = new Set(['1mo', '3mo', '6mo', '1y', '3y', '5y', '20y']);
    const requestUrl = new URL(request.url);
    const rangeParam = requestUrl.searchParams.get('range');
    const range = rangeParam && ALLOWED_RANGES.has(rangeParam) ? rangeParam : '20y';

    const cacheKey = `sahamlens:cache:computed:technical:${ticker}:${range}`;
    // Key kedua, TTL jauh lebih panjang - HANYA dibaca kalau fetch Yahoo gagal
    // (lihat blok catch di bawah). Mempertahankan perilaku lama: lebih baik
    // sajikan data basi (bisa >3 menit) daripada error keras saat Yahoo down,
    // yang hilang kalau cuma mengandalkan TTL pendek cacheKey di atas.
    const staleFallbackKey = `sahamlens:cache:computed:technical-stale-fallback:${ticker}:${range}`;

    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(await withQuotaInfo(cached, ticker, session?.id, hasPro, isInternal));
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
    
    // Add timeout to prevent infinite spinning if Yahoo hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const chartPromise = fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: controller.signal
    }).then(res => {
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('Failed to fetch Yahoo data');
      return res.json();
    }).catch((e: any) => {
      clearTimeout(timeoutId);
      throw e;
    });

    const quotePromise = Promise.race([
      yahooFinance.quoteSummary(ticker, {
        modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'price']
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('quoteSummary timeout')), 8000))
    ]).catch((e: any) => {
      console.warn("Failed to fetch fundamental data for scoring:", e);
      return null;
    });

    let data, quoteSummary;
    try {
      [data, quoteSummary] = await Promise.all([chartPromise, quotePromise]);
    } catch (error) {
      const stale = await cacheGet<any>(staleFallbackKey);
      if (stale) {
        console.warn(`yfinance fetch failed, returning stale fallback cache for ${ticker}`);
        // BUG FIX (audit integritas data 2026-08-03, temuan M-06): payload basi ini
        // (bisa berumur s/d 24 jam, lihat TTL.STALE_FALLBACK) SEBELUMNYA dikembalikan
        // dengan bentuk IDENTIK dengan data segar - tidak ada penanda apa pun yang
        // membedakan "harga hari ini" dari "harga terakhir yang berhasil diambil,
        // mungkin kemarin/minggu lalu". Ditambahkan `_meta` supaya UI/pemanggil bisa
        // menampilkan peringatan kesegaran, bukan diam-diam menyajikan data lama
        // seolah terkini.
        const staleComputedAt = stale?._meta?.computedAt;
        const stalePayload = {
          ...stale,
          _meta: {
            ...(stale?._meta || {}),
            source: 'stale-cache',
            staleReason: 'Yahoo Finance fetch gagal - menyajikan data terakhir yang berhasil diambil',
            ageSeconds: staleComputedAt ? Math.round((Date.now() - new Date(staleComputedAt).getTime()) / 1000) : null,
          },
        };
        return NextResponse.json(await withQuotaInfo(stalePayload, ticker, session?.id, hasPro, isInternal));
      }
      return NextResponse.json({ error: 'Failed to fetch Yahoo data' }, { status: 500 });
    }

    const result = data.chart.result?.[0];
    if (!result) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }

    const currentPrice = isFinitePositive(result.meta?.regularMarketPrice) ? result.meta.regularMarketPrice : null;
    if (currentPrice == null) {
      return NextResponse.json({ error: 'Harga pasar tidak tersedia' }, { status: 503 });
    }
    
    // Extract Fundamental Data
    let per = null, pbv = null, roe = null, der = null, currentRatio = null, revenueGrowth = null;
    if (quoteSummary) {
      per = quoteSummary.summaryDetail?.trailingPE ?? quoteSummary.summaryDetail?.forwardPE ?? null;
      pbv = quoteSummary.defaultKeyStatistics?.priceToBook ?? null;
      // BUG FIX (audit integritas data 2026-08-03, temuan C-05): Yahoo mengembalikan
      // returnOnEquity/revenueGrowth sebagai FRAKSI (0.218 = 21.8%) dan debtToEquity
      // sebagai PERSEN/rasio x100 (59.98 = 0.60x) - field ini diteruskan MENTAH ke
      // calculateScore(), padahal kontrak FundamentalInput (scoring.service.ts) eksplisit
      // menyatakan "roe: already in % (e.g. 18.2)" dan "der: ratio (e.g. 0.4)". Akibatnya
      // ROE 21.8% terbaca sebagai 0.22% ("lemah") dan DER 0.60x terbaca sebagai 59.98x
      // ("berisiko tinggi") - kebalikan dari kenyataan. Modul lain di aplikasi ini
      // (screener.service.ts, recommendation.service.ts, roe-analyzer.ts, der-analyzer.ts)
      // sudah melakukan konversi ini dengan benar - disamakan di sini.
      roe = quoteSummary.financialData?.returnOnEquity != null ? quoteSummary.financialData.returnOnEquity * 100 : null;
      der = quoteSummary.financialData?.debtToEquity != null ? quoteSummary.financialData.debtToEquity / 100 : null;
      currentRatio = quoteSummary.financialData?.currentRatio ?? null;
      revenueGrowth = quoteSummary.financialData?.revenueGrowth != null ? quoteSummary.financialData.revenueGrowth * 100 : null;

      // BUG FIX (audit integritas data 2026-08-03, temuan C-07): priceToBook mentah untuk
      // emiten pelapor USD membandingkan harga IDR dengan book value USD.
      // BUG FIX (audit 2026-08-05, temuan H-6): koreksinya dulu memakai kurs cadangan
      // hardcoded `|| 15500`. Sekarang lewat helper bersama yang mengembalikan null kalau
      // kurs benar-benar tidak tersedia (shared/market/usd-idr-rate.ts).
      pbv = await correctPbvForUsdReporter({
        priceCurrency: quoteSummary.price?.currency,
        financialCurrency: quoteSummary.financialData?.financialCurrency,
        bookValue: quoteSummary.defaultKeyStatistics?.bookValue,
        price: currentPrice,
        rawPbv: pbv,
      });
    }
    
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    // AdjClose dari Yahoo `indicators.adjclose` - dipakai analyzer tren
    // (EMA/MACD/RSI/MA/Momentum/Market Flow) supaya hari ex-dividend tidak terbaca
    // sebagai sinyal bearish murni dari pasar. `Close` TETAP dipakai apa adanya untuk
    // stock.history (candlestick yang ditampilkan ke pengguna) dan support/resistance.
    // FASE 3: tidak ada fallback AdjClose -> Close. Missing adjusted price membuat
    // indikator return-based N/A/fail-closed.
    const adjcloseArr: (number | null)[] | undefined = result.indicators.adjclose?.[0]?.adjclose;

    // Convert to history array for analyzers
    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i];
      if (
        isFiniteNumber(timestamp) &&
        isFiniteNumber(open) &&
        isFiniteNumber(high) &&
        isFiniteNumber(low) &&
        isFinitePositive(close) &&
        isFiniteNonNegative(volume) &&
        high >= low
      ) {
        const adj = adjcloseArr?.[i];
        history.push({
          Date: new Date(timestamp * 1000).toISOString(),
          Open: open,
          High: high,
          Low: low,
          Close: close,
          Volume: volume,
          ...(isFinitePositive(adj) ? { AdjClose: adj } : {}),
        });
      }
    }

    // Window 200 hari terakhir untuk analyzer/scoring (Performance Roadmap Fase 2
    // poin 6) - indikator standar (RSI/MACD/EMA/dst.) tidak butuh histori 20 tahun
    // penuh, cukup ~200 hari. `history` PENUH tetap dipakai apa adanya untuk
    // `stock.history` di response (data chart, beda kebutuhan dari analyzer).
    const ANALYZER_HISTORY_DAYS = 200;
    const analyzerHistory = history.slice(-ANALYZER_HISTORY_DAYS);

    // BUG FIX (audit integritas data 2026-08-03, temuan M-02): kalau bar terakhir adalah
    // bar HARI INI dan bursa sedang buka SEKARANG, volume-nya masih PARSIAL (baru
    // sebagian sesi terkumpul) - dibandingkan mentah dengan rata-rata 20 hari PENUH,
    // rasio volume bias ke bawah sepanjang jam bursa (lihat shared/market/trading-session.ts).
    // Array TERPISAH (bukan menimpa `analyzerHistory` asli) dibuat khusus untuk analyzer
    // yang memakai Volume (analyzeVolume, analyzeMarketFlow) - analyzer lain (RSI/MACD/
    // EMA/dst, yang cuma pakai Close/High/Low) tetap memakai `analyzerHistory` asli tanpa
    // perubahan. `modules/technical/service/analyzers/*.ts` SENGAJA tidak disentuh -
    // fungsi itu dipakai ulang oleh backtest/precompute atas bar HISTORIS yang sudah
    // closed, bukan cuma live, jadi estimasi ini HARUS diterapkan di titik pemanggilan
    // (di sini), bukan di dalam analyzer bersama.
    const lastBar = analyzerHistory[analyzerHistory.length - 1];
    const isLiveFormingBar = !!lastBar && lastBar.Date.split('T')[0] === todayDateKeyWIB() && isIdxMarketHoursNow();
    const volumeAdjustedHistory = isLiveFormingBar
      ? [...analyzerHistory.slice(0, -1), { ...lastBar, Volume: estimateFullDayVolume(lastBar.Volume) }]
      : analyzerHistory;

    // Run all 10 analyzers
    const analyzersResult = await Promise.all([
      Promise.resolve(analyzeEma(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeRsi(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeMacd(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeVolume(volumeAdjustedHistory, currentPrice)),
      Promise.resolve(analyzeTrend(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeVolatility(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeMomentum(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeSupport(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeSma(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeMarketFlow(volumeAdjustedHistory, currentPrice))
    ]);

    // === FOREIGN FLOW (ESTIMASI): proxy dari harga+volume Yahoo Finance yang REAL ===
    // Sebelumnya seedRandom(ticker) murni - angka yang SELALU SAMA untuk ticker yang
    // sama, tidak pernah mencerminkan pergerakan pasar (ditemukan saat audit dummy-data
    // 2026-08-01, pola identik dengan yang sudah diperbaiki di app/api/flow/[ticker]).
    // IDX tidak menyediakan feed broker asing gratis, jadi ini tetap PROXY (bukan data
    // broker sungguhan) - dihitung dari computeDailyNetFlow (modules/market), sama
    // seperti /api/flow/[ticker] dan kategori "Akumulasi Asing" di AI Pick, supaya
    // ketiga fitur konsisten satu sama lain.
    const flowHistory = analyzerHistory.map((h: any) => ({
      date: h.Date.split('T')[0],
      high: h.High,
      low: h.Low,
      close: h.Close,
      volume: h.Volume,
    }));
    const dailyFlow = computeDailyNetFlow(flowHistory).slice(-20);
    const net5D = dailyFlow.slice(-5).reduce((sum, d) => sum + d.netValueBillion, 0);
    const buyStreak = computeAccumulationStreak(dailyFlow);
    let sellStreak = 0;
    for (let i = dailyFlow.length - 1; i >= 0; i--) {
      if (dailyFlow[i].netValueBillion < 0) sellStreak++;
      else break;
    }
    // Dulu "3 hari netValue positif berturut-turut" saja - gampang lolos meski
    // sinyalnya lemah. Diganti konfirmasi 4-lapis (CMF20 + CLV kuat 3 hari + volume
    // spike + tren MFM menguat), lihat analyzeAccumulationSignal di foreign-flow-proxy.ts.
    const accumulation = analyzeAccumulationSignal(flowHistory.slice(-20));
    const isAccumulation3D = accumulation.status === 'AKUMULASI';
    const isDistribution3D = accumulation.status === 'DISTRIBUSI';

    // Status kanonik dikonsumsi calculateScore (FlowInput.foreignFlow) - lihat
    // modules/technical/service/scoring.service.ts untuk 5 nilai yang diharapkan.
    let foreignFlowStatus: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
    let ffDecision = 'NEUTRAL';
    let ffConfidence = 50;
    if (isAccumulation3D) {
      foreignFlowStatus = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
      ffDecision = 'BULLISH';
      ffConfidence = buyStreak >= 4 ? 80 : 65;
    } else if (isDistribution3D) {
      foreignFlowStatus = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';
      ffDecision = 'BEARISH';
      ffConfidence = sellStreak >= 4 ? 80 : 65;
    }
    const foreignFlow = `${foreignFlowStatus} | Net 5D: ${net5D >= 0 ? '+' : ''}${net5D.toFixed(2)}M | Streak: ${buyStreak > 0 ? `${buyStreak}D akumulasi` : sellStreak > 0 ? `${sellStreak}D distribusi` : 'netral'}`;

    const consecutiveBuyDays = buyStreak;
    const consecutiveSellDays = sellStreak;

    analyzersResult.push({
      label: 'LensFlow (Estimasi Arus Dana Asing)',
      value: foreignFlow,
      decision: ffDecision,
      confidence: ffConfidence
    });

    // Bandarmology (Chaikin Money Flow) - definisi SAMA dipakai Screener & Bandar Flow
    // (modules/market/service/foreign-flow-proxy.ts), dari flowHistory yang sudah
    // dihitung di atas untuk Foreign Flow (bukan fetch/hitung ulang).
    const bandarmology = analyzeBandarmology(flowHistory.slice(-20));
    const bandarmologyDecision = bandarmology.status === 'BULLISH' ? 'BULLISH' : bandarmology.status === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
    const bandarmologyConfidence = Math.round(50 + Math.min(45, Math.abs(bandarmology.cmf20)));
    analyzersResult.push({
      label: 'Bandarmology (CMF)',
      value: `CMF20: ${bandarmology.cmf20 > 0 ? '+' : ''}${bandarmology.cmf20}% | Tekanan: ${bandarmology.netPressurePct > 0 ? '+' : ''}${bandarmology.netPressurePct}%`,
      decision: bandarmologyDecision,
      confidence: bandarmologyConfidence,
      // `raw` (angka asli, pola temuan M-03) - dipakai header chart di app/dashboard
      // untuk menampilkan Money Flow yang BENAR-BENAR dihitung (temuan C-1/C-2),
      // tanpa mem-parse string `value` yang diformat untuk tampilan.
      raw: { cmf20: bandarmology.cmf20, netPressurePct: bandarmology.netPressurePct, status: bandarmology.status },
    } as any);

    let bullish = 0;
    let bearish = 0;
    // Anotasi `any` - analyzersResult sekarang berisi analyzer dengan bentuk `raw` yang
    // beda-beda per indikator (ema20/ema50 vs rsi vs macdLine/Signal/Hist vs atr, lihat
    // temuan M-03) - TS akan mencoba menyatukan tipe literal semuanya kalau tidak
    // dilonggarkan di sini, padahal field yang benar-benar dipakai (decision/confidence)
    // sama di semua analyzer.
    let bestPerformer: any = analyzersResult[0];

    analyzersResult.forEach(res => {
      if (res.decision === 'BULLISH') bullish++;
      else if (res.decision === 'BEARISH') bearish++;

      if (res.confidence > bestPerformer.confidence) {
        bestPerformer = res;
      }
    });

    const totalVotes = bullish + bearish;
    
    // === CONSENSUS ENGINE: Median + Voting ===
    const consensusData = calculateConsensus(analyzersResult);
    const consensus = consensusData.konsensus;

    // === SCORING ENGINE: Hitung skor komposit 0-100 ===
    // FASE 3: MA scoring memakai adjusted close eksplisit dan current adjusted dari
    // bar terakhir. Jangan membandingkan MA adjusted dengan regularMarketPrice raw.
    const adjustedCloses = analyzerHistory.every((h: any) => isFinitePositive(h.AdjClose))
      ? analyzerHistory.map((h: any) => h.AdjClose as number)
      : null;
    const currentAdjustedPrice = adjustedCloses ? adjustedCloses[adjustedCloses.length - 1] : null;
    // BUG FIX (audit logika & algoritma 2026-08-05, temuan H-2): ketiganya SEBELUMNYA
    // dibagi `Math.min(period, closes.length)` - saham dengan 60 bar menghasilkan
    // rata-rata 60 hari yang tetap diberi nama MA200, lalu dipakai membuat klaim
    // "Uptrend sempurna P > MA20 > MA50 > MA200" ke pengguna. Sekarang null kalau bar
    // belum cukup; scoring engine memperlakukan null sebagai data tidak tersedia.
    const maOf = (period: number): number | null =>
      adjustedCloses && adjustedCloses.length >= period ? adjustedCloses.slice(-period).reduce((a, b) => a + b, 0) / period : null;
    const ma20 = maOf(20);
    const ma50 = maOf(50);
    const ma200v = maOf(200);

    // BUG FIX (audit integritas data 2026-08-03, temuan M-03): sebelumnya nilai RSI/MACD
    // diambil kembali dengan mem-parse string `value` yang diformat untuk tampilan
    // (regex/replace) - kalau format berubah atau analyzer mengembalikan 'N/A', kegagalan
    // parse DIAM-DIAM menghasilkan NaN/0 yang mengalir ke scoring tanpa error terlihat.
    // Sekarang pakai `raw` (angka asli) yang disediakan analyzer, tanpa parsing string.
    //
    // BUG FIX (audit logika & algoritma 2026-08-05, temuan C-7): fallback `: 50` untuk RSI
    // dan `: 0` untuk MACD dihapus. RSI 50 jatuh PERSIS di pita "zona BUY ideal" (+8 dari
    // 15 poin), jadi saham yang RSI-nya gagal dihitung justru DIHADIAHI skor teknikal -
    // pola yang sama persis dengan temuan H-04 yang sudah diperbaiki di scoreAsing().
    // `null` sekarang membuat komponen itu dikeluarkan dari skor & bobotnya dinormalisasi.
    const rsiResult = analyzersResult.find((r: any) => r.label?.includes('RSI')) as any;
    const rsiVal = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : null;

    const macdResult = analyzersResult.find((r: any) => r.label?.includes('MACD')) as any;
    const macdLineVal = typeof macdResult?.raw?.macdLine === 'number' ? macdResult.raw.macdLine : null;
    const macdSigVal = typeof macdResult?.raw?.macdSignal === 'number' ? macdResult.raw.macdSignal : null;
    const macdHistVal = typeof macdResult?.raw?.macdHist === 'number' ? macdResult.raw.macdHist : null;

    // volToday dipakai untuk scoring engine di bawah - pakai bar yang SUDAH disesuaikan
    // (volumeAdjustedHistory, dibangun di atas dekat analyzerHistory) kalau bar terakhir
    // adalah bar hari ini yang masih berjalan, sama seperti yang dipakai analyzeVolume/
    // analyzeMarketFlow, supaya scoring engine & vote analyzer konsisten satu sama lain.
    const volToday = isLiveFormingBar ? volumeAdjustedHistory[volumeAdjustedHistory.length - 1]?.Volume : lastBar?.Volume;
    const volWindow = analyzerHistory.slice(-20);
    const volAvg20v = volWindow.length > 0 && volWindow.every((h) => isFiniteNonNegative(h.Volume))
      ? volWindow.reduce((s, h) => s + h.Volume, 0) / volWindow.length
      : null;

    const scoringResult = calculateScore(
      ticker,
      {
        currentPrice,
        currentRawPrice: currentPrice,
        currentAdjustedPrice,
        currentPriceBasis: currentAdjustedPrice == null ? 'UNKNOWN' : RETURN_PRICE_BASIS,
        maPriceBasis: adjustedCloses == null ? 'UNKNOWN' : RETURN_PRICE_BASIS,
        adjustmentVersion: PRICE_ADJUSTMENT_VERSION,
        corporateActionStatus: 'NONE',
        ma20,
        ma50,
        ma200: ma200v,
        rsi: rsiVal,
        macdHist: macdHistVal,
        macdLine: macdLineVal,
        macdSignal: macdSigVal,
        volToday: isFiniteNonNegative(volToday) ? volToday : null,
        volAvg20: volAvg20v,
        // P1-8: volume tinggi hanya bernilai kalau MENGONFIRMASI arah harga. Tanpa
        // field ini, saham yang anjlok dengan volume 3x dulu mendapat nilai volume
        // sempurna - sama dengan saham yang breakout naik dengan volume 3x.
        changePct: typeof result.meta?.regularMarketChangePercent === 'number'
          ? result.meta.regularMarketChangePercent * 100
          : null,
      },
      {
        per, pbv, roe, der, currentRatio, revenueGrowth,
        // P1-10/P1-11/P1-12: valuasi & kesehatan neraca dinilai menurut sektor dan
        // risiko emiten ini, bukan ambang tunggal untuk seluruh IDX.
        sector: {
          yahooSector: quoteSummary?.assetProfile?.sector ?? null,
          yahooIndustry: quoteSummary?.assetProfile?.industry ?? null,
          payoutRatio: quoteSummary?.summaryDetail?.payoutRatio ?? null,
          // Beta tidak dihitung di route ini (butuh histori IHSG - satu fetch tambahan
          // per request). null = pakai beta acuan sektor, dan itu dinyatakan di keluaran
          // valuasi lewat `betaSource`.
          beta: null,
        },
      },
      {
        // Arus dana dinilai SEKALI sebagai satu kelompok (besaran CMF20 + persistensi
        // streak) - lihat temuan H-1 di modules/technical/service/scoring.service.ts.
        // `foreignFlowStatus` TIDAK lagi dikirim sebagai input skor terpisah karena ia
        // sendiri turunan dari cmf20 yang sama (analyzeAccumulationSignal), jadi dulu
        // satu angka dihitung dua kali. Status itu tetap dipakai untuk label UI di bawah.
        cmf20: bandarmology.cmf20,
        accumulationStatus: accumulation.status,
        consecutiveBuyDays,
        consecutiveSellDays,
        volRatio: isFiniteNonNegative(volToday) && isFinitePositive(volAvg20v) ? volToday / volAvg20v : null,
        // P1-9: persistensi diukur atas jendela 20 hari, bukan panjang streak.
        mfmPositiveRatio20: accumulation.mfmPositiveRatio20,
      }
    );

    // === GERBANG KELAYAKAN MINIMAL (Phase 0 / P0-3) ===
    // Dijalankan atas `history` PENUH (bukan `analyzerHistory` yang sudah dipotong 200
    // bar) supaya jumlah bar yang dilaporkan adalah jumlah bar yang benar-benar dimiliki
    // saham ini, bukan hasil pemotongan kita sendiri.
    //
    // CATATAN PENTING: kalau pemanggil meminta `?range` pendek (mis. 1mo), histori yang
    // tersedia memang kurang dari 200 bar dan gerbang G1 akan aktif - rekomendasi tidak
    // diberikan. Itu DISENGAJA (fail-closed): kelayakan tidak boleh disimpulkan dari
    // data yang tidak kita punya. Seluruh pemanggil di aplikasi ini memakai default 20y.
    //
    // `scoring` v1 di bawah TIDAK diubah sama sekali - halaman lama tetap membaca
    // `scoring.total_score`/`scoring.kategori` seperti sebelumnya. Yang ditambahkan
    // adalah `eligibility` + `decision`, dan `decision.action` itulah satu-satunya
    // field yang boleh dibaca sebagai ajakan bertindak.
    const eligibility = evaluateMinimalEligibility({
      ticker,
      asOf: todayDateKeyWIB(),
      bars: history.map((h: any) => ({
        date: h.Date.split('T')[0],
        close: typeof h.Close === 'number' ? h.Close : null,
        volume: typeof h.Volume === 'number' ? h.Volume : null,
      })),
      coveragePct: scoringResult.coverage_pct,
    });
    const decision = toAdvisoryDecision(scoringResult.kategori, eligibility);

    // Klasifikasi kesegaran (temuan M-07) dari timestamp bar SESUNGGUHNYA (Yahoo
    // `meta.regularMarketTime`), bukan `Date.now()` di server - lihat shared/http/freshness.ts.
    const freshness = classifyFreshness(result.meta?.regularMarketTime);

    const resultPayload = {
      ticker,
      price: currentPrice,
      priceMeta: {
        raw: currentPrice,
        adjusted: currentAdjustedPrice,
        basis_used_for_score: adjustedCloses == null ? 'UNKNOWN' : RETURN_PRICE_BASIS,
        basis_used_for_trading_levels: 'RAW',
        adjustment_version: PRICE_ADJUSTMENT_VERSION,
        corporate_action_status: 'NONE',
      },
      analyzers: analyzersResult,
      consensus,
      consensusData,
      bestPerformer,
      scoring: scoringResult,
      // BARU (Phase 0). Aditif - tidak ada field lama yang dihapus atau diubah artinya.
      eligibility: {
        status: eligibility.status,
        reasonCodes: eligibility.reasonCodes,
        blocking: eligibility.blocking,
        message: eligibility.message,
        details: eligibility.details,
      },
      decision,
      stock: {
        symbol: ticker,
        current_price: currentPrice,
        // BUG FIX (audit logika & algoritma 2026-08-05, temuan M-7): keduanya dulu jatuh
        // ke `0` kalau close/volume terakhir tidak ada - "0%" terbaca sebagai "harga tidak
        // bergerak" dan "volume 0" sebagai "tidak ada transaksi", dua pernyataan tentang
        // pasar yang tidak pernah kita ukur. `null` = tidak tersedia. Sumbernya juga
        // dipindah ke `history` (sudah dibersihkan dari bar null), bukan array mentah.
        change_pct: (() => {
          const last = history[history.length - 1]?.Close;
          const prev = history[history.length - 2]?.Close;
          return typeof last === 'number' && typeof prev === 'number' && prev !== 0
            ? parseFloat((((last - prev) / prev) * 100).toFixed(2))
            : null;
        })(),
        volume: typeof history[history.length - 1]?.Volume === 'number' ? history[history.length - 1].Volume : null,
        history: history.map(h => ({
          time: h.Date.split('T')[0],
          open: h.Open,
          high: h.High,
          low: h.Low,
          close: h.Close,
          volume: h.Volume
        }))
      },
      technical: {},
      // BUG FIX (audit integritas data 2026-08-03, temuan M-06/M-07): metadata kesegaran
      // data - dipakai blok stale-fallback di atas untuk menghitung umur data, dan bisa
      // ditampilkan UI ("Data per 15:30 WIB - EOD") alih-alih diam-diam menganggap semua
      // response ini "live".
      _meta: {
        source: 'live',
        computedAt: new Date().toISOString(),
        dataTimestamp: freshness.dataTimestamp,
        freshness: freshness.freshness,
      },
    };

    await cacheSet(cacheKey, resultPayload, CACHE_TTL_SEC);
    await cacheSet(staleFallbackKey, resultPayload, TTL.STALE_FALLBACK);

    return NextResponse.json(await withQuotaInfo(resultPayload, ticker, session?.id, hasPro, isInternal));

  } catch (error: any) {
    console.error('Stock API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
