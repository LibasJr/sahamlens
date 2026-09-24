#!/usr/bin/env node

/**
 * Bedah irisan OOS LensIntraday - alat diagnosa, BUKAN pengubah status.
 *
 * Tujuan: menjawab pertanyaan "apakah ada irisan yang benar-benar positif setelah biaya,
 * dan berapa besar bagian kerugian yang berasal dari biaya vs dari sinyalnya sendiri".
 *
 * Aturan yang dipatuhi skrip ini:
 *   - TIDAK menulis apa pun ke database (read-only).
 *   - TIDAK mengubah protokol/kriteria/ambang yang sudah dibekukan.
 *   - Memakai loader produksi (loadIntradayObservations) supaya yang diukur persis
 *     yang dilihat validasi, bukan salinan rumus.
 *   - Sampel OOS = sinyal SETELAH freeze protokol. Arsip pra-freeze hanya boleh
 *     ditampilkan sebagai konteks dan WAJIB dilabeli bukan bukti OOS.
 *
 * Usage:
 *   node scripts/intraday-oos-dissection.mjs --probe
 *   node scripts/intraday-oos-dissection.mjs            # irisan OOS
 *   node scripts/intraday-oos-dissection.mjs --include-prefreeze-context
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';

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

const args = new Set(process.argv.slice(2));
const PROBE = args.has('--probe');
const INCLUDE_PREFREEZE = args.has('--include-prefreeze-context');

const HORIZONS = ['M15', 'H1', 'H4', 'H30', 'EOD'];

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** t satu sisi: apakah rata-rata > 0. p = P(T >= t). Pendekatan normal untuk n besar. */
function oneSidedP(values) {
  const n = values.length;
  if (n < 3) return null;
  const m = mean(values);
  const s = stdev(values);
  if (!s || s === 0) return null;
  const t = m / (s / Math.sqrt(n));
  // Pendekatan normal standar (n besar); disebut apa adanya di output.
  const p = 0.5 * (1 - erf(t / Math.SQRT2));
  return { t, p, n };
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function fmt(value, digits = 5) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return Number(value).toFixed(digits);
}

function pct(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${(value * 100).toFixed(2)}%`;
}

function scoreBucket(score) {
  if (score === null || score === undefined) return 'tanpa skor';
  if (score >= 80) return '80-100';
  if (score >= 70) return '70-79';
  if (score >= 60) return '60-69';
  return '<60';
}

function hourOf(minute) {
  if (minute === null || minute === undefined) return 'tanpa jam';
  const h = Math.floor(Number(minute) / 60);
  return `${String(h).padStart(2, '0')}:00`;
}

function liquidityBand(turnover) {
  const v = Number(turnover);
  if (!Number.isFinite(v)) return 'tanpa nilai';
  if (v >= 50_000_000_000) return '>= 50 M';
  if (v >= 10_000_000_000) return '10-50 M';
  if (v >= 1_000_000_000) return '1-10 M';
  return '< 1 M';
}

function summarise(label, rows) {
  const nets = rows.map((r) => Number(r.netReturn)).filter((v) => Number.isFinite(v));
  const gross = rows.map((r) => Number(r.grossReturn)).filter((v) => Number.isFinite(v));
  const costs = rows
    .map((r) => (Number.isFinite(Number(r.grossReturn)) && Number.isFinite(Number(r.netReturn)) ? Number(r.grossReturn) - Number(r.netReturn) : null))
    .filter((v) => v !== null);
  const positives = nets.filter((v) => v > 0);
  const gains = positives.reduce((a, b) => a + b, 0);
  const losses = Math.abs(nets.filter((v) => v <= 0).reduce((a, b) => a + b, 0));
  const stat = oneSidedP(nets);

  return {
    label,
    n: nets.length,
    gross: mean(gross),
    cost: mean(costs),
    net: mean(nets),
    winRate: nets.length ? positives.length / nets.length : null,
    profitFactor: losses > 0 ? gains / losses : null,
    p: stat?.p ?? null,
    t: stat?.t ?? null,
  };
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log(
    ['irisan', 'n', 'bruto', 'biaya', 'netto', 'win', 'PF', 'p (1 sisi)']
      .map((h) => h.padEnd(14))
      .join('')
  );
  for (const row of rows) {
    console.log(
      [
        row.label,
        String(row.n),
        fmt(row.gross),
        fmt(row.cost),
        fmt(row.net),
        row.winRate === null ? 'n/a' : pct(row.winRate),
        row.profitFactor === null ? 'n/a' : fmt(row.profitFactor, 3),
        row.p === null ? 'n/a' : fmt(row.p, 4),
      ]
        .map((v) => String(v).padEnd(14))
        .join('')
    );
  }
}

function groupAndSummarise(rows, keyOf, minN = 30) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .filter(([, bucket]) => bucket.length >= minN)
    .map(([key, bucket]) => summarise(key, bucket))
    .sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity));
}

async function main() {
  const restore = installTypeScriptRequireHook();

  const repo = require(path.join(repoRoot, 'modules/intraday/repository/intraday.repository.ts'));
  const { loadIntradayObservations } = repo;
  const { queryReadWithRetry } = require(path.join(repoRoot, 'shared/database/postgres.client.ts'));

  const protocolRes = await queryReadWithRetry(
    `select * from intraday_oos_protocols where status = 'FROZEN' order by freeze_timestamp desc limit 1`
  );
  const protocol = protocolRes.rows[0] ?? null;
  if (!protocol) {
    console.log('[bedah] Tidak ada protokol OOS aktif. Skrip berhenti apa adanya.');
    restore();
    return;
  }

  console.log('=== BEDAH IRISAN LENSINTRADAY (baca-saja) ===');
  console.log(`model           : ${protocol.model_version}`);
  console.log(`protokol        : ${protocol.protocol_version ?? protocol.protocolVersion ?? '(tanpa versi)'}`);
  console.log(`config hash     : ${protocol.config_hash ?? protocol.configHash}`);
  console.log(`freeze          : ${protocol.freeze_timestamp ?? protocol.freezeTimestamp}`);
  const criteria = protocol.acceptance_criteria ?? protocol.acceptanceCriteria ?? {};
  console.log(`kriteria beku   : hari OOS >= ${criteria.minOosTradingDays}, emiten >= ${criteria.minDistinctTickers}, sampel >= ${criteria.minEffectiveSamplesTotal}`);
  console.log('Catatan: kriteria TIDAK diubah oleh skrip ini; hanya dilaporkan.');

  const freeze = protocol.freeze_timestamp ?? protocol.freezeTimestamp;
  const oos = await loadIntradayObservations({
    modelVersion: protocol.model_version ?? protocol.modelVersion,
    configHash: protocol.config_hash ?? protocol.configHash,
    signalAfter: freeze,
  });

  const rows = oos.rows ?? oos;
  console.log(`\nsampel OOS (setelah freeze): ${rows.length} baris`);

  if (rows.length === 0) {
    console.log('[bedah] Belum ada sampel OOS. Status gagal memang belum bisa dinilai ulang - bukan kesalahan data.');
    restore();
    return;
  }

  if (PROBE) {
    console.log('kolom yang tersedia pada baris pertama:');
    console.log(Object.keys(rows[0]).sort().join(', '));
    console.log('contoh baris pertama:');
    console.log(JSON.stringify(rows[0], null, 2).slice(0, 800));
    restore();
    return;
  }

  const days = new Set(rows.map((r) => r.tradingDate ?? r.trading_date));
  const tickers = new Set(rows.map((r) => r.ticker));
  console.log(`hari bursa: ${days.size} · emiten: ${tickers.size}`);

  const overall = summarise('SEMUA OOS', rows);
  printTable('Ringkasan keseluruhan (semua horizon tercampur):', [overall]);
  console.log(
    `\nArti cepat: bruto ${fmt(overall.gross)} vs biaya ${fmt(overall.cost)} -> netto ${fmt(overall.net)}. ` +
      `Kalau bruto sudah <= 0, kerugiannya bukan karena biaya. Kalau bruto > 0 tapi netto <= 0, biayanya yang memakan.`
  );

  for (const horizon of HORIZONS) {
    const subset = rows.filter((r) => (r.horizon ?? null) === horizon);
    if (subset.length < 30) continue;
    const rowsOut = [
      summarise(`${horizon} keseluruhan`, subset),
      ...groupAndSummarise(subset, (r) => `${horizon} skor ${scoreBucket(r.score)}`),
      ...groupAndSummarise(subset, (r) => `${horizon} jam ${hourOf(r.signalMinute)}`, 50),
    ];
    printTable(`Horizon ${horizon}:`, rowsOut);
    const positif = rowsOut.filter((r) => r.net > 0 && r.p !== null && r.p < 0.05);
    console.log(
      `-> irisan ${horizon} dengan netto > 0 DAN p < 0.05: ${positif.length}` +
        (positif.length ? ` (${positif.map((r) => r.label).join('; ')})` : ' - tidak ada')
    );
  }

  const byRegime = groupAndSummarise(rows, (r) => `regime ${r.regime ?? 'tanpa regime'}`, 30);
  if (byRegime.length) printTable('Per regime:', byRegime);

  const byLiquidity = groupAndSummarise(rows, (r) => `likuiditas ${liquidityBand(r.turnoverIdr)}`, 30);
  if (byLiquidity.length) printTable('Per band likuiditas:', byLiquidity);

  const allPositive = [...groupAndSummarise(rows, (r) => `${r.horizon ?? '?'} skor ${scoreBucket(r.score)}`, 30)].filter(
    (r) => r.net > 0 && r.p !== null && r.p < 0.05
  );
  console.log(
    `\nKESIMPULAN BACA-SAJA: irisan netto > 0 dengan p < 0.05 = ${allPositive.length}. ` +
      `Kalau nol, belum ada irisan yang bisa disebut punya keunggulan setelah biaya - dan itu jawaban yang sah.`
  );

  if (INCLUDE_PREFREEZE) {
    console.log(
      '\n=== KONTEKS ARSIP PRA-FREEZE (BUKAN BUKTI OOS - hanya untuk melihat apakah polanya sama) ==='
    );
    const pre = await loadIntradayObservations({
      modelVersion: protocol.model_version ?? protocol.modelVersion,
      configHash: protocol.config_hash ?? protocol.configHash,
      toDate: freeze,
    });
    const preRows = pre.rows ?? pre;
    if (preRows.length) {
      printTable('Pra-freeze (bukan OOS):', [summarise('PRA-FREEZE (bukan OOS)', preRows)]);
    } else {
      console.log('Tidak ada baris pra-freeze untuk konfigurasi ini.');
    }
  }

  restore();
}

main().catch((error) => {
  console.error('[bedah] gagal:', error?.message ?? error);
  process.exitCode = 1;
});