#!/usr/bin/env node

/**
 * One-shot LensRadar historical backfill.
 *
 * Prinsip audit:
 * - Tidak memakai fundamental "hari ini" untuk skor tanggal lampau. Fundamental hanya
 *   dibaca dari fundamental_history dengan observed_date <= tanggal sinyal.
 * - Harga return/performance memakai TOTAL_RETURN_ADJUSTED dari Yahoo AdjClose; harga
 *   raw tetap disimpan untuk audit dan trading-level UI.
 * - Tidak menebak corporate action. Gap raw ekstrem hanya diberi status SUSPECTED dan
 *   akan fail-closed oleh bucket-backtest Fase 3.
 * - Idempoten: lens_radar_history di-upsert dengan primary key (date, ticker).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Module from 'node:module';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const DEFAULT_FETCH_RANGE = '2y'; // 1 tahun insert + warm-up MA200/MACD/RSI.
const DEFAULT_TICKER_BATCH_SIZE = 24;
const DEFAULT_FETCH_CONCURRENCY = 4;
const DEFAULT_RETRY_ATTEMPTS = 2;
const YAHOO_TIMEOUT_MS = 15_000;
const INSERT_BATCH_SIZE = 500;

export function loadEnvFile(filePath = path.join(repoRoot, '.env.local')) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  let loaded = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] != null) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    loaded++;
  }
  return loaded;
}

export function installTypeScriptRequireHook(rootDir = repoRoot) {
  const ts = require('typescript');
  const previousTs = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;
  const rootWithSep = `${rootDir}${path.sep}`;

  Module._resolveFilename = function resolveWithAlias(request, parent, isMain, options) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      return previousResolve.call(this, path.join(rootWithSep, request.slice(2)), parent, isMain, options);
    }
    return previousResolve.call(this, request, parent, isMain, options);
  };

  Module._extensions['.ts'] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };

  return () => {
    Module._resolveFilename = previousResolve;
    if (previousTs) Module._extensions['.ts'] = previousTs;
    else delete Module._extensions['.ts'];
  };
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()) {
  const oneYearAgo = new Date(now);
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  const options = {
    startDate: dateKeyUtc(oneYearAgo),
    endDate: dateKeyUtc(now),
    range: DEFAULT_FETCH_RANGE,
    tickers: null,
    dryRun: false,
    skipBacktest: false,
    scoreVersion: null,
    universeAdditions: false,
    universeVersion: null,
    checkpointFile: null,
    tickerBatchSize: DEFAULT_TICKER_BATCH_SIZE,
    concurrency: DEFAULT_FETCH_CONCURRENCY,
    retryAttempts: DEFAULT_RETRY_ATTEMPTS,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-backtest') options.skipBacktest = true;
    else if (arg.startsWith('--start=')) options.startDate = arg.slice('--start='.length);
    else if (arg.startsWith('--end=')) options.endDate = arg.slice('--end='.length);
    else if (arg.startsWith('--range=')) options.range = arg.slice('--range='.length);
    else if (arg.startsWith('--score-version=')) options.scoreVersion = arg.slice('--score-version='.length);
    else if (arg === '--universe-additions') options.universeAdditions = true;
    else if (arg.startsWith('--universe-version=')) options.universeVersion = arg.slice('--universe-version='.length).trim();
    else if (arg.startsWith('--checkpoint=')) options.checkpointFile = arg.slice('--checkpoint='.length).trim();
    else if (arg.startsWith('--ticker-batch-size=')) options.tickerBatchSize = Number(arg.slice('--ticker-batch-size='.length));
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice('--concurrency='.length));
    else if (arg.startsWith('--retry-attempts=')) options.retryAttempts = Number(arg.slice('--retry-attempts='.length));
    else if (arg.startsWith('--tickers=')) {
      options.tickers = arg
        .slice('--tickers='.length)
        .split(',')
        .map((ticker) => normalizeTicker(ticker))
        .filter(Boolean);
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }

  assertDateKey(options.startDate, '--start');
  assertDateKey(options.endDate, '--end');
  if (options.endDate < options.startDate) throw new Error('--end harus >= --start');
  if (!Number.isInteger(options.tickerBatchSize) || options.tickerBatchSize < 1 || options.tickerBatchSize > 100) {
    throw new Error('--ticker-batch-size harus integer 1..100');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 10) {
    throw new Error('--concurrency harus integer 1..10');
  }
  if (!Number.isInteger(options.retryAttempts) || options.retryAttempts < 0 || options.retryAttempts > 5) {
    throw new Error('--retry-attempts harus integer 0..5');
  }
  return options;
}

export function dateKeyUtc(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export function normalizeTicker(value) {
  if (typeof value !== 'string') return '';
  const ticker = value.trim().toUpperCase();
  if (!ticker) return '';
  return ticker.includes('.') || ticker.startsWith('^') ? ticker : `${ticker}.JK`;
}

export function assertDateKey(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} harus format YYYY-MM-DD, diterima ${JSON.stringify(value)}`);
  }
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finitePositive(value) {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : null;
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

function toYahooRows(chartPayload) {
  const result = chartPayload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose;
  if (!Array.isArray(timestamps) || !quote) return { rows: [], dataTimestamp: null };

  const rows = [];
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if (
      typeof timestamp !== 'number' ||
      ![open, high, low, close, volume].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      close <= 0 ||
      high < low ||
      volume < 0
    ) continue;
    const adj = adjclose?.[i];
    rows.push({
      Date: new Date(timestamp * 1000).toISOString(),
      Open: open,
      High: high,
      Low: low,
      Close: close,
      Volume: volume,
      ...(typeof adj === 'number' && Number.isFinite(adj) && adj > 0 ? { AdjClose: adj } : {}),
    });
  }

  const regularMarketTime = result?.meta?.regularMarketTime;
  return {
    rows,
    dataTimestamp: typeof regularMarketTime === 'number'
      ? new Date(regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export async function fetchYahooChartRows(ticker, range = DEFAULT_FETCH_RANGE) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=1d&events=history%7Cdiv%7Csplit`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 SahamLensBackfill/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Yahoo chart ${ticker} HTTP ${res.status}`);
    return toYahooRows(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchYahooChartRowsWithRetry(ticker, range = DEFAULT_FETCH_RANGE, attempts = DEFAULT_RETRY_ATTEMPTS) {
  let lastError = null;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await fetchYahooChartRows(ticker, range);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts) break;
      await sleep(500 * (2 ** attempt));
    }
  }
  throw lastError;
}

export function fundamentalAsOf(fundamentals, requestedDate) {
  let selected = null;
  for (const row of fundamentals) {
    if (row.observedDate <= requestedDate) selected = row;
    else break;
  }
  return selected;
}

export function buildLensHistoryUpsert(rows) {
  if (!rows.length) return null;
  const params = [];
  const tuples = rows.map((row) => {
    const base = params.length;
    params.push(
      row.date,
      row.ticker,
      row.lensScore,
      row.closePrice,
      row.marketCap,
      row.technicalScore,
      row.fundamentalScore,
      row.flowScore,
      row.coveragePct,
      row.scoreVersion,
      row.universeVersion,
      row.valuationVersion,
      row.signalVersion,
      row.dataSnapshotVersion,
      row.calculationTimestamp,
      row.rawClosePrice,
      row.adjustedClosePrice,
      row.priceBasis,
      row.adjustmentFactor,
      row.corporateActionStatus,
      row.priceDataTimestamp,
      row.priceDataVersion,
      row.avgValue20d ?? null,
      row.eligibilityStatus ?? null,
      row.eligibilityReasonCodes ?? null,
      row.technicalAvailableMax ?? null,
      row.fundamentalAvailableMax ?? null,
      row.flowAvailableMax ?? null,
      row.councilSignal ?? null,
      row.councilConfidence ?? null,
      row.councilBuyPct ?? null,
      row.councilSellPct ?? null,
      row.councilDivided ?? null,
      row.universeEligible ?? null,
      row.universeReasonCodes ?? null,
      row.universeAvgClose63d ?? null,
      row.universeAvgValue63d ?? null,
      row.universeAnnualVolPct ?? null,
      row.universeMethodVersion ?? null,
      row.scoreConfigHash
    );
    return `($${base + 1}::date, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}::timestamptz, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21}::timestamptz, $${base + 22}, $${base + 23}, $${base + 24}, $${base + 25}, $${base + 26}, $${base + 27}, $${base + 28}, $${base + 29}, $${base + 30}, $${base + 31}, $${base + 32}, $${base + 33}, $${base + 34}, $${base + 35}, $${base + 36}, $${base + 37}, $${base + 38}, $${base + 39}, $${base + 40}, now())`;
  });

  return {
    text: `
      INSERT INTO lens_radar_history (
        date, ticker, lens_score, close_price, market_cap,
        technical_score, fundamental_score, flow_score, coverage_pct,
        score_version, universe_version, valuation_version, signal_version, data_snapshot_version,
        calculation_timestamp,
        raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
        corporate_action_status, price_data_timestamp, price_data_version,
        avg_value_20d,
        eligibility_status, eligibility_reason_codes,
        technical_available_max, fundamental_available_max, flow_available_max,
        council_signal, council_confidence, council_buy_pct, council_sell_pct, council_divided,
        universe_eligible, universe_reason_codes, universe_avg_close_63d, universe_avg_value_63d,
        universe_annual_vol_pct, universe_method_version, score_config_hash,
        updated_at
      )
      VALUES ${tuples.join(', ')}
      ON CONFLICT (date, ticker, score_version, score_config_hash, universe_version) DO UPDATE SET
        lens_score = EXCLUDED.lens_score,
        close_price = EXCLUDED.close_price,
        market_cap = EXCLUDED.market_cap,
        technical_score = EXCLUDED.technical_score,
        fundamental_score = EXCLUDED.fundamental_score,
        flow_score = EXCLUDED.flow_score,
        coverage_pct = EXCLUDED.coverage_pct,
        score_version = EXCLUDED.score_version,
        score_config_hash = EXCLUDED.score_config_hash,
        universe_version = EXCLUDED.universe_version,
        valuation_version = EXCLUDED.valuation_version,
        signal_version = EXCLUDED.signal_version,
        data_snapshot_version = EXCLUDED.data_snapshot_version,
        calculation_timestamp = EXCLUDED.calculation_timestamp,
        raw_close_price = EXCLUDED.raw_close_price,
        adjusted_close_price = EXCLUDED.adjusted_close_price,
        price_basis = EXCLUDED.price_basis,
        council_signal = EXCLUDED.council_signal,
        council_confidence = EXCLUDED.council_confidence,
        council_buy_pct = EXCLUDED.council_buy_pct,
        council_sell_pct = EXCLUDED.council_sell_pct,
        council_divided = EXCLUDED.council_divided,
        adjustment_factor = EXCLUDED.adjustment_factor,
        corporate_action_status = EXCLUDED.corporate_action_status,
        price_data_timestamp = EXCLUDED.price_data_timestamp,
        price_data_version = EXCLUDED.price_data_version,
        avg_value_20d = EXCLUDED.avg_value_20d,
        eligibility_status = EXCLUDED.eligibility_status,
        eligibility_reason_codes = EXCLUDED.eligibility_reason_codes,
        technical_available_max = EXCLUDED.technical_available_max,
        fundamental_available_max = EXCLUDED.fundamental_available_max,
        flow_available_max = EXCLUDED.flow_available_max,
        universe_eligible = EXCLUDED.universe_eligible,
        universe_reason_codes = EXCLUDED.universe_reason_codes,
        universe_avg_close_63d = EXCLUDED.universe_avg_close_63d,
        universe_avg_value_63d = EXCLUDED.universe_avg_value_63d,
        universe_annual_vol_pct = EXCLUDED.universe_annual_vol_pct,
        universe_method_version = EXCLUDED.universe_method_version,
        updated_at = now()
    `,
    params,
  };
}

export async function loadFundamentalHistory(pool, tickers, endDate) {
  const { rows } = await pool.query(
    `
    SELECT ticker, observed_date, per, pbv, roe, der, current_ratio, revenue_growth,
           yahoo_sector, yahoo_industry, payout_ratio, shares_outstanding, market_cap
    FROM fundamental_history
    WHERE ticker = ANY($1)
      AND observed_date <= $2::date
    ORDER BY ticker ASC, observed_date ASC
    `,
    [tickers, endDate]
  );

  const byTicker = new Map();
  for (const row of rows) {
    const ticker = String(row.ticker).toUpperCase();
    const list = byTicker.get(ticker) ?? [];
    list.push({
      observedDate: row.observed_date instanceof Date ? dateKeyUtc(row.observed_date) : String(row.observed_date).slice(0, 10),
      per: numericOrNull(row.per),
      pbv: numericOrNull(row.pbv),
      roe: numericOrNull(row.roe),
      der: numericOrNull(row.der),
      currentRatio: numericOrNull(row.current_ratio),
      revenueGrowth: numericOrNull(row.revenue_growth),
      // Konteks sektor point-in-time (temuan C-02) - lihat sectorContextAsOf().
      yahooSector: typeof row.yahoo_sector === 'string' && row.yahoo_sector.trim() ? row.yahoo_sector.trim() : null,
      yahooIndustry: typeof row.yahoo_industry === 'string' && row.yahoo_industry.trim() ? row.yahoo_industry.trim() : null,
      payoutRatio: numericOrNull(row.payout_ratio),
      sharesOutstanding: numericOrNull(row.shares_outstanding),
      marketCap: numericOrNull(row.market_cap),
    });
    byTicker.set(ticker, list);
  }
  return byTicker;
}

/**
 * Konteks sektor yang DIKETAHUI pada tanggal sinyal.
 *
 * BUG FIX (audit kuantitatif 2026-08-11, temuan C-02): backfill dulu selalu mengirim
 * sector berisi null semua ke calculateScore(), sementara app/api/stock/[ticker]:482
 * mengirim assetProfile Yahoo yang asli. Akibatnya seluruh histori dinilai sebagai
 * 'UNCLASSIFIED': bank dihukum lewat DER yang di produksi dinyatakan TIDAK BERLAKU,
 * penjaga puncak siklus emiten komoditas TIDAK PERNAH aktif, dan beta acuan sektor selalu
 * 1,0 sehingga PER/PBV wajar ikut berbeda. Diuji atas 110.592 kombinasi fundamental:
 * selisih sampai 10 poin LensScore dan 8,4% berpindah bucket - dan bucket adalah unit
 * analisis SELURUH Calibration Lab, Bucket Backtest, dan TP/CL Lab.
 *
 * Baris yang direkam sebelum kolom sektor ada tetap mengembalikan null - itu memang yang
 * kita ketahui pada tanggal itu, dan menambalnya dengan sektor hari ini justru akan
 * mengembalikan look-ahead yang baru saja dihapus.
 *
 * `beta` tetap null: ia dihitung dari harga terhadap IHSG per-request dan tidak pernah
 * diarsipkan; calculateScore() sudah menyatakan pemakaian beta acuan sektor lewat
 * `betaSource` di keluaran valuasi.
 */
export function sectorContextAsOf(fundamental) {
  return {
    yahooSector: fundamental?.yahooSector ?? null,
    yahooIndustry: fundamental?.yahooIndustry ?? null,
    payoutRatio: fundamental?.payoutRatio ?? null,
    beta: null,
  };
}

function numericOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function corporateActionStatusFor(index, normalizedBars, deps) {
  if (index <= 0) return 'NONE';
  const detection = deps.detectCorporateAction(normalizedBars[index - 1], normalizedBars[index]);
  return detection.suspected ? 'SUSPECTED_CORPORATE_ACTION' : 'NONE';
}

function officialForeignFlowAsOf(ticker, dateKey, deps) {
  if (!deps.getRealForeignFlow || !deps.analyzeOfficialForeignFlow) return null;
  const series = deps.getRealForeignFlow(ticker, 260);
  if (!series) return null;
  const history = series.history.filter((point) => point.date <= dateKey).slice(-20);
  if (history.length === 0) return null;
  const analysis = deps.analyzeOfficialForeignFlow(history);
  return analysis.netPressure20 == null ? null : analysis;
}

export function buildHistoricalLensRows(input) {
  const {
    ticker,
    yahooRows,
    fundamentals,
    startDate,
    endDate,
    dataTimestamp,
    runTimestamp,
    universeVersion,
    deps,
  } = input;

  const normalized = deps.normalizeYahooOhlcRows(yahooRows, ticker, dataTimestamp);
  const rawByDate = new Map(normalized.map((bar) => [bar.date, bar]));
  const adjustedSelection = deps.selectPriceSeries(normalized, deps.RETURN_PRICE_BASIS);
  const adjustedBars = adjustedSelection.bars;
  const rows = [];

  for (let i = 0; i < adjustedBars.length; i++) {
    const bar = adjustedBars[i];
    if (bar.date < startDate || bar.date > endDate) continue;
    const rawBar = rawByDate.get(bar.date);
    if (!rawBar) continue;
    const historyToDate = yahooRows.filter((row) => String(row.Date).slice(0, 10) <= bar.date);
    if (historyToDate.length < 30) continue;

    const adjustedCloses = historyToDate
      .map((row) => finitePositive(row.AdjClose))
      .filter((value) => value != null);
    const hasCompleteAdjusted = adjustedCloses.length === historyToDate.length;
    const currentAdjustedPrice = hasCompleteAdjusted ? adjustedCloses[adjustedCloses.length - 1] : null;
    const rawClose = finitePositive(rawBar.raw.close);
    const adjustedClose = finitePositive(rawBar.adjusted.close);
    if (rawClose == null || adjustedClose == null || currentAdjustedPrice == null) continue;

    // changePct feeds scoreVolume(), so it MUST use the same return basis as the
    // technical scoring series. Raw close can show a false crash on ex-dividend/split
    // dates while TOTAL_RETURN_ADJUSTED is economically flat (audit M-6).
    const previousAdjustedClose = i > 0 ? finitePositive(adjustedBars[i - 1]?.close) : null;
    const changePct = previousAdjustedClose != null ? ((adjustedClose / previousAdjustedClose) - 1) * 100 : null;
    const volumeToday = finiteNumber(historyToDate[historyToDate.length - 1]?.Volume);
    const volAvg20 = historyToDate.length >= 20
      ? historyToDate.slice(-20).reduce((sum, row) => sum + (finiteNumber(row.Volume) ?? 0), 0) / 20
      : null;
    // ADV20 proxy dalam rupiah memakai Yahoo quote Close (split-adjusted, belum
    // dividend-adjusted), bukan AdjClose. Jangan menyebutnya harga transaksi mentah:
    // audit M-07 membuktikan label itu menyesatkan. Jendela berhenti di `bar.date`,
    // sehingga seleksi tetap point-in-time; ambang harga rupiah absolut tidak dipakai.
    const avgValue20d = historyToDate.length >= 20
      ? historyToDate.slice(-20).reduce((sum, row) => {
        const close = finiteNumber(row.Close);
        const volume = finiteNumber(row.Volume);
        return sum + (close != null && volume != null ? close * volume : 0);
      }, 0) / 20
      : null;

    const dailyHistory = historyToDate.map((row) => ({
      date: String(row.Date).slice(0, 10),
      high: row.High,
      low: row.Low,
      close: row.Close,
      volume: row.Volume,
    }));
    const dailyFlow = deps.computeDailyNetFlow(dailyHistory).slice(-20);
    const buyStreak = deps.computeAccumulationStreak(dailyFlow);
    let sellStreak = 0;
    for (let j = dailyFlow.length - 1; j >= 0; j--) {
      if (dailyFlow[j].netValueBillion < 0) sellStreak++;
      else break;
    }
    const accumulation = deps.analyzeAccumulationSignal(dailyHistory.slice(-20));
    const bandarmology = deps.analyzeBandarmology(dailyHistory.slice(-20));
    const fundamental = fundamentalAsOf(fundamentals, bar.date);
    const officialFlow = officialForeignFlowAsOf(ticker, bar.date, deps);

    // VERDICT PEMBANDING (2026-08-12). Dihitung dari `historyToDate` yang SAMA dengan
    // yang memberi makan calculateScore - jadi point-in-time, tanpa bar sesudah tanggal
    // sinyal. Tujuannya satu: membuat pertanyaan "verdict mana yang paling mendekati
    // kenyataan" bisa DIUKUR terhadap return T+20 yang sama, bukan diperdebatkan.
    //
    // computeMiniCouncil() adalah fungsi murni atas OHLCV, jadi tidak ada jalur produksi
    // yang perlu diubah untuk ini - tidak ada risiko divergensi seperti temuan C-02.
    const council = deps.computeMiniCouncil
      ? deps.computeMiniCouncil(historyToDate.map((row) => ({
        time: String(row.Date).slice(0, 10),
        open: row.Open,
        high: row.High,
        low: row.Low,
        close: row.Close,
        volume: row.Volume,
      })), false)
      : null;

    const rsiResult = deps.analyzeRsi(historyToDate, rawClose);
    const macdResult = deps.analyzeMacd(historyToDate, rawClose);
    const adxResult = deps.analyzeAdx(historyToDate, rawClose);
    const bollingerResult = deps.analyzeBollinger(historyToDate, currentAdjustedPrice ?? rawClose);
    const stochasticResult = deps.analyzeStochastic(historyToDate, rawClose);
    const obvResult = deps.analyzeObv(historyToDate, currentAdjustedPrice ?? rawClose);
    const obvVolWindow = historyToDate.slice(-10);
    const obvAvgVolume10 = obvVolWindow.length === 10 && obvVolWindow.every((row) => Number.isFinite(row.Volume) && row.Volume >= 0)
      ? obvVolWindow.reduce((sum, row) => sum + row.Volume, 0) / 10
      : null;
    const score = deps.calculateScore(
      ticker.replace('.JK', ''),
      {
        currentPrice: rawClose,
        currentRawPrice: rawClose,
        currentAdjustedPrice,
        currentPriceBasis: deps.RETURN_PRICE_BASIS,
        maPriceBasis: deps.RETURN_PRICE_BASIS,
        adjustmentVersion: deps.PRICE_ADJUSTMENT_VERSION,
        corporateActionStatus: corporateActionStatusFor(normalized.findIndex((item) => item.date === bar.date), normalized, deps),
        ma20: hasCompleteAdjusted ? sma(adjustedCloses, 20) : null,
        ma50: hasCompleteAdjusted ? sma(adjustedCloses, 50) : null,
        ma200: hasCompleteAdjusted ? sma(adjustedCloses, 200) : null,
        rsi: typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : null,
        macdHist: typeof macdResult?.raw?.macdHist === 'number' ? macdResult.raw.macdHist : null,
        macdLine: typeof macdResult?.raw?.macdLine === 'number' ? macdResult.raw.macdLine : null,
        macdSignal: typeof macdResult?.raw?.macdSignal === 'number' ? macdResult.raw.macdSignal : null,
        adx: typeof adxResult?.raw?.adx === 'number' ? adxResult.raw.adx : null,
        plusDi: typeof adxResult?.raw?.plusDi === 'number' ? adxResult.raw.plusDi : null,
        minusDi: typeof adxResult?.raw?.minusDi === 'number' ? adxResult.raw.minusDi : null,
        bollingerPercentB: typeof bollingerResult?.raw?.percentB === 'number' ? bollingerResult.raw.percentB : null,
        stochasticK: typeof stochasticResult?.raw?.k === 'number' ? stochasticResult.raw.k : null,
        stochasticD: typeof stochasticResult?.raw?.d === 'number' ? stochasticResult.raw.d : null,
        volToday: volumeToday,
        volAvg20,
        changePct,
      },
      {
        per: fundamental?.per ?? null,
        pbv: fundamental?.pbv ?? null,
        roe: fundamental?.roe ?? null,
        der: fundamental?.der ?? null,
        currentRatio: fundamental?.currentRatio ?? null,
        revenueGrowth: fundamental?.revenueGrowth ?? null,
        sector: sectorContextAsOf(fundamental),
      },
      {
        officialNetPressure20: officialFlow?.netPressure20 ?? null,
        accumulationStatus: officialFlow?.accumulationStatus ?? null,
        consecutiveBuyDays: officialFlow?.consecutiveBuyDays ?? 0,
        consecutiveSellDays: officialFlow?.consecutiveSellDays ?? 0,
        officialPositiveRatio20: officialFlow?.positiveRatio20 ?? null,
        obvSlope10: typeof obvResult?.raw?.slope === 'number' ? obvResult.raw.slope : null,
        obvAvgVolume10,
      }
    );

    // GERBANG KELAYAKAN POINT-IN-TIME (temuan H-01). Dihitung DI SINI, dari bar yang
    // tersedia sampai tanggal ini saja, lalu diarsipkan. Menghitungnya belakangan saat
    // backtest berjalan akan menilai kelayakan memakai histori penuh - yaitu menyatakan
    // saham layak diperdagangkan pada 2025 karena hari ini ia likuid.
    const eligibilityBars = historyToDate.map((row) => ({
      date: String(row.Date).slice(0, 10),
      close: finiteNumber(row.Close),
      volume: finiteNumber(row.Volume),
    }));
    const eligibility = deps.evaluateMinimalEligibility({
      ticker,
      asOf: bar.date,
      bars: eligibilityBars,
      coveragePct: score.coverage_pct,
    });
    // H-02: membership universe dihitung hanya dari data sampai tanggal sinyal.
    const pitUniverse = deps.evaluatePointInTimeUniverse(eligibilityBars);
    // M-08/M-07: market cap historis hanya dari arsip PIT yang nyata. Jangan
    // merekonstruksinya dari close provider yang split-adjusted x saham period-end.
    const marketCap = fundamental?.marketCap != null && fundamental.marketCap > 0
      ? fundamental.marketCap
      : null;

    rows.push({
      date: bar.date,
      ticker,
      lensScore: score.total_score,
      closePrice: adjustedClose,
      marketCap,
      technicalScore: score.technical_score,
      fundamentalScore: score.fundamental_score,
      flowScore: score.flow_score,
      coveragePct: score.coverage_pct,
      scoreVersion: deps.SCORE_VERSION,
      scoreConfigHash: deps.LENS_SCORE_MODEL_HASH,
      universeVersion,
      valuationVersion: deps.VALUATION_VERSION,
      signalVersion: deps.SIGNAL_VERSION,
      dataSnapshotVersion: deps.DATA_SNAPSHOT_VERSION,
      calculationTimestamp: runTimestamp,
      rawClosePrice: rawClose,
      adjustedClosePrice: adjustedClose,
      priceBasis: deps.RETURN_PRICE_BASIS,
      adjustmentFactor: rawBar.adjustmentFactor,
      corporateActionStatus: score.price?.corporate_action_status ?? 'NONE',
      priceDataTimestamp: dataTimestamp ?? runTimestamp,
      priceDataVersion: deps.PRICE_ADJUSTMENT_VERSION,
      avgValue20d,
      eligibilityStatus: eligibility.status,
      eligibilityReasonCodes: eligibility.reasonCodes.join(',') || null,
      technicalAvailableMax: score.available_max.technical,
      fundamentalAvailableMax: score.available_max.fundamental,
      flowAvailableMax: score.available_max.flow,
      universeEligible: pitUniverse.eligible,
      universeReasonCodes: pitUniverse.reasonCodes.join(',') || null,
      universeAvgClose63d: pitUniverse.avgClose63d,
      universeAvgValue63d: pitUniverse.avgValue63d,
      universeAnnualVolPct: pitUniverse.annualVolPct,
      universeMethodVersion: pitUniverse.methodVersion,
      // `null` kalau council tidak terhitung (bar kurang) - JANGAN diisi 'HOLD', karena
      // "tidak terhitung" dan "netral" adalah dua hal berbeda dan keduanya akan diukur.
      councilSignal: council?.finalSignal ?? null,
      councilConfidence: council?.confidence ?? null,
      councilBuyPct: council?.buyPct ?? null,
      councilSellPct: council?.sellPct ?? null,
      councilDivided: council?.divided ?? null,
    });
  }

  return rows;
}

async function upsertLensHistoryRows(pool, rows) {
  let saved = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
    const query = buildLensHistoryUpsert(batch);
    if (!query) continue;
    const result = await pool.query(query.text, query.params);
    saved += result.rowCount ?? batch.length;
  }
  return saved;
}

async function loadProductionDeps() {
  installTypeScriptRequireHook();
  const { pool } = require('../shared/database/postgres.client.ts');
  const { ensureSharedSchema } = require('../shared/database/schema.service.ts');
  const { BACKTEST_UNIVERSE } = require('../modules/backtest/constants/backtest-universe.ts');
  const {
    ACTIVE_LIQUID_UNIVERSE_VERSION,
    AI_PICK_UNIVERSE_ADDITIONS,
    LEGACY_VALIDATED_UNIVERSE_VERSION,
    POINT_IN_TIME_VALIDATION_UNIVERSE_VERSION,
  } = require('../modules/market/constants/ai-pick-universe.ts');
  const {
    calculateScore,
    analyzeRsi,
    analyzeMacd,
    analyzeAdx,
    analyzeBollinger,
    analyzeStochastic,
    analyzeObv,
  } = require('../modules/technical/index.ts');
  const {
    computeDailyNetFlow,
    computeAccumulationStreak,
    analyzeAccumulationSignal,
    analyzeBandarmology,
    getRealForeignFlow,
    analyzeOfficialForeignFlow,
  } = require('../modules/market/index.ts');
  // Verdict pembanding - fungsi murni atas OHLCV, dipakai kartu "Konsensus AI" di UI.
  const { computeMiniCouncil } = require('../lib/miniCouncil.ts');
  const {
    SCORE_VERSION,
    VALUATION_VERSION,
    SIGNAL_VERSION,
    DATA_SNAPSHOT_VERSION,
  } = require('../modules/lens-radar/constants/model-version.ts');
  const { LENS_SCORE_MODEL_HASH } = require('../modules/technical/config/lens-score-model.ts');
  const {
    PRICE_ADJUSTMENT_VERSION,
    RETURN_PRICE_BASIS,
    normalizeYahooOhlcRows,
    selectPriceSeries,
    detectCorporateAction,
  } = require('../shared/market/price-basis.ts');
  const { evaluateMinimalEligibility } = require('../modules/eligibility/index.ts');
  const { evaluatePointInTimeUniverse } = require('../modules/backtest/service/point-in-time-universe.ts');
  const { runAndSaveLensBucketBacktest } = require('../modules/lens-radar/service/bucket-backtest.service.ts');
  const { cacheDel } = require('../shared/cache/redis-cache.ts');
  const { TRANSPARENCY_CACHE_KEY } = require('../modules/lens-radar/service/transparency.service.ts');

  return {
    pool,
    ensureSharedSchema,
    BACKTEST_UNIVERSE,
    ACTIVE_LIQUID_UNIVERSE_VERSION,
    AI_PICK_UNIVERSE_ADDITIONS,
    LEGACY_VALIDATED_UNIVERSE_VERSION,
    POINT_IN_TIME_VALIDATION_UNIVERSE_VERSION,
    evaluateMinimalEligibility,
    evaluatePointInTimeUniverse,
    runAndSaveLensBucketBacktest,
    calculateScore,
    analyzeRsi,
    analyzeMacd,
    analyzeAdx,
    analyzeBollinger,
    analyzeStochastic,
    analyzeObv,
    computeDailyNetFlow,
    computeAccumulationStreak,
    analyzeAccumulationSignal,
    analyzeBandarmology,
    getRealForeignFlow,
    analyzeOfficialForeignFlow,
    computeMiniCouncil,
    SCORE_VERSION,
    LENS_SCORE_MODEL_HASH,
    VALUATION_VERSION,
    SIGNAL_VERSION,
    DATA_SNAPSHOT_VERSION,
    PRICE_ADJUSTMENT_VERSION,
    RETURN_PRICE_BASIS,
    normalizeYahooOhlcRows,
    selectPriceSeries,
    detectCorporateAction,
    cacheDel,
    TRANSPARENCY_CACHE_KEY,
  };
}

export function loadIdxCandidateUniverse(csvPath = path.join(repoRoot, 'idx_emiten_900.csv')) {
  if (!fs.existsSync(csvPath)) return [];
  const lines = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = headers.findIndex((h) => h === 'Kode_YFinance');
  if (idx < 0) return [];
  const tickers = lines.slice(1)
    .map((line) => line.split(',')[idx]?.trim())
    .map((ticker) => normalizeTicker(ticker ?? ''))
    .filter((ticker) => /^[A-Z0-9]{1,12}\.JK$/.test(ticker));
  return Array.from(new Set(tickers)).sort();
}

export function resolveBackfillUniverse(options, deps) {
  if (options.tickers?.length) {
    return { tickers: options.tickers, universeVersion: options.universeVersion || deps.POINT_IN_TIME_VALIDATION_UNIVERSE_VERSION };
  }
  if (options.universeAdditions) {
    return { tickers: deps.AI_PICK_UNIVERSE_ADDITIONS, universeVersion: options.universeVersion || deps.ACTIVE_LIQUID_UNIVERSE_VERSION };
  }
  // H-02: start from the broad available IDX catalogue, not a list selected with 2026 conditions.
  const broad = loadIdxCandidateUniverse();
  const tickers = Array.from(new Set([...broad, ...deps.BACKTEST_UNIVERSE])).sort();
  if (!tickers.length) throw new Error('FAIL-CLOSED: kandidat universe IDX kosong; idx_emiten_900.csv tidak dapat dibaca.');
  return { tickers, universeVersion: options.universeVersion || deps.POINT_IN_TIME_VALIDATION_UNIVERSE_VERSION };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function loadCheckpoint(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { completed: new Set(), failed: {} };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    completed: new Set(Array.isArray(parsed.completedTickers) ? parsed.completedTickers.map((t) => String(t).toUpperCase()) : []),
    failed: parsed.failedTickers && typeof parsed.failedTickers === 'object' ? parsed.failedTickers : {},
  };
}

function saveCheckpoint(filePath, state) {
  if (!filePath) return;
  const target = path.resolve(repoRoot, filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({
    updatedAt: new Date().toISOString(),
    completedTickers: Array.from(state.completed).sort(),
    failedTickers: state.failed,
  }, null, 2));
}

async function main() {
  const options = parseArgs();
  loadEnvFile();
  const deps = await loadProductionDeps();
  if (!options.dryRun) {
    await deps.ensureSharedSchema();
  }

  const { tickers, universeVersion } = resolveBackfillUniverse(options, deps);
  const checkpointFile = options.checkpointFile || (options.universeAdditions ? 'scripts/.universe-200-additions-backfill-checkpoint.json' : 'scripts/.pit-validation-backfill-checkpoint.json');
  const checkpoint = loadCheckpoint(checkpointFile);
  const pendingTickers = tickers.filter((ticker) => !checkpoint.completed.has(ticker.toUpperCase()));
  const runTimestamp = new Date().toISOString();
  let fundamentalsByTicker = new Map();
  try {
    fundamentalsByTicker = await loadFundamentalHistory(deps.pool, pendingTickers, options.endDate);
  } catch (err) {
    if (!options.dryRun) throw err;
    console.warn(`[WARN] fundamental_history tidak terbaca saat dry-run; fundamental dikosongkan: ${err instanceof Error ? err.message : String(err)}`);
  }

  let builtRows = 0;
  let savedRows = 0;
  let failedTickers = 0;
  let skippedByCheckpoint = tickers.length - pendingTickers.length;
  let skippedNoRows = 0;

  console.log(`Backfill LensRadar ${options.startDate}..${options.endDate} untuk ${pendingTickers.length}/${tickers.length} ticker`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'UPSERT'}; range Yahoo: ${options.range}; universe: ${universeVersion}`);
  console.log(`Batch ticker: ${options.tickerBatchSize}; concurrency: ${options.concurrency}; retry: ${options.retryAttempts}; checkpoint: ${checkpointFile || '-'}`);
  if (!options.tickers?.length && !options.universeAdditions) {
    console.warn('[LIMITATION] PIT universe memakai katalog emiten IDX yang tersedia saat ini sebagai candidate superset. Emiten yang sudah delisting dan tidak ada di katalog belum dapat direkonstruksi tanpa historical listing master resmi.');
  }

  for (let i = 0; i < pendingTickers.length; i += options.tickerBatchSize) {
    const batch = pendingTickers.slice(i, i + options.tickerBatchSize);
    const results = await mapWithConcurrency(batch, options.concurrency, async (ticker) => {
      try {
        const { rows: yahooRows, dataTimestamp } = await fetchYahooChartRowsWithRetry(ticker, options.range, options.retryAttempts);
        const rows = buildHistoricalLensRows({
          ticker,
          yahooRows,
          fundamentals: fundamentalsByTicker.get(ticker) ?? [],
          startDate: options.startDate,
          endDate: options.endDate,
          dataTimestamp,
          runTimestamp,
          universeVersion,
          deps,
        });
        return { ticker, rows, error: null };
      } catch (err) {
        return { ticker, rows: [], error: err instanceof Error ? err.message : String(err) };
      }
    });

    for (const result of results) {
      if (result.error) {
        failedTickers++;
        checkpoint.failed[result.ticker] = result.error;
        console.warn(`[WARN] ${result.ticker} gagal: ${result.error}`);
        continue;
      }
      if (result.rows.length === 0) {
        skippedNoRows++;
        checkpoint.failed[result.ticker] = 'NO_VALID_ROWS';
        console.warn(`[SKIP] ${result.ticker}: tidak ada baris valid dalam window`);
        continue;
      }
      builtRows += result.rows.length;
      if (!options.dryRun) savedRows += await upsertLensHistoryRows(deps.pool, result.rows);
      if (!options.dryRun) {
        checkpoint.completed.add(result.ticker.toUpperCase());
        delete checkpoint.failed[result.ticker];
        saveCheckpoint(checkpointFile, checkpoint);
      }
      console.log(`${result.ticker}: ${result.rows.length} rows`);
    }
  }

  let bucketStats = null;
  if (!options.dryRun && !options.skipBacktest) {
    bucketStats = await deps.runAndSaveLensBucketBacktest(
      deps.pool,
      undefined,
      options.endDate,
      {
        scoreVersion: options.scoreVersion ?? deps.SCORE_VERSION,
        scoreConfigHash: deps.LENS_SCORE_MODEL_HASH,
      }
    );
    // Backfill mengubah sumber data transparency secara massal. Hapus cache spesifik
    // supaya UI publik tidak menunggu TTL 30 menit sambil menampilkan totalSamples lama.
    await deps.cacheDel(deps.TRANSPARENCY_CACHE_KEY);
    await deps.cacheDel(`sahamlens:cache:lock:${deps.TRANSPARENCY_CACHE_KEY}`);
  }

  console.log(JSON.stringify({
    status: failedTickers === tickers.length ? 'FAILED_ALL_TICKERS' : 'OK',
    tickers: tickers.length,
    pendingTickers: pendingTickers.length,
    skippedByCheckpoint,
    failedTickers,
    skippedNoRows,
    builtRows,
    savedRows: options.dryRun ? 0 : savedRows,
    bucketStatsSavedRows: bucketStats?.savedRows ?? 0,
    scoreVersion: deps.SCORE_VERSION,
    universeVersion,
    priceBasis: deps.RETURN_PRICE_BASIS,
  }, null, 2));

  // Dry-run tidak pernah membuka koneksi database - `loadFundamentalHistory` sengaja
  // ditangkap di atas dan fundamentalnya dikosongkan. Menyentuh `deps.pool` DI SINI
  // tetap memaksa lazy getter-nya menuntut DATABASE_URL, sehingga dry-run yang sudah
  // selesai dan sudah mencetak ringkasannya tetap mati di baris terakhir dengan
  // ZodError. Efeknya: satu-satunya cara memeriksa pipeline tanpa database jadi
  // terlihat gagal padahal hasilnya benar.
  if (!options.dryRun && typeof deps.pool.end === 'function') await deps.pool.end();
  if (failedTickers === tickers.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
