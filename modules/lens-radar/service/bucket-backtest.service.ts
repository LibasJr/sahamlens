import { pool } from '../../../shared/database/postgres.client';
import { ensureSharedSchema } from '../../../shared/database/schema.service';
import { todayDateKeyWIB } from '../../../shared/market/trading-session';
import { fetchYahooHistory } from '../../technical';
import {
  barAtForwardTradingOffset,
  barAtTradingOffset,
  buildIdxTradingCalendar,
  hasCorporateActionGap,
  drawdownPercentile95Pct,
  worstTradeDrawdownPct,
} from './history-return-utils';
import { logger } from '@/shared/logger/logger';
import { SCORE_VERSION, partitionByScoreVersion } from '../constants/model-version';
import {
  PRICE_ADJUSTMENT_VERSION,
  RETURN_PRICE_BASIS,
  calculateForwardReturnPct,
  normalizeYahooOhlcRows,
  selectPriceSeries,
  type CorporateActionStatus,
  type PriceBasis,
} from '@/shared/market/price-basis';
import type { TradingCalendarSource } from './history-return-utils';

import { ADV_HARD_FLOOR_IDR } from '@/modules/eligibility';
import {
  countValidationPopulationRejection,
  emptyValidationPopulationCounters,
  MIN_VALIDATION_COVERAGE_PCT,
  rejectFromValidationPopulation,
  type ValidationPopulationCounters,
} from './validation-population';

export const LENS_BUCKET_ROUND_TRIP_COST_PCT = 0.5; // fee 0.4% + slippage 0.1%

/**
 * Gerbang likuiditas backtest: satu sinyal hanya dihitung kalau pada TANGGAL SINYAL
 * nilai transaksi rata-rata 20 harinya sudah di atas lantai ADV. Ambangnya sengaja
 * memakai konstanta yang sama dengan gerbang kelayakan produk (`ADV_HARD_FLOOR_IDR`)
 * supaya backtest tidak pernah mengklaim return dari saham yang aplikasinya sendiri
 * menolak merekomendasikan.
 */
export const LENS_BUCKET_MIN_AVG_VALUE_20D_IDR = ADV_HARD_FLOOR_IDR;

export type LensScoreBucket = '80-100' | '70-79' | '60-69' | '<60';
export type ForwardHorizon = 'T1' | 'T5' | 'T20';

const BUCKETS: LensScoreBucket[] = ['80-100', '70-79', '60-69', '<60'];
const BATCH_SIZE = 12;
/** Indeks komposit IDX. Diperdagangkan setiap hari bursa dan tidak pernah disuspensi,
 * jadi tanggal barnya adalah kalender bursa (temuan M-14). */
export const IDX_BENCHMARK_TICKER = '^JKSE';

export interface LensRadarHistoryEntry {
  date: string | Date;
  ticker: string;
  lens_score: number | string;
  close_price: number | string;
  market_cap: number | string | null;
  score_version?: string | null;
  universe_version?: string | null;
  raw_close_price?: number | string | null;
  adjusted_close_price?: number | string | null;
  price_basis?: PriceBasis | string | null;
  adjustment_factor?: number | string | null;
  corporate_action_status?: CorporateActionStatus | string | null;
  price_data_timestamp?: string | Date | null;
  price_data_version?: string | null;
  avg_value_20d?: number | string | null;
  coverage_pct?: number | string | null;
  eligibility_status?: string | null;
  fundamental_available_max?: number | string | null;
  universe_eligible?: boolean | string | number | null;
}

export interface DailyOpenBar {
  date: string;
  open: number;
  low?: number | null;
  close?: number;
  priceBasis?: PriceBasis;
  adjustmentVersion?: string;
  corporateActionStatus?: CorporateActionStatus;
}

export interface LensBucketStat {
  bucket: LensScoreBucket;
  avg_T1: number | null;
  avg_T5: number | null;
  avg_T20: number | null;
  winRate_T5: number | null;
  winRate_T20: number | null;
  /** Drawdown intra-trade pada persentil 95. Metrik risiko yang ditampilkan di UI. */
  maxDdP95_T20: number | null;
  /** Satu trade dengan drawdown intra-trade terdalam. Statistik ekor, untuk audit. */
  worstMae_T20: number | null;
  avgWin_T20: number | null;
  avgLoss_T20: number | null;
  totalSamples: number;
  /** Return T+20 SEBELUM fee dan slippage. `avg_T20` adalah angka bersihnya. */
  avgT20Gross: number | null;
}

export interface LensBucketBacktestResult {
  asOfDate: string;
  scoreVersion: string | null;
  requestedScoreVersion: string;
  rejectedRows: number;
  unversionedRows: number;
  versionMixed: boolean;
  versionRejectedReason: string | null;
  priceBasis: PriceBasis;
  priceDataVersion: string;
  sourceRows: number;
  uniqueTickers: number;
  roundTripCostPct: number;
  /** Kompatibilitas API lama. Selalu 0 sejak M-07 karena filter harga absolut historis dinonaktifkan. */
  skippedGocapRows: number;
  /** Baris dibuang karena ADV20 pada tanggal sinyal di bawah lantai likuiditas. */
  skippedIlliquidRows: number;
  /** Baris tanpa avg_value_20d sama sekali: likuiditasnya tidak bisa diuji. */
  unknownLiquidityRows: number;
  minAvgValue20dIdr: number;
  /** Baris yang dibuang gerbang populasi produksi (temuan H-01): kelengkapan data di
   * bawah ambang rekomendasi, kelayakan bukan ELIGIBLE, atau keduanya tidak diketahui
   * karena baris diarsipkan sebelum kolomnya ada. Ditampilkan terpisah supaya terlihat
   * berapa banyak sinyal yang DULU ikut menghasilkan angka di halaman ini padahal
   * produksi tidak akan pernah merekomendasikannya. */
  productionGateRows: ValidationPopulationCounters;
  minCoveragePct: number;
  /** Dari mana kalender hari bursa berasal (temuan M-14). 'IDX_BENCHMARK_BARS' = tanggal
   * bar ^JKSE, yaitu kalender bursa sesungguhnya. 'OBSERVED_SIGNAL_DATES' = fallback dari
   * tanggal yang kebetulan ada di data; horizon T+5/T+20 bisa bergeser kalau ada hari
   * bursa yang gagal di-scan seluruh universe. */
  tradingCalendarSource: TradingCalendarSource;
  /** Sinyal yang dibuang karena tidak punya bar bursa MAJU untuk dijadikan entry
   * (temuan C-03). Sebelum perbaikan, sinyal seperti ini diam-diam dieksekusi pada bar
   * tanggal sinyal itu sendiri - yaitu look-ahead. Angkanya wajib terlihat: kalau besar,
   * artinya sebagian populasi backtest hilang dan itu fakta yang mempengaruhi tafsir
   * seluruh tabel bucket. */
  skippedNoForwardEntryRows: number;
  /** Trade T+20 tanpa low harian valid, jadi tidak bisa dihitung drawdown-nya. */
  skippedDrawdownTrades: number;
  drawdownTrades: number;
  stats: LensBucketStat[];
}

export interface DailyOpenProvider {
  getDailyOpenBars(ticker: string): Promise<DailyOpenBar[]>;
  /** Tanggal bar indeks acuan (^JKSE) = kalender hari bursa IDX (temuan M-14).
   *
   * Sengaja bagian dari interface ini, bukan argumen opsional yang dikirim pemanggil:
   * selama pemanggil yang memutuskan, pemanggil berikutnya bisa lupa dan kalender diam-
   * diam kembali dibangun dari tanggal yang kebetulan ada di data. Kembalikan array
   * kosong kalau tidak tersedia - hasilnya jatuh balik ke kalender terobservasi dan
   * dilaporkan lewat `tradingCalendarSource`. */
  getIdxTradingCalendarDates(): Promise<string[]>;
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface NormalizedEntry {
  date: string;
  ticker: string;
  lensScore: number;
  closePrice: number;
  rawClosePrice: number | null;
  adjustedClosePrice: number;
  priceBasis: PriceBasis;
  adjustmentVersion: string;
  corporateActionStatus: CorporateActionStatus;
  marketCap: number | null;
  /** Selalu terisi: baris tanpa ADV20 tidak pernah lolos normalizeHistory. */
  avgValue20d: number;
  bucket: LensScoreBucket;
}

class YahooDailyOpenProvider implements DailyOpenProvider {
  async getIdxTradingCalendarDates(): Promise<string[]> {
    const history = await fetchYahooHistory(IDX_BENCHMARK_TICKER, '5y').catch(() => null);
    return (history?.history ?? [])
      .map((bar) => String(bar.Date).slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  }

  async getDailyOpenBars(ticker: string): Promise<DailyOpenBar[]> {
    const history = await fetchYahooHistory(ticker, '5y');
    const normalized = normalizeYahooOhlcRows(history?.history ?? [], ticker, history?.regularMarketTime ? new Date(history.regularMarketTime * 1000).toISOString() : null);
    return selectPriceSeries(normalized, RETURN_PRICE_BASIS).bars
      .map((bar) => ({
        date: bar.date,
        open: bar.open,
        low: bar.low,
        close: bar.close,
        priceBasis: bar.basis,
        adjustmentVersion: bar.adjustmentVersion,
        corporateActionStatus: bar.corporateActionStatus,
      }));
  }
}

function dateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function finiteNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function bucketFor(score: number): LensScoreBucket | null {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (score >= 80) return '80-100';
  if (score >= 70) return '70-79';
  if (score >= 60) return '60-69';
  return '<60';
}

function isValidCorporateActionStatus(status: CorporateActionStatus | string | null | undefined): status is CorporateActionStatus {
  return !status || ![
    'SUSPECTED_CORPORATE_ACTION',
    'UNRESOLVED_CORPORATE_ACTION',
    'LEGACY_UNKNOWN_PRICE_BASIS',
    'UNRESOLVED_SECURITY_IDENTITY',
  ].includes(status);
}

function roundPct(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function winRate(values: number[]): number | null {
  if (!values.length) return null;
  return (values.filter((value) => value > 0).length / values.length) * 100;
}

/**
 * M-07: filter harga absolut historis dinonaktifkan. Provider quote OHLC bersifat
 * split-adjusted lintas corporate action, sehingga ambang nominal Rp50 masa lalu
 * tidak bisa diaudit tanpa seri harga transaksi asli. Counter dipertahankan untuk
 * kompatibilitas response lama dan akan tetap 0.
 */

interface NormalizeOutcome {
  entries: NormalizedEntry[];
  skippedGocap: number;
  skippedIlliquid: number;
  unknownLiquidity: number;
  productionGate: ValidationPopulationCounters;
}

function normalizeHistory(rows: LensRadarHistoryEntry[]): NormalizeOutcome {
  let skippedGocap = 0;
  let skippedIlliquid = 0;
  let unknownLiquidity = 0;
  const productionGate = emptyValidationPopulationCounters();
  const entries = rows
    .map((row) => {
      const date = dateKey(row.date);
      const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
      const lensScore = finiteNumber(row.lens_score);
      const rawClosePrice = finiteNumber(row.raw_close_price ?? row.close_price);
      const adjustedClosePrice = finiteNumber(row.adjusted_close_price ?? null);
      const priceBasis = row.price_basis === RETURN_PRICE_BASIS ? RETURN_PRICE_BASIS : 'UNKNOWN';
      const marketCap = finiteNumber(row.market_cap);
      const avgValue20d = finiteNumber(row.avg_value_20d ?? null);
      if (
        !date ||
        !ticker ||
        lensScore == null ||
        priceBasis !== RETURN_PRICE_BASIS ||
        !isFinitePositive(adjustedClosePrice) ||
        !isValidCorporateActionStatus(row.corporate_action_status)
      ) return null;
      // M-07: no historical absolute-price/gocap filter. Yahoo quote OHLC is
      // split-adjusted retroactively, so a historical Rp50 threshold is not auditable.
      // Baris tanpa ADV20 dihitung terpisah lalu DIBUANG. Meloloskannya berarti angka
      // performa bucket kembali memuat sinyal yang likuiditasnya tidak pernah diuji -
      // persis klaim yang gerbang ini ada untuk mencegahnya.
      if (avgValue20d == null) {
        unknownLiquidity++;
        return null;
      }
      if (avgValue20d < LENS_BUCKET_MIN_AVG_VALUE_20D_IDR) {
        skippedIlliquid++;
        return null;
      }
      // Gerbang yang SAMA dengan produksi: kelengkapan data + kelayakan minimal
      // point-in-time. Lihat validation-population.ts (temuan H-01).
      if (countValidationPopulationRejection(productionGate, rejectFromValidationPopulation(row))) {
        return null;
      }
      const bucket = bucketFor(lensScore);
      if (!bucket) return null;
      return {
        date,
        ticker,
        lensScore,
        closePrice: adjustedClosePrice,
        rawClosePrice,
        adjustedClosePrice,
        priceBasis,
        adjustmentVersion: row.price_data_version ?? PRICE_ADJUSTMENT_VERSION,
        corporateActionStatus: (row.corporate_action_status as CorporateActionStatus) ?? 'NONE',
        marketCap,
        avgValue20d,
        bucket,
      };
    })
    .filter((row): row is NormalizedEntry => row !== null)
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));
  return { entries, skippedGocap, skippedIlliquid, unknownLiquidity, productionGate };
}

function initReturns(): Record<LensScoreBucket, Record<ForwardHorizon, number[]>> {
  return BUCKETS.reduce((acc, bucket) => {
    acc[bucket] = { T1: [], T5: [], T20: [] };
    return acc;
  }, {} as Record<LensScoreBucket, Record<ForwardHorizon, number[]>>);
}

function initDrawdowns(): Record<LensScoreBucket, number[]> {
  return BUCKETS.reduce((acc, bucket) => {
    acc[bucket] = [];
    return acc;
  }, {} as Record<LensScoreBucket, number[]>);
}

interface IntradayBar {
  open: number;
  low: number | null;
}

interface LoadedMarketBars {
  byDate: Map<string, IntradayBar>;
  fullCloseSeries: Array<{ date: string; closePrice: number }>;
}

async function loadBarMaps(
  tickers: string[],
  provider: DailyOpenProvider
): Promise<Map<string, LoadedMarketBars>> {
  const result = new Map<string, LoadedMarketBars>();
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const barsList = await Promise.all(batch.map(async (ticker) => ({
      ticker,
      bars: await provider.getDailyOpenBars(ticker).catch(() => []),
    })));
    for (const { ticker, bars } of barsList) {
      const usable = bars.filter((bar) => bar.priceBasis === RETURN_PRICE_BASIS);
      result.set(ticker, {
        byDate: new Map(
          usable.filter((bar) => isFinitePositive(bar.open))
            .map((bar) => [bar.date, { open: bar.open, low: isFinitePositive(bar.low) ? bar.low : null }])
        ),
        // M-13: corporate-action detection must see every provider bar, not only
        // LensRadar rows that survived liquidity/coverage filters.
        fullCloseSeries: usable
          .filter((bar) => isFinitePositive(bar.close))
          .map((bar) => ({ date: bar.date, closePrice: bar.close as number })),
      });
    }
  }
  return result;
}

/**
 * Maximum Adverse Excursion: penurunan terdalam dari harga entry selama trade
 * berjalan (T+1 open sampai bar exit), memakai low harian yang sudah disesuaikan
 * corporate action. Return null kalau tidak ada satupun low valid di rentang itu,
 * supaya trade dengan data lubang tidak diam-diam dihitung sebagai drawdown 0.
 */
function adverseExcursionPct(
  bars: Map<string, IntradayBar>,
  calendar: string[],
  entryDate: string,
  exitDate: string,
  entryOpen: number,
  roundTripCostPct: number
): number | null {
  const from = calendar.indexOf(entryDate);
  const to = calendar.indexOf(exitDate);
  if (from < 0 || to < from) return null;

  let lowestLow: number | null = null;
  for (let i = from; i <= to; i++) {
    const low = bars.get(calendar[i])?.low;
    if (!isFinitePositive(low)) continue;
    lowestLow = lowestLow == null ? low : Math.min(lowestLow, low);
  }
  if (lowestLow == null) return null;

  // Excursion dijaga tidak melebihi 0: kalau harga tidak pernah turun di bawah
  // entry, drawdown trade itu nol, bukan angka positif.
  return Math.min(0, (lowestLow / entryOpen - 1) * 100 - roundTripCostPct);
}

export async function calculateLensBucketStats(
  rows: LensRadarHistoryEntry[],
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  asOfDate = todayDateKeyWIB(),
  options: { scoreVersion?: string | null } = {}
): Promise<LensBucketBacktestResult> {
  const requestedScoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const partition = partitionByScoreVersion(rows, requestedScoreVersion);
  const { entries: normalized, skippedGocap, skippedIlliquid, unknownLiquidity, productionGate } = normalizeHistory(partition.accepted);
  const calendar = buildIdxTradingCalendar(
    await provider.getIdxTradingCalendarDates().catch(() => []),
    normalized
  );
  const tradingCalendar = calendar.dates;
  const calendarIndex = new Map(tradingCalendar.map((date, index) => [date, index]));
  const byTicker = new Map<string, NormalizedEntry[]>();
  for (const row of normalized) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }

  const tickers = Array.from(byTicker.keys());
  const barMaps = await loadBarMaps(tickers, provider);
  const returns = initReturns();
  const t20Drawdowns = initDrawdowns();
  let t20Trades = 0;
  let skippedNoLow = 0;
  let skippedNoForwardEntry = 0;

  for (const [ticker, series] of Array.from(byTicker.entries())) {
    const loadedBars = barMaps.get(ticker) ?? { byDate: new Map<string, IntradayBar>(), fullCloseSeries: [] };
    const barsByDate = loadedBars.byDate;
    const byDate = new Map(series.map((row) => [row.date, row]));
    for (let i = 0; i < series.length; i++) {
      const signal = series[i];
      if (!signal) continue;
      const signalCalendarIndex = calendarIndex.get(signal.date);
      if (signalCalendarIndex == null) continue;
      // Entry WAJIB maju dari tanggal sinyal (temuan C-03). Sinyal tanpa bar maju
      // dibuang dan dihitung, bukan digeser mundur ke bar tanggal sinyal.
      const entry = barAtForwardTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 1);
      if (!entry) {
        skippedNoForwardEntry++;
        continue;
      }
      const entryOpen = barsByDate.get(entry.date)?.open;
      if (!isFinitePositive(entryOpen)) continue;

      const exitT1 = entry;
      const exitT5 = barAtTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 5);
      const exitT20 = barAtTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 20);

      const addReturn = (horizon: ForwardHorizon, exit: NormalizedEntry | null) => {
        if (!exit || !isFinitePositive(exit.closePrice)) return;
        // Exit tidak boleh mendahului entry, dan untuk horizon di atas T1 tidak boleh
        // jatuh PADA bar entry. Toleransi dua arah pada offset exit bisa menariknya
        // sampai bertemu bar entry (mis. entry di T+3 dan exit T+5 - 2 = T+3); return
        // nol-hari yang dihasilkan bukan pengukuran horizon 5 atau 20 hari.
        // T1 memang bar entry itu sendiri (open -> close hari yang sama), jadi hanya
        // horizon lain yang dijaga ketat.
        if (exit.date < entry.date) return;
        if (horizon !== 'T1' && exit.date === entry.date) return;
        if (hasCorporateActionGap(loadedBars.fullCloseSeries, entry.date, exit.date)) return;
        const ret = calculateForwardReturnPct({
          ticker,
          entryBar: {
            date: entry.date,
            ticker,
            raw: { open: null, high: null, low: null, close: entry.rawClosePrice },
            adjusted: { open: entryOpen, high: null, low: null, close: entry.adjustedClosePrice },
            adjustmentFactor: null,
            adjustmentStatus: 'DERIVED_FROM_ADJUSTMENT_FACTOR',
            corporateActionStatus: entry.corporateActionStatus,
            basisAvailability: { raw: false, adjusted: true },
            source: 'LENS_RADAR_HISTORY+YAHOO_CHART',
            dataTimestamp: null,
            metadata: { priceBasis: RETURN_PRICE_BASIS, adjustmentSource: 'YAHOO_CHART_ADJCLOSE', adjustmentTimestamp: null, adjustmentVersion: entry.adjustmentVersion },
          },
          exitBar: {
            date: exit.date,
            ticker,
            raw: { open: null, high: null, low: null, close: exit.rawClosePrice },
            adjusted: { open: null, high: null, low: null, close: exit.adjustedClosePrice },
            adjustmentFactor: null,
            adjustmentStatus: 'DERIVED_FROM_ADJUSTMENT_FACTOR',
            corporateActionStatus: exit.corporateActionStatus,
            basisAvailability: { raw: false, adjusted: true },
            source: 'LENS_RADAR_HISTORY',
            dataTimestamp: null,
            metadata: { priceBasis: RETURN_PRICE_BASIS, adjustmentSource: 'YAHOO_CHART_ADJCLOSE', adjustmentTimestamp: null, adjustmentVersion: exit.adjustmentVersion },
          },
          basis: RETURN_PRICE_BASIS,
          entryField: 'open',
          exitField: 'close',
          roundTripCostPct: LENS_BUCKET_ROUND_TRIP_COST_PCT,
        });
        if (ret.status !== 'OK' || ret.returnPct == null) return;
        returns[signal.bucket][horizon].push(ret.returnPct);
        if (horizon !== 'T20') return;

        t20Trades++;
        const excursion = adverseExcursionPct(
          barsByDate,
          tradingCalendar,
          entry.date,
          exit.date,
          entryOpen,
          LENS_BUCKET_ROUND_TRIP_COST_PCT
        );
        if (excursion == null) {
          skippedNoLow++;
          return;
        }
        t20Drawdowns[signal.bucket].push(excursion);
      };

      addReturn('T1', exitT1);
      addReturn('T5', exitT5);
      addReturn('T20', exitT20);
    }
  }

  const stats = BUCKETS.map((bucket): LensBucketStat => {
    const avgT20Net = average(returns[bucket].T20);
    return {
    bucket,
    avg_T1: roundPct(average(returns[bucket].T1)),
    avg_T5: roundPct(average(returns[bucket].T5)),
    avg_T20: roundPct(avgT20Net),
    // Biaya round-trip dikurangkan sebagai konstanta dari tiap return, jadi rata-rata
    // gross adalah rata-rata net + biaya. Tidak perlu pass kedua atas data yang sama.
    avgT20Gross: roundPct(avgT20Net == null ? null : avgT20Net + LENS_BUCKET_ROUND_TRIP_COST_PCT),
    winRate_T5: roundPct(winRate(returns[bucket].T5)),
    winRate_T20: roundPct(winRate(returns[bucket].T20)),
    maxDdP95_T20: roundPct(drawdownPercentile95Pct(t20Drawdowns[bucket])),
    worstMae_T20: roundPct(worstTradeDrawdownPct(t20Drawdowns[bucket])),
    avgWin_T20: roundPct(average(returns[bucket].T20.filter((value) => value > 0))),
    avgLoss_T20: roundPct(average(returns[bucket].T20.filter((value) => value < 0))),
    // Card utama menampilkan statistik T+20; denominator harus berasal dari populasi T+20 yang sama.
    totalSamples: returns[bucket].T20.length,
    };
  });

  const productionGateRejected =
    productionGate.lowCoverage + productionGate.notEligible +
    productionGate.unknownCoverage + productionGate.unknownEligibility +
    productionGate.outsidePitUniverse + productionGate.unknownPitUniverse;
  logger.info(
    `lens-bucket-backtest: filtered ${skippedIlliquid + unknownLiquidity + skippedNoForwardEntry + skippedNoLow + productionGateRejected} dirty rows out of ${partition.accepted.length} ` +
    `(historical absolute-price filter disabled M-07, ` +
    `ADV20 < ${LENS_BUCKET_MIN_AVG_VALUE_20D_IDR}: ${skippedIlliquid}, ` +
    `ADV20 tidak diketahui: ${unknownLiquidity}, ` +
    `gerbang produksi/PIT-universe rejected: ${productionGateRejected}, ` +
    `tanpa bar entry maju: ${skippedNoForwardEntry}, ` +
    `T+20 tanpa low valid: ${skippedNoLow} dari ${t20Trades} trade T+20)`
  );

  return {
    asOfDate,
    skippedGocapRows: skippedGocap,
    skippedIlliquidRows: skippedIlliquid,
    unknownLiquidityRows: unknownLiquidity,
    minAvgValue20dIdr: LENS_BUCKET_MIN_AVG_VALUE_20D_IDR,
    productionGateRows: productionGate,
    minCoveragePct: MIN_VALIDATION_COVERAGE_PCT,
    tradingCalendarSource: calendar.source,
    skippedNoForwardEntryRows: skippedNoForwardEntry,
    skippedDrawdownTrades: skippedNoLow,
    drawdownTrades: t20Trades - skippedNoLow,
    scoreVersion: partition.version,
    requestedScoreVersion,
    rejectedRows: partition.rejected.length,
    unversionedRows: partition.unversionedCount,
    versionMixed: partition.mixed,
    versionRejectedReason: partition.rejectedReason,
    priceBasis: RETURN_PRICE_BASIS,
    priceDataVersion: PRICE_ADJUSTMENT_VERSION,
    sourceRows: normalized.length,
    uniqueTickers: tickers.length,
    roundTripCostPct: LENS_BUCKET_ROUND_TRIP_COST_PCT,
    stats,
  };
}

export async function readLensRadarHistory(db: Queryable = pool): Promise<LensRadarHistoryEntry[]> {
  const { rows } = await db.query(
    `
    SELECT "date", ticker, lens_score, close_price, market_cap, score_version, universe_version,
           raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
           corporate_action_status, price_data_timestamp, price_data_version,
           avg_value_20d, coverage_pct, eligibility_status, fundamental_available_max, universe_eligible
    FROM lens_radar_history
    WHERE lens_score IS NOT NULL
      AND close_price IS NOT NULL
    ORDER BY ticker ASC, "date" ASC
    `
  );
  return rows as LensRadarHistoryEntry[];
}

export async function saveLensBucketStats(
  result: LensBucketBacktestResult,
  db: Queryable = pool
): Promise<number> {
  await ensureSharedSchema();
  let saved = 0;
  for (const stat of result.stats) {
    await db.query(
      `
      INSERT INTO lens_bucket_stats (
        run_date, bucket, avg_t1, avg_t5, avg_t20,
        win_rate_t5, win_rate_t20, max_dd_p95, worst_mae,
        avg_win_t20, avg_loss_t20, total_samples,
        source_rows, unique_tickers, round_trip_cost_pct, score_version,
        price_basis, price_data_version,
        avg_t20_gross, illiquid_rows_skipped, unknown_liquidity_rows, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now())
      ON CONFLICT (run_date, bucket) DO UPDATE SET
        avg_t1 = EXCLUDED.avg_t1,
        avg_t5 = EXCLUDED.avg_t5,
        avg_t20 = EXCLUDED.avg_t20,
        avg_t20_gross = EXCLUDED.avg_t20_gross,
        illiquid_rows_skipped = EXCLUDED.illiquid_rows_skipped,
        unknown_liquidity_rows = EXCLUDED.unknown_liquidity_rows,
        win_rate_t5 = EXCLUDED.win_rate_t5,
        win_rate_t20 = EXCLUDED.win_rate_t20,
        max_dd_p95 = EXCLUDED.max_dd_p95,
        worst_mae = EXCLUDED.worst_mae,
        avg_win_t20 = EXCLUDED.avg_win_t20,
        avg_loss_t20 = EXCLUDED.avg_loss_t20,
        total_samples = EXCLUDED.total_samples,
        source_rows = EXCLUDED.source_rows,
        unique_tickers = EXCLUDED.unique_tickers,
        round_trip_cost_pct = EXCLUDED.round_trip_cost_pct,
        score_version = EXCLUDED.score_version,
        price_basis = EXCLUDED.price_basis,
        price_data_version = EXCLUDED.price_data_version,
        updated_at = now()
      `,
      [
        result.asOfDate,
        stat.bucket,
        stat.avg_T1,
        stat.avg_T5,
        stat.avg_T20,
        stat.winRate_T5,
        stat.winRate_T20,
        stat.maxDdP95_T20,
        stat.worstMae_T20,
        stat.avgWin_T20,
        stat.avgLoss_T20,
        stat.totalSamples,
        result.sourceRows,
        result.uniqueTickers,
        result.roundTripCostPct,
        result.scoreVersion,
        result.priceBasis,
        result.priceDataVersion,
        stat.avgT20Gross,
        result.skippedIlliquidRows,
        result.unknownLiquidityRows,
      ]
    );
    saved++;
  }
  return saved;
}

export async function runAndSaveLensBucketBacktest(
  db: Queryable = pool,
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  asOfDate = todayDateKeyWIB(),
  options: { scoreVersion?: string | null } = {}
): Promise<LensBucketBacktestResult & { savedRows: number }> {
  await ensureSharedSchema();
  const rows = await readLensRadarHistory(db);
  const result = await calculateLensBucketStats(rows, provider, asOfDate, options);
  const savedRows = await saveLensBucketStats(result, db);
  return { ...result, savedRows };
}
