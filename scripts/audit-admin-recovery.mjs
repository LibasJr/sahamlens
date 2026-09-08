#!/usr/bin/env node
import dns from 'node:dns';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

const { Client } = pg;
const failures = [];
const warnings = [];
const passes = [];
const ok = (message) => passes.push(message);
const warn = (message) => warnings.push(message);
const fail = (message) => failures.push(message);

const manifestPath = process.env.ADMIN_RECOVERY_MANIFEST_PATH?.trim()
  || '/etc/sahamlens/admin-recovery/manifest.json';

function isMeaningfulReference(value) {
  return typeof value === 'string'
    && value.trim().length >= 8
    && !/(replace|contoh|example|placeholder|todo|isi di sini)/i.test(value);
}

function manifestContainsSecret(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  return /(password|secret|token|database_url|postgres(?:ql)?:\/\/|jwt|api[_-]?key)\s*[":=]/.test(serialized);
}

async function auditManifest() {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    const stat = await fs.stat(manifestPath);
    if ((stat.mode & 0o077) === 0) ok(`Manifest recovery permission aman (${manifestPath})`);
    else fail(`Manifest recovery terlalu terbuka (${manifestPath}); wajib permission 0600 atau lebih ketat`);

    if (manifestContainsSecret(manifest)) fail('Manifest recovery tampak memuat field/nilai rahasia; hapus dan simpan hanya referensi non-secret');
    else ok('Manifest recovery tidak memuat field rahasia terlarang');

    const custodians = Array.isArray(manifest.custodians) ? manifest.custodians : [];
    const validCustodians = custodians.filter((item) => isMeaningfulReference(item?.label)
      && isMeaningfulReference(item?.contactReference)
      && isMeaningfulReference(item?.envelopeLocationReference));
    if (validCustodians.length >= 2) ok(`Dual custody tercatat (${validCustodians.length} custodian)`);
    else fail('Dual custody belum lengkap: butuh minimal 2 custodian dengan contact dan lokasi envelope non-secret');

    if (isMeaningfulReference(manifest.escalationOwnerReference)) ok('Escalation owner tercatat');
    else fail('Escalation owner belum tercatat di manifest recovery');

    const due = manifest.nextReviewDueAt ? new Date(manifest.nextReviewDueAt) : null;
    if (!due || Number.isNaN(due.getTime())) warn('Jadwal review recovery belum dicatat');
    else if (due.getTime() < Date.now()) fail(`Review recovery sudah jatuh tempo (${manifest.nextReviewDueAt})`);
    else ok(`Review recovery berikutnya ${manifest.nextReviewDueAt}`);
  } catch (error) {
    if (error?.code === 'ENOENT') warn(`Manifest recovery belum dipasang di ${manifestPath}; gunakan deploy/admin-recovery/manifest.example.json sebagai template non-secret`);
    else fail(`Manifest recovery tidak dapat diaudit: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function auditRuntime() {
  if (process.env.ADMIN_BREAK_GLASS_ENABLED === 'true') fail('ADMIN_BREAK_GLASS_ENABLED=true; break-glass permanen dilarang');
  else ok('ADMIN_BREAK_GLASS_ENABLED nonaktif');

  if (process.env.ADMIN_JWT_SECRET?.trim()) ok('ADMIN_JWT_SECRET khusus tersedia');
  else fail('ADMIN_JWT_SECRET tidak tersedia');

  if (!process.env.DATABASE_URL?.trim()) {
    fail('DATABASE_URL tidak tersedia untuk audit admin recovery');
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT count(*)::int AS rows,
             min(session_version)::int AS min_version,
             max(session_version)::int AS max_version,
             max(updated_at)::text AS updated_at
      FROM admin_secret
    `);
    const state = rows[0] ?? {};
    if (Number(state.rows) === 1 && Number(state.min_version) >= 1 && state.min_version === state.max_version) {
      ok(`admin_secret tunggal dan session version valid (${state.min_version}; diperbarui ${state.updated_at ?? 'tidak diketahui'})`);
    } else {
      fail(`admin_secret tidak memenuhi invariant satu credential/session version: rows=${state.rows ?? 0}, versions=${state.min_version ?? 'null'}-${state.max_version ?? 'null'}`);
    }

    const events = await client.query(`
      SELECT count(*)::int AS count, max(created_at)::text AS newest
      FROM admin_audit_events
    `);
    if (Number(events.rows[0]?.count ?? 0) > 0) ok(`Audit admin tersedia (${events.rows[0].count} event; terbaru ${events.rows[0].newest ?? 'tidak diketahui'})`);
    else warn('Belum ada admin_audit_events; drill/reset belum dapat diaudit dari database');
  } catch (error) {
    fail(`Audit database admin gagal: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await client.end().catch(() => {});
  }
}

await auditRuntime();
await auditManifest();
console.log('\n=== SAHAMLENS ADMIN RECOVERY AUDIT ===');
for (const message of passes) console.log(`PASS  ${message}`);
for (const message of warnings) console.log(`WARN  ${message}`);
for (const message of failures) console.log(`FAIL  ${message}`);
console.log(`\nSummary: ${passes.length} pass, ${warnings.length} warn, ${failures.length} fail`);
if (failures.length) process.exitCode = 1;
