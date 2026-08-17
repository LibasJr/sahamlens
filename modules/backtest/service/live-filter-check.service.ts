// "Live Filter Check" - fitur BARU (bukan versi lama "Sinyal Hari Ini"/live-signal.service.ts
// yang dihapus 2026-08-03 karena dianggap tumpang tindih dengan AI Pick). Bedanya dari
// AI Pick: ini mengecek kombinasi filter TEKNIKAL SPESIFIK yang dipilih pengguna sendiri
// (sama seperti filter/preset di halaman Backtest), untuk kondisi SEKARANG - bukan skor
// komposit generik. Kegunaan konkret: menerjemahkan bonus/kategori dari AI Pick (mis.
// "Golden Cross") ke preset Backtest terdekat, lalu memverifikasi saham lain mana yang
// SAAT INI juga memenuhi kombinasi filter yang sama.
//
// BEDA PENTING dari versi lama yang dihapus: versi lama membaca cache precompute harian
// (bisa berjam-jam basi, cuma granularitas EOD per hari cron terakhir jalan). Versi ini
// FETCH LIVE ke Yahoo Finance saat dipanggil - akurat sampai ke jam yang sama (freshness
// dilaporkan eksplisit per hasil), bukan cuma "hari yang sama".
import { fetchYahooHistory } from '../../technical/service/yahoo-history.service';
import { analyze as analyzeEma } from '../../technical/service/analyzers/ema-analyzer';
import { analyze as analyzeVolume } from '../../technical/service/analyzers/volume-analyzer';
import { analyze as analyzeRsi } from '../../technical/service/analyzers/rsi-analyzer';
import { analyze as analyzeMacd } from '../../technical/service/analyzers/macd-analyzer';
import { analyze as analyzeVolatility } from '../../technical/service/analyzers/volatility-analyzer';
import { analyze as analyzeTrend } from '../../technical/service/analyzers/trend-analyzer';
import { analyze as analyzeSupport } from '../../technical/service/analyzers/support-resistance';
import { analyze as analyzeMarketFlow } from '../../technical/service/analyzers/market-flow';
import { analyze as analyzeSma } from '../../technical/service/analyzers/moving-average';
import { BACKTEST_UNIVERSE } from '../constants/backtest-universe';
import { estimateFullDayVolume, isIdxMarketHoursNow, todayDateKeyWIB } from '../../../shared/market/trading-session';
import { classifyFreshness } from '../../../shared/http/freshness';
import type { IndicatorName } from '../types/backtest.types';

// SAMA PERSIS dengan pemetaan di precompute.service.ts (9 filter <-> 9 analyzer) - satu
// definisi dipakai simulasi historis DAN pengecekan live ini, supaya "BULLISH hari ini"
// artinya identik di kedua tempat. Analyzer menerima `history: any[]` generik jadi type
// assertion di sini aman (bentuknya sama, cuma nama parameter beda per file).
const INDICATOR_ANALYZERS: Record<IndicatorName, (history: any[], price: number) => { decision: string }> = {
  'EMA 20/50 Cross': analyzeEma,
  'Volume vs Avg 20D': analyzeVolume,
  'RSI 14': analyzeRsi,
  'MACD': analyzeMacd,
  'Volatility (ATR 14)': analyzeVolatility,
  'MA Trend IDX (20,50,200)': analyzeTrend,
  'Support & Resistance': analyzeSupport,
  'Market Flow Index': analyzeMarketFlow,
  'SMA Score (5,10,20)': analyzeSma,
};
const ALL_INDICATORS = Object.keys(INDICATOR_ANALYZERS) as IndicatorName[];

// Butuh >= 200 bar untuk MA Trend IDX (MA200) - filter dengan kebutuhan histori
// terpanjang dari 9 yang ada (lihat trend-analyzer.ts). range=1y Yahoo memberi ~245 bar,
// cukup margin.
const MIN_HISTORY_BARS = 200;
const FETCH_RANGE = '1y';
const BATCH_SIZE = 15; // sama seperti precomputeBacktestData() - jangan tembak 109 request sekaligus

export interface LiveFilterMatch {
  ticker: string; // tanpa .JK
  price: number;
  /** Jumlah SEMUA 9 indikator yang BULLISH sekarang (bukan cuma yang dipilih user) -
   * proxy "seberapa kuat" sinyalnya di luar kombinasi yang diminta, sama seperti versi
   * lama & tie-break di simulate.service.ts. */
  bullishCount: number;
  dataTimestamp: string | null;
  freshness: string;
  ageSeconds: number | null;
}

export interface LiveFilterCheckResult {
  scannedAt: string;
  filters: IndicatorName[];
  matches: LiveFilterMatch[];
  /** Ticker yang gagal di-fetch (network/data kurang) - dilaporkan, bukan disembunyikan. */
  skipped: string[];
}

// Diekspor lewat barrel - dipakai juga oleh modules/market/service/screener.service.ts
// (tag pola per saham di Stock Screener) supaya "BULLISH" per indikator dihitung dengan
// definisi PERSIS SAMA yang dipakai Live Filter Check/preset Backtest, bukan cabang logika
// ketiga yang bisa berbeda hasil (pelajaran M-04, sama alasannya dengan BACKTEST_PRESETS
// di constants/presets.ts).
export function evaluateIndicatorDecisions(history: any[], currentPrice: number): Record<IndicatorName, string> {
  // BUG FIX (audit integritas data 2026-08-03, pola M-02): volume hari ini masih
  // PARSIAL selama jam bursa - diestimasi ke volume penuh sehari SEBELUM dievaluasi
  // analyzer Volume/Market Flow, supaya sinyal "BULLISH" tidak bias tertunda sepanjang
  // hari. AdjClose (pola M-01) sudah otomatis terbawa dari fetchYahooHistory untuk
  // analyzer tren (EMA/MACD/RSI/MA Trend/SMA/Momentum).
  const lastBar = history[history.length - 1];
  const isLiveFormingBar = lastBar.Date.split('T')[0] === todayDateKeyWIB() && isIdxMarketHoursNow();
  const adjustedHistory = isLiveFormingBar
    ? [...history.slice(0, -1), { ...lastBar, Volume: estimateFullDayVolume(lastBar.Volume) }]
    : history;

  return ALL_INDICATORS.reduce((acc, name) => {
    acc[name] = INDICATOR_ANALYZERS[name](adjustedHistory, currentPrice).decision;
    return acc;
  }, {} as Record<IndicatorName, string>);
}

async function checkOne(ticker: string, filters: IndicatorName[]): Promise<LiveFilterMatch | 'skip' | null> {
  const data = await fetchYahooHistory(ticker, FETCH_RANGE);
  if (!data || data.history.length < MIN_HISTORY_BARS) return 'skip';

  const { history, currentPrice, regularMarketTime } = data;
  const decisions = evaluateIndicatorDecisions(history, currentPrice);

  const isMatch = filters.every((f) => decisions[f] === 'BULLISH');
  if (!isMatch) return null;

  const bullishCount = ALL_INDICATORS.filter((name) => decisions[name] === 'BULLISH').length;
  const fresh = classifyFreshness(regularMarketTime);

  return {
    ticker: ticker.replace('.JK', ''),
    price: currentPrice,
    bullishCount,
    dataTimestamp: fresh.dataTimestamp,
    freshness: fresh.freshness,
    ageSeconds: fresh.ageSeconds,
  };
}

export async function scanLiveFilterCheck(filters: IndicatorName[]): Promise<LiveFilterCheckResult> {
  const matches: LiveFilterMatch[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < BACKTEST_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = BACKTEST_UNIVERSE.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((ticker) => checkOne(ticker, filters)));
    results.forEach((r, idx) => {
      if (r === 'skip') skipped.push(batch[idx].replace('.JK', ''));
      else if (r) matches.push(r);
    });
  }

  // Diranking dari jumlah TOTAL indikator bullish (bukan cuma yang diminta, semua
  // yang lolos filter sudah pasti punya count >= filters.length) - tie-break simbol,
  // konsisten dengan aturan yang sama di ai-pick.service.ts/simulate.service.ts
  // (hasil tidak boleh bergantung urutan konstanta universe).
  matches.sort((a, b) => (b.bullishCount !== a.bullishCount ? b.bullishCount - a.bullishCount : a.ticker.localeCompare(b.ticker)));

  return { scannedAt: new Date().toISOString(), filters, matches, skipped };
}
