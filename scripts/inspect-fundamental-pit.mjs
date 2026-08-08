#!/usr/bin/env node
/**
 * Inspeksi READ-ONLY arsip fundamental point-in-time. Tidak pernah menulis ke database.
 *
 * Pemakaian:
 *   node scripts/inspect-fundamental-pit.mjs
 *       Ringkasan: total baris, coverage Batch-51 per periode, daftar sel yang MISSING.
 *
 *   node scripts/inspect-fundamental-pit.mjs --ticker=ANTM
 *       Seluruh snapshot PIT satu ticker beserta source-nya.
 *
 *   node scripts/inspect-fundamental-pit.mjs --ticker=ANTM --asof=2025-04-09
 *       Uji no-lookahead lewat asOf() PRODUKSI: menampilkan apa yang terlihat pada
 *       tanggal itu dan pada H-1. Snapshot yang terbit pada D tidak boleh terlihat di D-1.
 */
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const arg = (n) => {
  const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : null;
};
const rawTicker = arg('ticker');
const TICKER = rawTicker ? (rawTicker.includes('.') ? rawTicker.toUpperCase() : `${rawTicker.toUpperCase()}.JK`) : null;
const ASOF = arg('asof');

// .env.local dimuat tanpa pernah dicetak.
for (const raw of fs.readFileSync(path.join(repoRoot, '.env.local'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq).trim();
  if (process.env[key] != null) continue;
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[key] = v;
}

const BATCH51 = ['BBCA','TPIA','BMRI','BBRI','BRPT','DSSA','AMMN','ANTM','TLKM','ASII','CUAN','DEWA','BRMS','BREN','BBNI','MDKA','TINS','RAJA','AMRT','UNTR','ADRO','BULL','ENRG','INCO','MAPI','MBMA','MEDC','KLBF','ESSA','INDY','INDF','NCKL','INKP','PGAS','ADMR','WIFI','ITMG','PTBA','CPIN','JPFA','ISAT','TAPG','BRIS','ICBP','UNVR','AKRA','STAA','AUTO','BFIN','GJTL','DGWG'].map((t) => `${t}.JK`);
const PERIODS = ['2024-09-30', '2024-12-31', '2025-03-31', '2025-06-30'];

const { Pool } = require('pg');
const url = process.env.DATABASE_URL.replace(
  /([?&])sslmode=(?:prefer|require|verify-ca)(?=(&|$))/i, '$1sslmode=verify-full'
);
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: true }, max: 3, connectionTimeoutMillis: 15000 });

const dayBefore = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

try {
  if (ASOF) {
    if (!TICKER) throw new Error('--asof butuh --ticker=XXXX');
    // TS hook: memanggil repository PRODUKSI, bukan menyalin logikanya.
    const ts = require('typescript');
    const prevResolve = Module._resolveFilename;
    Module._resolveFilename = function (req, parent, isMain, opts) {
      if (typeof req === 'string' && req.startsWith('@/')) {
        return prevResolve.call(this, path.join(repoRoot, req.slice(2)), parent, isMain, opts);
      }
      return prevResolve.call(this, req, parent, isMain, opts);
    };
    Module._extensions['.ts'] = function (m, f) {
      const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs },
      });
      m._compile(out.outputText, f);
    };
    const { asOf } = require(path.join(repoRoot, 'modules/fundamental/repository/fundamental-history.repository.ts'));
    const show = (label, r) => console.log(`${label}: ${r ? `observed_date=${r.observedDate} period_end=${r.periodEnd} per=${r.per} pbv=${r.pbv} roe=${r.roe} der=${r.der}` : 'null (belum ada yang diketahui)'}`);
    const on = await asOf(TICKER, ASOF);
    const before = await asOf(TICKER, dayBefore(ASOF));
    console.log(`Uji no-lookahead ${TICKER}`);
    show(`  asOf(${ASOF})      `, on);
    show(`  asOf(${dayBefore(ASOF)}) [H-1]`, before);
    if (on && before && on.observedDate === before.observedDate) {
      console.log(`  -> H-1 melihat snapshot yang sama; artinya laporan itu memang sudah terbit sebelum ${ASOF}.`);
    } else if (on) {
      console.log(`  -> OK: snapshot ${on.observedDate} TIDAK terlihat pada H-1. Tidak ada look-ahead.`);
    }
  } else if (TICKER) {
    const { rows } = await pool.query(
      `SELECT observed_date::text od, period_end::text pe, per, pbv, roe, der, current_ratio cr, revenue_growth rg, source
         FROM fundamental_history WHERE ticker = $1 ORDER BY observed_date`, [TICKER]);
    console.log(`${TICKER}: ${rows.length} snapshot (period_end NULL = snapshot runtime lama, bukan PIT)`);
    console.table(rows.map((r) => ({ observed: r.od, period: r.pe, per: r.per, pbv: r.pbv, roe: r.roe, der: r.der, cr: r.cr, rg: r.rg })));
    for (const r of rows.filter((x) => x.pe)) console.log(`  ${r.pe} <- ${String(r.source).slice(0, 110)}`);
  } else {
    const tot = await pool.query(
      `SELECT COUNT(*)::int rows,
              COUNT(*) FILTER (WHERE period_end IS NOT NULL)::int pit,
              COUNT(DISTINCT ticker) FILTER (WHERE ticker = ANY($1) AND period_end IS NOT NULL)::int tickers
         FROM fundamental_history`, [BATCH51]);
    console.log('TOTAL:', JSON.stringify(tot.rows[0]), `(dari ${BATCH51.length} ticker Batch-51)`);

    const cov = await pool.query(
      `SELECT period_end::text pe, COUNT(DISTINCT ticker)::int n
         FROM fundamental_history WHERE ticker = ANY($1) AND period_end = ANY($2::date[])
        GROUP BY 1 ORDER BY 1`, [BATCH51, PERIODS]);
    console.log('\nCOVERAGE Batch-51:');
    console.table(cov.rows.map((r) => ({ period_end: r.pe, coverage: `${r.n}/${BATCH51.length}` })));

    const { rows } = await pool.query(
      `SELECT ticker, period_end::text pe FROM fundamental_history
        WHERE ticker = ANY($1) AND period_end = ANY($2::date[])`, [BATCH51, PERIODS]);
    const have = new Set(rows.map((r) => `${r.ticker}|${r.pe}`));
    console.log('\nMISSING per periode:');
    for (const pe of PERIODS) {
      const miss = BATCH51.filter((t) => !have.has(`${t}|${pe}`)).map((t) => t.replace('.JK', ''));
      console.log(`  ${pe} (${miss.length}): ${miss.join(', ') || '- lengkap -'}`);
    }
    console.log('\nAlasan tiap MISSING tercatat di data/pit-batch51/observed-dates.batch51*.json (blok deliberately_missing).');
  }
} finally {
  await pool.end();
}
