#!/usr/bin/env node

/**
 * Pemindai faktor lintas-emiten pada arsip harian SahamLens.
 *
 * PERTANYAAN YANG DIJAWAB. Pendekatan "satu rumus stop/sasaran" sudah diuji dan gagal
 * (docs/entry-rules/backtest-2026-09-24.md). Cara yang dipakai pengelola dana bukan mencari
 * satu rumus, melainkan mengukur berapa besar informasi (IC) yang dimiliki sebuah ciri
 * lintas-emiten, lalu menyusun portofolio dari ciri yang terbukti - dengan biaya nyata,
 * dipisah train/OOS, dan dibandingkan dengan patokan yang jujur (seluruh emiten likuid,
 * timbang sama).
 *
 * ATURAN MAIN (dipatuhi keras):
 *   - Daftar faktor dan parameternya DIBEKUkan di berkas ini sebelum dijalankan.
 *   - Baca-saja: tidak menulis apa pun ke basis data.
 *   - Tanpa look-ahead: ciri dihitung dari data sampai hari rebalance; hasil diukur dari
 *     sesi berikutnya memakai kalender sesi global.
 *   - Yang bisa dipakai hanya data yang benar-benar ada di arsip. Fundamental per emiten
 *     hanya 200 emiten dan praktis hanya sejak Agustus 2026, kepemilikan asing bulanan
 *     hanya sejak Jan 2025, ringkasan broker kosong - semuanya TIDAK dijadikan faktor,
 *     supaya tidak ada yang dikarang.
 *
 * Usage:
 *   node scripts/factor-research.mjs [--markdown FILE] [--top 10]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';
import fs from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function installTypeScriptRequireHook(rootDir = repoRoot) {
  const ts = require('typescript');
  const previousTs = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;
  const rootWithSep = `${rootDir}${path.sep}`;
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

// --- Kontrak beku ---------------------------------------------------------------------------

const SPLIT = { trainEnd: '2024-12-31', oosStart: '2025-01-01' };
const MIN_ROWS = 300;                  // riwayat minimum per emiten (butuh 252 sesi untuk momentum 12-1)
const MIN_CROSS_SECTION = 50;          // minimal emiten per tanggal agar IC bermakna
const MIN_LIQUIDITY_IDR = 1_000_000_000; // rata-rata nilai transaksi 20 hari (sama dengan produksi)
const FORWARD_PRIMARY = 20;            // sesi
const FORWARD_SECONDARY = 60;
const REBALANCE_SESSIONS = 20;         // portofolio: non-tumpang-tindih
const COST_ROUND_TRIP = 0.0040;        // fee 0,15% + 0,25%; tanpa slippage
const COST_SENSITIVITY = 0.0060;       // fee + slippage kasar, sebagai uji tahan
const TOP_QUANTILE = 0.10;             // desil teratas

/**
 * Daftar faktor, dibekukan. `sign` = arah yang diharapkan lebih baik bernilai tinggi;
 * hanya dipakai untuk menyusun komposit dari TRAIN, bukan untuk mengubah datanya.
 */
const FACTORS = [
  { id: 'mom_12_1', label: 'Momentum 12 bulan minus 1 bulan', group: 'harga' },
  { id: 'mom_6_1', label: 'Momentum 6 bulan minus 1 bulan', group: 'harga' },
  { id: 'mom_3_1', label: 'Momentum 3 bulan minus 1 bulan', group: 'harga' },
  { id: 'rev_5', label: 'Balik arah 5 sesi (dibalik tandanya)', group: 'harga' },
  { id: 'rev_20', label: 'Balik arah 20 sesi (dibalik tandanya)', group: 'harga' },
  { id: 'vol_60', label: 'Volatilitas 60 sesi rendah', group: 'risiko' },
  { id: 'vol_20', label: 'Volatilitas 20 sesi rendah', group: 'risiko' },
  { id: 'trend_200', label: 'Harga di atas rata-rata 200 sesi', group: 'tren' },
  { id: 'dist_high_52w', label: 'Jarak dari puncak 52 minggu', group: 'tren' },
  { id: 'liquidity', label: 'Likuiditas (log nilai transaksi 20 hari)', group: 'likuiditas' },
  { id: 'max_ret_20', label: 'Puncak imbal hasil harian 20 sesi (dibalik: hindari lotere)', group: 'risiko' },
  { id: 'score_total', label: 'LensScore total (produksi, materialisasi terakhir)', group: 'skor', excludeFromComposite: true },
  { id: 'score_technical', label: 'Skor teknikal (produksi, materialisasi terakhir)', group: 'skor', excludeFromComposite: true },
  { id: 'score_fundamental', label: 'Skor fundamental (produksi, materialisasi terakhir)', group: 'skor', excludeFromComposite: true },
  { id: 'score_flow', label: 'Skor arus (produksi, materialisasi terakhir)', group: 'skor', excludeFromComposite: true },
];

// --- Utilitas -------------------------------------------------------------------------------

function mean(v) {
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function stdev(v) {
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

function rank(values) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k].index] = avgRank;
    i = j + 1;
  }
  return out;
}

function spearman(xs, ys) {
  if (xs.length < 5) return null;
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function pctQuantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  const pos = (sortedValues.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo);
}

// --- Pemrosesan -----------------------------------------------------------------------------

const args = process.argv.slice(2);
const mdIndex = args.indexOf('--markdown');
const markdownPath = mdIndex >= 0 ? args[mdIndex + 1] : null;
const watchMode = args.includes('--watch');

async function main() {
  const restore = installTypeScriptRequireHook();
  const { queryReadWithRetry } = require(path.join(repoRoot, 'shared/database/postgres.client.ts'));

  const calRes = await queryReadWithRetry(`select distinct date::text as date from lens_radar_history order by date asc`);
  const calendar = calRes.rows.map((r) => r.date);
  const globalIndex = new Map(calendar.map((d, i) => [d, i]));
  console.log(`kalender sesi: ${calendar.length} (${calendar[0]} → ${calendar[calendar.length - 1]})`);

  const tickerRes = await queryReadWithRetry(
    `select ticker, count(*) n from lens_radar_history group by ticker having count(*) >= ${MIN_ROWS} order by ticker`
  );
  const tickers = tickerRes.rows.map((r) => r.ticker);
  console.log(`emiten dengan riwayat >= ${MIN_ROWS} sesi: ${tickers.length}`);

  // Tanggal -> daftar observasi (faktor + imbal hasil depan)
  const byDate = new Map(calendar.map((d) => [d, []]));
  const factorUsable = new Map(FACTORS.map((f) => [f.id, 0]));
  let coverageSum = 0;
  let coverageN = 0;
  let coverageFull = 0;
  let observed = 0;

  for (const ticker of tickers) {
    const res = await queryReadWithRetry(
      `select distinct on (date)
              date::text as date,
              coalesce(adjusted_close_price, close_price)::float8 as close,
              avg_value_20d::float8 as liquidity,
              coverage_pct::float8 as coverage,
              lens_score::float8 as score_total,
              technical_score::float8 as score_technical,
              fundamental_score::float8 as score_fundamental,
              flow_score::float8 as score_flow
         from lens_radar_history
        where ticker = $1 and coalesce(adjusted_close_price, close_price) is not null
        order by date asc, calculation_timestamp desc nulls last, updated_at desc`,
      [ticker]
    );
    const rows = res.rows;
    if (rows.length < MIN_ROWS) continue;

    const n = rows.length;
    const closes = new Float64Array(n);
    const gi = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      closes[i] = Number(rows[i].close);
      gi[i] = globalIndex.get(rows[i].date) ?? -1;
    }

    // log return harian
    const logRet = new Float64Array(n);
    logRet[0] = 0;
    for (let i = 1; i < n; i += 1) {
      logRet[i] = closes[i - 1] > 0 && closes[i] > 0 ? Math.log(closes[i] / closes[i - 1]) : 0;
    }

    // pencari baris "as-of" indeks kalender global (dua penunjuk, sekali jalan)
    const rowAtOrBefore = (targetGi) => {
      let lo = 0;
      let hi = n - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (gi[mid] <= targetGi) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    };

    const valueAt = (i, backSessions) => {
      const j = i - backSessions;
      return j >= 0 ? closes[j] : null;
    };

    for (let i = 252; i < n - 1; i += 1) {
      const liquidity = Number(rows[i].liquidity);
      if (!Number.isFinite(liquidity) || liquidity < MIN_LIQUIDITY_IDR) continue;

      const targetGi = gi[i] + FORWARD_PRIMARY;
      if (targetGi >= calendar.length) break;
      const fwdRow = rowAtOrBefore(targetGi);
      if (fwdRow <= i) continue;
      const fwd20 = closes[fwdRow] / closes[i] - 1;

      const targetGi60 = gi[i] + FORWARD_SECONDARY;
      const fwdRow60 = targetGi60 < calendar.length ? rowAtOrBefore(targetGi60) : -1;
      const fwd60 = fwdRow60 > i ? closes[fwdRow60] / closes[i] - 1 : null;

      const c12 = valueAt(i, 252);
      const c6 = valueAt(i, 126);
      const c3 = valueAt(i, 63);
      const c1 = valueAt(i, 21);
      const c5 = valueAt(i, 5);
      const c20 = valueAt(i, 20);
      if (c12 === null || c6 === null || c3 === null || c1 === null || c5 === null || c20 === null) continue;

      const vol = (window) => {
        if (i - window < 1) return null;
        let s = 0;
        let s2 = 0;
        for (let k = i - window + 1; k <= i; k += 1) {
          s += logRet[k];
          s2 += logRet[k] * logRet[k];
        }
        const m = s / window;
        const variance = (s2 - window * m * m) / (window - 1);
        return variance > 0 ? Math.sqrt(variance) : 0;
      };

      const v60 = vol(60);
      const v20 = vol(20);
      if (v60 === null || v20 === null || v60 <= 0 || v20 <= 0) continue;

      const sma200 = (() => {
        if (i - 199 < 0) return null;
        let s = 0;
        for (let k = i - 199; k <= i; k += 1) s += closes[k];
        return s / 200;
      })();
      if (sma200 === null || sma200 <= 0) continue;

      const max52 = (() => {
        if (i - 251 < 0) return null;
        let m = -Infinity;
        for (let k = i - 251; k <= i; k += 1) if (closes[k] > m) m = closes[k];
        return m;
      })();
      if (max52 === null || max52 <= 0) continue;

      let maxRet20 = -Infinity;
      for (let k = i - 19; k <= i; k += 1) if (logRet[k] > maxRet20) maxRet20 = logRet[k];

      const factors = {
        mom_12_1: closes[i] / c12 - 1 - (closes[i] / c1 - 1),
        mom_6_1: closes[i] / c6 - 1 - (closes[i] / c1 - 1),
        mom_3_1: closes[i] / c3 - 1 - (closes[i] / c1 - 1),
        rev_5: -(closes[i] / c5 - 1),
        rev_20: -(closes[i] / c20 - 1),
        vol_60: -v60,
        vol_20: -v20,
        trend_200: closes[i] > sma200 ? 1 : 0,
        dist_high_52w: -(1 - closes[i] / max52),
        liquidity: Math.log10(liquidity),
        max_ret_20: -maxRet20,
        score_total: Number(rows[i].score_total),
        score_technical: Number(rows[i].score_technical),
        score_fundamental: Number(rows[i].score_fundamental),
        score_flow: Number(rows[i].score_flow),
      };

      const coverage = Number(rows[i].coverage);
      if (Number.isFinite(coverage)) {
        coverageSum += coverage;
        coverageN += 1;
        if (coverage >= 99) coverageFull += 1;
      }
      for (const factor of FACTORS) factorUsable.set(factor.id, (factorUsable.get(factor.id) ?? 0) + (Number.isFinite(factors[factor.id]) ? 1 : 0));

      const bucket = byDate.get(rows[i].date);
      if (!bucket) continue;
      bucket.push({ ticker, factors, fwd20, fwd60 });
      observed += 1;
    }
  }
  console.log(`observasi terpakai: ${observed.toLocaleString('id-ID')}`);

  // Audit 1: keterisian waktu arsip skor (berapa materialisasi per pasangan sesi-emiten)
  const auditRes = await queryReadWithRetry(
    `select to_char(date,'YYYY') as tahun,
            count(*)::int as baris,
            count(distinct (date, ticker))::int as pasangan_unik,
            count(*) filter (where updated_at <= lens_radar_history.date + interval '2 days')::int as tepat_waktu,
            count(distinct score_version)::int as versi_skor,
            min(calculation_timestamp)::text as hitung_terawal,
            max(calculation_timestamp)::text as hitung_terakhir
       from lens_radar_history
      group by 1 order by 1`
  );

  // Audit 2: apakah fundamental yang dipakai skor historis benar-benar sudah terbit saat itu?
  const pitRes = await queryReadWithRetry(
    `select count(*)::int as baris,
            count(distinct ticker)::int as emiten,
            min(observed_date)::text as observasi_awal,
            max(observed_date)::text as observasi_akhir,
            min(observed_date - period_end)::int as lag_terpendek_hari,
            round(percentile_cont(0.5) within group (order by (observed_date - period_end)))::int as lag_tengah_hari,
            count(distinct period_end)::int as periode_laporan
       from fundamental_history
      where period_end is not null`
  );

  // --- IC lintas-emiten per tanggal ---
  const icByFactor = new Map(FACTORS.map((f) => [f.id, []]));
  const decileAcc = new Map(FACTORS.map((f) => [f.id, Array.from({ length: 10 }, () => [])]));

  for (const [date, rows] of byDate) {
    if (rows.length < MIN_CROSS_SECTION) continue;
    const fwd = rows.map((r) => r.fwd20);
    for (const factor of FACTORS) {
      const xs = rows.map((r) => r.factors[factor.id]);
      if (xs.some((v) => !Number.isFinite(v))) {
        // buang baris tak lengkap untuk faktor ini
        const pair = rows.map((r, idx) => [r.factors[factor.id], fwd[idx]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
        const ic = spearman(pair.map((p) => p[0]), pair.map((p) => p[1]));
        if (ic !== null) {
          const train = date < SPLIT.oosStart;
          icByFactor.get(factor.id).push({ date, ic, train });
        }
        continue;
      }
      const ic = spearman(xs, fwd);
      if (ic !== null) icByFactor.get(factor.id).push({ date, ic, train: date < SPLIT.oosStart });

      // desil: urutkan berdasarkan faktor lalu rata-rata imbal hasil ke depan per desil
      const order = rows.map((r, idx) => ({ v: r.factors[factor.id], f: fwd[idx] })).sort((a, b) => a.v - b.v);
      const per = Math.floor(order.length / 10);
      if (per >= 5) {
        for (let d = 0; d < 10; d += 1) {
          const slice = order.slice(d * per, d === 9 ? order.length : (d + 1) * per);
          decileAcc.get(factor.id)[d].push(mean(slice.map((s) => s.f)));
        }
      }
    }
  }

  const stats = (values) => {
    if (!values.length) return { n: 0 };
    const m = mean(values);
    const s = stdev(values);
    const nonOverlap = values.filter((_, i) => i % REBALANCE_SESSIONS === 0);
    const mNo = mean(nonOverlap);
    const sNo = stdev(nonOverlap);
    const t = sNo && nonOverlap.length > 2 ? mNo / (sNo / Math.sqrt(nonOverlap.length)) : null;
    return {
      n: values.length,
      mean: m,
      positiveShare: values.filter((v) => v > 0).length / values.length,
      nonOverlapN: nonOverlap.length,
      nonOverlapMean: mNo,
      t,
    };
  };

  const factorRows = FACTORS.map((factor) => {
    const all = icByFactor.get(factor.id);
    const train = all.filter((r) => r.train).map((r) => r.ic);
    const oos = all.filter((r) => !r.train).map((r) => r.ic);
    const deciles = decileAcc.get(factor.id).map((d) => mean(d));
    return {
      factor,
      train: stats(train),
      oos: stats(oos),
      deciles,
      spread: deciles[9] !== null && deciles[0] !== null ? deciles[9] - deciles[0] : null,
    };
  });

  // --- Portofolio: desil teratas tiap 20 sesi, timbang sama, biaya nyata ---
  const eligibleDates = [];
  for (let i = 0; i < calendar.length; i += REBALANCE_SESSIONS) eligibleDates.push(calendar[i]);

  const portfolioFor = (scoreFn) => {
    const periods = [];
    let prevHoldings = new Set();
    for (let idx = 0; idx < eligibleDates.length - 1; idx += 1) {
      const date = eligibleDates[idx];
      const rows = byDate.get(date);
      if (!rows || rows.length < MIN_CROSS_SECTION) continue;
      const scored = rows
        .map((r) => ({ r, s: scoreFn(r) }))
        .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.r.fwd20));
      if (scored.length < MIN_CROSS_SECTION) continue;
      scored.sort((a, b) => b.s - a.s);
      const take = Math.max(5, Math.floor(scored.length * TOP_QUANTILE));
      const holdings = scored.slice(0, take);
      const names = new Set(holdings.map((h) => h.r.ticker));
      const gross = mean(holdings.map((h) => h.r.fwd20));
      const benchmark = mean(rows.filter((r) => Number.isFinite(r.fwd20)).map((r) => r.fwd20));
      let turnover = 1;
      if (prevHoldings.size) {
        let replaced = 0;
        for (const t of names) if (!prevHoldings.has(t)) replaced += 1;
        turnover = replaced / Math.max(names.size, 1);
      }
      const net = gross - turnover * COST_ROUND_TRIP;
      const netStress = gross - turnover * COST_SENSITIVITY;
      periods.push({ date, gross, net, netStress, benchmark, excess: net - benchmark, turnover, n: names.size });
      prevHoldings = names;
    }
    const summary = (key) => {
      const vals = periods.map((p) => p[key]);
      const all = stats(vals);
      const m = mean(vals);
      const s = stdev(vals);
      // kurva ekuitas dan drawdown dari periode non-tumpang-tindih (memang non-tumpang-tindih)
      let equity = 1;
      let peak = 1;
      let maxDd = 0;
      for (const v of vals) {
        equity *= 1 + v;
        if (equity > peak) peak = equity;
        const dd = equity / peak - 1;
        if (dd < maxDd) maxDd = dd;
      }
      const oosVals = periods.filter((p) => p.date >= SPLIT.oosStart).map((p) => p[key]);
      const trainVals = periods.filter((p) => p.date < SPLIT.oosStart).map((p) => p[key]);
      return {
        n: vals.length,
        mean: m,
        sd: s,
        win: vals.length ? vals.filter((v) => v > 0).length / vals.length : null,
        total: equity - 1,
        maxDrawdown: maxDd,
        trainMean: mean(trainVals),
        trainN: trainVals.length,
        oosMean: mean(oosVals),
        oosN: oosVals.length,
        oosWin: oosVals.length ? oosVals.filter((v) => v > 0).length / oosVals.length : null,
      };
    };
    return {
      periods,
      gross: summary('gross'),
      net: summary('net'),
      netStress: summary('netStress'),
      benchmark: summary('benchmark'),
      excess: summary('excess'),
      avgTurnover: mean(periods.map((p) => p.turnover)),
      avgNames: mean(periods.map((p) => p.n)),
    };
  };

  // komposit dibentuk HANYA dari faktor harga/risiko/tren yang IC train-nya positif.
  // Faktor skor dikeluarkan karena cakupan fundamental historis hanya sebagian (coverage_pct < 100
  // untuk hampir semua sesi 2021-2025), sehingga bukan ukuran yang sebanding lintas emiten.
  const decisiveFactors = factorRows.filter((r) => !r.factor.excludeFromComposite);
  const compositeFactors = decisiveFactors.filter((r) => r.train.mean !== null && r.train.mean > 0).map((r) => r.factor.id);
  const compositeScore = (row) => {
    if (!compositeFactors.length) return null;
    let sum = 0;
    let count = 0;
    for (const id of compositeFactors) {
      const v = row.factors[id];
      if (Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    return count ? sum / count : null;
  };

  const singlePortfolios = decisiveFactors
    .filter((r) => r.train.mean !== null && r.train.mean > 0)
    .map((r) => ({ id: r.factor.id, label: r.factor.label, result: portfolioFor((row) => row.factors[r.factor.id]) }));

  const compositePortfolio = compositeFactors.length ? portfolioFor(compositeScore) : null;

  // --- Laporan ---
  const f = (v, d = 5) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
  const pc = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
  const L = [];
  L.push(`# Pemindai faktor lintas-emiten (${new Date().toISOString().slice(0, 10)})`);
  L.push('');
  L.push(`Arsip: ${calendar[0]} → ${calendar[calendar.length - 1]} · ${tickers.length} emiten beriwayat ≥${MIN_ROWS} sesi · ` +
    `${observed.toLocaleString('id-ID')} observasi · ambang likuiditas Rp ${(MIN_LIQUIDITY_IDR / 1e9).toFixed(0)} miliar/hari · ` +
    `imbal hasil depan ${FORWARD_PRIMARY} sesi (sekunder ${FORWARD_SECONDARY}) · split train < ${SPLIT.oosStart} ≤ OOS · ` +
    `biaya ${(COST_ROUND_TRIP * 100).toFixed(2)}% per transaksi (fee; uji tahan ${(COST_SENSITIVITY * 100).toFixed(2)}%)`);
  L.push('');
  L.push('IC = korelasi peringkat Spearman antara ciri dan imbal hasil depan, diukur per tanggal di antara emiten');
  L.push('likuid (bukan per emiten). Nilai positif berarti ciri itu cenderung menaikkan peringkat emiten di hari itu.');
  L.push('t-statistik dihitung hanya dari tanggal non-tumpang-tindih (setiap 20 sesi) supaya tidak dilebih-lebihkan.');
  L.push('');
  L.push('## Kekuatan informasi per faktor');
  L.push('');
  L.push('| faktor | grup | observasi terpakai | IC train | IC OOS | IC OOS (non-overlap) | t | % tanggal positif (OOS) | D10−D1 (imbal 20 sesi) |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of factorRows) {
    const usable = factorUsable.get(r.factor.id) ?? 0;
    const mark = r.factor.excludeFromComposite ? ' ※' : '';
    L.push(
      `| ${r.factor.label}${mark} | ${r.factor.group} | ${usable.toLocaleString('id-ID')} | ${f(r.train.mean, 4)} | ${f(r.oos.mean, 4)} | ${f(r.oos.nonOverlapMean, 4)} | ${f(r.oos.t, 2)} | ${pc(r.oos.positiveShare, 1)} | ${pc(r.spread)} |`
    );
  }
  L.push('※ = faktor skor produksi: ditampilkan sebagai catatan, tidak ikut membentuk komposit (lihat audit arsip di bawah).');
  L.push('');
  L.push('## Audit arsip skor (penting dibaca)');
  L.push('');
  L.push('### 1. Arsip menyimpan beberapa materialisasi untuk satu sesi yang sama');
  L.push('');
  L.push('| tahun sesi | baris | pasangan sesi-emiten unik | materialisasi berlebih | versi skor | dihitung pertama | dihitung terakhir |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  let totalRows = 0;
  let totalPairs = 0;
  for (const row of auditRes.rows) {
    totalRows += row.baris;
    totalPairs += row.pasangan_unik;
    const excess = row.baris - row.pasangan_unik;
    L.push(
      `| ${row.tahun} | ${row.baris.toLocaleString('id-ID')} | ${row.pasangan_unik.toLocaleString('id-ID')} | ${excess.toLocaleString('id-ID')} | ${row.versi_skor} | ${row.hitung_terawal?.slice(0, 10)} | ${row.hitung_terakhir?.slice(0, 10)} |`
    );
  }
  L.push('');
  L.push(`Total: ${totalRows.toLocaleString('id-ID')} baris untuk ${totalPairs.toLocaleString('id-ID')} pasangan sesi-emiten unik — ` +
    `**${(totalRows / totalPairs).toFixed(1)}× lipat**. Kunci utama arsip memuat hash konfigurasi, sehingga setiap kali skor`);
  L.push('dihitung ulang dengan konfigurasi berbeda, baris baru ditambahkan, bukan menimpa. Tanpa menyaring satu materialisasi');
  L.push('saja, satu emiten bisa terwakili sampai 6 kali di dalam satu tanggal — itu akan mengacaukan peringkat lintas-emiten.');
  L.push('Karena itu skrip ini mengambil **satu** materialisasi per pasangan (perhitungan terbaru).');
  L.push('');
  L.push('### 2. Skor historis dihitung ulang, tetapi dirancang point-in-time');
  L.push('');
  L.push('Seluruh baris 2021–2025 dihitung pada Agustus–September 2026, bukan saat sesinya berlalu. Itu **tidak otomatis**');
  L.push('berarti ada kebocoran masa depan: skrip pembentuk arsip (`scripts/backfill-lens-history.mjs`) mengambil fundamental');
  L.push('hanya dengan syarat `observed_date <= tanggal sinyal`, dan `observed_date` di `fundamental_history` adalah');
  L.push('tanggal terbit berkas resmi IDX (XBRL), bukan akhir periode laporan.');
  L.push('');
  if (pitRes.rows.length) {
    const pit = pitRes.rows[0];
    L.push(`Bukti data: ${pit.baris.toLocaleString('id-ID')} baris fundamental, ${pit.emiten} emiten, observasi ${pit.observasi_awal} → ${pit.observasi_akhir}, ` +
      `${pit.periode_laporan} periode laporan. Jarak terbit dari akhir periode: **terpendek ${pit.lag_terpendek_hari} hari**, tengah **${pit.lag_tengah_hari} hari** ` +
      '(tidak ada baris dengan observasi = akhir periode, jadi memang tanggal terbit).');
    L.push('');
  }
  L.push('Sisa keterbatasan yang tetap berlaku (dan tidak bisa ditutup dari arsip ini):');
  L.push('');
  L.push('- **Cakupan fundamental tipis.** `fundamental_history` hanya 200 emiten; untuk sesi 2021–2025 hanya 45–51 emiten');
  L.push('  punya fundamental terbit. Sisanya dinilai dengan komponen yang tersedia sebagian (`coverage_pct` < 100).');
  L.push('- **Cakupan penuh hampir tidak ada di periode uji.** Baris dengan `coverage_pct` ≥ 99: **0%** untuk 2021–2025 dan');
  L.push('  hanya 2,2% untuk 2026. Jadi skor historis di sini adalah skor sebagian, bukan skor lengkap.');
  L.push('- **Arsip tidak menyimpan apa yang benar-benar ditampilkan produk pada hari itu.** Karena baris ditimpa/ditambah,');
  L.push('  yang bisa diuji adalah hitungan ulang, bukan perilaku produk saat itu. Untuk itu diperlukan snapshot harian yang');
  L.push('  tidak bisa diubah (usulan perbaikan, belum dikerjakan).');
  L.push('');
  L.push('Karena dua keterbatasan pertama, faktor skor tetap ditampilkan di tabel di atas sebagai catatan, tetapi **tidak** ikut');
  L.push('membentuk komposit — komposit hanya memakai faktor yang bisa dihitung penuh dari harga.');
  L.push('');
  L.push('## Desil imbal hasil depan 20 sesi (rata-rata, seluruh periode)');
  L.push('');
  L.push('| faktor | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of factorRows) {
    L.push(`| ${r.factor.label} | ${r.deciles.map((v) => pc(v, 1)).join(' | ')} |`);
  }
  L.push('');
  L.push('## Portofolio desil teratas (timbang sama, rebalance tiap 20 sesi, biaya nyata)');
  L.push('');
  const portfolioRows = compositePortfolio ? [{ id: 'komposit', label: 'Komposit (faktor dengan IC train > 0)', result: compositePortfolio }, ...singlePortfolios] : singlePortfolios;
  L.push('| portofolio | periode | bruto rata2 | netto rata2 | menang | total | drawdown maks | OOS netto rata2 | OOS menang | turnover | emiten |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const p of portfolioRows) {
    const n = p.result.net;
    L.push(
      `| ${p.label} | ${n.n} | ${pc(n.mean)} | ${pc(n.mean)} | ${pc(n.win, 1)} | ${pc(n.total, 1)} | ${pc(n.maxDrawdown, 1)} | ${pc(n.oosMean)} (${n.oosN}) | ${pc(n.oosWin, 1)} | ${pc(p.result.avgTurnover, 1)} | ${p.result.avgNames?.toFixed(0) ?? 'n/a'} |`
    );
  }
  L.push('');
  const bench = portfolioRows[0]?.result.benchmark;
  if (bench) {
    L.push(`Patokan (seluruh emiten likuid, timbang sama, tanpa biaya): rata-rata per periode ${pc(bench.mean)}, ` +
      `total ${pc(bench.total, 1)}, drawdown maks ${pc(bench.maxDrawdown, 1)}, OOS ${pc(bench.oosMean)} (${bench.oosN} periode).`);
    const ex = portfolioRows[0]?.result.excess;
    if (ex) {
      L.push(`Selisih komposit terhadap patokan setelah biaya: rata-rata per periode ${pc(ex.mean)}, OOS ${pc(ex.oosMean)}, ` +
        `menang ${pc(ex.win, 1)}, total ${pc(ex.total, 1)}.`);
    }
    L.push('');
  }
  L.push('## Kesimpulan');
  L.push('');
  const oosPositive = decisiveFactors.filter((r) => r.oos.mean !== null && r.oos.mean > 0 && r.train.mean !== null && r.train.mean > 0);
  if (!oosPositive.length) {
    L.push('**Tidak ada faktor dengan IC positif konsisten di train dan OOS.** Berarti tidak ada ciri yang terbukti');
    L.push('memisahkan emiten mana yang akan naik, sehingga tidak ada portofolio yang layak diusulkan dari data ini.');
  } else {
    L.push('Faktor dengan IC positif di train **dan** OOS:');
    for (const r of oosPositive) {
      L.push(`- **${r.factor.label}** — IC train ${f(r.train.mean, 4)}, IC OOS ${f(r.oos.mean, 4)}, t ${f(r.oos.t, 2)}, D10−D1 ${pc(r.spread)}`);
    }
    L.push('');
    if (compositePortfolio) {
      L.push(`Komposit dari ${compositeFactors.length} faktor tersebut (dibentuk dari train): netto rata-rata ${pc(compositePortfolio.net.mean)} per 20 sesi ` +
        `(OOS ${pc(compositePortfolio.net.oosMean)}), menang ${pc(compositePortfolio.net.win, 1)}, drawdown maks ${pc(compositePortfolio.net.maxDrawdown, 1)}.`);
    }
  }
  L.push('');
  L.push('Catatan yang harus dibaca bersama angka di atas:');
  L.push('- Pengukuran per tanggal memperbesar jumlah sampel tetapi imbal hasil 20 sesi tumpang-tindih; itu sebabnya t-statistik');
  L.push('  dihitung dari tanggal non-tumpang-tindih saja.');
  L.push('- Portofolio di sini **long-only** dan dibandingkan dengan patokan timbang sama yang juga turut menanggung emiten yang');
  L.push('  sedang turun; keunggulan kecil belum berarti layak dipakai.');
  L.push('- Data yang tidak dipakai karena memang tidak lengkap: fundamental per emiten (hanya 200 emiten; 45–51 emiten');
  L.push('  untuk periode uji 2021–2025), kepemilikan asing bulanan (sejak Jan 2025), ringkasan broker (kosong).');
  L.push('  Tidak ada faktor karangan, dan skor produksi tidak dinaikkan menjadi portofolio karena cakupannya sebagian.');
  L.push('');

  const report = L.join('\n');
  console.log('\n' + report);

  if (watchMode) {
    // Pengawas bulanan: ciri yang dipakai halaman /admin/profil-risiko harus tetap positif di
    // luar sampel. Kalau tidak, alarm - halaman tidak diubah otomatis, keputusan di operator.
    const watchIds = ['vol_60', 'vol_20', 'dist_high_52w', 'max_ret_20'];
    const alarms = [];
    for (const id of watchIds) {
      const row = factorRows.find((r) => r.factor.id === id);
      if (!row) {
        alarms.push(`${id}: tidak ada di hasil (faktor hilang)`);
        continue;
      }
      if (!Number.isFinite(row.oos.mean) || row.oos.mean <= 0) {
        alarms.push(`${id} (${row.factor.label}): IC luar sampel ${f(row.oos.mean, 4)} - tidak lagi positif`);
      }
      if (!Number.isFinite(row.oos.t) || row.oos.t <= 0) {
        alarms.push(`${id} (${row.factor.label}): t luar sampel ${f(row.oos.t, 2)} - tidak lagi positif`);
      }
    }
    L.push('');
    L.push('## Pengawas (mode --watch)');
    L.push('');
    if (alarms.length) {
      L.push('ALARM FAKTOR: bukti ciri yang dipakai halaman Profil Risiko tidak lagi bertahan.');
      for (const alarm of alarms) L.push(`- ${alarm}`);
    } else {
      L.push('Semua ciri kokoh masih positif di luar sampel (IC dan t-statistik > 0).');
    }
    if (markdownPath) fs.writeFileSync(markdownPath, L.join('\n'));
    if (alarms.length) {
      console.error('ALARM FAKTOR: bukti ciri yang dipakai halaman Profil Risiko tidak lagi bertahan:');
      for (const alarm of alarms) console.error(`  - ${alarm}`);
      process.exitCode = 1;
    } else {
      console.log('Pengawas faktor: 4 ciri kokoh masih positif di luar sampel (IC dan t > 0).');
    }
  }
  if (markdownPath) {
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, report);
    console.log(`laporan ditulis: ${markdownPath}`);
  }
  restore();
}

main().catch((error) => {
  console.error('[pemindai-faktor] gagal:', error?.message ?? error);
  process.exitCode = 1;
});