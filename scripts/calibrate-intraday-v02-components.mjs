#!/usr/bin/env node

/**
 * Kalibrasi empiris untuk dua komponen baru LensIntraday v0.2.0: obvAccumulation
 * dan bollingerPctB. Skrip ini TIDAK menulis apa pun ke database dan TIDAK melihat
 * net return sama sekali - ia cuma mengukur sebaran nilai MENTAH kedua komponen di
 * seluruh grid sinyal riil, persis metodologi yang sudah dipakai untuk
 * volumeSurgeCenter/volumeSurgeSpan (lihat komentar di intraday-model.ts).
 *
 * Kenapa ini perlu: menyetel rentang pemetaan dari hasil return adalah fitting.
 * Yang sah cuma memeriksa apakah rentangnya masuk akal terhadap sebaran fitur itu
 * sendiri (median, saturasi ujung skala pada beberapa pilihan span).
 *
 * Pakai TS-hook + fetchIntradayBars yang SAMA dengan produksi (bukan salinan),
 * supaya kalibrasi ini benar-benar mengukur apa yang akan dilihat model, bukan
 * pendekatan.
 *
 * Usage: node scripts/calibrate-intraday-v02-components.mjs [--tickers=A,B,C] [--lookback-days=60]
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Module from 'node:module';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function installTypeScriptRequireHook(rootDir = repoRoot) {
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
    const source = require('node:fs').readFileSync(filename, 'utf8');
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

function parseArgs(argv = process.argv.slice(2)) {
  const options = { tickers: null, lookbackDays: null };
  for (const arg of argv) {
    if (arg.startsWith('--tickers=')) {
      options.tickers = arg.slice('--tickers='.length).split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    } else if (arg.startsWith('--lookback-days=')) {
      options.lookbackDays = Number(arg.slice('--lookback-days='.length));
    }
  }
  return options;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = clampIdx((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function clampIdx(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** OBV standar: unchanged close -> kontribusi 0 (bukan setengah, ini bukan trendPersistence). */
function computeObvAccumulationRaw(completedBars) {
  let obv = 0;
  let totalVolume = 0;
  for (const bar of completedBars) totalVolume += bar.volume ?? 0;
  for (let i = 1; i < completedBars.length; i++) {
    const prevClose = completedBars[i - 1].close;
    const close = completedBars[i].close;
    const volume = completedBars[i].volume ?? 0;
    if (close > prevClose) obv += volume;
    else if (close < prevClose) obv -= volume;
  }
  return totalVolume > 0 ? obv / totalVolume : 0;
}

/** %B standar atas window bar 5-menit yang tersedia (dibatasi windowBars). */
function computeBollingerPctBRaw(completedBars, windowBars, k) {
  const window = completedBars.slice(-windowBars);
  const closes = window.map((b) => b.close);
  const mean = average(closes);
  const variance = average(closes.map((c) => (c - mean) ** 2));
  const stdev = Math.sqrt(variance);
  const lastClose = closes[closes.length - 1];
  if (stdev <= 0) return 0.5;
  const upper = mean + k * stdev;
  const lower = mean - k * stdev;
  return (lastClose - lower) / (upper - lower);
}

async function main() {
  const args = parseArgs();
  const restoreHook = installTypeScriptRequireHook();

  const {
    DEFAULT_INTRADAY_CALENDAR,
    INTRADAY_MAX_LOOKBACK_DAYS,
    INTRADAY_BAR_INTERVAL_MINUTES,
  } = require(path.join(repoRoot, 'modules/intraday/constants/intraday-model.ts'));
  const { fetchIntradayBars, fetchExchangeTradingDates, sessionsForDate, isInsideSession } = require(
    path.join(repoRoot, 'modules/intraday/service/intraday-bars.service.ts')
  );
  const { MIN_COMPLETED_BARS_FOR_SIGNAL } = require(
    path.join(repoRoot, 'modules/intraday/service/intraday-signal.service.ts')
  );
  const { DEFAULT_INTRADAY_RESEARCH_UNIVERSE } = require(
    path.join(repoRoot, 'modules/intraday/service/intraday-collector.service.ts')
  );

  const tickers = args.tickers?.length ? args.tickers : DEFAULT_INTRADAY_RESEARCH_UNIVERSE;
  const lookbackDays = Math.min(args.lookbackDays ?? INTRADAY_MAX_LOOKBACK_DAYS, INTRADAY_MAX_LOOKBACK_DAYS);

  console.log(`[calibrate] ${tickers.length} ticker, lookback ${lookbackDays} hari, window Bollinger 12 bar (60 menit), K=2`);

  const referenceTradingDates = await fetchExchangeTradingDates({ lookbackDays, calendar: DEFAULT_INTRADAY_CALENDAR }).catch(
    () => null
  );

  const obvRaw = [];
  const bbRaw = [];
  let tickersOk = 0;
  let tickersFailed = 0;
  let gridPointsSeen = 0;

  const BOLLINGER_WINDOW_BARS = 12; // sama dengan TREND_DOC_BARS (60 menit) - konsisten skala dgn komponen lain.
  const BOLLINGER_K = 2;

  const CONCURRENCY = 4;
  const queue = [...tickers];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const ticker = queue.shift();
      if (!ticker) return;
      const fetched = await fetchIntradayBars(ticker, {
        lookbackDays,
        calendar: DEFAULT_INTRADAY_CALENDAR,
        referenceTradingDates: referenceTradingDates ?? undefined,
      });
      if (fetched.error || !fetched.bars.length) {
        tickersFailed++;
        console.warn(`[WARN] ${ticker}: ${fetched.error ?? 'tanpa bar'}`);
        continue;
      }
      tickersOk++;

      const usableDates = new Set(
        fetched.quality.days.filter((d) => d.status === 'OK').map((d) => d.tradingDate)
      );
      const byDate = new Map();
      for (const bar of fetched.bars) {
        if (!usableDates.has(bar.tradingDate)) continue;
        const list = byDate.get(bar.tradingDate);
        if (list) list.push(bar);
        else byDate.set(bar.tradingDate, [bar]);
      }

      for (const dayBars of Array.from(byDate.values())) {
        const sorted = [...dayBars].sort((a, b) => a.unixSeconds - b.unixSeconds);
        const tradingDate = sorted[0].tradingDate;
        const sessions = sessionsForDate(tradingDate, DEFAULT_INTRADAY_CALENDAR);
        for (const gridMinute of DEFAULT_INTRADAY_CALENDAR.signalGridMinutes) {
          if (!isInsideSession(gridMinute, sessions)) continue;
          const completed = sorted.filter((b) => b.wibMinute + INTRADAY_BAR_INTERVAL_MINUTES <= gridMinute);
          if (completed.length < MIN_COMPLETED_BARS_FOR_SIGNAL) continue;
          gridPointsSeen++;
          obvRaw.push(computeObvAccumulationRaw(completed));
          bbRaw.push(computeBollingerPctBRaw(completed, BOLLINGER_WINDOW_BARS, BOLLINGER_K));
        }
      }
    }
  });
  await Promise.all(workers);

  console.log(`[calibrate] ticker OK: ${tickersOk}, gagal: ${tickersFailed}, titik grid terkumpul: ${gridPointsSeen}`);

  function report(name, values) {
    const sorted = [...values].sort((a, b) => a - b);
    const stats = {
      n: sorted.length,
      min: round(sorted[0], 4),
      p10: round(percentile(sorted, 0.1), 4),
      p25: round(percentile(sorted, 0.25), 4),
      median: round(percentile(sorted, 0.5), 4),
      p75: round(percentile(sorted, 0.75), 4),
      p90: round(percentile(sorted, 0.9), 4),
      p95: round(percentile(sorted, 0.95), 4),
      max: round(sorted[sorted.length - 1], 4),
      mean: round(average(sorted), 4),
    };
    console.log(`\n[${name}] ${JSON.stringify(stats, null, 2)}`);
    return stats;
  }

  const obvStats = report('obvAccumulation raw', obvRaw);
  const bbStats = report('bollingerPctB raw', bbRaw);

  function saturationAt(values, lo, hi) {
    const below = values.filter((v) => v < lo).length;
    const above = values.filter((v) => v > hi).length;
    return { belowPct: round((below / values.length) * 100, 2), abovePct: round((above / values.length) * 100, 2), totalPct: round(((below + above) / values.length) * 100, 2) };
  }

  console.log('\n[obvAccumulation] saturasi pada beberapa pilihan Abs (linearScore(-Abs..Abs)):');
  for (const abs of [obvStats.p90, obvStats.p95, round(Math.max(Math.abs(obvStats.p10), Math.abs(obvStats.p90)), 4)]) {
    console.log(`  Abs=${abs}: ${JSON.stringify(saturationAt(obvRaw, -abs, abs))}`);
  }

  console.log('\n[bollingerPctB] saturasi pada rentang [0,1] apa adanya (tanpa span tambahan):');
  console.log(`  ${JSON.stringify(saturationAt(bbRaw, 0, 1))}`);

  restoreHook();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
