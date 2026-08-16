#!/usr/bin/env node
/**
 * AUTO-BACKFILL OWNERSHIP FLOW KSEI (Holding Composition).
 *
 * Tujuan:
 * - menemukan arsip resmi KSEI dari halaman Holding Composition;
 * - mengunduh ZIP BalanceposEfekYYYYMMDD.zip;
 * - mengekstrak BalanceposYYYYMMDD.txt;
 * - SELALU menjalankan dry-run parser lebih dulu;
 * - hanya mengizinkan --confirm bila dry-run: reject=0, tanggal cocok,
 *   dan jumlah EQUITY masuk akal;
 * - memakai backfill-ownership-flow.mjs sebagai satu-satunya jalur parser/DB,
 *   sehingga append-only + ON CONFLICT DO NOTHING tetap berlaku.
 *
 * Contoh aman (belum menulis DB):
 *   node scripts/backfill-ownership-flow-ksei-auto.mjs \
 *     --from 2026-01-01 --to 2026-05-31
 *
 * Setelah preview semua periode lolos:
 *   NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
 *   node --env-file=.env.production \
 *     scripts/backfill-ownership-flow-ksei-auto.mjs \
 *     --from 2026-01-01 --to 2026-05-31 --confirm
 *
 * Opsional:
 *   --list              hanya tampilkan arsip yang ditemukan
 *   --keep-files        jangan hapus ZIP/TXT sementara
 *   --min-equity <n>    guard minimum EQUITY per snapshot (default 100)
 *
 * Fail-closed:
 * - sumber selain web.ksei.co.id ditolak;
 * - bila halaman arsip gagal diambil / format link berubah -> berhenti;
 * - bila ZIP/TXT tidak sesuai pola -> berhenti;
 * - bila dry-run parser menolak satu baris pun -> periode itu TIDAK ditulis;
 * - bila tanggal di dalam file tidak sama dengan tanggal archive -> TIDAK ditulis.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ARCHIVE_PAGE = 'https://web.ksei.co.id/archive_download/holding_composition';
const DOWNLOAD_ORIGIN = 'https://web.ksei.co.id';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ARCHIVE_NAME_RE = /^BalanceposEfek(\d{8})\.zip$/i;
const TXT_NAME_RE = /^Balancepos(\d{8})\.txt$/i;
const DEFAULT_MIN_EQUITY = 100;
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 5;

/**
 * @typedef {Object} ArchiveEntry
 * @property {string} observedDate Tanggal snapshot ISO YYYY-MM-DD.
 * @property {string} ymd Tanggal snapshot YYYYMMDD.
 * @property {string} fileName Nama ZIP resmi KSEI.
 * @property {string} url URL download resmi KSEI.
 */

/**
 * @typedef {Object} ArchiveFilter
 * @property {string | null | undefined} [from] Batas bawah inklusif YYYY-MM-DD.
 * @property {string | null | undefined} [to] Batas atas inklusif YYYY-MM-DD.
 */

/**
 * @typedef {Object} BackfillSummary
 * @property {number | null} validEquity
 * @property {number | null} rejected
 * @property {string | null} snapshotDate
 * @property {number | null} inserted
 * @property {number | null} alreadyExisting
 */

function parseArgs(argv) {
  const args = {
    from: null,
    to: null,
    confirm: false,
    list: false,
    keepFiles: false,
    minEquity: DEFAULT_MIN_EQUITY,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from') args.from = argv[++i] ?? null;
    else if (arg === '--to') args.to = argv[++i] ?? null;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--keep-files') args.keepFiles = true;
    else if (arg === '--min-equity') {
      const value = Number(argv[++i]);
      args.minEquity = Number.isInteger(value) && value > 0 ? value : NaN;
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }

  return args;
}

function isRealDate(key) {
  if (!DATE_RE.test(String(key ?? ''))) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function ymdToIso(ymd) {
  if (!/^\d{8}$/.test(ymd)) return null;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  return isRealDate(iso) ? iso : null;
}

function isoToYmd(iso) {
  return String(iso).replaceAll('-', '');
}

/**
 * Ambil link BalanceposEfekYYYYMMDD.zip dari HTML resmi.
 * Regex sengaja hanya menerima host web.ksei.co.id + nama file ketat.
 */
/**
 * @param {unknown} html
 * @returns {ArchiveEntry[]}
 */
export function discoverArchiveEntries(html) {
  const text = String(html ?? '');
  const ymds = new Set();

  // Cukup cari nama file ketat. URL final selalu kita bangun ulang dari origin
  // resmi; href HTML tidak dipercaya begitu saja.
  const re = /BalanceposEfek(\d{8})\.zip/gi;
  for (const match of text.matchAll(re)) {
    const iso = ymdToIso(match[1]);
    if (iso) ymds.add(match[1]);
  }

  return [...ymds]
    .map((ymd) => ({
      observedDate: ymdToIso(ymd),
      ymd,
      fileName: `BalanceposEfek${ymd}.zip`,
      url: `${DOWNLOAD_ORIGIN}/Download/BalanceposEfek${ymd}.zip`,
    }))
    .filter((entry) => entry.observedDate)
    .sort((a, b) => a.observedDate.localeCompare(b.observedDate));
}

/**
 * @param {ArchiveEntry[]} entries
 * @param {ArchiveFilter} [range]
 * @returns {ArchiveEntry[]}
 */
export function filterArchiveEntries(entries, { from = null, to = null } = {}) {
  return entries.filter((entry) => {
    if (from && entry.observedDate < from) return false;
    if (to && entry.observedDate > to) return false;
    return true;
  });
}

/** Parse ringkasan stdout dari backfill-ownership-flow.mjs. */
/**
 * @param {unknown} output
 * @returns {BackfillSummary}
 */
export function parseBackfillSummary(output) {
  const text = String(output ?? '');
  const valid = text.match(/Baris EQUITY valid\s*:\s*(\d+)/i);
  const rejected = text.match(/Baris ditolak\s*:\s*(\d+)/i);
  const snapshot = text.match(/Tanggal snapshot\s*:\s*([^\r\n]+)/i);
  const inserted = text.match(/Baris BARU:\s*(\d+)\.\s*Sudah ada sebelumnya:\s*(\d+)/i);

  return {
    validEquity: valid ? Number(valid[1]) : null,
    rejected: rejected ? Number(rejected[1]) : null,
    snapshotDate: snapshot ? snapshot[1].trim() : null,
    inserted: inserted ? Number(inserted[1]) : null,
    alreadyExisting: inserted ? Number(inserted[2]) : null,
  };
}

function mergeNodeOptions(existing = '') {
  const required = [
    '--dns-result-order=ipv4first',
    '--no-network-family-autoselection',
  ];
  const tokens = String(existing).trim().split(/\s+/).filter(Boolean);
  for (const option of required) {
    if (!tokens.includes(option)) tokens.push(option);
  }
  return tokens.join(' ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch dengan retry terbatas untuk gangguan temporer KSEI.
 * 4xx permanen selain 408/425/429 tetap fail-fast.
 */
async function fetchWithRetry(url, init, label, timeoutMs) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return response;

      const error = new Error(`${label} HTTP ${response.status}`);
      if (!RETRYABLE_HTTP.has(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_FETCH_ATTEMPTS) throw lastError;
    }

    const delayMs = Math.min(2_000 * (2 ** (attempt - 1)), 12_000);
    console.warn(`  retry ${label}: percobaan ${attempt}/${MAX_FETCH_ATTEMPTS} gagal; tunggu ${delayMs / 1000}s...`);
    await sleep(delayMs);
  }

  throw lastError ?? new Error(`${label} gagal tanpa detail`);
}

async function fetchText(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'web.ksei.co.id') {
    throw new Error(`Host sumber ditolak: ${url}`);
  }

  const response = await fetchWithRetry(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'SahamLens-OwnershipFlow/1.0 (+operator backfill KSEI)',
      accept: 'text/html,application/xhtml+xml',
    },
  }, 'KSEI archive page', 25_000);

  return response.text();
}

async function downloadZip(entry, destination) {
  const parsed = new URL(entry.url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'web.ksei.co.id' ||
    !ARCHIVE_NAME_RE.test(path.basename(parsed.pathname))
  ) {
    throw new Error(`URL ZIP tidak lolos allowlist: ${entry.url}`);
  }

  const response = await fetchWithRetry(entry.url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'SahamLens-OwnershipFlow/1.0 (+operator backfill KSEI)',
      accept: 'application/zip,application/octet-stream,*/*',
    },
  }, `download ${entry.fileName}`, 45_000);

  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== 'web.ksei.co.id') {
    throw new Error(`redirect ZIP keluar domain KSEI: ${response.url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  // ZIP local-file header PK\x03\x04, empty PK\x05\x06, atau spanned PK\x07\x08.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error(`${entry.fileName}: respons bukan ZIP (signature PK tidak ada)`);
  }
  await fs.writeFile(destination, bytes, { mode: 0o600 });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function extractTxt(zipPath, extractDir, expectedYmd) {
  await fs.mkdir(extractDir, { recursive: true });
  const unzip = await runCommand('unzip', ['-o', '-q', zipPath, '-d', extractDir]);
  if (unzip.code !== 0) {
    throw new Error(`unzip gagal (${unzip.code}): ${unzip.stderr.trim() || unzip.stdout.trim()}`);
  }

  const names = await fs.readdir(extractDir);
  const candidates = names.filter((name) => TXT_NAME_RE.test(name));
  const expected = `Balancepos${expectedYmd}.txt`;
  const exact = candidates.find((name) => name.toLowerCase() === expected.toLowerCase());
  if (!exact) {
    throw new Error(`TXT ${expected} tidak ditemukan dalam ZIP. Isi cocok: ${candidates.join(', ') || '(tidak ada)'}`);
  }

  const txtPath = path.join(extractDir, exact);
  const stat = await fs.stat(txtPath);
  if (!stat.isFile() || stat.size < 100) {
    throw new Error(`${exact}: file terlalu kecil/tidak sah (${stat.size} bytes)`);
  }
  return txtPath;
}

function validateDryRun(summary, entry, minEquity) {
  if (!Number.isInteger(summary.validEquity)) {
    throw new Error('output dry-run tidak memuat "Baris EQUITY valid"');
  }
  if (!Number.isInteger(summary.rejected)) {
    throw new Error('output dry-run tidak memuat "Baris ditolak"');
  }
  if (summary.validEquity < minEquity) {
    throw new Error(`EQUITY valid hanya ${summary.validEquity}, di bawah guard ${minEquity}`);
  }
  if (summary.rejected !== 0) {
    throw new Error(`dry-run menolak ${summary.rejected} baris; confirm diblokir`);
  }
  if (summary.snapshotDate !== entry.observedDate) {
    throw new Error(`tanggal file ${summary.snapshotDate ?? '(tidak ada)'} != tanggal arsip ${entry.observedDate}`);
  }
}

async function runBackfill(backfillScript, txtPath, confirm, cwd) {
  const env = {
    ...process.env,
    NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS),
  };
  const args = [backfillScript, '--file', txtPath];
  if (confirm) args.push('--confirm');
  return runCommand(process.execPath, args, { cwd, env });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.from && !isRealDate(args.from)) throw new Error(`--from tidak sah: ${args.from}`);
  if (args.to && !isRealDate(args.to)) throw new Error(`--to tidak sah: ${args.to}`);
  if (args.from && args.to && args.from > args.to) throw new Error('--from lebih besar dari --to');
  if (!Number.isInteger(args.minEquity) || args.minEquity <= 0) throw new Error('--min-equity harus integer > 0');
  if (args.confirm && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tidak ada. Untuk --confirm jalankan dengan --env-file=.env.production.');
  }

  const cwd = process.cwd();
  const backfillScript = path.resolve(cwd, 'scripts/backfill-ownership-flow.mjs');
  try {
    await fs.access(backfillScript);
  } catch {
    throw new Error(`script parser tidak ditemukan: ${backfillScript}`);
  }

  console.log('\nOwnership Flow KSEI - Auto Backfill');
  console.log(`  Archive page : ${ARCHIVE_PAGE}`);
  console.log(`  Mode         : ${args.confirm ? 'CONFIRM (DB)' : args.list ? 'LIST ONLY' : 'DRY RUN'}`);
  console.log(`  Range        : ${args.from ?? '(awal tersedia)'} s/d ${args.to ?? '(terbaru tersedia)'}`);
  console.log(`  Guard reject : HARUS 0`);
  console.log(`  Guard EQUITY : minimum ${args.minEquity}`);

  const html = await fetchText(ARCHIVE_PAGE);
  const discovered = discoverArchiveEntries(html);
  if (!discovered.length) {
    throw new Error('tidak menemukan link BalanceposEfekYYYYMMDD.zip pada halaman resmi KSEI');
  }

  const selected = filterArchiveEntries(discovered, args);
  if (!selected.length) {
    throw new Error('tidak ada arsip KSEI dalam range yang diminta');
  }

  console.log(`\nArsip ditemukan: ${discovered.length}; dipilih: ${selected.length}`);
  for (const entry of selected) console.log(`  - ${entry.observedDate}  ${entry.fileName}`);

  if (args.list) return;

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sahamlens-ksei-ownership-'));
  const results = [];

  try {
    for (const [index, entry] of selected.entries()) {
      console.log(`\n[${index + 1}/${selected.length}] ${entry.observedDate}`);
      const periodDir = path.join(root, entry.ymd);
      const zipPath = path.join(periodDir, entry.fileName);
      const extractDir = path.join(periodDir, 'extract');
      await fs.mkdir(periodDir, { recursive: true });

      console.log(`  download: ${entry.url}`);
      await downloadZip(entry, zipPath);
      const txtPath = await extractTxt(zipPath, extractDir, entry.ymd);
      console.log(`  extract : ${path.basename(txtPath)}`);

      // Dry-run WAJIB selalu terjadi, termasuk dalam mode --confirm.
      const dry = await runBackfill(backfillScript, txtPath, false, cwd);
      process.stdout.write(dry.stdout);
      if (dry.stderr) process.stderr.write(dry.stderr);
      if (dry.code !== 0) throw new Error(`dry-run parser gagal exit ${dry.code} untuk ${entry.observedDate}`);

      const drySummary = parseBackfillSummary(`${dry.stdout}\n${dry.stderr}`);
      validateDryRun(drySummary, entry, args.minEquity);
      console.log(`  GATE OK: ${drySummary.validEquity} EQUITY, reject=0, tanggal cocok.`);

      let confirmSummary = null;
      if (args.confirm) {
        const write = await runBackfill(backfillScript, txtPath, true, cwd);
        process.stdout.write(write.stdout);
        if (write.stderr) process.stderr.write(write.stderr);
        if (write.code !== 0) throw new Error(`confirm DB gagal exit ${write.code} untuk ${entry.observedDate}`);
        confirmSummary = parseBackfillSummary(`${write.stdout}\n${write.stderr}`);
        if (!Number.isInteger(confirmSummary.inserted) || !Number.isInteger(confirmSummary.alreadyExisting)) {
          throw new Error(`output confirm tidak memuat ringkasan insert untuk ${entry.observedDate}`);
        }
      }

      results.push({
        date: entry.observedDate,
        valid: drySummary.validEquity,
        inserted: confirmSummary?.inserted ?? null,
        existing: confirmSummary?.alreadyExisting ?? null,
      });
    }
  } finally {
    if (args.keepFiles) {
      console.log(`\nFile sementara dipertahankan: ${root}`);
    } else {
      await fs.rm(root, { recursive: true, force: true });
    }
  }

  console.log('\n=== RINGKASAN AUTO-BACKFILL ===');
  for (const item of results) {
    if (args.confirm) {
      console.log(`${item.date}  valid=${item.valid}  baru=${item.inserted}  sudah_ada=${item.existing}`);
    } else {
      console.log(`${item.date}  valid=${item.valid}  DRY-RUN OK`);
    }
  }
  console.log(`\nSelesai ${results.length}/${selected.length} periode.`);
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`\nAUTO-BACKFILL GAGAL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
