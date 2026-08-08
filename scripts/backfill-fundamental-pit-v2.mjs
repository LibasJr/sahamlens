#!/usr/bin/env node

/**
 * Fundamental PIT Backfill v2
 *
 * Target period:
 *   Q3 2024 => period_end 2024-09-30
 *   Q4 2024 => period_end 2024-12-31
 *   Q1 2025 => period_end 2025-03-31
 *   Q2 2025 => period_end 2025-06-30
 *
 * observed_date WAJIB tanggal publikasi/pertama diketahui pasar.
 * Script TIDAK pernah menebak observed_date dari period_end dan TIDAK pernah
 * mengambil quoteSummary hari ini lalu menempelkannya ke masa lalu.
 *
 * Default source directory: data/financials/
 * Supported: CSV / JSON. Minimal columns:
 * ticker, observed_date (atau publication_date), period_end,
 * per,pbv,roe,der,current_ratio,revenue_growth,source
 *
 * Append-only: repository memakai ON CONFLICT DO NOTHING.
 */

import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const TARGET_PERIODS = new Set(['2024-09-30', '2024-12-31', '2025-03-31', '2025-06-30']);
const BATCH_51 = new Set([
  'BBCA.JK','TPIA.JK','BMRI.JK','BBRI.JK','BRPT.JK',
  'DSSA.JK','AMMN.JK','ANTM.JK','TLKM.JK','ASII.JK',
  'CUAN.JK','DEWA.JK','BRMS.JK','BREN.JK','BBNI.JK',
  'MDKA.JK','TINS.JK','RAJA.JK','AMRT.JK','UNTR.JK',
  'ADRO.JK','BULL.JK','ENRG.JK','INCO.JK','MAPI.JK',
  'MBMA.JK','MEDC.JK','KLBF.JK','ESSA.JK','INDY.JK',
  'INDF.JK','NCKL.JK','INKP.JK','PGAS.JK','ADMR.JK',
  'WIFI.JK','ITMG.JK','PTBA.JK','CPIN.JK','JPFA.JK',
  'ISAT.JK','TAPG.JK','BRIS.JK','ICBP.JK','UNVR.JK',
  'AKRA.JK','STAA.JK','AUTO.JK','BFIN.JK','GJTL.JK',
  'DGWG.JK',
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NULLISH = new Set(['', '-', 'â€”', 'na', 'n/a', 'null', 'undefined']);

function loadEnvFile(filePath = path.join(repoRoot, '.env.local')) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] != null) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function installTsHook() {
  const ts = require('typescript');
  const prevTs = Module._extensions['.ts'];
  const prevResolve = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      return prevResolve.call(this, path.join(repoRoot, request.slice(2)), parent, isMain, options);
    }
    return prevResolve.call(this, request, parent, isMain, options);
  };
  Module._extensions['.ts'] = function(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
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
  return () => {
    Module._resolveFilename = prevResolve;
    if (prevTs) Module._extensions['.ts'] = prevTs;
    else delete Module._extensions['.ts'];
  };
}

function parseArgs() {
  const out = {
    dir: path.join(repoRoot, 'data', 'financials'),
    pilot: false,
    dryRun: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--pilot') out.pilot = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--dir=')) out.dir = path.resolve(repoRoot, arg.slice(6));
    else throw new Error(`Argumen tidak dikenal: ${arg}`);
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (quotes) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') quotes = false;
      else cell += c;
    } else if (c === '"') quotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  row.push(cell); rows.push(row);
  const clean = rows.filter((r) => r.some((x) => String(x).trim()));
  if (!clean.length) return [];
  const headers = clean[0].map((h) => h.trim());
  return clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]?.trim() ?? ''])));
}

function readRows(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `FAIL-CLOSED: folder sumber PIT tidak ditemukan: ${dir}\n` +
      `Tambahkan file historis yang benar ke data/financials/. Script TIDAK akan memakai data current sebagai pengganti.`
    );
  }
  const files = fs.readdirSync(dir)
    .filter((f) => /\.(csv|json)$/i.test(f))
    .sort();
  if (!files.length) {
    throw new Error(`FAIL-CLOSED: tidak ada CSV/JSON PIT di ${dir}`);
  }

  const rows = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const text = fs.readFileSync(full, 'utf8');
    const parsed = file.toLowerCase().endsWith('.json')
      ? JSON.parse(text)
      : parseCsv(text);
    if (!Array.isArray(parsed)) throw new Error(`${file}: root JSON harus array`);
    parsed.forEach((row) => rows.push({ ...row, __file: file }));
  }
  return rows;
}

function pick(row, names) {
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const actual = lower.get(name.toLowerCase());
    if (actual) return row[actual];
  }
  return undefined;
}

function normalizeTicker(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s || s.startsWith('^')) return '';
  return s.includes('.') ? s : `${s}.JK`;
}

function num(v, label) {
  if (v == null) return null;
  const raw = String(v).trim();
  if (NULLISH.has(raw.toLowerCase())) return null;
  let normalized = raw.replace(/\s+/g, '').replace(/%$/, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) normalized = normalized.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error(`${label}: angka invalid ${JSON.stringify(v)}`);
  return n;
}

function date(v, label) {
  const s = String(v ?? '').slice(0, 10);
  if (!DATE_RE.test(s)) throw new Error(`${label}: tanggal YYYY-MM-DD wajib, diterima ${JSON.stringify(v)}`);
  return s;
}

function normalize(row) {
  const ticker = normalizeTicker(pick(row, ['ticker','symbol','code','kode']));
  const observedDate = date(
    pick(row, ['observed_date','observedDate','publication_date','publicationDate','published_date','publishedDate']),
    `${row.__file} ${ticker || '?'} observed_date`
  );
  const periodEnd = date(
    pick(row, ['period_end','periodEnd','report_period_end','reportPeriodEnd']),
    `${row.__file} ${ticker || '?'} period_end`
  );

  if (periodEnd > observedDate) {
    throw new Error(`${row.__file} ${ticker}: period_end ${periodEnd} > observed_date ${observedDate}`);
  }

  return {
    ticker,
    observedDate,
    periodEnd,
    per: num(pick(row, ['per','pe','pe_ratio','trailingPE']), `${ticker} per`),
    pbv: num(pick(row, ['pbv','pb','pb_ratio','priceToBook']), `${ticker} pbv`),
    roe: num(pick(row, ['roe','return_on_equity','returnOnEquity']), `${ticker} roe`),
    der: num(pick(row, ['der','debt_to_equity','debtToEquity']), `${ticker} der`),
    currentRatio: num(pick(row, ['current_ratio','currentRatio','cr']), `${ticker} current_ratio`),
    revenueGrowth: num(pick(row, ['revenue_growth','revenueGrowth','sales_growth','salesGrowth']), `${ticker} revenue_growth`),
    source: String(pick(row, ['source','sumber']) ?? `pit-file:${row.__file}`).trim(),
  };
}

async function main() {
  const args = parseArgs();
  loadEnvFile();

  const restore = installTsHook();
  try {
    const { BACKTEST_UNIVERSE } = require(path.join(repoRoot, 'modules/backtest/constants/backtest-universe.ts'));
    const {
      archiveFundamentalPitBackfill,
      auditFundamentalHistoryCounts,
    } = require(path.join(repoRoot, 'modules/fundamental/repository/fundamental-history.repository.ts'));

    const universe = new Set(BATCH_51);
    if (!args.pilot && BACKTEST_UNIVERSE.length !== 109) {
      console.warn(`[PIT v2] WARNING: BACKTEST_UNIVERSE sekarang ${BACKTEST_UNIVERSE.length}, bukan 109; memakai isi repo apa adanya.`);
    }

    const normalized = readRows(args.dir).map(normalize);
    const rows = normalized.filter((r) => universe.has(r.ticker) && TARGET_PERIODS.has(r.periodEnd));

    const keyCount = new Map();
    for (const row of rows) {
      const key = `${row.ticker}|${row.observedDate}`;
      keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
    }
    const dupes = [...keyCount.entries()].filter(([, n]) => n > 1);
    if (dupes.length) {
      throw new Error(`FAIL-CLOSED: duplicate ticker+observed_date pada input: ${dupes.slice(0,5).map(([k,n]) => `${k} x${n}`).join(', ')}`);
    }

    const distinctTickers = new Set(rows.map((r) => r.ticker));
    const periods = [...new Set(rows.map((r) => r.periodEnd))].sort();

    console.log('[PIT v2] mode: BATCH-51');
    console.log('[PIT v2] source dir:', args.dir);
    console.log('[PIT v2] candidate rows:', rows.length);
    console.log('[PIT v2] distinct tickers:', distinctTickers.size);
    console.log('[PIT v2] period_end:', periods.join(', ') || '(none)');

    if (!rows.length) {
      throw new Error('FAIL-CLOSED: tidak ada row PIT valid untuk target Q3 2024 s/d Q2 2025.');
    }

    // Tidak mewajibkan 4x109 rows karena sumber historis bisa incomplete. Yang hilang
    // dilaporkan dan TIDAK diisi dengan karangan/current values.
    for (const period of [...TARGET_PERIODS]) {
      const n = new Set(rows.filter((r) => r.periodEnd === period).map((r) => r.ticker)).size;
      console.log(`[PIT v2] coverage ${period}: ${n}/${universe.size} ticker`);
    }

    if (args.dryRun) {
      console.log('[PIT v2] DRY RUN - database tidak disentuh.');
      return;
    }

    const before = await auditFundamentalHistoryCounts();
    console.log(`[PIT v2] BEFORE distinct observed_date=${before.distinctObservedDates}, rows=${before.totalRows}`);

    // Batch kecil mengurangi parameter explosion, tetap append-only.
    let inserted = 0;
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      inserted += await archiveFundamentalPitBackfill(rows.slice(i, i + BATCH));
    }

    const after = await auditFundamentalHistoryCounts();
    console.log(`[PIT v2] inserted=${inserted}`);
    console.log(`[PIT v2] AFTER distinct observed_date=${after.distinctObservedDates}, rows=${after.totalRows}`);
    console.log('[PIT v2] Data existing tidak dihapus/UPDATE; conflict di-skip.');
  } finally {
    restore();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || path.resolve(process.argv[1] ?? '') === __filename) {
  main().catch((err) => {
    console.error('[PIT v2] ERROR:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}




