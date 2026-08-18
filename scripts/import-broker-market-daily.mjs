#!/usr/bin/env node
// Impor CSV EOD Broker Summary tingkat pasar (hasil scripts/sync-idx-broker-summary.py)
// ke tabel broker_market_daily.
//
// Zero Dummy: skrip ini hanya memindahkan angka yang sudah ada di CSV resmi BEI. Tidak
// ada nilai default, tidak ada interpolasi, tidak ada baris yang "dilengkapi". Baris
// yang tidak lengkap atau tidak masuk akal DITOLAK dan dilaporkan, bukan ditambal.
//
// Sifat tulisan: APPEND-ONLY. ON CONFLICT DO NOTHING - baris yang sudah ada tidak
// pernah ditimpa atau dihapus, sehingga impor ulang aman dijalankan berkali-kali.
//
// Contoh:
//   node scripts/import-broker-market-daily.mjs                    # dry-run semua CSV
//   node scripts/import-broker-market-daily.mjs --date 2026-08-14
//   node --env-file=.env.production scripts/import-broker-market-daily.mjs --confirm
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'IDX_OFFICIAL_API';
const DEFAULT_DIR = path.join(process.cwd(), 'data', 'broker-summary');
const REQUIRED_HEADER = ['date', 'broker_code', 'broker_name', 'volume', 'value', 'frequency'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const confirm = process.argv.includes('--confirm');
const asJson = process.argv.includes('--json');
const dir = arg('--dir') || DEFAULT_DIR;
const singleFile = arg('--file');
const onlyDate = arg('--date');

function csvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { cur += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Angka wajib finite dan tidak negatif - selain itu barisnya ditolak, bukan dinolkan. */
function requireNonNegative(raw, label, rowNumber, rejects) {
  const value = Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(value) || value < 0) {
    rejects.push(`baris ${rowNumber}: ${label} tidak valid (${JSON.stringify(raw)})`);
    return null;
  }
  return value;
}

function parseBrokerMarketCsv(text, sourceFile) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error(`${sourceFile}: file kosong.`);

  const header = csvLine(lines[0]).map((h) => h.toLowerCase().replace(/^﻿/, ''));
  for (const column of REQUIRED_HEADER) {
    if (!header.includes(column)) {
      throw new Error(`${sourceFile}: kolom wajib "${column}" tidak ada. Header: ${header.join(',')}`);
    }
  }
  const index = Object.fromEntries(REQUIRED_HEADER.map((c) => [c, header.indexOf(c)]));

  const rows = [];
  const rejects = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i += 1) {
    const cells = csvLine(lines[i]);
    const rowNumber = i + 1;

    const tradeDate = String(cells[index.date] ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) {
      rejects.push(`baris ${rowNumber}: trade_date tidak valid (${JSON.stringify(cells[index.date])})`);
      continue;
    }

    const brokerCode = String(cells[index.broker_code] ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(brokerCode)) {
      rejects.push(`baris ${rowNumber}: broker_code tidak valid (${JSON.stringify(cells[index.broker_code])})`);
      continue;
    }

    const volume = requireNonNegative(cells[index.volume], 'volume', rowNumber, rejects);
    const value = requireNonNegative(cells[index.value], 'value', rowNumber, rejects);
    const frequency = requireNonNegative(cells[index.frequency], 'frequency', rowNumber, rejects);
    if (volume === null || value === null || frequency === null) continue;

    const key = `${tradeDate}|${brokerCode}`;
    if (seen.has(key)) {
      rejects.push(`baris ${rowNumber}: duplikat ${brokerCode} pada ${tradeDate}`);
      continue;
    }
    seen.add(key);

    rows.push({
      tradeDate,
      brokerCode,
      brokerName: String(cells[index.broker_name] ?? '').trim() || null,
      volume,
      value,
      frequency,
      sourceFile: path.basename(sourceFile),
    });
  }

  return { rows, rejects };
}

async function targetFiles() {
  if (singleFile) return [path.resolve(singleFile)];
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    throw new Error(`Folder CSV tidak ditemukan: ${dir}. Jalankan dulu scripts/sync-idx-broker-summary.py.`);
  }
  return entries
    .filter((name) => /^broker_\d{4}-\d{2}-\d{2}\.csv$/.test(name))
    .filter((name) => !onlyDate || name === `broker_${onlyDate}.csv`)
    .sort()
    .map((name) => path.join(dir, name));
}

const files = await targetFiles();
if (files.length === 0) {
  console.error(onlyDate ? `Tidak ada CSV untuk tanggal ${onlyDate} di ${dir}.` : `Tidak ada CSV broker di ${dir}.`);
  process.exit(2);
}

const allRows = [];
const allRejects = [];
for (const file of files) {
  const text = await fs.readFile(file, 'utf8');
  const { rows, rejects } = parseBrokerMarketCsv(text, file);
  allRows.push(...rows);
  allRejects.push(...rejects.map((r) => `${path.basename(file)} ${r}`));
}

const dates = [...new Set(allRows.map((r) => r.tradeDate))].sort();
const summary = {
  mode: confirm ? 'INSERT_APPEND_ONLY' : 'DRY_RUN',
  files: files.length,
  parsedRows: allRows.length,
  rejectedRows: allRejects.length,
  brokers: new Set(allRows.map((r) => r.brokerCode)).size,
  dates: dates.length,
  minTradeDate: dates[0] ?? null,
  maxTradeDate: dates[dates.length - 1] ?? null,
  totalValue: allRows.reduce((sum, r) => sum + r.value, 0),
  insertedRows: null,
  skippedExistingRows: null,
};

if (!confirm) {
  if (asJson) console.log(JSON.stringify(summary));
  else {
    console.log(`DRY RUN - tidak ada tulisan ke database.`);
    console.log(`File     : ${summary.files}`);
    console.log(`Baris    : ${summary.parsedRows} valid, ${summary.rejectedRows} ditolak`);
    console.log(`Broker   : ${summary.brokers}`);
    console.log(`Tanggal  : ${summary.minTradeDate} s/d ${summary.maxTradeDate} (${summary.dates} hari)`);
    console.log(`Nilai    : Rp ${summary.totalValue.toLocaleString('id-ID')}`);
    for (const reject of allRejects.slice(0, 20)) console.log(`  TOLAK ${reject}`);
    console.log('\nTambahkan --confirm untuk menulis ke broker_market_daily.');
  }
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('DATABASE_URL wajib diset untuk --confirm. Gunakan: node --env-file=.env.production scripts/import-broker-market-daily.mjs --confirm');
  process.exit(2);
}

const pg = (await import('pg')).default;
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000 });
await client.connect();
let inserted = 0;
try {
  await client.query('BEGIN');
  for (const row of allRows) {
    const result = await client.query(
      `INSERT INTO broker_market_daily
         (trade_date, broker_code, broker_name, volume, value, frequency, source, source_file)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (trade_date, broker_code, source) DO NOTHING`,
      [row.tradeDate, row.brokerCode, row.brokerName, row.volume, row.value, row.frequency, SOURCE, row.sourceFile]
    );
    inserted += result.rowCount ?? 0;
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

summary.insertedRows = inserted;
summary.skippedExistingRows = allRows.length - inserted;

if (asJson) console.log(JSON.stringify(summary));
else {
  console.log(`IMPOR SELESAI (append-only).`);
  console.log(`Baris masuk   : ${summary.insertedRows}`);
  console.log(`Sudah ada     : ${summary.skippedExistingRows}`);
  console.log(`Ditolak       : ${summary.rejectedRows}`);
  for (const reject of allRejects.slice(0, 20)) console.log(`  TOLAK ${reject}`);
}
