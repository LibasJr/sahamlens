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
const YAHOO_BATCH_SIZE = 6;
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
  };

  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-backtest') options.skipBacktest = true;
    else if (arg.startsWith('--start=')) options.startDate = arg.slice('--start='.length);
    else if (arg.startsWith('--end=')) options.endDate = arg.slice('--end='.length);
    else if (arg.startsWith('--range=')) options.range = arg.slice('--range='.length);
    else if (arg.startsWith('--score-version=')) options.scoreVersion = arg.slice('--score-version='.length);
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
  const timer = setTimeout(() => controller.abort(), 15_000);
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
      row.priceDataVersion
    );
    return `($${base + 1}::date, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}::timestamptz, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}::timestamptz, $${base + 21}, now())`;
  });

  return {
    text: `
      INSERT INTO lens_radar_history (
        date, ticker, lens_score, close_price, market_cap,
        technical_score, fundamental_score, flow_score, coverage_pct,
        score_version, valuation_version, signal_version, data_snapshot_version,
        calculation_timestamp,
        raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
        corporate_action_status, price_data_timestamp, price_data_version,
        updated_at
      )
      VALUES ${tuples.join(', ')}
      ON CONFLICT (date, ticker) DO UPDATE SET
        lens_score = EXCLUDED.lens_score,
        close_price = EXCLUDED.close_price,
        market_cap = EXCLUDED.market_cap,
        technical_score = EXCLUDED.technical_score,
        fundamental_score = EXCLUDED.fundamental_score,
        flow_score = EXCLUDED.flow_score,
        coverage_pct = EXCLUDED.coverage_pct,
        score_version = EXCLUDED.score_version,
        valuation_version = EXCLUDED.valuation_version,
        signal_version = EXCLUDED.signal_version,
        data_snapshot_version = EXCLUDED.data_snapshot_version,
        calculation_timestamp = EXCLUDED.calculation_timestamp,
        raw_close_price = EXCLUDED.raw_close_price,
        adjusted_close_price = EXCLUDED.adjusted_close_price,
        price_basis = EXCLUDED.price_basis,
        adjustment_factor = EXCLUDED.adjustment_factor,
        corporate_action_status = EXCLUDED.corporate_action_status,
        price_data_timestamp = EXCLUDED.price_data_timestamp,
        price_data_version = EXCLUDED.price_data_version,
        updated_at = now()
    `,
    params,
  };
}

export async function loadFundamentalHistory(pool, tickers, endDate) {
  const { rows } = await pool.query(
    `
    SELECT ticker, observed_date, per, pbv, roe, der, current_ratio, revenue_growth
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
    });
    byTicker.set(ticker, list);
  }
  return byTicker;
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

export function buildHistoricalLensRows(input) {
  const {
    ticker,
    yahooRows,
    fundamentals,
    startDate,
    endDate,
    dataTimestamp,
    runTimestamp,
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

    const previousRawClose = finitePositive(historyToDate[historyToDate.length - 2]?.Close);
    const changePct = previousRawClose != null ? ((rawClose / previousRawClose) - 1) * 100 : null;
    const volumeToday = finiteNumber(historyToDate[historyToDate.length - 1]?.Volume);
    const volAvg20 = historyToDate.length >= 20
      ? historyToDate.slice(-20).reduce((sum, row) => sum + (finiteNumber(row.Volume) ?? 0), 0) / 20
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

    const rsiResult = deps.analyzeRsi(historyToDate, rawClose);
    const macdResult = deps.analyzeMacd(historyToDate, rawClose);
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
        sector: { yahooSector: null, yahooIndustry: null, payoutRatio: null, beta: null },
      },
      {
        cmf20: bandarmology.cmf20,
        accumulationStatus: accumulation.status,
        consecutiveBuyDays: buyStreak,
        consecutiveSellDays: sellStreak,
        volRatio: volAvg20 && volAvg20 > 0 && volumeToday != null ? volumeToday / volAvg20 : null,
        mfmPositiveRatio20: accumulation.mfmPositiveRatio20,
      }
    );

    rows.push({
      date: bar.date,
      ticker,
      lensScore: score.total_score,
      closePrice: adjustedClose,
      marketCap: null,
      technicalScore: score.technical_score,
      fundamentalScore: score.fundamental_score,
      flowScore: score.flow_score,
      coveragePct: score.coverage_pct,
      scoreVersion: deps.SCORE_VERSION,
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
    calculateScore,
    analyzeRsi,
    analyzeMacd,
  } = require('../modules/technical/index.ts');
  const {
    computeDailyNetFlow,
    computeAccumulationStreak,
    analyzeAccumulationSignal,
    analyzeBandarmology,
  } = require('../modules/market/index.ts');
  const {
    SCORE_VERSION,
    VALUATION_VERSION,
    SIGNAL_VERSION,
    DATA_SNAPSHOT_VERSION,
  } = require('../modules/lens-radar/constants/model-version.ts');
  const {
    PRICE_ADJUSTMENT_VERSION,
    RETURN_PRICE_BASIS,
    normalizeYahooOhlcRows,
    selectPriceSeries,
    detectCorporateAction,
  } = require('../shared/market/price-basis.ts');
  const { runAndSaveLensBucketBacktest } = require('../modules/lens-radar/service/bucket-backtest.service.ts');

  return {
    pool,
    ensureSharedSchema,
    BACKTEST_UNIVERSE,
    runAndSaveLensBucketBacktest,
    calculateScore,
    analyzeRsi,
    analyzeMacd,
    computeDailyNetFlow,
    computeAccumulationStreak,
    analyzeAccumulationSignal,
    analyzeBandarmology,
    SCORE_VERSION,
    VALUATION_VERSION,
    SIGNAL_VERSION,
    DATA_SNAPSHOT_VERSION,
    PRICE_ADJUSTMENT_VERSION,
    RETURN_PRICE_BASIS,
    normalizeYahooOhlcRows,
    selectPriceSeries,
    detectCorporateAction,
  };
}

async function main() {
  const options = parseArgs();
  loadEnvFile();
  const deps = await loadProductionDeps();
  if (!options.dryRun) {
    await deps.ensureSharedSchema();
  }

  const tickers = options.tickers?.length ? options.tickers : deps.BACKTEST_UNIVERSE;
  const runTimestamp = new Date().toISOString();
  let fundamentalsByTicker = new Map();
  try {
    fundamentalsByTicker = await loadFundamentalHistory(deps.pool, tickers, options.endDate);
  } catch (err) {
    if (!options.dryRun) throw err;
    console.warn(`[WARN] fundamental_history tidak terbaca saat dry-run; fundamental dikosongkan: ${err instanceof Error ? err.message : String(err)}`);
  }

  let builtRows = 0;
  let savedRows = 0;
  let failedTickers = 0;

  console.log(`Backfill LensRadar ${options.startDate}..${options.endDate} untuk ${tickers.length} ticker`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'UPSERT'}; range Yahoo: ${options.range}`);

  for (let i = 0; i < tickers.length; i += YAHOO_BATCH_SIZE) {
    const batch = tickers.slice(i, i + YAHOO_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (ticker) => {
      try {
        const { rows: yahooRows, dataTimestamp } = await fetchYahooChartRows(ticker, options.range);
        const rows = buildHistoricalLensRows({
          ticker,
          yahooRows,
          fundamentals: fundamentalsByTicker.get(ticker) ?? [],
          startDate: options.startDate,
          endDate: options.endDate,
          dataTimestamp,
          runTimestamp,
          deps,
        });
        return { ticker, rows, error: null };
      } catch (err) {
        return { ticker, rows: [], error: err instanceof Error ? err.message : String(err) };
      }
    }));

    for (const result of results) {
      if (result.error) {
        failedTickers++;
        console.warn(`[WARN] ${result.ticker} gagal: ${result.error}`);
        continue;
      }
      builtRows += result.rows.length;
      if (!options.dryRun) savedRows += await upsertLensHistoryRows(deps.pool, result.rows);
      console.log(`${result.ticker}: ${result.rows.length} rows`);
    }
  }

  let bucketStats = null;
  if (!options.dryRun && !options.skipBacktest) {
    bucketStats = await deps.runAndSaveLensBucketBacktest(
      deps.pool,
      undefined,
      options.endDate,
      { scoreVersion: options.scoreVersion ?? deps.SCORE_VERSION }
    );
  }

  console.log(JSON.stringify({
    status: failedTickers === tickers.length ? 'FAILED_ALL_TICKERS' : 'OK',
    tickers: tickers.length,
    failedTickers,
    builtRows,
    savedRows: options.dryRun ? 0 : savedRows,
    bucketStatsSavedRows: bucketStats?.savedRows ?? 0,
    scoreVersion: deps.SCORE_VERSION,
    priceBasis: deps.RETURN_PRICE_BASIS,
  }, null, 2));

  if (typeof deps.pool.end === 'function') await deps.pool.end();
  if (failedTickers === tickers.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
