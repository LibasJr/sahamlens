#!/usr/bin/env node
// Pengawas kesegaran data broker SahamLens.
//
// Tiga hal yang diperiksa, semuanya dari data yang BENAR-BENAR ada (tidak ada nilai tebakan,
// tidak ada interpolasi):
//   1. broker_market_daily  - agregat EOD seluruh pasar per broker (sumber resmi BEI).
//      Ini yang harus segar setiap hari bursa; jalur otomatisnya adalah idx-flow-sync.
//   2. broker_summary_period - broker summary PER EMITEN (STOCKBIT_MANUAL_JSON). Sumbernya
//      manual, jadi job ini HANYA memperingatkan umurnya - tidak bisa dan tidak boleh
//      "memperbarui" sendiri.
//   3. CSV yang menumpuk di data/broker-summary tetapi belum ada di broker_market_daily
//      (= gejala penjadwal impor mati).
//
// Kalender acuan yang dipakai adalah hari bursa (Sen-Jum) waktu Asia/Jakarta, bukan kalender
// UTC: antara 17:00-24:00 WIB tanggal UTC masih kemarin, sehingga acuan UTC membuat data
// tampak sehari lebih segar daripada kenyataannya. Satu hari bursa yang belum masuk
// dilaporkan sebagai CATATAN (bisa libur bursa); dua hari atau lebih = PERLU TINDAKAN.
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

const MAX_MISSING_TRADING_DAYS = 2; // 2 hari bursa berturut-turut tanpa data = alarm
const CSV_DIR = path.join(process.cwd(), 'data', 'broker-summary');
const MARKET_SOURCE = 'IDX_OFFICIAL_API';
const PERIOD_STALE_DAYS = 21; // broker summary per emiten bersumber manual

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('[broker-watchdog] DATABASE_URL belum diset (jalankan dengan EnvironmentFile .env.production).');
  process.exit(2);
}

const toDate = (value) => (value ? new Date(`${value}T00:00:00Z`) : null);
const isoDate = (date) => date.toISOString().slice(0, 10);
const isWeekend = (date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);

/** Tanggal "hari ini" menurut kalender pasar: zona waktu Asia/Jakarta. */
function todayInJakarta() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${parts}T00:00:00Z`);
}

/** Hari bursa terakhir yang seharusnya sudah punya data (hari kerja <= hari ini). */
function lastExpectedTradingDay(today) {
  let cursor = new Date(today.getTime());
  for (let guard = 0; guard < 10 && isWeekend(cursor); guard += 1) cursor = addDays(cursor, -1);
  return cursor;
}

/** Jumlah hari bursa (Sen-Jum) setelah `from` sampai `to` inklusif. */
function missingTradingDays(from, to) {
  if (!from) return null;
  let count = 0;
  for (let cursor = addDays(from, 1); cursor.getTime() <= to.getTime(); cursor = addDays(cursor, 1)) {
    if (!isWeekend(cursor)) count += 1;
  }
  return count;
}

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
const notes = [];
const actions = [];
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

  const today = todayInJakarta();
  const expected = lastExpectedTradingDay(today);
  const missing = missingTradingDays(toDate(latestMarket), expected);
  const periodAge = latestPeriod ? Math.round((today.getTime() - toDate(latestPeriod).getTime()) / 86_400_000) : null;

  console.log('[broker-watchdog] laporan kesegaran data broker');
  console.log(`  hari bursa acuan (WIB): ${isoDate(expected)} (hari ini ${isoDate(today)})`);
  console.log(`  broker_market_daily   : ${latestMarket ?? 'BELUM ADA DATA'} (${market.rows[0]?.rows_latest ?? 0} baris pada tanggal itu, total ${market.rows[0]?.rows_total ?? 0}) - sumber ${MARKET_SOURCE}`);
  console.log(`  hari bursa belum masuk: ${missing === null ? 'tidak dapat dihitung (belum ada data)' : missing}`);
  console.log(`  broker_summary_period : ${latestPeriod ?? 'BELUM ADA DATA'} (umur ${periodAge ?? '-'} hari, total ${period.rows[0]?.rows_total ?? 0} baris) - SUMBER MANUAL (STOCKBIT), tidak ada jalur otomatis`);
  console.log(`  CSV di disk           : ${files} berkas; ${pending.length} tanggal belum masuk database${pending.length ? ` (${pending.slice(0, 8).join(', ')}${pending.length > 8 ? ', ...' : ''})` : ''}`);

  if (!latestMarket) {
    actions.push('broker_market_daily belum punya satu baris pun - jalankan idx-flow-sync dan periksa log-nya');
    exitCode = 1;
  } else if (missing !== null && missing >= MAX_MISSING_TRADING_DAYS) {
    actions.push(`broker_market_daily tertinggal ${missing} hari bursa (data terakhir ${latestMarket}, acuan ${isoDate(expected)}) - periksa idx-flow-sync dan log HTTP IDX`);
    exitCode = 1;
  } else if (missing === 1) {
    notes.push(`1 hari bursa (${isoDate(expected)}) belum masuk - wajar bila libur bursa; bila besok tetap tidak masuk, alarm akan berbunyi`);
  }

  if (pending.length > 0) {
    actions.push(`${pending.length} berkas CSV broker sudah ada di disk tetapi belum masuk broker_market_daily - periksa langkah impor idx-flow-sync`);
    exitCode = 1;
  }

  if (periodAge !== null && periodAge > PERIOD_STALE_DAYS) {
    notes.push(`broker_summary_period (per emiten) berumur ${periodAge} hari dan sumbernya manual - butuh keputusan sumber data, TIDAK diisi otomatis oleh job ini`);
  }

  for (const note of notes) console.log(`  CATATAN: ${note}`);
  if (exitCode === 0) {
    console.log('[broker-watchdog] VERDICT SEGAR');
  } else {
    console.log('[broker-watchdog] VERDICT PERLU TINDAKAN');
    for (const line of actions) console.log(`  - ${line}`);
  }
} catch (error) {
  console.error('[broker-watchdog] gagal membaca database:', error instanceof Error ? error.message : String(error));
  exitCode = 2;
} finally {
  await client.end().catch(() => undefined);
}

process.exit(exitCode);