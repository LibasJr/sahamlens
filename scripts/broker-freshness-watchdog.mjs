#!/usr/bin/env node
// Pengawas kesegaran data broker SahamLens.
//
// Tiga hal yang diperiksa, semuanya dari data yang BENAR-BENAR ada (tidak ada nilai
// tebakan, tidak ada interpolasi):
//   1. broker_market_daily  - agregat EOD seluruh pasar per broker (sumber resmi BEI).
//      Ini yang harus segar setiap hari bursa; jalur otomatisnya adalah pasangan
//      sahamlens-broker-eod-sync + sahamlens-broker-market-daily-import.
//   2. broker_summary_period - broker summary PER EMITEN (STOCKBIT_MANUAL_JSON). Sumbernya
//      manual, jadi job ini HANYA memperingatkan umurnya - tidak bisa dan tidak boleh
//      "memperbarui" sendiri.
//   3. CSV yang menumpuk di data/broker-summary tetapi belum ada di broker_market_daily
//      (= gejala penjadwal impor mati; pernah terjadi 2026-08-14 s/d 2026-09-23).
//
// Keluar dengan kode 1 bila data pasar broker basi, sehingga unit systemd memicu jalur
// peringatan cron yang sudah ada.
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const MAX_AGE_DAYS = 4; // toleransi: akhir pekan + satu hari libur bursa
const CSV_DIR = path.join(process.cwd(), 'data', 'broker-summary');
const MARKET_SOURCE = 'IDX_OFFICIAL_API';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('[broker-watchdog] DATABASE_URL belum diset (jalankan dengan EnvironmentFile .env.production).');
  process.exit(2);
}

const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
const toDate = (value) => (value ? new Date(`${value}T00:00:00Z`) : null);

async function pendingCsvDates(latestInDb) {
  let names = [];
  try {
    names = await fs.readdir(CSV_DIR);
  } catch {
    return { files: 0, pending: [] };
  }
  const files = names.filter((name) => /^broker_\d{4}-\d{2}-\d{2}\.csv$/.test(name)).sort();
  const pending = [];
  for (const name of files) {
    const date = name.slice('broker_'.length, -'.csv'.length);
    if (!latestInDb || date > latestInDb) pending.push(date);
  }
  return { files: files.length, pending };
}

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000 });
let summary = [];
let exitCode = 0;

try {
  await client.connect();

  const market = await client.query(
    `SELECT MAX(trade_date)::text AS latest,
            COUNT(*) FILTER (WHERE trade_date = (SELECT MAX(trade_date) FROM broker_market_daily WHERE source = $1))::int AS rows_latest,
            COUNT(*)::int AS rows_total
       FROM broker_market_daily WHERE source = $1`,
    [MARKET_SOURCE],
  );
  const latestMarket = market.rows[0]?.latest ?? null;

  const period = await client.query(
    `SELECT MAX(end_date)::text AS latest, COUNT(*)::int AS rows_total FROM broker_summary_period`,
  );
  const latestPeriod = period.rows[0]?.latest ?? null;

  const { files, pending } = await pendingCsvDates(latestMarket);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const marketAge = latestMarket ? daysBetween(toDate(latestMarket), today) : null;
  const periodAge = latestPeriod ? daysBetween(toDate(latestPeriod), today) : null;

  console.log('[broker-watchdog] laporan kesegaran data broker');
  console.log(`  broker_market_daily   : ${latestMarket ?? 'BELUM ADA DATA'} (umur ${marketAge ?? '-'} hari, ${market.rows[0]?.rows_latest ?? 0} baris pada tanggal itu, total ${market.rows[0]?.rows_total ?? 0}) - sumber ${MARKET_SOURCE}`);
  console.log(`  broker_summary_period : ${latestPeriod ?? 'BELUM ADA DATA'} (umur ${periodAge ?? '-'} hari, total ${period.rows[0]?.rows_total ?? 0} baris) - SUMBER MANUAL (STOCKBIT), tidak ada jalur otomatis`);
  console.log(`  CSV di disk           : ${files} berkas; ${pending.length} tanggal belum masuk database${pending.length ? ` (${pending.slice(0, 8).join(', ')}${pending.length > 8 ? ', ...' : ''})` : ''}`);

  if (!latestMarket || (marketAge !== null && marketAge > MAX_AGE_DAYS)) {
    summary.push(`broker_market_daily basi: ${latestMarket ?? 'tanpa data'} (umur ${marketAge ?? '-'} hari > ambang ${MAX_AGE_DAYS} hari)`);
    exitCode = 1;
  }
  if (pending.length > 0) {
    summary.push(`${pending.length} berkas CSV broker belum diimpor ke broker_market_daily - periksa timer sahamlens-broker-market-daily-import`);
    exitCode = 1;
  }
  if (periodAge !== null && periodAge > 21) {
    summary.push(`broker_summary_period (per emiten) berumur ${periodAge} hari dan sumbernya manual - butuh keputusan sumber data, bukan penjadwalan (TIDAK diisi otomatis oleh job ini)`);
  }

  if (exitCode === 0) {
    console.log('[broker-watchdog] VERDICT SEGAR');
  } else {
    console.log('[broker-watchdog] VERDICT PERLU TINDAKAN');
    for (const line of summary) console.log(`  - ${line}`);
  }
} catch (error) {
  console.error('[broker-watchdog] gagal membaca database:', error instanceof Error ? error.message : String(error));
  exitCode = 2;
} finally {
  await client.end().catch(() => undefined);
}

process.exit(exitCode);