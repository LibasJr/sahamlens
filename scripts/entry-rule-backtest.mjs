#!/usr/bin/env node

/**
 * Uji deterministik aturan Stop Loss / sasaran pada arsip harga HARIAN SahamLens.
 *
 * KENAPA ADA. Halaman /admin/pemindai-harga memakai aturan yang belum pernah diuji:
 * masuk = penutupan terendah 20 sesi, sasaran = penutupan tertinggi 20 sesi, stop =
 * masuk x (1 - 2 x simpangan baku). Rasio risiko/imbalnya KELUAR sebagai hasil hitungan,
 * sehingga bisa muncul angka seperti 23,56 tanpa arti. Skrip ini menguji aturan itu
 * berdampingan dengan kandidat lain pada arsip nyata, dipisah train/OOS.
 *
 * ATURAN MAIN (dipatuhi keras):
 *   - Daftar aturan DIBEKUkan di berkas ini SEBELUM dijalankan (lihat RULES). Tidak ada
 *     aturan yang ditambahkan setelah melihat hasil.
 *   - Baca-saja: tidak menulis apa pun ke basis data.
 *   - Tanpa look-ahead: semua level dihitung dari sesi <= hari sinyal; hasil diukur dari
 *     sesi berikutnya.
 *   - Hanya harga penutupan yang dipakai (arsip tidak punya high/low). Konsekuensinya
 *     disebut apa adanya: kalau dalam satu sesi harga menyentuh stop DAN sasaran, skrip
 *     menghitung STOP lebih dulu (asumsi konservatif), bukan yang menguntungkan.
 *   - Split train/OOS ditetapkan di SPLIT. Pilihan aturan dilakukan dari TRAIN, lalu
 *     dibuktikan di OOS; kalau tidak ada yang lolos di train, tidak ada yang dipilih.
 *
 * Usage:
 *   node scripts/entry-rule-backtest.mjs                  # ringkasan + tabel
 *   node scripts/entry-rule-backtest.mjs --markdown FILE   # tulis laporan markdown
 *   node scripts/entry-rule-backtest.mjs --horizon 60      # jendela uji lain (default 20)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';
import fs from 'node:fs';

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

// --- Kontrak yang dibekukan sebelum pengukuran ------------------------------------------------

const SPLIT = { trainEnd: '2024-12-31', oosStart: '2025-01-01' };
const MIN_HISTORY_SESSIONS = 60;    // sama dengan halaman produksi
const LEVEL_WINDOW = 20;            // sama dengan halaman produksi
const VOL_WINDOW = 20;
const VOL_WINDOW_LONG = 60;
const CHANDELIER_WINDOW = 22;
const MIN_LIQUIDITY_IDR = 1_000_000_000; // rata-rata nilai transaksi 20 hari, sama dengan produksi
const COST_ROUND_TRIP = 0.0040;     // fee 0,15% beli + 0,25% jual - TANPA slippage (versi paling murah)

/**
 * Daftar aturan dibekukan di sini. `stop` dan `target` adalah fungsi dari larik penutupan
 * sampai hari sinyal (inklusif) dan level masuk.
 */
const RULES = [
  {
    id: 'sekarang',
    label: 'Baseline produksi sekarang',
    note: 'masuk = min20, sasaran = max20, stop = masuk - 2 sigma(20)',
    entry: (c) => Math.min(...c.slice(-LEVEL_WINDOW)),
    stop: (c, entry) => entry * (1 - 2 * sigma20(c)),
    target: (c) => Math.max(...c.slice(-LEVEL_WINDOW)),
  },
  {
    id: 'donchian-2s',
    label: 'Masuk penutupan, sasaran Donchian 20',
    note: 'masuk = penutupan hari sinyal, sasaran = max20, stop = masuk - 2 sigma(20)',
    entry: (c) => c[c.length - 1],
    stop: (c, entry) => entry * (1 - 2 * sigma20(c)),
    target: (c) => Math.max(...c.slice(-LEVEL_WINDOW)),
  },
  {
    id: 'rr15-2s',
    label: 'Sasaran berbasis RR 1,5 (masukan, bukan keluaran)',
    note: 'masuk = penutupan, stop = masuk - 2 sigma(20), sasaran = masuk + 1,5 x risiko',
    entry: (c) => c[c.length - 1],
    stop: (c, entry) => entry * (1 - 2 * sigma20(c)),
    target: (c, entry, stop) => entry + 1.5 * (entry - stop),
  },
  {
    id: 'rr2-2s',
    label: 'Sasaran berbasis RR 2',
    note: 'masuk = penutupan, stop = masuk - 2 sigma(20), sasaran = masuk + 2 x risiko',
    entry: (c) => c[c.length - 1],
    stop: (c, entry) => entry * (1 - 2 * sigma20(c)),
    target: (c, entry, stop) => entry + 2 * (entry - stop),
  },
  {
    id: 'rr2-3s',
    label: 'Stop lebih longgar 3 sigma(20)',
    note: 'masuk = penutupan, stop = masuk - 3 sigma(20), sasaran = masuk + 2 x risiko',
    entry: (c) => c[c.length - 1],
    stop: (c, entry) => entry * (1 - 3 * sigma20(c)),
    target: (c, entry, stop) => entry + 2 * (entry - stop),
  },
  {
    id: 'rr2-mad',
    label: 'Volatilitas MAD (tahan outlier)',
    note: 'masuk = penutupan, stop = masuk - 2 x MAD(20), sasaran = masuk + 2 x risiko',
    entry: (c) => c[c.length - 1],
    stop: (c, entry) => entry * (1 - 2 * mad20(c)),
    target: (c, entry, stop) => entry + 2 * (entry - stop),
  },
  {
    id: 'rr2-2s60',
    label: 'Volatilitas 60 sesi',
    note: 'masuk = penutupan, stop = masuk - 2 sigma(60), sasaran = masuk + 2 x risiko',
    entry: (c) => c[c.length - 1],
    stop: (c, entry) => entry * (1 - 2 * sigmaLong(c)),
    target: (c, entry, stop) => entry + 2 * (entry - stop),
  },
  {
    id: 'rr2-chandelier',
    label: 'Stop Chandelier versi penutupan',
    note: 'stop = max penutupan 22 sesi - 3 sigma(20), sasaran = masuk + 2 x risiko',
    entry: (c) => c[c.length - 1],
    stop: (c) => Math.max(...c.slice(-CHANDELIER_WINDOW)) * (1 - 3 * sigma20(c)),
    target: (c, entry, stop) => entry + 2 * (entry - stop),
  },
  {
    id: 'rr2-fixed',
    label: 'Stop/sasaran persentase tetap',
    note: 'masuk = penutupan, stop = masuk x 0,95, sasaran = masuk x 1,10 (RR 2)',
    entry: (c) => c[c.length - 1],
    stop: (c, entry) => entry * 0.95,
    target: (c, entry) => entry * 1.10,
  },
];

// --- Utilitas statistik (penutupan saja) -------------------------------------------------------

function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i += 1) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

function stdev(values) {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  const s = Math.sqrt(variance);
  return Number.isFinite(s) ? s : null;
}

function meanAbsDeviation(values) {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + Math.abs(b), 0) / values.length;
  return Number.isFinite(m) && m > 0 ? m : null;
}

function sigma20(closes) {
  return stdev(logReturns(closes.slice(-(VOL_WINDOW + 1)))) ?? 0;
}

function sigmaLong(closes) {
  return stdev(logReturns(closes.slice(-(VOL_WINDOW_LONG + 1)))) ?? 0;
}

function mad20(closes) {
  return meanAbsDeviation(logReturns(closes.slice(-(VOL_WINDOW + 1)))) ?? 0;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
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

function oneSidedP(values) {
  const n = values.length;
  if (n < 3) return null;
  const m = mean(values);
  const s = stdev(values);
  if (!s) return null;
  const t = m / (s / Math.sqrt(n));
  return 0.5 * (1 - erf(t / Math.SQRT2));
}

// --- Simulasi satu observasi ---------------------------------------------------------------

/**
 * Menelusuri sesi setelah hari sinyal. Karena arsip hanya punya penutupan, sentuhan
 * intraday tidak diketahui; kalau dalam satu sesi harga menutup di bawah stop DAN di atas
 * sasaran (mustahil untuk satu penutupan, tetapi mungkin bagi dua level yang sangat
 * berdekatan), urutan yang dihitung adalah: stop lebih dulu bila penutupan <= stop.
 */
function simulate(closes, signalIndex, horizonSessions, stop, target, entry) {
  const end = Math.min(closes.length - 1, signalIndex + horizonSessions);
  let worst = 0;
  for (let j = signalIndex + 1; j <= end; j += 1) {
    const price = closes[j];
    const drawdown = (price - entry) / entry;
    if (drawdown < worst) worst = drawdown;
    if (stop > 0 && price <= stop) return { outcome: 'stop', pnl: (stop - entry) / entry, worst };
    if (target > 0 && price >= target) return { outcome: 'target', pnl: (target - entry) / entry, worst };
  }
  return { outcome: 'timeout', pnl: (closes[end] - entry) / entry, worst };
}

// --- Pemrosesan ------------------------------------------------------------------------------

const args = process.argv.slice(2);
const markdownIndex = args.indexOf('--markdown');
const markdownPath = markdownIndex >= 0 ? args[markdownIndex + 1] : null;
const horizonIndex = args.indexOf('--horizon');
const HORIZON = horizonIndex >= 0 ? Number(args[horizonIndex + 1]) : 20;

async function main() {
  const restore = installTypeScriptRequireHook();
  const { queryReadWithRetry } = require(path.join(repoRoot, 'shared/database/postgres.client.ts'));

  const tickersRes = await queryReadWithRetry(
    `select ticker from lens_radar_history group by ticker order by ticker`
  );
  const tickers = tickersRes.rows.map((r) => r.ticker);
  console.log(`emiten di arsip: ${tickers.length} · horizon uji: ${HORIZON} sesi · split train < ${SPLIT.oosStart} <= OOS`);

  const acc = new Map();
  for (const rule of RULES) {
    acc.set(rule.id, { train: [], oos: [], stopTrain: 0, stopOos: 0, tgtTrain: 0, tgtOos: 0, toTrain: 0, toOos: 0, maeTrain: [], maeOos: [], skipped: 0 });
  }

  let processed = 0;
  for (const ticker of tickers) {
    const res = await queryReadWithRetry(
      `select date::text as date,
              coalesce(adjusted_close_price, close_price)::float8 as close,
              avg_value_20d::float8 as liquidity
         from lens_radar_history
        where ticker = $1 and coalesce(adjusted_close_price, close_price) is not null
        order by date asc`,
      [ticker]
    );
    const rows = res.rows;
    if (rows.length <= MIN_HISTORY_SESSIONS + 1) continue;

    const closes = rows.map((r) => Number(r.close));
    const dates = rows.map((r) => r.date);

    for (let i = MIN_HISTORY_SESSIONS; i < rows.length - 1; i += 1) {
      const liquidity = Number(rows[i].liquidity);
      if (!Number.isFinite(liquidity) || liquidity < MIN_LIQUIDITY_IDR) continue;

      const history = closes.slice(0, i + 1);
      const day = dates[i];
      const bucket = day < SPLIT.oosStart ? 'train' : 'oos';

      for (const rule of RULES) {
        const entry = rule.entry(history);
        const stop = rule.stop(history, entry);
        const target = rule.target(history, entry, stop);
        if (!(entry > 0) || !(target > entry) || !(stop > 0) || !(stop < entry)) {
          acc.get(rule.id).skipped += 1;
          continue;
        }
        const sim = simulate(closes, i, HORIZON, stop, target, entry);
        const a = acc.get(rule.id);
        a[bucket].push(sim.pnl);
        a[`${bucket === 'train' ? 'maeTrain' : 'maeOos'}`].push(sim.worst);
        if (sim.outcome === 'stop') a[bucket === 'train' ? 'stopTrain' : 'stopOos'] += 1;
        if (sim.outcome === 'target') a[bucket === 'train' ? 'tgtTrain' : 'tgtOos'] += 1;
        if (sim.outcome === 'timeout') a[bucket === 'train' ? 'toTrain' : 'toOos'] += 1;
      }
    }

    processed += 1;
    if (processed % 100 === 0) console.log(`  ... ${processed}/${tickers.length} emiten`);
  }

  const results = RULES.map((rule) => {
    const a = acc.get(rule.id);
    const summarise = (bucket) => {
      const pnls = a[bucket];
      const nets = pnls.map((v) => v - COST_ROUND_TRIP);
      const stopCount = a[bucket === 'train' ? 'stopTrain' : 'stopOos'];
      const tgtCount = a[bucket === 'train' ? 'tgtTrain' : 'tgtOos'];
      const toCount = a[bucket === 'train' ? 'toTrain' : 'toOos'];
      const mae = a[bucket === 'train' ? 'maeTrain' : 'maeOos'];
      return {
        n: pnls.length,
        gross: mean(pnls),
        net: mean(nets),
        medianNet: median(nets),
        stopRate: pnls.length ? stopCount / pnls.length : null,
        targetRate: pnls.length ? tgtCount / pnls.length : null,
        timeoutRate: pnls.length ? toCount / pnls.length : null,
        mae: mean(mae),
        p: oneSidedP(nets),
      };
    };
    return { rule, train: summarise('train'), oos: summarise('oos'), skipped: a.skipped };
  });

  const f = (v, d = 5) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
  const pc = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(2)}%`);

  const lines = [];
  lines.push(`# Uji aturan Stop Loss / sasaran pada arsip harian (${new Date().toISOString().slice(0, 10)})`);
  lines.push('');
  lines.push(`Horizon uji: **${HORIZON} sesi** · aturan **dibekukan sebelum dijalankan** (${RULES.length} aturan) · ` +
    `split train < ${SPLIT.oosStart} <= OOS · biaya ${(COST_ROUND_TRIP * 100).toFixed(2)}% per transaksi (fee saja, tanpa slippage) · ` +
    `likuiditas minimum Rp ${(MIN_LIQUIDITY_IDR / 1e9).toFixed(0)} miliar/hari (sama dengan produksi)`);
  lines.push('');
  lines.push('Catatan metode: arsip hanya punya harga penutupan (tanpa high/low), jadi stop/sasaran dianggap tersentuh');
  lines.push('bila **penutupan** menyentuhnya, dan bila stop serta sasaran sama-sama tersentuh pada sesi yang sama,');
  lines.push('yang dihitung adalah **stop** lebih dulu. Keduanya konservatif, bukan menguntungkan.');
  lines.push('');

  for (const bucket of ['train', 'oos']) {
    lines.push(`## ${bucket === 'train' ? 'TRAIN' : 'OOS'} (${bucket === 'train' ? `sampai ${SPLIT.trainEnd}` : `sejak ${SPLIT.oosStart}`})`);
    lines.push('');
    lines.push('| aturan | n | stop kena | sasaran kena | waktu habis | bruto | netto | median netto | MAE rata2 | p (1 sisi) |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of results) {
      const s = r[bucket];
      lines.push(
        `| ${r.rule.label} | ${s.n} | ${pc(s.stopRate)} | ${pc(s.targetRate)} | ${pc(s.timeoutRate)} | ${f(s.gross)} | ${f(s.net)} | ${f(s.medianNet)} | ${f(s.mae)} | ${s.p === null ? 'n/a' : f(s.p, 4)} |`
      );
    }
    lines.push('');
  }

  const oosWin = results
    .filter((r) => r.train.net !== null && r.train.net > 0 && r.oos.net !== null && r.oos.net > 0 && r.oos.p !== null && r.oos.p < 0.05)
    .sort((a, b) => (b.oos.net ?? -Infinity) - (a.oos.net ?? -Infinity));

  lines.push('## Kesimpulan');
  lines.push('');
  if (oosWin.length === 0) {
    lines.push('**Tidak ada aturan yang lolos.** Syarat yang dipakai: netto TRAIN > 0, netto OOS > 0, dan p OOS < 0,05.');
    lines.push('Karena tidak ada yang lolos di train, tidak ada aturan yang dipilih - dan itu jawaban yang sah:');
    lines.push('daftar aturan ini tidak boleh diganti setelah melihat hasil (itu p-hacking).');
  } else {
    lines.push('Aturan yang lolos syarat (netto train > 0, netto OOS > 0, p OOS < 0,05):');
    for (const r of oosWin) {
      lines.push(`- **${r.rule.label}** — netto train ${f(r.train.net)}, netto OOS ${f(r.oos.net)} (p ${f(r.oos.p, 4)})`);
    }
  }
  lines.push('');
  lines.push('Rincian aturan yang diuji:');
  for (const r of results) {
    lines.push(`- \`${r.rule.id}\` — ${r.rule.note}${r.skipped ? ` (dilewati ${r.skipped} observasi karena level tidak masuk akal)` : ''}`);
  }
  lines.push('');

  const report = lines.join('\n');
  console.log('\n' + report);

  if (markdownPath) {
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, report);
    console.log(`laporan ditulis: ${markdownPath}`);
  }

  restore();
}

main().catch((error) => {
  console.error('[uji-aturan] gagal:', error?.message ?? error);
  process.exitCode = 1;
});