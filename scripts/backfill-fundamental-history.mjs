#!/usr/bin/env node

/**
 * One-shot fundamental point-in-time backfill.
 *
 * Prinsip audit:
 * - Script ini TIDAK mengambil fundamental "hari ini" untuk ditempel ke awal 2026.
 *   Input wajib berasal dari file snapshot/laporan historis yang punya observed_date
 *   (tanggal saat data diketahui pasar/SahamLens), supaya backtest bebas look-ahead.
 * - Idempoten dan append-only: INSERT memakai ON CONFLICT DO NOTHING. Jika snapshot
 *   sudah pernah diarsipkan, script tidak menimpa angka lama secara diam-diam.
 * - Null berarti sumber tidak menyediakan metrik itu; tidak pernah diubah menjadi 0.
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

const INSERT_BATCH_SIZE = 500;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NULLISH = new Set(['', '-', '—', 'na', 'n/a', 'null', 'undefined']);
const METRIC_ALIASES = [
  ['per', 'pe', 'pe_ratio', 'trailingPE'],
  ['pbv', 'pb', 'pb_ratio', 'priceToBook'],
  ['roe', 'return_on_equity', 'returnOnEquity'],
  ['der', 'debt_to_equity', 'debtToEquity'],
  ['current_ratio', 'currentRatio', 'cr'],
  ['revenue_growth', 'revenueGrowth', 'sales_growth', 'salesGrowth'],
];

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

export function dateKeyUtc(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export function normalizeTicker(value) {
  if (typeof value !== 'string') return '';
  const ticker = value.trim().toUpperCase();
  if (!ticker || ticker.startsWith('^')) return '';
  return ticker.includes('.') ? ticker : `${ticker}.JK`;
}

export function assertDateKey(value, label) {
  if (!DATE_KEY_RE.test(value)) {
    throw new Error(`${label} harus format YYYY-MM-DD, diterima ${JSON.stringify(value)}`);
  }
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()) {
  const options = {
    file: null,
    format: null,
    observedDate: null,
    source: 'manual-point-in-time-import',
    dryRun: false,
    tickers: null,
    percentInput: 'percent',
    maxObservedDate: dateKeyUtc(now),
    skipEmptyRows: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-empty-rows') options.skipEmptyRows = true;
    else if (arg.startsWith('--file=')) options.file = arg.slice('--file='.length);
    else if (arg.startsWith('--format=')) options.format = arg.slice('--format='.length).toLowerCase();
    else if (arg.startsWith('--observed-date=')) options.observedDate = arg.slice('--observed-date='.length);
    else if (arg.startsWith('--source=')) options.source = arg.slice('--source='.length).trim() || options.source;
    else if (arg.startsWith('--percent-input=')) options.percentInput = arg.slice('--percent-input='.length).toLowerCase();
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

  if (!options.file) throw new Error('Wajib isi --file=path/to/fundamental.csv atau .json');
  if (options.format != null && !['csv', 'json'].includes(options.format)) {
    throw new Error('--format hanya boleh csv atau json');
  }
  if (options.observedDate != null) assertDateKey(options.observedDate, '--observed-date');
  if (options.maxObservedDate == null) throw new Error('Tanggal hari ini tidak valid');
  if (!['percent', 'decimal'].includes(options.percentInput)) {
    throw new Error('--percent-input hanya boleh percent atau decimal');
  }

  return options;
}

function pick(row, names) {
  const lowerKeyMap = new Map();
  for (const key of Object.keys(row)) {
    lowerKeyMap.set(key.toLowerCase(), key);
  }
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const actualKey = lowerKeyMap.get(String(name).toLowerCase());
    if (actualKey != null) return row[actualKey];
  }
  return undefined;
}

export function parseNullableNumber(value, label = 'value') {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (NULLISH.has(raw.toLowerCase())) return null;
  let normalized = raw
    .replace(/\s+/g, '')
    .replace(/%$/, '');
  // CSV Indonesia sering memakai koma sebagai desimal ("22,1"), sedangkan export
  // lain memakai titik ("22.1"). Titik hanya dianggap pemisah ribuan jika koma juga
  // hadir ("1.234,56"); kalau titik sendirian, ia tetap desimal.
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    throw new Error(`${label} bukan angka valid: ${JSON.stringify(value)}`);
  }
  return n;
}

function maybePercent(value, mode) {
  if (value == null) return null;
  return mode === 'decimal' ? value * 100 : value;
}

function roundOrNull(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);

  const nonEmpty = rows.filter((items) => items.some((item) => item.trim() !== ''));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((header) => header.trim());
  return nonEmpty.slice(1).map((items) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = items[index]?.trim() ?? '';
    });
    return obj;
  });
}

export function parseFundamentalRowsFromText(text, options) {
  return parseFundamentalRowsFromTextWithStats(text, options).rows;
}

export function parseFundamentalRowsFromTextWithStats(text, options) {
  const format = options.format ?? (String(options.file ?? '').toLowerCase().endsWith('.json') ? 'json' : 'csv');
  const rawRows = format === 'json'
    ? parseJsonRows(text)
    : parseCsv(text);
  const rows = [];
  let skippedEmptyRows = 0;
  rawRows.forEach((row, index) => {
    if (options.skipEmptyRows && !rowHasAnyMetric(row)) {
      skippedEmptyRows++;
      return;
    }
    rows.push(normalizeFundamentalRow(row, index + 2, options));
  });
  return { rows, rawRows: rawRows.length, skippedEmptyRows };
}

function parseJsonRows(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  throw new Error('JSON fundamental harus berupa array atau objek { data: [...] }');
}

export function normalizeFundamentalRow(row, lineNumber, options) {
  const ticker = normalizeTicker(String(pick(row, ['ticker', 'symbol', 'code', 'kode']) ?? ''));
  if (!ticker) throw new Error(`Baris ${lineNumber}: ticker kosong/tidak valid`);

  const observedDate = String(
    pick(row, ['observed_date', 'observedDate', 'as_of', 'asOf', 'known_date', 'knownDate', 'publication_date', 'publicationDate'])
      ?? options.observedDate
      ?? ''
  ).slice(0, 10);
  assertDateKey(observedDate, `Baris ${lineNumber} observed_date`);
  if (observedDate > options.maxObservedDate) {
    throw new Error(`Baris ${lineNumber}: observed_date ${observedDate} ada di masa depan`);
  }

  const per = parseNullableNumber(pick(row, METRIC_ALIASES[0]), `Baris ${lineNumber} per`);
  const pbv = parseNullableNumber(pick(row, METRIC_ALIASES[1]), `Baris ${lineNumber} pbv`);
  const roeRaw = parseNullableNumber(pick(row, METRIC_ALIASES[2]), `Baris ${lineNumber} roe`);
  const der = parseNullableNumber(pick(row, METRIC_ALIASES[3]), `Baris ${lineNumber} der`);
  const currentRatio = parseNullableNumber(pick(row, METRIC_ALIASES[4]), `Baris ${lineNumber} current_ratio`);
  const revenueGrowthRaw = parseNullableNumber(pick(row, METRIC_ALIASES[5]), `Baris ${lineNumber} revenue_growth`);
  const source = String(pick(row, ['source', 'sumber']) ?? options.source).trim() || options.source;

  const result = {
    ticker,
    observedDate,
    per: roundOrNull(per),
    pbv: roundOrNull(pbv),
    roe: roundOrNull(maybePercent(roeRaw, options.percentInput)),
    der: roundOrNull(der),
    currentRatio: roundOrNull(currentRatio),
    revenueGrowth: roundOrNull(maybePercent(revenueGrowthRaw, options.percentInput)),
    source,
  };

  const hasMetric = ['per', 'pbv', 'roe', 'der', 'currentRatio', 'revenueGrowth']
    .some((key) => result[key] != null);
  if (!hasMetric) {
    throw new Error(`Baris ${lineNumber}: minimal satu metrik fundamental harus terisi`);
  }
  return result;
}

export function rowHasAnyMetric(row) {
  return METRIC_ALIASES.some((aliases) => {
    const value = pick(row, aliases);
    if (value == null) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    return !NULLISH.has(String(value).trim().toLowerCase());
  });
}

export function filterRows(rows, tickers) {
  if (!tickers?.length) return rows;
  const allowed = new Set(tickers);
  return rows.filter((row) => allowed.has(row.ticker));
}

export function buildFundamentalHistoryInsert(rows) {
  if (!rows.length) return null;
  const params = [];
  const tuples = rows.map((row) => {
    const base = params.length;
    params.push(
      row.ticker,
      row.observedDate,
      row.per,
      row.pbv,
      row.roe,
      row.der,
      row.currentRatio,
      row.revenueGrowth,
      row.source
    );
    return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
  });

  return {
    text: `
      INSERT INTO fundamental_history
        (ticker, observed_date, per, pbv, roe, der, current_ratio, revenue_growth, source)
      VALUES ${tuples.join(', ')}
      ON CONFLICT (ticker, observed_date) DO NOTHING
    `,
    params,
  };
}

async function upsertFundamentalRows(pool, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const query = buildFundamentalHistoryInsert(rows.slice(i, i + INSERT_BATCH_SIZE));
    if (!query) continue;
    const result = await pool.query(query.text, query.params);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function loadProductionDeps() {
  installTypeScriptRequireHook();
  const { pool } = require('../shared/database/postgres.client.ts');
  const { ensureSharedSchema } = require('../shared/database/schema.service.ts');
  return { pool, ensureSharedSchema };
}

async function main() {
  const options = parseArgs();
  loadEnvFile();

  const filePath = path.resolve(process.cwd(), options.file);
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFundamentalRowsFromTextWithStats(text, { ...options, file: filePath });
  const rows = filterRows(parsed.rows, options.tickers);

  let insertedRows = 0;
  if (!options.dryRun) {
    const deps = await loadProductionDeps();
    await deps.ensureSharedSchema();
    insertedRows = await upsertFundamentalRows(deps.pool, rows);
    if (typeof deps.pool.end === 'function') await deps.pool.end();
  }

  const byDate = [...new Set(rows.map((row) => row.observedDate))].sort();
  console.log(JSON.stringify({
    status: 'OK',
    mode: options.dryRun ? 'DRY_RUN' : 'INSERT_APPEND_ONLY',
    sourceFile: filePath,
    parsedRows: parsed.rows.length,
    skippedEmptyRows: parsed.skippedEmptyRows,
    filteredRows: rows.length,
    insertedRows,
    skippedExistingRows: options.dryRun ? null : Math.max(0, rows.length - insertedRows),
    tickers: new Set(rows.map((row) => row.ticker)).size,
    minObservedDate: byDate[0] ?? null,
    maxObservedDate: byDate[byDate.length - 1] ?? null,
    percentInput: options.percentInput,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
