#!/usr/bin/env node
/**
 * Generate PIT fundamental rows from Yahoo, using a HUMAN-VERIFIED observed_date worklist.
 *
 * Hubungan dengan scripts/generate-pit-from-yahoo-verified.mjs: script itu dipakai untuk
 * batch 41 dan jalur file-nya hardcoded (data/financials/pit-observed-date-41.csv ->
 * pit-batch-41-verified-generated.csv) termasuk jendela Yahoo-nya. Yang ini versi
 * berparameter: worklist, direktori keluaran, dan file provenance ditentukan lewat flag,
 * dan jendela fetch diturunkan dari periode target (lihat fetchFundamentals). Untuk batch
 * baru pakai yang ini; yang lama disimpan sebagai catatan bagaimana batch 41 dibuat.
 *
 * Ini bukan penebak observed_date. observed_date HARUS sudah diverifikasi manual
 * (tanggal publikasi laporan ke pasar) dan diberikan lewat worklist JSON. Script hanya:
 *   - ambil angka fundamental historis dari Yahoo fundamentalsTimeSeries (quarterly+annual)
 *   - ambil harga historis terakhir <= observed_date
 *   - ambil FX USDIDR terakhir <= observed_date bila laporan USD sedangkan harga IDR
 *   - hitung PER/PBV/ROE/DER/current_ratio/revenue_growth sesuai konvensi SahamLens
 * Nilai yang tidak bisa dihitung dari sumber -> null (tidak pernah dikarang).
 *
 * Konvensi income statement (YTD, TIDAK disetahunkan):
 *   Q1 -> Q1 3M; H1 -> Q1+Q2 3M; 9M -> Q1+Q2+Q3 3M; FY -> annual 12M.
 * ROE = ni_ytd / ending_equity ; DER = total_liabilities / equity ;
 * current_ratio = current_assets / current_liabilities ;
 * revenue_growth = YoY hanya bila comparator YTD periode sama tahun sebelumnya tersedia.
 *   BASIS: mata uang pelaporan emiten (as-reported), BUKAN hasil translasi ke IDR.
 *   Untuk pelapor USD (mis. TPIA) pembilang dan penyebut sama-sama USD, jadi rasio
 *   pertumbuhannya bersih dari pergerakan kurs antar-tahun. Angka media yang memakai
 *   nilai ter-translasi IDR akan berbeda (TPIA FY24: -17.34% USD vs -12.9% IDR) - itu
 *   selisih FX, bukan selisih kinerja. JANGAN mentranslasi ke IDR hanya demi rasio ini;
 *   translasi hanya dipakai untuk harga (PER/PBV), di mana harga dan laporan memang
 *   harus berada pada mata uang yang sama.
 * PER = harga(mata uang laporan) / (ni_ytd/shares) bila ni_ytd>0 ; PBV = harga / (equity/shares) bila equity>0.
 *
 * Usage:
 *   node scripts/generate-pit-from-yahoo.mjs \
 *     --worklist=data/pit-batch51/observed-dates.batch51.json \
 *     --out=data/pit-batch51/staging \
 *     --provenance=data/pit-batch51/provenance.batch51.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

function arg(name, def) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const WORKLIST = path.resolve(repoRoot, arg('worklist', 'data/pit-batch51/observed-dates.batch51.json'));
const OUT_DIR = path.resolve(repoRoot, arg('out', 'data/pit-batch51/staging'));
const PROV = path.resolve(repoRoot, arg('provenance', 'data/pit-batch51/provenance.batch51.json'));
const TODAY = new Date().toISOString().slice(0, 10);

const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const dk = (dt) => (dt instanceof Date ? dt.toISOString().slice(0, 10) : String(dt).slice(0, 10));
const prevYearEnd = (pe) => `${Number(pe.slice(0, 4)) - 1}${pe.slice(4)}`;

// last close with date <= onDate, searching back up to lookback days
async function closeAtOrBefore(symbol, onDate, lookbackDays = 45) {
  const p2 = new Date(onDate + 'T00:00:00Z');
  const p1 = new Date(p2.getTime() - lookbackDays * 864e5);
  const r = await yf.chart(symbol, { period1: dk(p1), period2: dk(new Date(p2.getTime() + 864e5)), interval: '1d' });
  const q = (r.quotes || []).filter((x) => x.close != null && dk(x.date) <= onDate).sort((a, b) => dk(a.date) < dk(b.date) ? -1 : 1);
  const last = q[q.length - 1];
  return last ? { date: dk(last.date), close: last.close } : null;
}

/**
 * Jendela fetch WAJIB dipatok ke periode target, bukan ke hari ini.
 *
 * Empiris (yahoo-finance2 v4, 2026-08-08): fundamentalsTimeSeries hanya mengisi nilai
 * untuk ~4 periode terakhir relatif ke `period2`. Dengan period2 = hari ini, baris
 * tanggal untuk kuartal lama TETAP dikembalikan tetapi SELURUH field-nya kosong -
 * mis. RAJA/INKP/WIFI 2025-03-31 datang tanpa totalRevenue/stockholdersEquity. Efeknya
 * senyap: metrik jadi null dan coverage turun tanpa error. Memakai period2 = periode
 * target terakhir + buffer membuat kuartal yang diminta berada di dalam jendela isi.
 */
async function fetchFundamentals(symbol, period2) {
  const opt = { period1: '2022-06-01', period2, module: 'all', merge: false };
  const [q, a] = await Promise.all([
    yf.fundamentalsTimeSeries(symbol, { ...opt, type: 'quarterly' }),
    yf.fundamentalsTimeSeries(symbol, { ...opt, type: 'annual' }),
  ]);
  const byDate = (rows) => {
    const m = new Map();
    for (const row of rows || []) if (row && row.date) m.set(dk(row.date), row);
    return m;
  };
  return { q: byDate(q), a: byDate(a) };
}

function ytdIncome(qMap, periodEnd, kind) {
  const y = periodEnd.slice(0, 4);
  const keys = { Q1: [`${y}-03-31`], H1: [`${y}-03-31`, `${y}-06-30`], '9M': [`${y}-03-31`, `${y}-06-30`, `${y}-09-30`] }[kind];
  let rev = 0, ni = 0;
  for (const k of keys) {
    const r = qMap.get(k);
    if (!r || r.totalRevenue == null || r.netIncome == null) return null; // comparator/quarter tidak lengkap
    rev += r.totalRevenue; ni += r.netIncome;
  }
  return { rev, ni };
}

async function main() {
  const wl = JSON.parse(fs.readFileSync(WORKLIST, 'utf8'));
  const rows = [];
  const provenance = [];
  const gaps = [];

  // period2 = period_end target terakhir + 120 hari (dibatasi hari ini). Lihat catatan
  // di fetchFundamentals(): jendela yang terlalu lebar mengosongkan kuartal lama.
  const maxPe = wl.entries.reduce((m, e) => (e.period_end > m ? e.period_end : m), '0000-00-00');
  const buffered = new Date(new Date(maxPe + 'T00:00:00Z').getTime() + 120 * 864e5).toISOString().slice(0, 10);
  const period2 = buffered < TODAY ? buffered : TODAY;
  console.log(`[generate] fundamentals window: 2022-06-01 .. ${period2} (max period_end ${maxPe})`);

  // group entries by ticker to reuse fetches
  const byTicker = new Map();
  for (const e of wl.entries) { if (!byTicker.has(e.ticker)) byTicker.set(e.ticker, []); byTicker.get(e.ticker).push(e); }

  for (const [ticker, entries] of byTicker) {
    const qs = await yf.quoteSummary(ticker, { modules: ['price', 'financialData', 'defaultKeyStatistics'] }).catch(() => null);
    const priceCcy = qs?.price?.currency ?? null;
    const finCcy = qs?.financialData?.financialCurrency ?? priceCcy;
    const sharesOut = qs?.defaultKeyStatistics?.sharesOutstanding ?? null;
    const fund = await fetchFundamentals(ticker, period2);

    for (const e of entries) {
      const { period_end: pe, observed_date: od, period_kind: kind, source } = e;
      const prov = { ticker, period_end: pe, observed_date: od, period_kind: kind, financialCurrency: finCcy, priceCurrency: priceCcy };
      if (od < pe) throw new Error(`${ticker} ${pe}: observed_date ${od} < period_end`);
      if (od > TODAY) throw new Error(`${ticker} ${pe}: observed_date ${od} di masa depan`);

      // balance sheet point-in-time @ period_end (annual preferred for FY, else quarterly)
      const bs = (kind === 'FY' ? fund.a.get(pe) : null) || fund.q.get(pe) || fund.a.get(pe);
      const equity = bs?.stockholdersEquity ?? null;
      const liab = bs?.totalLiabilitiesNetMinorityInterest ?? null;
      const ca = bs?.currentAssets ?? null;
      const cl = bs?.currentLiabilities ?? null;
      const shares = bs?.ordinarySharesNumber ?? bs?.shareIssued ?? sharesOut ?? null;

      // income YTD
      let inc;
      if (kind === 'FY') { const r = fund.a.get(pe); inc = r && r.totalRevenue != null && r.netIncome != null ? { rev: r.totalRevenue, ni: r.netIncome } : null; }
      else inc = ytdIncome(fund.q, pe, kind);
      const niYtd = inc?.ni ?? null;
      const revYtd = inc?.rev ?? null;

      // revenue growth YoY (hanya jika comparator tersedia)
      let revGrowth = null, revPrev = null;
      if (revYtd != null) {
        if (kind === 'FY') { const pr = fund.a.get(prevYearEnd(pe)); revPrev = pr?.totalRevenue ?? null; }
        else { const pi = ytdIncome(fund.q, prevYearEnd(pe), kind); revPrev = pi?.rev ?? null; }
        if (revPrev != null && revPrev !== 0) revGrowth = ((revYtd - revPrev) / Math.abs(revPrev)) * 100;
      }

      // price + FX <= observed_date
      const px = await closeAtOrBefore(ticker, od);
      prov.price_date = px?.date ?? null; prov.price_close = px?.close ?? null; prov.price_currency = priceCcy;
      let fx = null, priceInFinCcy = px?.close ?? null;
      if (px && finCcy && priceCcy && finCcy !== priceCcy) {
        // asumsi umum IDX: price IDR, financial USD -> USDIDR
        const fxSym = `${finCcy}${priceCcy}=X`; // e.g. USDIDR=X
        fx = await closeAtOrBefore(fxSym, od);
        prov.fx_symbol = fxSym; prov.fx_date = fx?.date ?? null; prov.fx_rate = fx?.close ?? null;
        priceInFinCcy = px && fx ? px.close / fx.close : null; // IDR / (IDR per USD) = USD
      }

      // ratios
      const roe = equity != null && equity > 0 && niYtd != null ? (niYtd / equity) * 100 : null;
      const der = equity != null && equity > 0 && liab != null ? liab / equity : null;
      const cr = ca != null && cl != null && cl !== 0 ? ca / cl : null;
      const epsYtd = niYtd != null && shares ? niYtd / shares : null;
      const bvps = equity != null && shares ? equity / shares : null;
      const per = priceInFinCcy != null && epsYtd != null && epsYtd > 0 ? priceInFinCcy / epsYtd : null;
      const pbv = priceInFinCcy != null && bvps != null && bvps > 0 ? priceInFinCcy / bvps : null;

      Object.assign(prov, { shares, ni_ytd: niYtd, revenue_ytd: revYtd, revenue_prev: revPrev, equity, total_liabilities: liab, current_assets: ca, current_liabilities: cl, price_in_financial_ccy: priceInFinCcy });
      provenance.push(prov);

      // Sumber tidak lengkap harus TERLIHAT, bukan diam-diam jadi null.
      const missing = [];
      if (equity == null) missing.push('equity');
      if (niYtd == null) missing.push('net_income_ytd');
      if (revYtd == null) missing.push('revenue_ytd');
      if (px == null) missing.push('price');
      if (missing.length) gaps.push(`${ticker} ${pe} (${kind}): ${missing.join(', ')}`);

      const srcFull = `Yahoo fundamentalsTimeSeries (${finCcy}) + Yahoo close ${px?.date ?? 'NA'} (${priceCcy})${fx ? ` + FX ${prov.fx_symbol}@${fx.date}` : ''}; observed_date verified: ${source}`;
      rows.push({
        ticker, observed_date: od, period_end: pe,
        per: round(per), pbv: round(pbv), roe: round(roe), der: round(der),
        current_ratio: round(cr), revenue_growth: round(revGrowth), source: srcFull,
      });
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PROV), { recursive: true });
  const header = 'ticker,observed_date,period_end,per,pbv,roe,der,current_ratio,revenue_growth,source';
  const csv = [header, ...rows.map((r) => [r.ticker, r.observed_date, r.period_end, r.per ?? '', r.pbv ?? '', r.roe ?? '', r.der ?? '', r.current_ratio ?? '', r.revenue_growth ?? '', `"${r.source.replace(/"/g, '""')}"`].join(','))].join('\n') + '\n';
  const outCsv = path.join(OUT_DIR, 'pit-batch51.csv');
  fs.writeFileSync(outCsv, csv, 'utf8');
  fs.writeFileSync(PROV, JSON.stringify(provenance, null, 2), 'utf8');

  console.log('[generate] rows:', rows.length, '-> ', path.relative(repoRoot, outCsv));
  if (gaps.length) {
    console.log(`[generate] SUMBER TIDAK LENGKAP pada ${gaps.length} baris (metrik terkait dibiarkan null, TIDAK dikarang):`);
    gaps.forEach((g) => console.log('   -', g));
  }
  console.table(rows.map((r) => ({ t: r.ticker, pe: r.period_end, od: r.observed_date, per: r.per, pbv: r.pbv, roe: r.roe, der: r.der, cr: r.current_ratio, rg: r.revenue_growth })));
}

main().catch((e) => { console.error('[generate] ERROR:', e.message); process.exitCode = 1; });
