#!/usr/bin/env node
/**
 * Verifikasi temuan audit SAHAMLENS_QUANT_FINANCIAL_AUDIT_2026.md, dijalankan terhadap
 * kode produksi apa adanya. Skrip ini TIDAK mengubah apa pun.
 *
 *   node docs/audit-2026-08-11/verify-findings.mjs            # C-2 dan C-3 (offline)
 *   node docs/audit-2026-08-11/verify-findings.mjs --network  # tambah C-1 (butuh Yahoo)
 *
 * Sebelum Fase 1 (11 Agustus 2026) ketiganya FAIL. Setelah Fase 1 (12 Agustus 2026)
 * ketiganya harus PASS. Skrip ini sengaja dipertahankan sebagai pemeriksa hidup, bukan
 * catatan sejarah - kalau salah satunya kembali FAIL, ada regresi.
 */

import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const withNetwork = process.argv.includes('--network');
const verdicts = [];

// Hook TypeScript yang sama dengan scripts/backfill-lens-history.mjs, supaya skrip ini
// memanggil sumber produksi langsung dan tidak pernah menyalin logikanya.
{
  const ts = require('typescript');
  const previousResolve = Module._resolveFilename;
  const rootWithSep = `${repoRoot}${path.sep}`;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      return previousResolve.call(this, path.join(rootWithSep, request.slice(2)), parent, isMain, options);
    }
    return previousResolve.call(this, request, parent, isMain, options);
  };
  Module._extensions['.ts'] = function (module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
}

const { calculateScore } = require(path.join(repoRoot, 'modules/technical/service/scoring.service.ts'));
const { calculateRsi } = require(path.join(repoRoot, 'modules/technical/service/rsi.ts'));
const { calculateWilderAtr } = require(path.join(repoRoot, 'modules/technical/service/atr.ts'));
const { analyze: analyzeVolatility } = require(path.join(repoRoot, 'modules/technical/service/analyzers/volatility-analyzer.ts'));
const {
  barAtForwardTradingOffset,
  barAtTradingOffset,
} = require(path.join(repoRoot, 'modules/lens-radar/service/history-return-utils.ts'));
// pathToFileURL wajib: di Windows, `import()` atas path absolut membaca "c:" sebagai
// skema URL dan gagal dengan ERR_UNSUPPORTED_ESM_URL_SCHEME.
const backfill = await import(pathToFileURL(path.join(repoRoot, 'scripts/backfill-lens-history.mjs')).href);

function report(kode, lulus, catatan) {
  verdicts.push({ kode, lulus });
  console.log(`    VERDICT ${kode}: ${lulus ? 'PASS' : 'FAIL'}${catatan ? ` - ${catatan}` : ''}`);
}

// ---------------------------------------------------------------------------
// C-2  Konteks sektor point-in-time sampai ke scoring historis
// ---------------------------------------------------------------------------
function verifyC2() {
  console.log('\n=== C-2  konteks sektor di jalur backfill vs produksi ===');
  console.log('    backfill : scripts/backfill-lens-history.mjs -> sectorContextAsOf()');
  console.log('    produksi : app/api/stock/[ticker]/route.ts:482\n');

  // Bagian 1 - apakah backfill benar-benar meneruskan sektor dari arsip?
  const pitRow = {
    observedDate: '2025-01-01', per: 11, pbv: 2.2, roe: 20, der: 6.0,
    currentRatio: null, revenueGrowth: 9,
    yahooSector: 'Financial Services', yahooIndustry: 'Banks - Regional', payoutRatio: 0.5,
  };
  const diteruskan = backfill.sectorContextAsOf(pitRow);
  console.log(`    sector yang diteruskan backfill : ${JSON.stringify(diteruskan)}`);
  const meneruskan = diteruskan.yahooSector === 'Financial Services'
    && diteruskan.yahooIndustry === 'Banks - Regional'
    && diteruskan.payoutRatio === 0.5;

  // Bagian 2 - seberapa besar taruhannya kalau sektor hilang. Angka ini SENGAJA tetap
  // dihitung setelah perbaikan: ia mengukur sensitivitas model terhadap sektor, yaitu
  // alasan kenapa kehilangan sektor di histori dulu begitu merusak.
  const technical = (rsi) => ({
    currentPrice: 5000, currentRawPrice: 5000, currentAdjustedPrice: 5000,
    currentPriceBasis: 'TOTAL_RETURN_ADJUSTED', maPriceBasis: 'TOTAL_RETURN_ADJUSTED',
    ma20: 4900, ma50: 4800, ma200: 4500,
    rsi, macdHist: 5, macdLine: 1, macdSignal: 0,
    volToday: 1_800_000, volAvg20: 1_000_000, changePct: 1.5,
  });
  const flow = (cmf20) => ({
    cmf20, accumulationStatus: 'AKUMULASI',
    consecutiveBuyDays: 3, consecutiveSellDays: 0, volRatio: 1.8, mfmPositiveRatio20: 0.7,
  });
  const emptySector = { yahooSector: null, yahooIndustry: null, payoutRatio: null, beta: null };
  const bucketOf = (s) => (s >= 80 ? '80-100' : s >= 70 ? '70-79' : s >= 60 ? '60-69' : '<60');
  const sectors = [
    ['Financial Services', 'Banks - Regional'], ['Energy', 'Thermal Coal'],
    ['Basic Materials', 'Other Industrial Metals'], ['Real Estate', 'Real Estate - Development'],
    ['Consumer Defensive', 'Packaged Foods'], ['Communication Services', 'Telecom Services'],
  ];
  let combinations = 0, maxDelta = 0, bucketFlips = 0;
  for (const [yahooSector, yahooIndustry] of sectors)
    for (const per of [4, 8, 12, 18, 28, 40])
      for (const pbv of [0.6, 1.2, 2.5, 5])
        for (const roe of [5, 12, 20, 30])
          for (const der of [0.3, 1.0, 1.9, 6.0])
            for (const currentRatio of [null, 1.2, 2.5])
              for (const revenueGrowth of [-5, 4, 12, 25])
                for (const rsi of [45, 60])
                  for (const cmf of [8, 25]) {
                    const f = { per, pbv, roe, der, currentRatio, revenueGrowth };
                    const t = technical(rsi), fl = flow(cmf);
                    const tanpa = calculateScore('X', t, { ...f, sector: emptySector }, fl);
                    const dengan = calculateScore('X', t, { ...f, sector: { yahooSector, yahooIndustry, payoutRatio: 0.4, beta: null } }, fl);
                    combinations++;
                    maxDelta = Math.max(maxDelta, Math.abs(dengan.total_score - tanpa.total_score));
                    if (bucketOf(tanpa.total_score) !== bucketOf(dengan.total_score)) bucketFlips++;
                  }
  console.log(`    sensitivitas model terhadap sektor: ${maxDelta} poin maks, ${((bucketFlips / combinations) * 100).toFixed(1)}% pindah bucket (${combinations.toLocaleString('id-ID')} kombinasi)`);
  report('C-2', meneruskan, meneruskan
    ? 'backfill memakai sektor dari arsip point-in-time'
    : 'backfill masih mengirim sektor kosong ke calculateScore()');
}

// ---------------------------------------------------------------------------
// C-3  Bar entry tidak boleh mundur ke tanggal sinyal
// ---------------------------------------------------------------------------
function verifyC3() {
  console.log('\n=== C-3  pemilihan bar entry backtest ===');
  console.log('    modules/lens-radar/service/history-return-utils.ts');
  console.log('    pemanggil: bucket-backtest.service.ts, calibration.service.ts\n');

  const calendar = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
  const signalIndex = 2;
  const signalDate = calendar[signalIndex];
  const mapOf = (dates) => new Map(dates.map((d) => [d, { date: d }]));

  const cases = [
    ['histori ticker lengkap    ', calendar],
    ['H+1 dan H+2 tidak ada     ', calendar.slice(0, 3)],
    ['hanya bar H-1 yang ada    ', ['2026-01-06']],
  ];

  let leaked = 0;
  for (const [label, dates] of cases) {
    const entry = barAtForwardTradingOffset(mapOf(dates), calendar, signalIndex, 1);
    const isLeak = entry != null && entry.date <= signalDate;
    if (isLeak) leaked++;
    console.log(`    ${label} -> entry ${entry?.date ?? 'null (sinyal dibuang & dihitung)'}${isLeak ? '   <<< LOOK-AHEAD' : ''}`);
  }

  // Kontrol: fungsi toleransi dua arah yang lama MASIH bocor - itu sebabnya ia tidak
  // lagi dipakai untuk entry. Kalau kontrol ini berhenti bocor, berarti perilaku lama
  // ikut berubah dan test regresi di modules/lens-radar/service/__tests__ perlu ditinjau.
  const lama = barAtTradingOffset(mapOf(calendar.slice(0, 3)), calendar, signalIndex, 1);
  console.log(`    kontrol (barAtTradingOffset, toleransi 2 arah) -> ${lama?.date} ${lama?.date <= signalDate ? '(memang bocor - sengaja tidak dipakai untuk entry)' : ''}`);

  report('C-3', leaked === 0, leaked === 0
    ? 'tidak ada skenario yang menghasilkan entry pada/sebelum tanggal sinyal'
    : `${leaked} skenario masih bocor`);
}

// ---------------------------------------------------------------------------
// C-1  Satu ATR untuk produksi dan TP/CL Lab (butuh jaringan)
// ---------------------------------------------------------------------------
async function fetchYahooBars(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SahamLensAudit/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = (await response.json()).chart.result[0];
  const quote = result.indicators.quote[0];
  const adjclose = result.indicators.adjclose?.[0]?.adjclose;
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const ohlc = [quote.open[i], quote.high[i], quote.low[i], quote.close[i]];
    if (!ohlc.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    bars.push({ high: quote.high[i], low: quote.low[i], close: quote.close[i], adjClose: adjclose?.[i] ?? quote.close[i] });
  }
  return bars;
}

/** FORMULA LAMA produksi (rata-rata aritmatik 14 TR terakhir) - kontrol negatif. */
function simpleMeanAtr(bars) {
  let trSum = 0;
  for (let i = bars.length - 14; i < bars.length; i++) {
    trSum += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  return trSum / 14;
}

/** Referensi RSI independen: RMA rekursif alpha = 1/n (bentuk pandas ewm adjust=False). */
function rsiReferensi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  const diffs = [];
  for (let i = 1; i < closes.length; i++) diffs.push(closes[i] - closes[i - 1]);
  const gains = diffs.map((d) => (d > 0 ? d : 0));
  const losses = diffs.map((d) => (d < 0 ? -d : 0));
  let avgGain = gains.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let avgLoss = losses.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < diffs.length; i++) {
    avgGain += (gains[i] - avgGain) / n;
    avgLoss += (losses[i] - avgLoss) / n;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

async function verifyC1() {
  console.log('\n=== C-1  ATR produksi vs ATR TP/CL Lab ===');
  console.log('    produksi : volatility-analyzer.ts -> modules/technical/service/atr.ts');
  console.log('    lab      : tpcl-validation.service.ts -> modules/technical/service/atr.ts');
  console.log('    kontrol  : RSI produksi vs implementasi independen (harus ~1e-14)\n');
  console.log('    ticker      bar   ATR produksi   ATR bersama   selisih   | formula lama   selisih lama  | RSI');

  let divergen = 0;
  let diuji = 0;
  for (const ticker of ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'ASII.JK', 'ADRO.JK']) {
    try {
      const bars = await fetchYahooBars(ticker);
      const closes = bars.map((b) => b.adjClose);
      // Jalur produksi apa adanya: analyzer volatilitas mengembalikan raw.atr.
      const produksi = analyzeVolatility(
        bars.map((b) => ({ High: b.high, Low: b.low, Close: b.close })),
        bars[bars.length - 1].close
      ).raw.atr;
      // Jalur lab: helper bersama yang sama.
      const bersama = calculateWilderAtr(bars);
      const lama = simpleMeanAtr(bars);
      const beda = Math.abs((produksi - bersama) / bersama) * 100;
      if (beda > 1e-9) divergen++;
      diuji++;
      const rsiDelta = calculateRsi(closes, 14) - rsiReferensi(closes, 14);
      console.log(
        `    ${ticker.padEnd(10)} ${String(bars.length).padStart(4)}   ${produksi.toFixed(2).padStart(11)}   ${bersama.toFixed(2).padStart(11)}   ${beda.toFixed(4).padStart(6)}%  | ${lama.toFixed(2).padStart(12)}   ${(((lama - bersama) / bersama) * 100).toFixed(2).padStart(10)}%  | ${rsiDelta.toExponential(1)}`
      );
    } catch (err) {
      console.log(`    ${ticker.padEnd(10)} GAGAL: ${err.message}`);
    }
  }
  report('C-1', diuji > 0 && divergen === 0, divergen === 0
    ? 'produksi dan lab memakai ATR yang sama persis; kolom "selisih lama" menunjukkan besar masalah yang diperbaiki'
    : `${divergen} ticker masih divergen`);
}

console.log('SAHAMLENS - verifikasi temuan audit (kode per 2026-08-12, sesudah Fase 1)');
verifyC2();
verifyC3();
if (withNetwork) await verifyC1();
else console.log('\n=== C-1 dilewati. Jalankan dengan --network untuk menguji ATR terhadap data Yahoo. ===');

const gagal = verdicts.filter((v) => !v.lulus);
console.log(`\nRINGKASAN: ${verdicts.length - gagal.length}/${verdicts.length} PASS${gagal.length ? ` - REGRESI pada ${gagal.map((v) => v.kode).join(', ')}` : ''}`);
process.exitCode = gagal.length ? 1 : 0;
