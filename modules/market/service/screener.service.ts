import YahooFinanceClass from 'yahoo-finance2';
import {
  analyzeBandarmology, computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal,
  type BandarmologyStatus,
} from './foreign-flow-proxy';
import { AI_PICK_UNIVERSE } from '../constants/ai-pick-universe';
import { estimateFullDayVolume, isIdxMarketHoursNow, todayDateKeyWIB } from '@/shared/market/trading-session';
import { correctPbvForUsdReporter } from '@/shared/market/usd-idr-rate';
import { fetchYahooHistory, analyzeRsi, analyzeMacd, calculateScore, type ScoringResult } from '@/modules/technical';
import { evaluateIndicatorDecisions, BACKTEST_PRESETS } from '@/modules/backtest';
import { getBatchStockSentiment, type Sentiment as NewsSentiment } from '@/modules/news';
import {
  evaluateMinimalEligibility,
  type EligibilityResult,
  type EligibilityStatus,
} from '@/modules/eligibility';

// Backend nyata untuk /screener - sebelumnya halaman itu memanggil /api/live/[ticker]
// (cuma quote harga satu simbol), padahal UI-nya butuh 10 saham teratas dengan 10+
// kolom fundamental+teknikal per simbol -> field yang dibutuhkan (top_10_stocks) tidak
// pernah ada di response manapun, jadi tabelnya selalu kosong. Semua angka di bawah
// dihitung dari data Yahoo Finance riil per simbol, tidak ada yang dikarang:
// - PER/ROE/DER/Dividend Yield/Revenue Growth: langsung dari quoteSummary
// - "Bandarmology": Chaikin Money Flow (CLV/CMF20) dari histori High/Low/Close/Volume 20
//   hari - definisi SAMA dipakai Bandar Flow & AI Pick (lihat foreign-flow-proxy.ts),
//   bukan data flow broker sungguhan (IDX broker summary tidak tersedia gratis) - makanya
//   labelnya "Akumulasi/Distribusi", bukan "Big Player Confirmed" dsb.
// - "Moat Rating": heuristik dari ROE & gross margin (ambang batas didokumentasikan
//   di bawah), bukan penilaian kualitatif yang dikarang
// - 52W High/Low: harga tertinggi/terendah riil 52 minggu terakhir (fakta historis,
//   BUKAN target/proyeksi harga ke depan - dulu dilabel "Target Bull/Bear" yang
//   menyesatkan seolah itu prediksi AI, sudah diperbaiki jadi apa adanya)
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Saham likuid LQ45/blue-chip - universe yang sama dipakai getMarketSummary(), supaya
// screener ini tidak perlu scan 900+ emiten (lambat & rawan rate-limit Yahoo). Diexport
// supaya modul lain yang butuh universe likuid yang sama (mis. corporate-calendar.service.ts)
// tidak duplikat daftar ini.
export const SCREENER_UNIVERSE = [
  'BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK','TLKM.JK','ASII.JK','GOTO.JK','ADRO.JK','UNTR.JK',
  'ICBP.JK','KLBF.JK','PGAS.JK','PTBA.JK','ANTM.JK','BRPT.JK','INKP.JK','INDF.JK','ITMG.JK',
  'CPIN.JK','UNVR.JK','AKRA.JK','BRIS.JK','SMGR.JK','INTP.JK','CTRA.JK','BSDE.JK','SMRA.JK',
  'ISAT.JK','EXCL.JK','BUKA.JK','TOWR.JK','TBIG.JK','SIDO.JK','AMRT.JK','MYOR.JK','HMSP.JK',
  'GGRM.JK','JPFA.JK','ARTO.JK','BDMN.JK','BNGA.JK','BBTN.JK','MEGA.JK','INDY.JK','BYAN.JK',
  'HRUM.JK','INCO.JK','TINS.JK','MAPI.JK','SILO.JK','EMTK.JK',
];

export type RiskProfile = 'Konservatif' | 'Moderat' | 'Agresif';

type RawStock = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  current_ratio: number | null;
  div_yield: number | null;
  rev_growth: number | null;
  gross_margin: number | null;
  vol_ratio: number;
  bandarmology_status: BandarmologyStatus;
  fifty_two_week_low: number | null;
  fifty_two_week_high: number | null;
  atr_pct: number | null;
  // Kolom BARU (permintaan eksplisit "signal streaght/netral/negatif" + "buy on weknes
  // apa buy apa sell, tapi bukan dummy, harus pakai data real dan sentimen yg ada") -
  // ketiganya null kalau data yang dibutuhkan tidak cukup (BUKAN ditebak/didefaultkan):
  // signal & pattern_tag butuh histori >= 200 hari bursa (MA200/preset butuh itu, lihat
  // MIN_HISTORY_BARS di live-filter-check.service.ts), sentiment null kalau saham tidak
  // disebut di RSS manapun (lihat TickerSentiment di news.service.ts - beda dari
  // 'NETRAL' yang berarti ADA berita tapi diklasifikasi netral).
  signal: ScoringResult['kategori'] | null;
  /** Phase 0 / P0-3. `signal` di atas dipaksa null kalau ini bukan 'ELIGIBLE'.
   * null di sini = gerbang belum sempat dievaluasi (histori kurang dari
   * MIN_HISTORY_BARS), yang artinya "tidak diketahui", BUKAN "layak". */
  eligibility_status: EligibilityStatus | null;
  eligibility_reasons: string[] | null;
  pattern_tag: string | null;
  sentiment: NewsSentiment | null;
};

// Daftar ticker yang boleh DIREKOMENDASIKAN - sama dengan universe AI Pick karena
// keduanya menjawab pertanyaan yang sama: saham ini layak disarankan atau tidak.
// Syaratnya: harga rata-rata 3 bulan >= Rp 200, nilai transaksi >= Rp 1 M/hari,
// volatilitas 12 bulan <= 120%/tahun.
//
// SCREENER_UNIVERSE sengaja TIDAK disaring - daftar itu juga dipakai Compare Tool,
// Dividend, dan Corporate Calendar yang semuanya alat PENCARIAN, bukan pemberi saran.
// Pengguna berhak membandingkan atau melihat jadwal dividen GOTO meski GOTO tidak
// layak direkomendasikan.
const CURATED_TICKERS = new Set(AI_PICK_UNIVERSE.map((t) => t.replace('.JK', '')));

/** ATR 14 sebagai persen dari harga terakhir. null kalau data kurang dari 15 bar
 * (butuh 14 True Range, masing-masing perlu close hari sebelumnya) atau harga nol.
 *
 * Menggantikan kolom stop loss yang dulu memberi angka tetap 5%/8%/12%: pengujian
 * 4.705 sampel menunjukkan stop 5% tersentuh di 77% transaksi dan memangkas hampir
 * seluruh keuntungan (+0,02% vs +1,34% tanpa stop). Angka ATR memberi tahu ruang gerak
 * wajar saham supaya pengguna menetapkan batasnya sendiri, bukan menuruti angka yang
 * terdengar otoritatif tapi tidak berdasar. */
export function atr14Pct(ohlcv: { high: number; low: number; close: number }[]): number | null {
  if (ohlcv.length < 15) return null;
  const last = ohlcv[ohlcv.length - 1].close;
  if (!last) return null;

  let sum = 0;
  for (let i = ohlcv.length - 14; i < ohlcv.length; i++) {
    const { high, low } = ohlcv[i];
    const prevClose = ohlcv[i - 1].close;
    sum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  return (sum / 14 / last) * 100;
}

/** Sisakan hanya saham yang boleh direkomendasikan. Menerima ticker dengan maupun
 * tanpa akhiran .JK karena RawStock menyimpannya sudah dibuang. */
export function filterCurated<T extends { ticker: string }>(stocks: T[]): T[] {
  return stocks.filter((s) => CURATED_TICKERS.has(s.ticker.replace('.JK', '')));
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Histori butuh 200 bar (bukan lagi 1mo/~21 bar) - permintaan BARU untuk kolom Signal
// (calculateScore butuh MA200) dan Pattern Tag (preset Backtest terpanjang butuh MA200,
// lihat MIN_HISTORY_BARS di live-filter-check.service.ts). range=1y Yahoo memberi ~245
// bar, cukup margin. fetchYahooHistory (modules/technical) dipakai (bukan fetch manual
// terpisah lagi) - satu implementasi parsing AdjClose/regularMarketTime, bukan duplikat.
const MIN_HISTORY_BARS = 200;

async function fetchOne(ticker: string): Promise<RawStock | null> {
  try {
    const [q, yahooData] = await Promise.all([
      yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'],
      }),
      fetchYahooHistory(ticker, '1y'),
    ]);
    if (!q) return null;
    const price = q.price?.regularMarketPrice || 0;
    if (!price) return null;

    const history = yahooData?.history || [];
    const hasFullHistory = history.length >= MIN_HISTORY_BARS;

    // Shape {date,high,low,close,volume} untuk Bandarmology/ATR/CMF - Close MENTAH
    // (bukan AdjClose), konsisten dengan recommendation.service.ts (High/Low tidak
    // disesuaikan dividen sama sekali, jadi mencampur AdjClose ke Close di sini akan
    // membuat basis High/Low/Close tidak lagi sebasis).
    const dailyHistory = history.map((h) => ({ date: h.Date.split('T')[0], high: h.High, low: h.Low, close: h.Close, volume: h.Volume }));

    // BUG FIX (audit integritas data 2026-08-03, temuan M-02): `regularMarketVolume`
    // ADALAH volume sesi hari ini per definisi Yahoo - selama bursa buka, angkanya
    // PARSIAL (baru sebagian sesi terkumpul) tapi dibandingkan dengan rata-rata 10 hari
    // PENUH di bawah, membuat vol_ratio bias ke bawah sepanjang jam bursa (lihat
    // shared/market/trading-session.ts). Tidak perlu cek tanggal terpisah seperti di
    // route lain - field ini SELALU merepresentasikan sesi HARI INI selama bursa buka.
    const rawVolume = q.price?.regularMarketVolume || 0;
    const volume = isIdxMarketHoursNow() ? estimateFullDayVolume(rawVolume) : rawVolume;
    const avgVolume = q.summaryDetail?.averageVolume10days || q.summaryDetail?.averageVolume || 0;
    const volRatio = avgVolume > 0 ? volume / avgVolume : 1;

    const bandarmology = analyzeBandarmology(dailyHistory.slice(-20));

    let per: number | null = q.summaryDetail?.trailingPE || null;
    let pbv: number | null = q.defaultKeyStatistics?.priceToBook || null;
    const roe = q.financialData?.returnOnEquity != null ? q.financialData.returnOnEquity * 100 : null;
    const der = q.financialData?.debtToEquity != null ? q.financialData.debtToEquity / 100 : null;
    const currentRatio = q.financialData?.currentRatio || null;
    const revGrowth = q.financialData?.revenueGrowth != null ? q.financialData.revenueGrowth * 100 : null;

    // BUG FIX (audit integritas data 2026-08-03, temuan C-07): sama seperti
    // recommendation.service.ts - emiten pelapor USD (ADRO, ITMG, INCO, dst. ada di
    // universe screener ini) punya priceToBook Yahoo yang membandingkan harga IDR
    // dengan book value USD mentah, hasilnya PBV salah satuan (bisa belasan kali lipat
    // dari wajar). Dikoreksi dengan menghitung ulang dari bookValue x kurs USD/IDR.
    // BUG FIX (audit 2026-08-05, temuan H-6): kurs cadangan hardcoded `|| 15500` dihapus.
    pbv = await correctPbvForUsdReporter({
      priceCurrency: q.price?.currency,
      financialCurrency: q.financialData?.financialCurrency,
      bookValue: q.defaultKeyStatistics?.bookValue,
      price,
      rawPbv: pbv,
    });

    // Signal (kategori STRONG BUY/BUY/HOLD/SELL) & Pattern Tag (preset Backtest yang
    // cocok SEKARANG) - null kalau histori kurang dari MIN_HISTORY_BARS, bukan ditebak.
    let signal: ScoringResult['kategori'] | null = null;
    let patternTag: string | null = null;
    let eligibility: EligibilityResult | null = null;
    if (hasFullHistory) {
      const closes = history.map((h) => h.AdjClose ?? h.Close);
      const ma20 = sma(closes, 20);
      const ma50 = sma(closes, 50);
      const ma200 = sma(closes, 200);

      // BUG FIX Phase 0 (P1-14 Tahap 1 / temuan C-7, disamakan dengan app/api/stock/
      // [ticker] dan ai-pick-scan.service.ts): fallback `: 50` untuk RSI dan `: 0` untuk
      // MACD DIHAPUS. RSI 50 jatuh PERSIS di pita "zona BUY ideal" scoreRsi() (8 dari 8
      // poin), jadi saham yang RSI-nya gagal dihitung justru DIHADIAHI skor teknikal
      // penuh. MACD 0 masuk cabang "netral" dan memberi 3 dari 7 poin untuk indikator
      // yang tidak pernah terhitung. Sekarang `null`: komponennya dikeluarkan dari skor
      // dan bobotnya dinormalisasi ulang, serta hilangnya terlihat di coverage_pct.
      const rsiResult = analyzeRsi(history, price);
      const macdResult = analyzeMacd(history, price);
      const rsiVal = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : null;
      const macdLineVal = typeof macdResult?.raw?.macdLine === 'number' ? macdResult.raw.macdLine : null;
      const macdSigVal = typeof macdResult?.raw?.macdSignal === 'number' ? macdResult.raw.macdSignal : null;
      const macdHistVal = typeof macdResult?.raw?.macdHist === 'number' ? macdResult.raw.macdHist : null;

      const volAvg20 = history.slice(-20).reduce((s, h) => s + h.Volume, 0) / 20;

      // Arus dana - definisi SAMA dengan recommendation.service.ts (analyzeAccumulationSignal
      // 4-lapis untuk arah, computeAccumulationStreak untuk lama streak berturut-turut),
      // duplikat yang didokumentasikan (bukan disatukan ke helper bersama karena di luar
      // cakupan permintaan ini) supaya kategori foreignFlow yang sama artinya di kedua
      // tempat, bukan cabang logika ketiga yang bisa berbeda hasil (pelajaran M-04).
      const dailyFlow = computeDailyNetFlow(dailyHistory).slice(-20);
      const buyStreak = computeAccumulationStreak(dailyFlow);
      let sellStreak = 0;
      for (let i = dailyFlow.length - 1; i >= 0; i--) {
        if (dailyFlow[i].netValueBillion < 0) sellStreak++;
        else break;
      }
      const accumulation = analyzeAccumulationSignal(dailyHistory.slice(-20));
      let foreignFlow: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
      if (accumulation.status === 'AKUMULASI') foreignFlow = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
      else if (accumulation.status === 'DISTRIBUSI') foreignFlow = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';

      const scoring = calculateScore(
        ticker.replace('.JK', ''),
        {
          currentPrice: price,
          // BUG FIX Phase 0 (temuan H-2): `?? 0` DIHAPUS. Harga selalu > 0, sehingga
          // "harga > MA200(0)" dulu SELALU true dan memberi poin uptrend gratis untuk
          // saham yang MA-nya belum bisa dihitung. null = tidak dinilai.
          ma20,
          ma50,
          ma200,
          rsi: rsiVal,
          macdHist: macdHistVal,
          macdLine: macdLineVal,
          macdSignal: macdSigVal,
          volToday: volume,
          volAvg20,
          // P1-8: volume besar tanpa arah harga bukan konfirmasi beli. Yahoo
          // mengembalikan `regularMarketChangePercent` sebagai FRAKSI (0.0317 = 3,17%) -
          // satuan yang sama sudah diverifikasi di audit sebelumnya.
          changePct: typeof q.price?.regularMarketChangePercent === 'number'
            ? q.price.regularMarketChangePercent * 100
            : null,
        },
        {
          per, pbv, roe, der, currentRatio, revenueGrowth: revGrowth,
          // P1-10/P1-11/P1-12 - lihat modules/sector & fair-multiples.service.ts.
          sector: {
            yahooSector: q.assetProfile?.sector ?? null,
            yahooIndustry: q.assetProfile?.industry ?? null,
            payoutRatio: q.summaryDetail?.payoutRatio ?? null,
            beta: null,
          },
        },
        // Satu kelompok arus dana (temuan H-1) - `foreignFlow` tetap dihitung di atas
        // untuk label kolom, tapi tidak lagi disekor terpisah dari cmf20 yang jadi asalnya.
        {
          cmf20: bandarmology.cmf20,
          accumulationStatus: accumulation.status,
          consecutiveBuyDays: buyStreak,
          consecutiveSellDays: sellStreak,
          volRatio,
          mfmPositiveRatio20: accumulation.mfmPositiveRatio20,  // P1-9
        },
      );
      // GERBANG KELAYAKAN MINIMAL (Phase 0 / P0-3). `signal` adalah label BUY/SELL yang
      // ditampilkan langsung ke pengguna di tabel Screener, jadi ia rekomendasi -
      // saham tidak likuid / kemungkinan tidak diperdagangkan / data basi tidak boleh
      // mendapatkannya. `signal` SUDAH bertipe nullable sejak sebelumnya (null saat
      // histori kurang), jadi konsumen UI tidak perlu berubah bentuk.
      eligibility = evaluateMinimalEligibility({
        ticker,
        asOf: todayDateKeyWIB(),
        bars: dailyHistory.map((h) => ({
          date: h.date,
          close: typeof h.close === 'number' ? h.close : null,
          volume: typeof h.volume === 'number' ? h.volume : null,
        })),
        coveragePct: scoring.coverage_pct,
      });
      signal = eligibility.status === 'ELIGIBLE' ? scoring.kategori : null;

      const decisions = evaluateIndicatorDecisions(history, price);
      const matchedPreset = BACKTEST_PRESETS.find((p) => p.filters.every((f) => decisions[f] === 'BULLISH'));
      patternTag = matchedPreset ? matchedPreset.label : null;
    }

    return {
      ticker: ticker.replace('.JK', ''),
      name: q.price?.longName || q.price?.shortName || ticker,
      sector: q.assetProfile?.sector || 'Lainnya',
      price,
      per,
      pbv,
      roe,
      der,
      current_ratio: currentRatio,
      div_yield: q.summaryDetail?.dividendYield != null ? q.summaryDetail.dividendYield * 100 : null,
      rev_growth: revGrowth,
      gross_margin: q.financialData?.grossMargins != null ? q.financialData.grossMargins * 100 : null,
      vol_ratio: volRatio,
      bandarmology_status: bandarmology.status,
      fifty_two_week_low: q.summaryDetail?.fiftyTwoWeekLow || null,
      fifty_two_week_high: q.summaryDetail?.fiftyTwoWeekHigh || null,
      atr_pct: atr14Pct(dailyHistory),
      signal,
      // BARU (Phase 0) - aditif. `null` kalau histori tidak cukup untuk mengevaluasinya
      // sama sekali (blok di atas tidak jalan), BUKAN "layak".
      eligibility_status: eligibility ? eligibility.status : null,
      eligibility_reasons: eligibility ? eligibility.reasonCodes : null,
      pattern_tag: patternTag,
      sentiment: null, // diisi belakangan oleh fetchScreenerUniverse() - lihat komentar di sana
    };
  } catch {
    return null;
  }
}

// Universe mentah (fundamental+teknikal per saham) - TIDAK bergantung pada profil
// risiko, jadi di-cache terpisah dan dipakai ulang untuk skoring 3 profil sekaligus.
//
// Mengambil GABUNGAN dua universe (114 saham) dalam satu kali jalan, bukan dua kali:
// SCREENER_UNIVERSE (51, dipakai Compare Tool sebagai alat pencarian) dan universe
// tersaring (109, satu-satunya yang boleh direkomendasikan). Keduanya beririsan 46
// saham - mengambilnya terpisah berarti 46 saham di-fetch dua kali tiap 30 menit.
//
// Penyaringan TIDAK dilakukan di sini, melainkan di rankScreener(), supaya /api/compare
// tetap bisa melihat seluruh 114.
//
// BATCH_SIZE 15 (bukan lagi 114 paralel sekaligus) - konsisten dengan
// precomputeBacktestData()/scanLiveFilterCheck() yang membatasi hal sama, supaya tidak
// rate-limited Yahoo. Perlu sekarang karena tiap saham menarik histori 1y (~245 bar),
// jauh lebih berat dari 1mo (~21 bar) sebelumnya.
const FETCH_BATCH_SIZE = 15;

export async function fetchScreenerUniverse(): Promise<RawStock[]> {
  const tickers = Array.from(new Set([...SCREENER_UNIVERSE, ...AI_PICK_UNIVERSE]));
  const raw: RawStock[] = [];
  for (let i = 0; i < tickers.length; i += FETCH_BATCH_SIZE) {
    const batch = tickers.slice(i, i + FETCH_BATCH_SIZE);
    const results = await Promise.all(batch.map(fetchOne));
    results.forEach((r) => { if (r) raw.push(r); });
  }

  // Sentimen berita per saham - SATU panggilan batch untuk SELURUH universe (bukan
  // per-ticker, lihat komentar getBatchStockSentiment()), dilakukan di sini (bukan di
  // fetchOne) supaya RSS cuma di-fetch sekali per siklus cache, bukan berkali-kali.
  try {
    const sentimentMap = await getBatchStockSentiment(raw.map((s) => ({ ticker: s.ticker, name: s.name })));
    raw.forEach((s) => { s.sentiment = sentimentMap[s.ticker]?.sentiment ?? null; });
  } catch {
    // Kegagalan sentimen (RSS/AI down) tidak boleh menggagalkan seluruh screener -
    // field tetap null (bukan ditebak), kolom Sentimen di UI tampil "N/A".
  }

  return raw;
}

function moatRating(roe: number | null, grossMargin: number | null): string {
  if (roe != null && roe >= 20 && grossMargin != null && grossMargin >= 40) return 'Lebar';
  if (roe != null && roe >= 12) return 'Sedang';
  return 'Sempit';
}

function bandarmologyLabel(status: BandarmologyStatus): string {
  if (status === 'BULLISH') return 'Akumulasi';
  if (status === 'BEARISH') return 'Distribusi';
  return 'Netral';
}

// Bobot skor per profil risiko - Konservatif memberatkan DER rendah + dividend yield
// + ROE stabil; Moderat berimbang; Agresif memberatkan pertumbuhan revenue + momentum
// volume. Semua komponen skor dinormalisasi 0-100 relatif terhadap universe yang sama
// sebelum dibobot, supaya skala antar metrik (mis. PER vs ROE) sebanding.
function scoreStock(s: RawStock, sectorAvgPer: number | null, profile: RiskProfile): number {
  // BUG FIX (audit integritas data 2026-08-03, temuan H-05): rumus lama
  // (100 - |per - sectorAvgPer|/sectorAvgPer*100) menghukum PENYIMPANGAN KE DUA ARAH
  // secara simetris - saham dengan PER SETENGAH dari rata-rata sektor (jelas lebih
  // murah) mendapat skor SAMA (50) dengan saham yang 50% LEBIH MAHAL dari sektor.
  // Kolom UI-nya ("PER (Valuasi)") mengomunikasikan "lebih rendah = lebih baik", tapi
  // rumusnya tidak melakukan itu. Sekarang monoton: PER di bawah/sama rata-rata sektor
  // selalu dapat skor penuh, hanya PER yang LEBIH MAHAL dari sektor yang mengurangi skor.
  // sectorAvgPer null (tidak ada pembanding sektor) -> komponen PER tidak dinilai sama
  // sekali, bukan dibandingkan dengan angka karangan (temuan H-8).
  const perScore = s.per != null && s.per > 0 && sectorAvgPer != null && sectorAvgPer > 0
    ? (s.per <= sectorAvgPer ? 100 : Math.max(0, 100 - ((s.per - sectorAvgPer) / sectorAvgPer) * 100))
    : null;
  // CATATAN KALIBRASI (audit 2026-08-05, temuan M-11): pemetaan di bawah adalah
  // normalisasi HEURISTIK ke skala 0-100, bukan hasil regresi atas data IDX. Dampaknya
  // terbatas pada URUTAN ranking (skor mentahnya sendiri tidak pernah ditampilkan sebagai
  // angka ke pengguna), dan tiap ambangnya dipilih agar nilai "sehat" menurut kaidah
  // umum jatuh di sekitar 60-100: ROE 33%+ = penuh, DER 2.5x = nol, yield 6.7% = penuh,
  // pertumbuhan +10% = 100. Dicatat di sini supaya bisa dikalibrasi ulang kalau suatu saat
  // ada data historis yang memadai - bukan disamarkan sebagai formula yang sudah teruji.
  const roeScore = s.roe != null ? Math.min(100, Math.max(0, s.roe * 3)) : null;
  const derScore = s.der != null ? Math.max(0, 100 - s.der * 40) : null;
  const divScore = s.div_yield != null ? Math.min(100, s.div_yield * 15) : null;
  const growthScore = s.rev_growth != null ? Math.min(100, Math.max(0, 50 + s.rev_growth * 5)) : null;
  const momentumScore = Math.min(100, Math.max(0, s.vol_ratio * 50));

  const weights: Record<RiskProfile, Record<string, number>> = {
    Konservatif: { der: 0.35, div: 0.30, roe: 0.20, per: 0.15, growth: 0, momentum: 0 },
    Moderat: { roe: 0.25, per: 0.25, growth: 0.20, der: 0.15, div: 0.15, momentum: 0 },
    Agresif: { growth: 0.35, momentum: 0.30, roe: 0.20, per: 0.15, der: 0, div: 0 },
  };
  const w = weights[profile];

  // BUG FIX (audit integritas data 2026-08-03, temuan H-04): komponen yang datanya
  // TIDAK ADA (mis. bank tanpa DER/current ratio ke Yahoo) SEBELUMNYA diisi angka
  // tebakan (30/20/50/10/30) - persis pola `data ?? ANGKA_DEFAULT` yang dilarang untuk
  // data finansial (bisa membuat saham TANPA data valuasi tampak lebih baik daripada
  // saham DENGAN data valuasi yang buruk). Sekarang komponen yang null dikeluarkan dari
  // perhitungan dan bobot sisanya dinormalisasi ulang - ketiadaan data tidak lagi diam-
  // diam disamakan dengan skor rata-rata.
  const parts: [number | null, number][] = [
    [perScore, w.per], [roeScore, w.roe], [derScore, w.der],
    [divScore, w.div], [growthScore, w.growth], [momentumScore, w.momentum],
  ];
  const available = parts.filter((p): p is [number, number] => p[0] != null && p[1] > 0);
  const totalWeight = available.reduce((sum, [, wt]) => sum + wt, 0);
  if (totalWeight === 0) return 0;
  return available.reduce((sum, [score, wt]) => sum + score * (wt / totalWeight), 0);
}

export function rankScreener(universe: RawStock[], profile: RiskProfile) {
  // Disaring SEBELUM skor dihitung - rata-rata PER sektor pun hanya boleh dihitung dari
  // saham yang layak direkomendasikan, supaya pembandingnya konsisten.
  const curated = filterCurated(universe);

  const bySector = new Map<string, number[]>();
  curated.forEach((s) => {
    if (s.per && s.per > 0) {
      const list = bySector.get(s.sector) || [];
      list.push(s.per);
      bySector.set(s.sector, list);
    }
  });
  // BUG FIX (audit logika & algoritma 2026-08-05, temuan H-8): fallback `return 15`
  // dihapus. Angka itu bukan rata-rata apa pun - ia ditampilkan di kolom "PER vs Sektor"
  // sebagai kalau itu PER rata-rata sektor yang sesungguhnya, dan dipakai sebagai
  // pembanding penilaian valuasi. Sektor yang tidak punya satu pun emiten ber-PER valid
  // sekarang mengembalikan null: komponen PER dikeluarkan dari skor (bobotnya
  // dinormalisasi ulang di scoreStock) dan kolomnya tampil "N/A".
  const sectorAvgPer = (sector: string): number | null => {
    const list = bySector.get(sector);
    if (!list || list.length === 0) return null;
    return list.reduce((a, b) => a + b, 0) / list.length;
  };

  const ranked = curated
    .map((s) => ({ s, score: scoreStock(s, sectorAvgPer(s.sector), profile) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ s }) => {
      return {
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        per: s.per != null ? parseFloat(s.per.toFixed(1)) : null,
        per_sector: (() => { const avg = sectorAvgPer(s.sector); return avg != null ? parseFloat(avg.toFixed(1)) : null; })(),
        rev_growth_ttm: s.rev_growth != null ? `${s.rev_growth >= 0 ? '+' : ''}${s.rev_growth.toFixed(1)}%` : 'N/A',
        roe: s.roe != null ? `${s.roe.toFixed(1)}%` : 'N/A',
        der: s.der != null ? `${s.der.toFixed(2)}x` : 'N/A',
        div_yield: s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : 'N/A',
        bandarmology: bandarmologyLabel(s.bandarmology_status),
        moat: moatRating(s.roe, s.gross_margin),
        week52_high: s.fifty_two_week_high,
        week52_low: s.fifty_two_week_low,
        entry: s.price,
        // Menggantikan stop_loss - lihat alasannya di komentar atr14Pct().
        atr_pct: s.atr_pct != null ? parseFloat(s.atr_pct.toFixed(1)) : null,
        // Kolom BARU (permintaan eksplisit) - null/'N/A' kalau data kurang, BUKAN
        // ditebak (lihat komentar RawStock.signal/pattern_tag/sentiment di atas).
        signal: s.signal,
        // Phase 0 / P0-3 - aditif. Diteruskan supaya UI/konsumen bisa menjelaskan KENAPA
        // `signal` kosong ("likuiditas di bawah batas"), bukan menampilkan sel kosong.
        eligibility_status: s.eligibility_status,
        eligibility_reasons: s.eligibility_reasons,
        pattern_tag: s.pattern_tag,
        sentiment: s.sentiment,
      };
    });

  return ranked;
}
