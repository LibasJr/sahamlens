import { computeDailyNetFlow, computeAccumulationStreak } from './foreign-flow-proxy';

// BUILD 002 (Refactor Domain) - dipindah dari app/api/market-summary/route.ts, verbatim.
// Rute publik (tanpa login) - ringkasan pasar untuk landing page & halaman /market/[category].
// Universe diperluas dari 50 -> 250 saham atas permintaan eksplisit. 250 ticker ini BUKAN
// hafalan/tebakan index membership (bisa basi) - dipilih lewat scratch/rank-liquidity.js
// yang memindai ~1.277 emiten IDX di lib/tickers.ts dan mem-filter berdasarkan data REAL
// Yahoo Finance: harga >= Rp100 & market cap >= Rp500 miliar (buang saham "gorengan"/shell),
// lalu diranking berdasarkan nilai transaksi rata-rata (harga x avg volume 10 hari, proxy
// likuiditas) dengan profitabilitas (ROE > 0, proxy fundamental) diprioritaskan lebih dulu.
// Dari 335 kandidat yang lolos filter, 284 di antaranya profitable - 250 teratas semuanya
// masuk dari kelompok profitable itu. Re-run script itu secara periodik untuk menyegarkan.
const MARKET_STOCKS = [
  'TPIA.JK', 'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BUMI.JK', 'DSSA.JK', 'DEWA.JK', 'BRPT.JK',
  'AMMN.JK', 'ANTM.JK', 'BRMS.JK', 'TLKM.JK', 'BUVA.JK', 'CUAN.JK', 'ASII.JK', 'BULL.JK',
  'BBNI.JK', 'RAJA.JK', 'TINS.JK', 'ENRG.JK', 'BREN.JK', 'KOTA.JK', 'UNTR.JK', 'MDKA.JK',
  'AADI.JK', 'VKTR.JK', 'INDY.JK', 'MEDC.JK', 'ADRO.JK', 'INCO.JK', 'RANS.JK', 'PGAS.JK',
  'KLBF.JK', 'AMRT.JK', 'RATU.JK', 'ESSA.JK', 'CDIA.JK', 'ADMR.JK', 'INDF.JK', 'RMKE.JK',
  'CPIN.JK', 'MBMA.JK', 'INET.JK', 'NCKL.JK', 'AKRA.JK', 'INKP.JK', 'WIFI.JK', 'DOOH.JK',
  'BRIS.JK', 'ITMG.JK', 'ARCI.JK', 'ERAA.JK', 'JELI.JK', 'PANI.JK', 'PACK.JK', 'GGRM.JK',
  'APIC.JK', 'ISAT.JK', 'TAPG.JK', 'PTBA.JK', 'BFIN.JK', 'BBTN.JK', 'EMTK.JK', 'ICBP.JK',
  'IRSX.JK', 'UNVR.JK', 'TCPI.JK', 'SMGR.JK', 'ELSA.JK', 'PGEO.JK', 'JPFA.JK', 'MTEL.JK',
  'SMIL.JK', 'CMNT.JK', 'AYAM.JK', 'TOWR.JK', 'BUKA.JK', 'BAIK.JK', 'MMIX.JK', 'NSSS.JK',
  'HATM.JK', 'MSIN.JK', 'ARTO.JK', 'PWON.JK', 'CYBR.JK', 'SSMS.JK', 'MAPA.JK', 'KETR.JK',
  'LSIP.JK', 'BBYB.JK', 'HEAL.JK', 'BEEF.JK', 'NICL.JK', 'BELL.JK', 'DSNG.JK', 'GJTL.JK',
  'SCMA.JK', 'HMSP.JK', 'SIDO.JK', 'SGER.JK', 'KEEN.JK', 'DATA.JK', 'CTRA.JK', 'DMAS.JK',
  'MNCN.JK', 'COIN.JK', 'BSML.JK', 'AALI.JK', 'BSDE.JK', 'JECX.JK', 'JSMR.JK', 'SMRA.JK',
  'CMRY.JK', 'STAA.JK', 'HUMI.JK', 'OMED.JK', 'AVIA.JK', 'INDO.JK', 'HRUM.JK', 'MAPI.JK',
  'APLN.JK', 'INTP.JK', 'MSJA.JK', 'BMTR.JK', 'AUTO.JK', 'ACES.JK', 'BNGA.JK', 'BDMN.JK',
  'EURO.JK', 'JARR.JK', 'BJTM.JK', 'NEST.JK', 'ASSA.JK', 'BLES.JK', 'BSSR.JK', 'DGWG.JK',
  'RISE.JK', 'TRIN.JK', 'BTPS.JK', 'APEX.JK', 'TEBE.JK', 'ASGR.JK', 'BDKR.JK', 'ARNA.JK',
  'ADES.JK', 'LPPF.JK', 'DMMX.JK', 'CLEO.JK', 'MSTI.JK', 'ERAL.JK', 'ELPI.JK', 'BACA.JK',
  'ALKA.JK', 'BJBR.JK', 'DILD.JK', 'GRIA.JK', 'VERN.JK', 'BIRD.JK', 'BANK.JK', 'ASRI.JK',
  'SWID.JK', 'IPCC.JK', 'MOLI.JK', 'BABY.JK', 'SUNI.JK', 'TUGU.JK', 'BLUE.JK', 'MAHA.JK',
  'BBRM.JK', 'ALII.JK', 'ABMM.JK', 'MHKI.JK', 'CASS.JK', 'TLDN.JK', 'ZONE.JK', 'CFIN.JK',
  'AREA.JK', 'BGTG.JK', 'UANG.JK', 'BYAN.JK', 'DRMA.JK', 'MDIY.JK', 'SPTO.JK', 'ALDO.JK',
  'AGII.JK', 'VICI.JK', 'GOLF.JK', 'PGUN.JK', 'GEMS.JK', 'DEPO.JK', 'CITY.JK', 'ARGO.JK',
  'DAAZ.JK', 'PEVE.JK', 'BNLI.JK', 'MINE.JK', 'BMHS.JK', 'ADMF.JK', 'BISI.JK', 'CITA.JK',
  'BEST.JK', 'AXIO.JK', 'BNBA.JK', 'KING.JK', 'GWSA.JK', 'IRRA.JK', 'BNII.JK', 'CSRA.JK',
  'ADMG.JK', 'LABS.JK', 'BBHI.JK', 'DLTA.JK', 'PMJS.JK', 'LIVE.JK', 'GOOD.JK', 'PDPP.JK',
  'SOHO.JK', 'ATIC.JK', 'CHIP.JK', 'BUAH.JK', 'MCOL.JK', 'SKRN.JK', 'CBUT.JK', 'BOLA.JK',
  'BESS.JK', 'CAMP.JK', 'YUPI.JK', 'MKAP.JK', 'AMAN.JK', 'CLAY.JK', 'PNGO.JK', 'CEKA.JK',
  'CARE.JK', 'TRGU.JK', 'PRAY.JK', 'AMAR.JK', 'CMNP.JK', 'KSIX.JK', 'AMFG.JK', 'ARII.JK',
  'BOGA.JK', 'KEJU.JK', 'AGAR.JK', 'IFII.JK', 'CASA.JK', 'BHAT.JK', 'GUNA.JK', 'ROCK.JK',
  'MKTR.JK', 'CSAP.JK',
];

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 300 }, // cache 5 menit
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    const closes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const volumes: number[] = [];
    const dates: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close?.[i] !== null && quote.close?.[i] !== undefined) {
        closes.push(quote.close[i]);
        highs.push(quote.high?.[i] ?? quote.close[i]);
        lows.push(quote.low?.[i] ?? quote.close[i]);
        volumes.push(quote.volume?.[i] || 0);
        dates.push(new Date(timestamps[i] * 1000).toISOString().split('T')[0]);
      }
    }
    if (closes.length < 5) return null;

    // NOTE: meta.chartPreviousClose is unreliable for ranges other than 1d — Yahoo
    // returns the close from the *start* of the requested range, not yesterday's close.
    // Always derive prevClose from the actual daily closes we just fetched.
    const prevClose = closes[closes.length - 2] || closes[0];
    const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    const volume = meta.regularMarketVolume || volumes[volumes.length - 1] || 0;

    const weekAgoClose = closes.length >= 6 ? closes[closes.length - 6] : closes[0];
    const weeklyChangePct = weekAgoClose ? ((currentPrice - weekAgoClose) / weekAgoClose) * 100 : 0;

    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const rsi14 = rsi(closes, 14);
    const avgVolume20 = volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : (volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1));
    const volRatio = avgVolume20 ? volume / avgVolume20 : 1;

    // Proxy "akumulasi asing berkelanjutan" - streak hari berturut-turut netValue
    // (Chaikin Money Flow: posisi close di range High-Low, bukan cuma arah harga)
    // positif, dari modules/market/service/foreign-flow-proxy.ts (definisi SAMA dipakai
    // /api/flow/[ticker] Bandar Flow & Bandarmology di Screener) - BUKAN data broker resmi.
    const history = dates.map((date, i) => ({ date, high: highs[i], low: lows[i], close: closes[i], volume: volumes[i] }));
    const dailyFlow = computeDailyNetFlow(history).slice(-20);
    const foreignAccumStreak = computeAccumulationStreak(dailyFlow);

    let technicalSignal: 'BULLISH' | 'BEARISH' | 'NETRAL' = 'NETRAL';
    let technicalScore = 0;
    if (ma20 !== null && ma50 !== null) {
      const conditions = [currentPrice > ma20, ma20 > ma50, volRatio > 1];
      const met = conditions.filter(Boolean).length;
      technicalScore = Math.round((met / conditions.length) * 100);
      if (currentPrice > ma20 && ma20 > ma50) technicalSignal = 'BULLISH';
      else if (currentPrice < ma20 && ma20 < ma50) technicalSignal = 'BEARISH';
    }

    return {
      symbol,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      weeklyChangePct: parseFloat(weeklyChangePct.toFixed(2)),
      volume,
      value: volume * currentPrice,
      ma20, ma50, rsi14,
      technicalSignal,
      technicalScore,
      foreignAccumStreak,
    };
  } catch {
    return null;
  }
}

export async function getMarketSummary() {
  // Fetch in chunks of 25 parallel - dinaikkan dari 10 seiring universe diperluas 50->250,
  // supaya jumlah putaran (dan total wall-clock) tidak ikut naik 5x.
  const quotes: any[] = [];
  for (let i = 0; i < MARKET_STOCKS.length; i += 25) {
    const chunk = MARKET_STOCKS.slice(i, i + 25);
    const results = await Promise.all(chunk.map(s => fetchQuote(s)));
    results.forEach(r => { if (r) quotes.push(r); });
  }

  const strip = (s: any) => s.symbol.replace('.JK', '');

  // Full list capped at 50 (in practice ~= the whole monitored universe below that size)
  // for the dedicated /market/[category] pages; dashboard cards just show the first 4.
  const LIST_CAP = 50;

  const topGainers = [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, LIST_CAP).map(s => ({
    symbol: strip(s), changePct: s.changePct, price: s.price
  }));

  const topLosers = [...quotes].sort((a, b) => a.changePct - b.changePct).slice(0, LIST_CAP).map(s => ({
    symbol: strip(s), changePct: s.changePct, price: s.price
  }));

  const topVolume = [...quotes].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, LIST_CAP).map(s => ({
    symbol: strip(s), volume: s.volume || 0, price: s.price
  }));

  const topValue = [...quotes].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, LIST_CAP).map(s => ({
    symbol: strip(s), value: s.value || 0, price: s.price
  }));

  const topWeeklyGainers = [...quotes].sort((a, b) => b.weeklyChangePct - a.weeklyChangePct).slice(0, LIST_CAP).map(s => ({
    symbol: strip(s), changePct: s.weeklyChangePct, price: s.price
  }));

  const topWeeklyLosers = [...quotes].sort((a, b) => a.weeklyChangePct - b.weeklyChangePct).slice(0, LIST_CAP).map(s => ({
    symbol: strip(s), changePct: s.weeklyChangePct, price: s.price
  }));

  const topTechnical = [...quotes]
    .filter(s => s.technicalSignal === 'BULLISH')
    .sort((a, b) => (b.technicalScore - a.technicalScore) || (b.changePct - a.changePct))
    .slice(0, LIST_CAP)
    .map(s => ({ symbol: strip(s), score: s.technicalScore, changePct: s.changePct, price: s.price }));

  const topTechnicalBearish = [...quotes]
    .filter(s => s.technicalSignal === 'BEARISH')
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, LIST_CAP)
    .map(s => ({ symbol: strip(s), score: s.technicalScore, changePct: s.changePct, price: s.price }));

  // Diranking berdasarkan RSI14 terendah (bukan filter keras rsi14 < 30) - saat kondisi
  // pasar sedang tidak ada saham yang benar-benar oversold, filter keras itu bisa
  // menyisakan cuma 1-2 saham sementara kartu lain (top gainer, dst.) selalu tampil 4+.
  // Merangking tetap 100% data RSI riil, cuma tidak lagi dibuang kalau sedikit di atas 30.
  const topRsiOversold = [...quotes]
    .filter(s => s.rsi14 !== null)
    .sort((a, b) => (a.rsi14 as number) - (b.rsi14 as number))
    .slice(0, LIST_CAP)
    .map(s => ({ symbol: strip(s), rsi: parseFloat((s.rsi14 as number).toFixed(1)), changePct: s.changePct, price: s.price }));

  // "Akumulasi Asing Berkelanjutan" - streak >= 3 hari (proxy volume, lihat
  // foreign-flow-proxy.ts), diranking dari yang paling panjang streak-nya.
  const topForeignAccumulation = [...quotes]
    .filter(s => (s.foreignAccumStreak || 0) >= 3)
    .sort((a, b) => (b.foreignAccumStreak || 0) - (a.foreignAccumStreak || 0))
    .slice(0, LIST_CAP)
    .map(s => ({ symbol: strip(s), streak: s.foreignAccumStreak, changePct: s.changePct, price: s.price }));

  return {
    timestamp: new Date().toISOString(),
    topGainers,
    topLosers,
    topVolume,
    topValue,
    topWeeklyGainers,
    topWeeklyLosers,
    topTechnical,
    topTechnicalBearish,
    topRsiOversold,
    topForeignAccumulation,
  };
}
