// Worker pengumpul data LensIntraday: ambil bar 5 menit -> periksa kualitas ->
// bangkitkan sinyal grid -> simulasikan hasil tiap horizon -> upsert idempoten.
//
// Aman dijalankan ulang: seluruh tulisan lewat ON CONFLICT DO UPDATE dengan kunci
// (ticker, trading_date, signal_minute_wib, model_version, config_hash), jadi backfill
// yang gagal di tengah bisa diulang tanpa menghasilkan sinyal kembar.

import { logger } from '@/shared/logger/logger';
import { AI_PICK_UNIVERSE } from '@/modules/market/constants/ai-pick-universe';
import {
  INTRADAY_MAX_LOOKBACK_DAYS,
  defaultIntradayRunConfig,
  intradayConfigHash,
  type IntradayRunConfig,
} from '../constants/intraday-model';
import { fetchExchangeTradingDates, fetchIntradayBars, type IntradayBar } from './intraday-bars.service';
import { buildIntradaySignals, simulateAllHorizons } from './intraday-signal.service';
import {
  upsertIntradayDataQuality,
  upsertIntradaySignals,
  type IntradaySignalWriteRow,
} from '../repository/intraday.repository';

/**
 * Universe riset default. SENGAJA lebih kecil dari AI_PICK_UNIVERSE penuh: satu
 * emiten = satu permintaan berisi ~5.220 bar, dan menarik 200 sekaligus membuat satu
 * eksekusi worker berjalan berpuluh menit sambil menahan koneksi database.
 * Bisa ditimpa lewat parameter, tapi defaultnya harus muat dalam satu eksekusi.
 */
export const DEFAULT_INTRADAY_RESEARCH_UNIVERSE = AI_PICK_UNIVERSE.slice(0, 60);

/** Fetch paralel dibatasi supaya tidak memukul provider dan tidak meledakkan memori. */
const FETCH_CONCURRENCY = 4;

export interface IntradayCollectionOptions {
  tickers?: string[];
  lookbackDays?: number;
  config?: IntradayRunConfig;
  /** Batas waktu lunak. Worker berhenti rapi setelah emiten berjalan selesai. */
  budgetMs?: number;
}

export interface IntradayCollectionResult {
  modelVersion: string;
  configHash: string;
  tickersRequested: number;
  tickersProcessed: number;
  tickersFailed: number;
  signalsWritten: number;
  outcomesWritten: number;
  qualityRowsWritten: number;
  daysSkippedForQuality: number;
  budgetExhausted: boolean;
  /** Jumlah hari bursa acuan (dari IHSG). null = acuan tidak tersedia pada eksekusi ini. */
  referenceTradingDays: number | null;
  /** Hari bursa berjalan yang datanya hilang TOTAL untuk sebuah emiten. */
  missingDayRows: number;
  errors: Array<{ ticker: string; error: string }>;
}

export async function runIntradayCollection(
  options: IntradayCollectionOptions = {}
): Promise<IntradayCollectionResult> {
  const config = options.config ?? defaultIntradayRunConfig();
  const configHash = intradayConfigHash(config);
  const tickers = (options.tickers?.length ? options.tickers : DEFAULT_INTRADAY_RESEARCH_UNIVERSE).map((t) =>
    t.trim().toUpperCase()
  );
  const lookbackDays = Math.min(options.lookbackDays ?? INTRADAY_MAX_LOOKBACK_DAYS, INTRADAY_MAX_LOOKBACK_DAYS);
  const deadline = options.budgetMs ? Date.now() + options.budgetMs : null;

  const result: IntradayCollectionResult = {
    modelVersion: config.modelVersion,
    configHash,
    tickersRequested: tickers.length,
    tickersProcessed: 0,
    tickersFailed: 0,
    signalsWritten: 0,
    outcomesWritten: 0,
    qualityRowsWritten: 0,
    daysSkippedForQuality: 0,
    budgetExhausted: false,
    referenceTradingDays: null,
    missingDayRows: 0,
    errors: [],
  };

  // Acuan hari bursa diambil SEKALI dari IHSG, sebelum emiten mana pun diproses.
  // Kalau gagal, pengumpulan tetap jalan tanpa acuan - hari yang hilang total jadi
  // tidak terdeteksi, dan itu dilaporkan apa adanya lewat referenceTradingDays=null.
  const referenceTradingDates = await fetchExchangeTradingDates({ lookbackDays, calendar: config.calendar }).catch(
    () => null
  );
  result.referenceTradingDays = referenceTradingDates?.length ?? null;
  if (!referenceTradingDates) {
    logger.warn('Intraday collection berjalan TANPA acuan hari bursa IHSG', { lookbackDays });
  }

  const queue = [...tickers];
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      if (deadline && Date.now() > deadline) {
        result.budgetExhausted = true;
        return;
      }
      const ticker = queue.shift();
      if (!ticker) return;
      try {
        const perTicker = await collectOneTicker(ticker, lookbackDays, config, configHash, referenceTradingDates);
        result.tickersProcessed++;
        result.signalsWritten += perTicker.signalsWritten;
        result.outcomesWritten += perTicker.outcomesWritten;
        result.qualityRowsWritten += perTicker.qualityRowsWritten;
        result.daysSkippedForQuality += perTicker.daysSkippedForQuality;
        result.missingDayRows += perTicker.missingDayRows;
        if (perTicker.error) {
          result.tickersFailed++;
          result.errors.push({ ticker, error: perTicker.error });
        }
      } catch (err) {
        result.tickersFailed++;
        const message = err instanceof Error ? err.message : 'unknown';
        result.errors.push({ ticker, error: message });
        logger.warn('Intraday collection gagal untuk satu ticker', { ticker, error: message });
      }
    }
  });

  await Promise.all(workers);
  logger.info('Intraday collection selesai', {
    tickersProcessed: result.tickersProcessed,
    signalsWritten: result.signalsWritten,
    outcomesWritten: result.outcomesWritten,
    tickersFailed: result.tickersFailed,
  });
  return result;
}

async function collectOneTicker(
  ticker: string,
  lookbackDays: number,
  config: IntradayRunConfig,
  configHash: string,
  referenceTradingDates: string[] | null
): Promise<{
  signalsWritten: number;
  outcomesWritten: number;
  qualityRowsWritten: number;
  daysSkippedForQuality: number;
  missingDayRows: number;
  error: string | null;
}> {
  const fetched = await fetchIntradayBars(ticker, {
    lookbackDays,
    calendar: config.calendar,
    referenceTradingDates: referenceTradingDates ?? undefined,
  });

  const qualityRowsWritten = await upsertIntradayDataQuality(
    ticker,
    fetched.quality,
    fetched.retrievedAt,
    fetched.error
  );

  if (fetched.error || fetched.quality.timezoneMismatch || !fetched.bars.length) {
    return {
      signalsWritten: 0,
      outcomesWritten: 0,
      qualityRowsWritten,
      daysSkippedForQuality: fetched.quality.days.length,
      missingDayRows: fetched.quality.missingDates.length,
      error: fetched.error ?? (fetched.quality.timezoneMismatch ? 'provider timezone bukan Asia/Jakarta' : null),
    };
  }

  const usableDates = new Set(
    fetched.quality.days.filter((d) => d.status === 'OK').map((d) => d.tradingDate)
  );
  const skipped = fetched.quality.days.length - usableDates.size;

  const byDate = new Map<string, IntradayBar[]>();
  for (const bar of fetched.bars) {
    if (!usableDates.has(bar.tradingDate)) continue;
    const list = byDate.get(bar.tradingDate);
    if (list) list.push(bar);
    else byDate.set(bar.tradingDate, [bar]);
  }

  const rows: IntradaySignalWriteRow[] = [];
  // Array.from, bukan iterasi Map langsung: tsconfig target es5 tanpa downlevelIteration.
  for (const dayBars of Array.from(byDate.values())) {
    for (const signal of buildIntradaySignals(dayBars, config)) {
      rows.push({ signal, outcomes: simulateAllHorizons(signal, dayBars, config) });
    }
  }

  if (!rows.length) {
    return {
      signalsWritten: 0,
      outcomesWritten: 0,
      qualityRowsWritten,
      daysSkippedForQuality: skipped,
      missingDayRows: fetched.quality.missingDates.length,
      error: null,
    };
  }

  const written = await upsertIntradaySignals(rows, {
    modelVersion: config.modelVersion,
    configHash,
    provider: config.provider,
    barInterval: config.interval,
    costVersion: config.cost.version,
  });

  return {
    signalsWritten: written.signalsWritten,
    outcomesWritten: written.outcomesWritten,
    qualityRowsWritten,
    daysSkippedForQuality: skipped,
    missingDayRows: fetched.quality.missingDates.length,
    error: null,
  };
}
