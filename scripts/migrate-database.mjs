#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const MIGRATIONS_DIR = path.join(process.cwd(), 'database', 'migrations');
const APPLY = process.argv.includes('--confirm');
const LOCK_ID = 6720260816;

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL wajib diset. Gunakan --env-file=.env.production di VPS.');
  return value;
}

async function migrationFiles() {
  return (await fs.readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
}

const client = new Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 15_000 });
try {
  await client.connect();
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const files = await migrationFiles();
  if (!files.length) throw new Error('Tidak ada migration SQL di database/migrations.');
  const { rows } = await client.query('SELECT migration, checksum FROM schema_migrations ORDER BY migration');
  const applied = new Map(rows.map((r) => [String(r.migration), String(r.checksum)]));
  const pending = [];

  for (const file of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const existing = applied.get(file);
    if (existing && existing !== checksum) {
      throw new Error(`Migration ${file} pernah diterapkan tetapi checksum berubah. Buat file migration baru; jangan edit histori.`);
    }
    if (!existing) pending.push({ file, sql, checksum });
  }

  console.log(`Migration tersedia : ${files.length}`);
  console.log(`Sudah diterapkan   : ${applied.size}`);
  console.log(`Pending            : ${pending.length}`);
  for (const m of pending) console.log(`  - ${m.file}`);

  if (!APPLY) {
    console.log('\nDRY RUN migration. Tambahkan --confirm untuk apply.');
  } else {
    for (const migration of pending) {
      console.log(`\nAPPLY ${migration.file}`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (migration, checksum) VALUES ($1, $2)',
          [migration.file, migration.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log(`\nSelesai. ${pending.length} migration diterapkan.`);
  }
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
  await client.end().catch(() => {});
}
