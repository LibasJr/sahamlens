#!/usr/bin/env node
/**
 * SYNC OTOMATIS OWNERSHIP FLOW KSEI.
 *
 * Dipakai timer VPS 1x sehari. Script ini TIDAK melakukan ingestion live per-ticker.
 * Ia hanya mengecek arsip resmi Holding Composition KSEI dan, bila ada snapshot
 * yang tanggalnya lebih baru daripada snapshot KSEI terakhir di PostgreSQL,
 * memanggil backfill otomatis yang sudah memiliki guard parser + dry-run + idempotency.
 *
 * Prinsip fail-closed:
 * - database kosong -> STOP, operator harus bootstrap manual lebih dulu;
 * - halaman KSEI tidak bisa dibaca setelah retry -> exit gagal;
 * - parser/reject guard gagal -> exit gagal;
 * - DB tidak maju sampai snapshot terbaru -> exit gagal;
 * - Redis gagal dihapus -> ingestion TETAP sukses; cache hanya akselerator.
 */

import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverArchiveEntries } from './backfill-ownership-flow-ksei-auto.mjs';

const execFileAsync = promisify(execFile);

const SOURCE_ID = 'KSEI_HOLDING_COMPOSITION';
const ARCHIVE_PAGE = 'https://web.ksei.co.id/archive_download/holding_composition';
const MAX_FETCH_ATTEMPTS = 5;
const FETCH_TIMEOUT_MS = 30_000;
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const LOCK_A = 8147;
const LOCK_B = 260816;

function mergeNodeOptions(existing = '') {
  const required = ['--dns-result-order=ipv4first', '--no-network-family-autoselection'];
  const tokens = String(existing).trim().split(/\s+/).filter(Boolean);
  for (const option of required) {
    if (!tokens.includes(option)) tokens.push(option);
  }
  return tokens.join(' ');
}

function normalizeDatabaseUrl(raw) {
  return String(raw).replace(
    /([?&])sslmode=(?:prefer|require|verify-ca)(?=(&|$))/i,
    '$1sslmode=verify-full'
  );
}

function resolveDatabaseSsl(databaseUrl) {
  const databaseHost = new URL(databaseUrl).hostname;
  const isLoopbackDatabase =
    databaseHost === '127.0.0.1' ||
    databaseHost === 'localhost' ||
    databaseHost === '::1';

  return isLoopbackDatabase ? false : { rejectUnauthorized: true };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchArchiveHtml() {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(ARCHIVE_PAGE, {
        headers: {
          'user-agent': 'SahamLens Ownership Flow Archive Sync/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.ok) return response.text();

      const error = new Error(`KSEI archive page HTTP ${response.status}`);
      if (!RETRYABLE_HTTP.has(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_FETCH_ATTEMPTS) break;
    }

    const waitMs = Math.min(2_000 * 2 ** (attempt - 1), 16_000);
    console.warn(`KSEI belum bisa dibaca (attempt ${attempt}/${MAX_FETCH_ATTEMPTS}); retry ${waitMs}ms...`);
    await sleep(waitMs);
  }

  throw lastError instanceof Error ? lastError : new Error('gagal membaca halaman arsip KSEI');
}

async function getLatestDbDate(client) {
  const { rows: tableRows } = await client.query(
    `SELECT to_regclass('public.ownership_flow_history')::text AS table_name`
  );
  if (!tableRows[0]?.table_name) return null;

  const { rows } = await client.query(
    `SELECT MAX(observed_date)::text AS latest
       FROM ownership_flow_history
      WHERE source = $1`,
    [SOURCE_ID]
  );
  return rows[0]?.latest == null ? null : String(rows[0].latest);
}

async function runAutoBackfill(from, to) {
  const cwd = process.cwd();
  const script = path.resolve(cwd, 'scripts/backfill-ownership-flow-ksei-auto.mjs');
  const env = {
    ...process.env,
    NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS),
  };

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [script, '--from', from, '--to', to, '--confirm'],
    {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  let inserted = 0;
  let existing = 0;
  const re = /Baris BARU:\s*(\d+)\.\s*Sudah ada sebelumnya:\s*(\d+)/gi;
  for (const match of stdout.matchAll(re)) {
    inserted += Number(match[1]);
    existing += Number(match[2]);
  }

  return { inserted, existing };
}

async function invalidateOwnershipCache() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('REDIS_URL tidak ada; skip invalidasi cache Ownership Flow.');
    return { deleted: 0, skipped: true };
  }

  let client = null;
  try {
    const { createClient } = await import('redis');
    client = createClient({ url: redisUrl });
    client.on('error', () => undefined);
    await client.connect();

    let cursor = '0';
    let deleted = 0;
    do {
      const reply = await client.sendCommand([
        'SCAN', cursor,
        'MATCH', 'sahamlens:cache:ownership-flow:*',
        'COUNT', '500',
      ]);
      const nextCursor = Array.isArray(reply) ? String(reply[0]) : '0';
      const keys = Array.isArray(reply) && Array.isArray(reply[1])
        ? reply[1].map((value) => String(value))
        : [];

      if (keys.length) {
        const result = await client.sendCommand(['DEL', ...keys]);
        deleted += Number(result ?? 0);
      }
      cursor = nextCursor;
    } while (cursor !== '0');

    return { deleted, skipped: false };
  } catch (error) {
    console.warn(`Invalidasi Redis gagal (ingestion tetap sukses): ${error instanceof Error ? error.message : String(error)}`);
    return { deleted: 0, skipped: true };
  } finally {
    if (client) await client.quit().catch(() => undefined);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tidak ada di environment proses');
  }

  const { Client } = await import('pg');
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  const client = new Client({
    connectionString: databaseUrl,
    // PostgreSQL VPS terikat ke loopback dan tidak menyediakan TLS. Database
    // remote tetap memakai validasi sertifikat dan hostname secara ketat.
    ssl: resolveDatabaseSsl(databaseUrl),
    connectionTimeoutMillis: 15_000,
  });

  await client.connect();
  let lockAcquired = false;
  try {
    const { rows: lockRows } = await client.query(
      'SELECT pg_try_advisory_lock($1::int, $2::int) AS acquired',
      [LOCK_A, LOCK_B]
    );
    lockAcquired = Boolean(lockRows[0]?.acquired);
    if (!lockAcquired) {
      const result = {
        status: 'SKIPPED',
        reason: 'sync_already_running',
        source: SOURCE_ID,
      };
      console.log('Sync lain masih berjalan; invocation ini dilewati.');
      console.log(`SAHAMLENS_SYNC_RESULT=${JSON.stringify(result)}`);
      return;
    }

    const latestBefore = await getLatestDbDate(client);
    if (!latestBefore) {
      throw new Error(
        'snapshot KSEI belum ada di database. Bootstrap manual dulu dengan backfill; cron tidak boleh mengisi seluruh histori dari database kosong.'
      );
    }

    console.log(`Snapshot DB terakhir : ${latestBefore}`);
    const html = await fetchArchiveHtml();
    const entries = discoverArchiveEntries(html);
    if (!entries.length) throw new Error('tidak menemukan arsip BalanceposEfekYYYYMMDD.zip di halaman KSEI');

    const latestArchive = entries[entries.length - 1];
    const pending = entries.filter((entry) => entry.observedDate > latestBefore);

    console.log(`Snapshot KSEI terbaru: ${latestArchive.observedDate}`);
    console.log(`Periode baru         : ${pending.length}`);

    if (!pending.length) {
      const result = {
        status: 'UP_TO_DATE',
        source: SOURCE_ID,
        latestDbDate: latestBefore,
        latestArchiveDate: latestArchive.observedDate,
        newPeriods: 0,
        inserted: 0,
        cacheDeleted: 0,
      };
      console.log('Database sudah sama/lebih baru dari arsip KSEI yang tersedia.');
      console.log(`SAHAMLENS_SYNC_RESULT=${JSON.stringify(result)}`);
      return;
    }

    const from = pending[0].observedDate;
    const to = pending[pending.length - 1].observedDate;
    console.log(`Mulai ingestion       : ${from} s/d ${to}`);

    const write = await runAutoBackfill(from, to);
    const latestAfter = await getLatestDbDate(client);
    if (latestAfter !== to) {
      throw new Error(`DB tidak maju ke snapshot terbaru. expected=${to}, actual=${latestAfter ?? 'null'}`);
    }

    const cache = await invalidateOwnershipCache();
    const result = {
      status: 'UPDATED',
      source: SOURCE_ID,
      latestDbDateBefore: latestBefore,
      latestDbDateAfter: latestAfter,
      latestArchiveDate: latestArchive.observedDate,
      newPeriods: pending.length,
      inserted: write.inserted,
      alreadyExisting: write.existing,
      cacheDeleted: cache.deleted,
      cacheInvalidationSkipped: cache.skipped,
    };

    console.log(`Sync selesai: ${pending.length} periode, ${write.inserted} baris baru.`);
    console.log(`SAHAMLENS_SYNC_RESULT=${JSON.stringify(result)}`);
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1::int, $2::int)', [LOCK_A, LOCK_B]).catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`OWNERSHIP FLOW KSEI SYNC GAGAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
