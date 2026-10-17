#!/usr/bin/env node

/**
 * Uji regime filter - SATU hipotesis, didaftarkan sebelum data dilihat.
 *
 * HIPOTESIS (tunggal, dibekukan). Portofolio desil teratas dari masing-masing dua faktor harga
 * yang bertahan di OOS pada docs/factor-research/factor-scan-2026-09-24.md - volatilitas 60 sesi
 * rendah (`vol_60`) dan jarak dari puncak 52 minggu (`dist_high_52w`) - menghasilkan netto per
 * 20 sesi LEBIH BAIK saat proxy regime > MA100-nya dibanding saat <= MA100.
 *
 * Proxy regime. DB tidak punya IHSG. Proxy = indeks timbang-sama seluruh emiten likuid
 * (avg_value_20d >= Rp1 miliar pada sesi SEBELUMNYA), dikumulasi dari imbal hasil harian arsip
 * harga. Regime pada tanggal t hanya memakai data <= t: "naik" jika level[t] > rata-rata level
 * 100 sesi terakhir (termasuk t); selain itu "turun". Tanggal dengan < 100 sesi riwayat dibuang.
 *
 * PARAMETER DIBEKUKAN (tidak boleh diubah setelah melihat hasil): MA100, rebalance 20 sesi,
 * biaya 0,40% per transaksi (uji tahan 0,60%), split train < 2025-01-01 <= OOS, desil teratas,
 * t-statistik dari periode non-tumpang-tindih (rebalance 20 sesi = tiap periode memang
 * non-tumpang-tindih). Tidak ada irisan lain, tidak ada tuning MA/ambang.
 *
 * KRITERIA VERDICT (dibekukan):
 *   Per faktor LOLOS jika: selisih (regime naik - regime turun) pada netto/periode > 0 di TRAIN,
 *   > 0 di OOS, dan t-Welch selisih OOS >= 2 (dengan >= 3 periode per sel).
 *   Verdict keseluruhan PASS hanya jika KEDUA faktor lolos. Selain itu GUGUR.
 *
 * Portofolio dihitung persis seperti scripts/factor-research.mjs: selalu terinvestasi, rebalance
 * tiap 20 sesi dari calendar[0], turnover dilacak lintas seluruh periode (regime hanya
 * menggolongkan periode, tidak mengubah isi portofolio), satu materialisasi per pasangan
 * sesi-emiten. Kolom skor lens_* TIDAK dipakai (ditulis ulang Agu-Sep 2026).
 * Baca-saja: tidak menulis ke basis data.
 *
 * Usage:
 *   node scripts/regime-filter-research.mjs [--markdown FILE]
 *   node scripts/regime-filter-research.mjs --selftest
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// --- Kontrak beku ---------------------------------------------------------------------------

const SPLIT = { oosStart: '2025-01-01' };
const MIN_ROWS = 300;
const MIN_CROSS_SECTION = 50;
const MIN_LIQUIDITY_IDR = 1_000_000_000;
const FORWARD = 20;
const REBALANCE_SESSIONS = 20;
const COST_ROUND_TRIP = 0.004;
const COST_STRESS = 0.006;
const TOP_QUANTILE = 0.1;
const MA_WINDOW = 100;
const T_PASS = 2;
const MIN_CELL = 3;
const FACTOR_IDS = [
  { id: 'vol_60', label: 'Volatilitas 60 sesi rendah' },
  { id: 'dist_high_52w', label: 'Jarak dari puncak 52 minggu' },
];

// --- Utilitas -------------------------------------------------------------------------------

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
function stdev(v) {
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/** t-Welch untuk selisih rata-rata a - b. null bila sel < MIN_CELL atau varians nol. */
function welch(a, b) {
  if (a.length < MIN_CELL || b.length < MIN_CELL) return { diff: null, t: null };
  const diff = mean(a) - mean(b);
  const se = Math.sqrt(stdev(a) ** 2 / a.length + stdev(b) ** 2 / b.length);
  return { diff, t: se > 0 ? diff / se : null };
}

function maxDrawdown(vals) {
  let equity = 1;
  let peak = 1;
  let dd = 0;
  for (const v of vals) {
    equity *= 1 + v;
    if (equity > peak) peak = equity;
    dd = Math.min(dd, equity / peak - 1);
  }
  return { maxDrawdown: dd, total: equity - 1 };
}

/** Regime naik pada indeks g jika level[g] > rata-rata level[g-window+1..g]; null jika riwayat kurang. */
function regimeSeries(level, window) {
  const out = new Array(level.length).fill(null);
  let sum = 0;
  for (let g = 0; g < level.length; g += 1) {
    sum += level[g];
    if (g >= window) sum -= level[g - window];
    if (g >= window - 1) out[g] = level[g] > sum / window;
  }
  return out;
}

function selftest() {
  // MA100 pada deret naik murni selalu "naik"; deret turun murni selalu "turun"; 99 pertama null.
  const up = regimeSeries(Array.from({ length: 150 }, (_, i) => 1 + i), 100);
  assert.equal(up.slice(0, 99).every((x) => x === null), true);
  assert.equal(up.slice(99).every((x) => x === true), true);
  const down = regimeSeries(Array.from({ length: 150 }, (_, i) => 200 - i), 100);
  assert.equal(down.slice(99).every((x) => x === false), true);
  // tanpa look-ahead: mengubah nilai masa depan tidak mengubah regime lampau
  const a = Array.from({ length: 150 }, (_, i) => 100 + Math.sin(i));
  const b = a.slice();
  b[140] = 1e6;
  assert.deepEqual(regimeSeries(a, 100).slice(0, 140), regimeSeries(b, 100).slice(0, 140));
  // Welch: sel kecil -> null; selisih jelas -> t besar
  assert.equal(welch([1, 2], [1, 2, 3]).t, null);
  assert.ok(welch([5, 6, 7, 5, 6], [1, 2, 1, 2, 1]).t > 5);
  const dd = maxDrawdown([0.1, -0.5, 0.2]);
  assert.ok(Math.abs(dd.maxDrawdown + 0.5) < 1e-12);
  console.log('selftest OK');
}

// --- Muat TypeScript DB client --------------------------------------------------------------

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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
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

// --- Pemrosesan -----------------------------------------------------------------------------

const args = process.argv.slice(2);
const mdIndex = args.indexOf('--markdown');
const markdownPath = mdIndex >= 0 ? args[mdIndex + 1] : null;

async function main() {
  const restore = installTypeScriptRequireHook();
  const { queryReadWithRetry } = require(path.join(repoRoot, 'shared/database/postgres.client.ts'));

  const calRes = await queryReadWithRetry(`select distinct date::text as date from lens_radar_history order by date asc`);
  const calendar = calRes.rows.map((r) => r.date);
  const globalIndex = new Map(calendar.map((d, i) => [d, i]));
  if (calendar.length < 400) throw new Error(`kalender terlalu pendek: ${calendar.length}`);
  console.log(`kalender sesi: ${calendar.length} (${calendar[0]} -> ${calendar[calendar.length - 1]})`);

  const tickerRes = await queryReadWithRetry(
    `select ticker from lens_radar_history group by ticker having count(*) >= ${MIN_ROWS} order by ticker`
  );
  const tickers = tickerRes.rows.map((r) => r.ticker);
  if (tickers.length < MIN_CROSS_SECTION) throw new Error(`emiten terlalu sedikit: ${tickers.length}`);
  console.log(`emiten dengan riwayat >= ${MIN_ROWS} sesi: ${tickers.length}`);

  // Akumulator indeks timbang-sama: jumlah & cacah imbal hasil harian per indeks kalender
  const idxSum = new Float64Array(calendar.length);
  const idxCnt = new Int32Array(calendar.length);
  const byDate = new Map(calendar.map((d) => [d, []]));
  let observed = 0;

  for (const ticker of tickers) {
    const res = await queryReadWithRetry(
      `select distinct on (date)
              date::text as date,
              coalesce(adjusted_close_price, close_price)::float8 as close,
              avg_value_20d::float8 as liquidity
         from lens_radar_history
        where ticker = $1 and coalesce(adjusted_close_price, close_price) is not null
        order by date asc, calculation_timestamp desc nulls last, updated_at desc`,
      [ticker]
    );
    const rows = res.rows;
    const n = rows.length;
    if (n < MIN_ROWS) continue;
    const closes = new Float64Array(n);
    const gi = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      closes[i] = Number(rows[i].close);
      gi[i] = globalIndex.get(rows[i].date) ?? -1;
    }
    const logRet = new Float64Array(n);
    for (let i = 1; i < n; i += 1) logRet[i] = closes[i - 1] > 0 && closes[i] > 0 ? Math.log(closes[i] / closes[i - 1]) : 0;

    // 1) kontribusi ke indeks: imbal hasil sesi berurutan, keanggotaan = likuiditas sesi SEBELUMNYA
    for (let i = 1; i < n; i += 1) {
      if (gi[i] < 0 || gi[i] - gi[i - 1] !== 1) continue;
      const liqPrev = Number(rows[i - 1].liquidity);
      if (!Number.isFinite(liqPrev) || liqPrev < MIN_LIQUIDITY_IDR) continue;
      if (!(closes[i - 1] > 0) || !(closes[i] > 0)) continue;
      idxSum[gi[i]] += closes[i] / closes[i - 1] - 1;
      idxCnt[gi[i]] += 1;
    }

    // 2) observasi faktor + imbal hasil depan, definisi sama dengan factor-research.mjs
    const rowAtOrBefore = (target) => {
      let lo = 0;
      let hi = n - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (gi[mid] <= target) {
          ans = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return ans;
    };
    for (let i = 252; i < n - 1; i += 1) {
      const liquidity = Number(rows[i].liquidity);
      if (!Number.isFinite(liquidity) || liquidity < MIN_LIQUIDITY_IDR) continue;
      const target = gi[i] + FORWARD;
      if (target >= calendar.length) break;
      const fwdRow = rowAtOrBefore(target);
      if (fwdRow <= i) continue;
      const fwd20 = closes[fwdRow] / closes[i] - 1;
      let s = 0;
      let s2 = 0;
      for (let k = i - 59; k <= i; k += 1) {
        s += logRet[k];
        s2 += logRet[k] * logRet[k];
      }
      const m = s / 60;
      const variance = (s2 - 60 * m * m) / 59;
      const v60 = variance > 0 ? Math.sqrt(variance) : 0;
      if (v60 <= 0) continue;
      let max52 = -Infinity;
      for (let k = i - 251; k <= i; k += 1) if (closes[k] > max52) max52 = closes[k];
      if (!(max52 > 0)) continue;
      const bucket = byDate.get(rows[i].date);
      if (!bucket) continue;
      bucket.push({ ticker, fwd20, factors: { vol_60: -v60, dist_high_52w: -(1 - closes[i] / max52) } });
      observed += 1;
    }
  }
  if (observed <= 0) throw new Error('penjaga: 0 observasi');
  console.log(`observasi terpakai: ${observed.toLocaleString('id-ID')}`);

  // Indeks timbang-sama -> level -> regime
  const level = new Float64Array(calendar.length);
  let lv = 1;
  let thinDays = 0;
  for (let g = 0; g < calendar.length; g += 1) {
    if (idxCnt[g] >= MIN_CROSS_SECTION) lv *= 1 + idxSum[g] / idxCnt[g];
    else thinDays += 1; // tidak cukup emiten: indeks diam (tidak mengarang imbal hasil)
    level[g] = lv;
  }
  const regime = regimeSeries(Array.from(level), MA_WINDOW);
  const regimeKnown = regime.filter((x) => x !== null).length;
  if (regimeKnown <= 0) throw new Error('penjaga: 0 tanggal dengan regime');
  console.log(`indeks proxy: ${calendar.length} sesi, ${thinDays} sesi tipis, ${regimeKnown} sesi punya regime`);

  const eligibleDates = [];
  for (let i = 0; i < calendar.length; i += REBALANCE_SESSIONS) eligibleDates.push(calendar[i]);

  const portfolioFor = (factorId) => {
    const periods = [];
    let prev = new Set();
    for (let idx = 0; idx < eligibleDates.length - 1; idx += 1) {
      const date = eligibleDates[idx];
      const rows = byDate.get(date);
      if (!rows || rows.length < MIN_CROSS_SECTION) continue;
      const scored = rows
        .map((r) => ({ r, s: r.factors[factorId] }))
        .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.r.fwd20));
      if (scored.length < MIN_CROSS_SECTION) continue;
      scored.sort((a, b) => b.s - a.s);
      const take = Math.max(5, Math.floor(scored.length * TOP_QUANTILE));
      const names = new Set(scored.slice(0, take).map((h) => h.r.ticker));
      const gross = mean(scored.slice(0, take).map((h) => h.r.fwd20));
      const benchmark = mean(rows.filter((r) => Number.isFinite(r.fwd20)).map((r) => r.fwd20));
      let turnover = 1;
      if (prev.size) {
        let replaced = 0;
        for (const t of names) if (!prev.has(t)) replaced += 1;
        turnover = replaced / Math.max(names.size, 1);
      }
      periods.push({
        date,
        up: regime[globalIndex.get(date)], // true / false / null (riwayat < 100 sesi)
        gross,
        net: gross - turnover * COST_ROUND_TRIP,
        netStress: gross - turnover * COST_STRESS,
        benchmark,
        turnover,
      });
      prev = names;
    }
    return periods;
  };

  const results = FACTOR_IDS.map((fd) => {
    const all = portfolioFor(fd.id);
    if (all.length <= 0) throw new Error(`penjaga: 0 periode portofolio untuk ${fd.id}`);
    const periods = all.filter((p) => p.up !== null);
    if (periods.length <= 0) throw new Error(`penjaga: 0 periode dengan regime untuk ${fd.id}`);
    const cell = (split, up, key) =>
      periods.filter((p) => (split === 'train' ? p.date < SPLIT.oosStart : p.date >= SPLIT.oosStart) && p.up === up).map((p) => p[key]);
    const splits = {};
    for (const split of ['train', 'oos']) {
      const out = {};
      for (const key of ['net', 'netStress', 'benchmark']) {
        const upV = cell(split, true, key);
        const dnV = cell(split, false, key);
        out[key] = { nUp: upV.length, nDown: dnV.length, meanUp: mean(upV), meanDown: mean(dnV), winUp: upV.length ? upV.filter((v) => v > 0).length / upV.length : null, winDown: dnV.length ? dnV.filter((v) => v > 0).length / dnV.length : null, ...welch(upV, dnV) };
      }
      out.excess = (() => {
        const e = (up) => periods.filter((p) => (split === 'train' ? p.date < SPLIT.oosStart : p.date >= SPLIT.oosStart) && p.up === up).map((p) => p.net - p.benchmark);
        return { meanUp: mean(e(true)), meanDown: mean(e(false)) };
      })();
      splits[split] = out;
    }
    // Strategi tersaring: investasi hanya saat regime naik, tunai (0%) saat turun. Masuk dari tunai = turnover 1.
    let wasIn = false;
    const filtered = periods.map((p) => {
      if (!p.up) {
        wasIn = false;
        return { date: p.date, ret: 0 };
      }
      const turnover = wasIn ? p.turnover : 1;
      wasIn = true;
      return { date: p.date, ret: p.gross - turnover * COST_ROUND_TRIP };
    });
    const slice = (arr, oos) => arr.filter((x) => (x.date >= SPLIT.oosStart) === oos);
    const always = periods.map((p) => ({ date: p.date, ret: p.net }));
    const bench = periods.map((p) => ({ date: p.date, ret: p.benchmark }));
    const dd = (arr) => ({ full: maxDrawdown(arr.map((x) => x.ret)), oos: maxDrawdown(slice(arr, true).map((x) => x.ret)) });
    const train = splits.train.net;
    const oos = splits.oos.net;
    const trainOk = train.diff !== null && train.diff > 0;
    const oosOk = oos.diff !== null && oos.diff > 0;
    const tOk = oos.t !== null && oos.t >= T_PASS;
    return {
      fd,
      nAll: all.length,
      nNoRegime: all.length - periods.length,
      splits,
      dd: { always: dd(always), filtered: dd(filtered), bench: dd(bench) },
      invested: filtered.filter((x) => x.ret !== 0).length,
      pass: trainOk && oosOk && tOk,
      checks: { trainOk, oosOk, tOk },
    };
  });

  const verdict = results.every((r) => r.pass) ? 'PASS' : 'GUGUR';

  // --- Laporan ---
  const f = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
  const pc = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
  const today = new Date().toISOString().slice(0, 10);
  const L = [];
  L.push(`# Uji regime filter pada faktor harga (${today})`);
  L.push('');
  L.push(`**Verdict: ${verdict}**`);
  L.push('');
  L.push('Hipotesis tunggal (dibekukan di kepala `scripts/regime-filter-research.mjs` sebelum dijalankan): netto per 20 sesi portofolio');
  L.push('desil teratas `vol_60` rendah dan `dist_high_52w` lebih baik saat proxy regime > MA100 dibanding saat <= MA100.');
  L.push(`Arsip ${calendar[0]} -> ${calendar[calendar.length - 1]} · ${tickers.length} emiten · ${observed.toLocaleString('id-ID')} observasi · ` +
    `rebalance ${REBALANCE_SESSIONS} sesi · biaya ${pc(COST_ROUND_TRIP)} (uji tahan ${pc(COST_STRESS)}) · split train < ${SPLIT.oosStart} <= OOS · ` +
    `${regimeKnown} sesi punya regime (MA${MA_WINDOW}, ${thinDays} sesi tipis tanpa imbal hasil indeks).`);
  L.push('');
  L.push('Proxy regime: indeks timbang-sama emiten likuid (>= Rp1 miliar/hari pada sesi sebelumnya) dari arsip harga; regime tanggal t hanya memakai data <= t.');
  L.push('Skor lens_* TIDAK dipakai (ditulis ulang Agu-Sep 2026). Portofolio selalu terinvestasi seperti factor-research.mjs; regime hanya menggolongkan periode.');
  L.push('');
  for (const r of results) {
    L.push(`## ${r.fd.label} (${r.fd.id}) - ${r.pass ? 'LOLOS' : 'GUGUR'}`);
    L.push('');
    L.push(`Periode portofolio ${r.nAll}, ${r.nNoRegime} dibuang karena riwayat indeks < ${MA_WINDOW} sesi.`);
    L.push('');
    L.push('| split | regime | tanggal | netto/20 sesi | menang | netto uji tahan 0,60% | patokan timbang-sama (tanpa biaya) | netto - patokan |');
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const split of ['train', 'oos']) {
      const s = r.splits[split];
      L.push(`| ${split} | naik (> MA${MA_WINDOW}) | ${s.net.nUp} | ${pc(s.net.meanUp)} | ${pc(s.net.winUp, 1)} | ${pc(s.netStress.meanUp)} | ${pc(s.benchmark.meanUp)} | ${pc(s.excess.meanUp)} |`);
      L.push(`| ${split} | turun (<= MA${MA_WINDOW}) | ${s.net.nDown} | ${pc(s.net.meanDown)} | ${pc(s.net.winDown, 1)} | ${pc(s.netStress.meanDown)} | ${pc(s.benchmark.meanDown)} | ${pc(s.excess.meanDown)} |`);
    }
    L.push('');
    L.push('| split | selisih netto (naik - turun) | t-Welch | selisih patokan (naik - turun) | selisih uji tahan 0,60% | t uji tahan |');
    L.push('| --- | --- | --- | --- | --- | --- |');
    for (const split of ['train', 'oos']) {
      const s = r.splits[split];
      L.push(`| ${split} | ${pc(s.net.diff)} | ${f(s.net.t)} | ${pc(s.benchmark.diff)} | ${pc(s.netStress.diff)} | ${f(s.netStress.t)} |`);
    }
    L.push('');
    L.push('| kurva | DD maks (seluruh) | total (seluruh) | DD maks (OOS) | total (OOS) |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const [name, d] of [['selalu terinvestasi (netto)', r.dd.always], [`tersaring regime (tunai saat turun; ${r.invested} periode terinvestasi)`, r.dd.filtered], ['patokan timbang-sama (tanpa biaya)', r.dd.bench]]) {
      L.push(`| ${name} | ${pc(d.full.maxDrawdown, 1)} | ${pc(d.full.total, 1)} | ${pc(d.oos.maxDrawdown, 1)} | ${pc(d.oos.total, 1)} |`);
    }
    L.push('');
    L.push(`Kriteria: selisih train > 0 ${r.checks.trainOk ? 'ya' : 'TIDAK'} · selisih OOS > 0 ${r.checks.oosOk ? 'ya' : 'TIDAK'} · t OOS >= ${T_PASS} ${r.checks.tOk ? 'ya' : 'TIDAK'} (t = ${f(r.splits.oos.net.t)}).`);
    L.push('');
  }
  L.push('## Kesimpulan');
  L.push('');
  L.push(`Verdict **${verdict}**. PASS hanya jika kedua faktor memenuhi: selisih regime searah positif di train dan OOS, dan t-Welch OOS >= ${T_PASS}. Tidak ada tuning setelah hasil dilihat.`);
  L.push('');
  L.push('Keterbatasan: (1) hanya emiten yang masih ada di arsip dengan >= 300 sesi (bias penyintas, sama dengan factor-research.mjs); ' +
    '(2) OOS ~2 tahun = sedikit periode 20 sesi, sehingga t >= 2 sulit dicapai secara struktural; (3) proxy bukan IHSG, dan satu kali uji tidak bisa dibuktikan ulang pada data yang sama.');
  L.push('');
  const report = L.join('\n');
  console.log('\n' + report);
  if (markdownPath) {
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, report);
    console.log(`laporan ditulis: ${markdownPath}`);
  }
  restore();
}

if (args.includes('--selftest')) selftest();
else
  main().catch((error) => {
    console.error('[regime-filter] gagal:', error?.message ?? error);
    process.exitCode = 1;
  });
