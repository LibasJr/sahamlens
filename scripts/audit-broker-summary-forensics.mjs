#!/usr/bin/env node
/**
 * READ-ONLY forensic audit for the 2026-08-17 Broker Summary synthetic-data incident.
 *
 * Safety contract:
 * - SELECT/BEGIN READ ONLY/ROLLBACK only.
 * - NO INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP.
 * - Does not classify a row as "real" merely from source='IDX_EOD_REPORT', because that
 *   source label was shared by the historical synthetic generator and a manual parser.
 */
import dns from 'node:dns';
import net from 'node:net';
import pg from 'pg';

dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('FAIL: DATABASE_URL tidak tersedia. Script tidak menjalankan query apa pun.');
  process.exit(2);
}

const SUSPECT_DATES = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
const SUSPECT_TICKERS = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'ADRO.JK', 'PTBA.JK',
  'AMMN.JK', 'GOTO.JK', 'ICBP.JK', 'INDF.JK', 'UNTR.JK', 'MDKA.JK', 'PGAS.JK',
];
const SUSPECT_BROKERS = ['AK', 'BK', 'CC', 'CS', 'ZP', 'YP', 'PD', 'XC', 'NI', 'DR', 'OD', 'KZ'];
const EXPECTED_MAX = SUSPECT_DATES.length * SUSPECT_TICKERS.length * SUSPECT_BROKERS.length;

function printSection(title, rows) {
  console.log(`\n=== ${title} ===`);
  if (!rows?.length) console.log('(tidak ada baris)');
  else console.table(rows);
}

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');

  const table = await client.query(`SELECT to_regclass('public.broker_summary_daily')::text AS name`);
  if (!table.rows[0]?.name) {
    console.log('CLEAN/NOT-APPLICABLE: tabel broker_summary_daily tidak ada.');
    await client.query('ROLLBACK');
    process.exit(0);
  }

  const columns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='broker_summary_daily'
    ORDER BY ordinal_position
  `);
  const names = new Set(columns.rows.map((r) => String(r.column_name)));
  const required = ['trade_date', 'ticker', 'broker_code', 'buy_value', 'sell_value', 'source', 'imported_at'];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) {
    console.error(`FAIL-CLOSED: skema broker_summary_daily tidak sesuai; kolom hilang: ${missing.join(', ')}`);
    await client.query('ROLLBACK');
    process.exit(3);
  }

  const sourceDistribution = await client.query(`
    SELECT source,
           COUNT(*)::int AS rows,
           COUNT(DISTINCT ticker)::int AS tickers,
           MIN(trade_date)::text AS first_date,
           MAX(trade_date)::text AS last_date,
           MIN(imported_at)::text AS first_import,
           MAX(imported_at)::text AS last_import
    FROM broker_summary_daily
    GROUP BY source
    ORDER BY rows DESC, source
  `);
  printSection('1. SOURCE DISTRIBUTION', sourceDistribution.rows);

  const suspect = await client.query(`
    SELECT trade_date::text AS trade_date,
           COUNT(*)::int AS rows,
           COUNT(DISTINCT ticker)::int AS tickers,
           COUNT(DISTINCT broker_code)::int AS brokers,
           MIN(imported_at)::text AS first_import,
           MAX(imported_at)::text AS last_import
    FROM broker_summary_daily
    WHERE source = 'IDX_EOD_REPORT'
      AND trade_date = ANY($1::date[])
      AND ticker = ANY($2::text[])
      AND broker_code = ANY($3::text[])
    GROUP BY trade_date
    ORDER BY trade_date
  `, [SUSPECT_DATES, SUSPECT_TICKERS, SUSPECT_BROKERS]);
  printSection('2. INCIDENT FINGERPRINT BY DATE', suspect.rows);

  const suspectTotal = await client.query(`
    SELECT COUNT(*)::int AS rows,
           COUNT(DISTINCT (trade_date, ticker))::int AS ticker_days,
           COUNT(DISTINCT ticker)::int AS tickers,
           COUNT(DISTINCT broker_code)::int AS brokers,
           MIN(imported_at)::text AS first_import,
           MAX(imported_at)::text AS last_import
    FROM broker_summary_daily
    WHERE source = 'IDX_EOD_REPORT'
      AND trade_date = ANY($1::date[])
      AND ticker = ANY($2::text[])
      AND broker_code = ANY($3::text[])
  `, [SUSPECT_DATES, SUSPECT_TICKERS, SUSPECT_BROKERS]);
  printSection('3. INCIDENT FINGERPRINT TOTAL', suspectTotal.rows);

  const clusteredImports = await client.query(`
    SELECT date_trunc('second', imported_at)::text AS import_second,
           source,
           COUNT(*)::int AS rows,
           COUNT(DISTINCT ticker)::int AS tickers
    FROM broker_summary_daily
    GROUP BY 1, 2
    HAVING COUNT(*) > 50
    ORDER BY rows DESC
    LIMIT 30
  `);
  printSection('4. LARGE SAME-SECOND IMPORT BATCHES', clusteredImports.rows);

  const exactTwelve = await client.query(`
    SELECT trade_date::text AS trade_date, ticker,
           COUNT(*)::int AS rows,
           COUNT(DISTINCT broker_code)::int AS brokers,
           MIN(imported_at)::text AS first_import,
           MAX(imported_at)::text AS last_import
    FROM broker_summary_daily
    WHERE source='IDX_EOD_REPORT'
      AND trade_date = ANY($1::date[])
      AND ticker = ANY($2::text[])
      AND broker_code = ANY($3::text[])
    GROUP BY trade_date, ticker
    HAVING COUNT(*) = 12 AND COUNT(DISTINCT broker_code) = 12
    ORDER BY trade_date, ticker
  `, [SUSPECT_DATES, SUSPECT_TICKERS, SUSPECT_BROKERS]);
  printSection('5. EXACT 12-BROKER TICKER-DAYS', exactTwelve.rows);

  const exactBillions = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE MOD(buy_value::numeric, 1000000000::numeric) = 0)::int AS buy_exact_billions,
           COUNT(*) FILTER (WHERE MOD(sell_value::numeric, 1000000000::numeric) = 0)::int AS sell_exact_billions
    FROM broker_summary_daily
    WHERE source='IDX_EOD_REPORT'
      AND trade_date = ANY($1::date[])
      AND ticker = ANY($2::text[])
      AND broker_code = ANY($3::text[])
  `, [SUSPECT_DATES, SUSPECT_TICKERS, SUSPECT_BROKERS]);
  printSection('6. ROUND-BILLION STATISTICAL SIGNAL', exactBillions.rows);

  const rowCount = Number(suspectTotal.rows[0]?.rows ?? 0);
  const exactGroups = exactTwelve.rows.length;
  console.log('\n=== VERDICT ===');
  if (rowCount === 0) {
    console.log('NO_MATCH: tidak ada row yang cocok dengan fingerprint insiden pada source IDX_EOD_REPORT.');
    console.log('Catatan: ini tidak membuktikan seluruh tabel benar; hanya membuktikan fingerprint generator yang diketahui tidak ditemukan.');
  } else if (rowCount === EXPECTED_MAX && exactGroups === SUSPECT_DATES.length * SUSPECT_TICKERS.length) {
    console.log(`CONTAMINATION_STRONGLY_CONFIRMED: ditemukan tepat ${rowCount}/${EXPECTED_MAX} row dan ${exactGroups} ticker-day masing-masing 12 broker.`);
    console.log('JANGAN DELETE/TRUNCATE dulu. Backup + karantina berbasis fingerprint/batch setelah review.');
    process.exitCode = 1;
  } else {
    console.log(`SUSPECT_MATCH: ditemukan ${rowCount}/${EXPECTED_MAX} row yang cocok dan ${exactGroups} grup tepat-12 broker.`);
    console.log('Perlu review imported_at + pola statistik sebelum mengklasifikasikan row sebagai sintetis atau sah.');
    process.exitCode = 1;
  }

  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('FAIL:', error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
} finally {
  await client.end().catch(() => {});
}
