#!/usr/bin/env node
/**
 * BACKFILL OWNERSHIP FLOW dari arsip periodik KSEI (Holding Composition).
 *
 * ============================================================================
 * ATURAN YANG TIDAK BOLEH DILANGGAR
 * ============================================================================
 *
 * 1. TIDAK ADA DATA SINTETIS. Setiap baris yang masuk harus berasal dari berkas
 *    arsip resmi. Tidak ada baris yang "diperkirakan".
 *
 * 2. TIDAK ADA FORWARD-FILL. Arsip bulanan memberi posisi akhir bulan. Ia TIDAK
 *    boleh disalin ke hari-hari di antaranya - itu akan menciptakan ~30
 *    "observasi" yang tidak pernah diukur siapa pun, dan delta 1D/7D yang
 *    dihitung darinya akan sepenuhnya fiktif.
 *
 * 3. TANGGAL SNAPSHOT ASLI DIPERTAHANKAN. Baris "30 Jun 2026" tersimpan dengan
 *    observed_date = 2026-06-30. TIDAK PERNAH diganti tanggal script dijalankan.
 *
 * 4. SUMBER DIBEDAKAN. Baris arsip masuk dengan source = KSEI_HOLDING_COMPOSITION,
 *    berbeda dari snapshot harian (KSEI_REGISTERED_SECURITY). Karena UNIQUE
 *    constraint mencakup kolom source, keduanya bisa hidup berdampingan untuk
 *    tanggal yang sama tanpa saling menimpa - dan justru itu yang membuat
 *    keduanya bisa dipakai saling cek.
 *
 * 5. APPEND-ONLY & IDEMPOTEN. ON CONFLICT DO NOTHING. Menjalankan ulang script
 *    ini tidak menggandakan dan tidak menimpa apa pun.
 *
 * ============================================================================
 * STATUS
 * ============================================================================
 * Format berkas arsip BELUM DIVERIFIKASI (KSEI_HOLDING_COMPOSITION.auditStatus
 * = UNVERIFIED). Script ini karena itu MENUNTUT berkas lokal yang sudah diunduh
 * dan diperiksa operator - ia TIDAK mengunduh sendiri dari internet.
 *
 * Ia juga menolak berjalan tanpa --confirm, dan --dry-run adalah default.
 *
 * CARA PAKAI
 * ----------
 *   # 1. Unduh arsip manual dari web.ksei.co.id/archive_download/holding_composition
 *   # 2. Periksa isinya, pastikan kolom & tanggalnya sesuai
 *   # 3. Dry run dulu - TIDAK menulis apa pun:
 *   node scripts/backfill-ownership-flow.mjs --file arsip.csv --observed-date 2026-06-30
 *
 *   # 4. Kalau ringkasannya benar, baru tulis:
 *   node scripts/backfill-ownership-flow.mjs --file arsip.csv --observed-date 2026-06-30 --confirm
 *
 * Kolom yang dicari (nama header, case-insensitive):
 *   Code / Kode        -> ticker
 *   Local / Lokal      -> jumlah atau persentase lokal
 *   Foreign / Asing    -> jumlah atau persentase asing
 *   Total              -> total efek (opsional)
 *   Date / Tanggal     -> observed_date per baris (opsional; kalau ada, MENANG
 *                         atas --observed-date)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_ID = 'KSEI_HOLDING_COMPOSITION';
const SOURCE_URL = 'https://web.ksei.co.id/archive_download/holding_composition';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const args = { file: null, observedDate: null, confirm: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') args.file = argv[++i];
    else if (arg === '--observed-date') args.observedDate = argv[++i];
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  return args;
}

/** Sama persis dengan parseNumericToken di modul - lihat catatan di sana soal
 * kenapa parseFloat polos berbahaya untuk "42,31" dan "1,234,567". */
function parseNumericToken(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let text = String(raw).trim();
  if (!text || ['-', '--', 'n/a', 'na', 'null', 'nil'].includes(text.toLowerCase())) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/[%\s ]/g, '');
  if (text.startsWith('+')) text = text.slice(1);
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) return null;

  const hasDot = text.includes('.');
  const hasComma = text.includes(',');
  let normalized;

  if (hasDot && hasComma) {
    const decimalSep = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    const parts = text.split(decimalSep);
    if (parts.length !== 2) return null;
    normalized = `${parts[0].split(thousandSep).join('') || '0'}.${parts[1]}`;
  } else if (hasDot || hasComma) {
    const sep = hasComma ? ',' : '.';
    const parts = text.split(sep);
    if (parts.length > 2) {
      if (!parts.slice(1).every((p) => p.length === 3)) return null;
      normalized = parts.join('');
    } else {
      const [head, tail] = parts;
      if (!head || !tail) return null;
      normalized = tail.length === 3 && head.length <= 3 ? `${head}${tail}` : `${head}.${tail}`;
    }
  } else {
    normalized = text;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** CSV sederhana dengan dukungan field berkutip. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function findColumn(header, candidates) {
  for (let i = 0; i < header.length; i++) {
    const name = header[i].trim().toLowerCase();
    if (candidates.some((c) => name === c || name.startsWith(c))) return i;
  }
  return -1;
}

function normalizeTicker(raw) {
  const value = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!value) return null;
  const bare = value.endsWith('.JK') ? value.slice(0, -3) : value;
  if (!/^[A-Z0-9]{1,10}$/.test(bare)) return null;
  return `${bare}.JK`;
}

function isRealDate(key) {
  if (!DATE_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    console.error('ERROR: --file wajib. Script ini TIDAK mengunduh sendiri dari internet -');
    console.error('       operator harus mengunduh dan memeriksa arsipnya lebih dulu.');
    console.error(`       Sumber: ${SOURCE_URL}`);
    process.exitCode = 1;
    return;
  }

  if (args.observedDate && !isRealDate(args.observedDate)) {
    console.error(`ERROR: --observed-date "${args.observedDate}" bukan tanggal YYYY-MM-DD yang sah.`);
    process.exitCode = 1;
    return;
  }

  const raw = await fs.readFile(path.resolve(args.file), 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    console.error('ERROR: berkas tidak memuat header + baris data.');
    process.exitCode = 1;
    return;
  }

  const header = rows[0];
  const idx = {
    ticker: findColumn(header, ['code', 'kode', 'security code', 'short code']),
    local: findColumn(header, ['local', 'lokal']),
    foreign: findColumn(header, ['foreign', 'asing']),
    total: findColumn(header, ['total']),
    date: findColumn(header, ['date', 'tanggal', 'as of']),
  };

  if (idx.ticker < 0 || (idx.local < 0 && idx.foreign < 0)) {
    console.error('ERROR: kolom wajib tidak ditemukan.');
    console.error(`  Header terbaca: ${header.join(' | ')}`);
    console.error('  Dibutuhkan: kolom kode emiten, dan minimal salah satu dari local/foreign.');
    process.exitCode = 1;
    return;
  }

  if (idx.date < 0 && !args.observedDate) {
    // Ini penjagaan terpenting di script: tanpa tanggal snapshot, satu-satunya
    // "tanggal" yang tersedia adalah hari ini - dan memakainya berarti mengarang
    // sejarah. Lebih baik berhenti.
    console.error('ERROR: berkas tidak punya kolom tanggal DAN --observed-date tidak diisi.');
    console.error('       Tanggal cron TIDAK BOLEH dipakai sebagai tanggal historis.');
    process.exitCode = 1;
    return;
  }

  const accepted = [];
  const rejected = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const ticker = normalizeTicker(row[idx.ticker]);
    if (!ticker) {
      rejected.push({ line: r + 1, reason: `kode emiten tidak dikenali: ${JSON.stringify(row[idx.ticker] ?? null)}` });
      continue;
    }

    const observedDate = idx.date >= 0 ? String(row[idx.date] ?? '').trim() : args.observedDate;
    if (!isRealDate(observedDate)) {
      rejected.push({ line: r + 1, reason: `tanggal snapshot tidak sah: ${JSON.stringify(observedDate)}` });
      continue;
    }

    const localRaw = idx.local >= 0 ? parseNumericToken(row[idx.local]) : null;
    const foreignRaw = idx.foreign >= 0 ? parseNumericToken(row[idx.foreign]) : null;
    const total = idx.total >= 0 ? parseNumericToken(row[idx.total]) : null;

    if (localRaw === null && foreignRaw === null) {
      rejected.push({ line: r + 1, reason: `${ticker}: tidak ada nilai local maupun foreign` });
      continue;
    }

    // Arsip Holding Composition memuat JUMLAH EFEK, bukan persentase. Persentase
    // dihitung dari jumlahnya - dan hanya kalau penyebutnya benar-benar ada.
    // Kalau tidak, baris ditolak: menebak penyebut berarti mengarang angka.
    const denominator = total ?? ((localRaw ?? 0) + (foreignRaw ?? 0));
    if (!denominator || denominator <= 0) {
      rejected.push({ line: r + 1, reason: `${ticker}: penyebut tidak sah (total=${total})` });
      continue;
    }

    let localPct = localRaw === null ? null : (localRaw / denominator) * 100;
    let foreignPct = foreignRaw === null ? null : (foreignRaw / denominator) * 100;

    // Kalau berkas ternyata SUDAH berisi persentase (0-100 dan jumlahnya ~100),
    // pakai apa adanya alih-alih membaginya lagi.
    if (localRaw !== null && foreignRaw !== null && Math.abs(localRaw + foreignRaw - 100) <= 0.05) {
      localPct = localRaw;
      foreignPct = foreignRaw;
    }

    const outOfRange = [localPct, foreignPct].some((v) => v !== null && (v < 0 || v > 100));
    if (outOfRange) {
      rejected.push({ line: r + 1, reason: `${ticker}: persentase di luar 0-100 (local=${localPct}, foreign=${foreignPct})` });
      continue;
    }
    if (localPct !== null && foreignPct !== null && Math.abs(localPct + foreignPct - 100) > 0.05) {
      rejected.push({
        line: r + 1,
        reason: `${ticker}: local+foreign = ${(localPct + foreignPct).toFixed(4)}, menyimpang dari 100`,
      });
      continue;
    }

    accepted.push({
      ticker,
      observedDate,
      localPct: localPct === null ? null : Number(localPct.toFixed(4)),
      foreignPct: foreignPct === null ? null : Number(foreignPct.toFixed(4)),
      totalSecurities: total,
      localShares: localRaw !== null && localPct !== localRaw ? localRaw : null,
      foreignShares: foreignRaw !== null && foreignPct !== foreignRaw ? foreignRaw : null,
    });

    if (args.limit > 0 && accepted.length >= args.limit) break;
  }

  const dates = Array.from(new Set(accepted.map((a) => a.observedDate))).sort();

  console.log('\nBackfill Ownership Flow - arsip periodik KSEI');
  console.log(`  Berkas          : ${args.file}`);
  console.log(`  Source          : ${SOURCE_ID}`);
  console.log(`  Baris diterima  : ${accepted.length}`);
  console.log(`  Baris ditolak   : ${rejected.length}`);
  console.log(`  Tanggal snapshot: ${dates.join(', ') || '(tidak ada)'}`);

  if (rejected.length) {
    console.log('\n  Contoh penolakan (maks 10):');
    for (const item of rejected.slice(0, 10)) console.log(`    baris ${item.line}: ${item.reason}`);
  }

  if (!accepted.length) {
    console.error('\nTidak ada baris sah. Tidak ada yang ditulis.');
    process.exitCode = 1;
    return;
  }

  if (!args.confirm) {
    console.log('\nDRY RUN - tidak ada yang ditulis ke database.');
    console.log('Jalankan ulang dengan --confirm kalau ringkasan di atas sudah benar.');
    return;
  }

  // Import ditunda sampai benar-benar akan menulis: dry run tidak perlu koneksi
  // database sama sekali.
  const { pool } = await import('../shared/database/postgres.client.ts');
  const { ensureSharedSchema } = await import('../shared/database/schema.service.ts');
  await ensureSharedSchema();

  // fetched_at = waktu backfill dijalankan. Ini JUJUR: kita memang baru
  // mengetahuinya sekarang. Yang tidak boleh adalah memakainya sebagai
  // observed_date - dan observed_date di atas datang dari arsipnya sendiri.
  const fetchedAt = new Date().toISOString();
  const CHUNK = 500;
  let inserted = 0;

  for (let i = 0; i < accepted.length; i += CHUNK) {
    const chunk = accepted.slice(i, i + CHUNK);
    const params = [];
    const tuples = chunk.map((row) => {
      const b = params.length;
      params.push(
        row.ticker, row.observedDate, row.localPct, row.foreignPct, null,
        row.totalSecurities, row.localShares, row.foreignShares,
        SOURCE_ID, SOURCE_URL, fetchedAt
      );
      return `($${b + 1}, $${b + 2}::date, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}::timestamptz)`;
    });

    const { rowCount } = await pool.query(
      `INSERT INTO ownership_flow_history
         (ticker, observed_date, local_pct, foreign_pct, scripless_pct,
          total_securities, local_shares, foreign_shares, source, source_url, fetched_at)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (ticker, observed_date, source) DO NOTHING`,
      params
    );
    inserted += rowCount ?? 0;
  }

  console.log(`\nSelesai. Baris BARU: ${inserted}. Sudah ada sebelumnya: ${accepted.length - inserted}.`);
  console.log('Baris arsip TIDAK menimpa snapshot harian - source-nya berbeda, jadi keduanya');
  console.log('dapat dipakai saling cek untuk tanggal yang sama.');
  await pool.end?.();
}

main().catch((err) => {
  console.error('Backfill gagal:', err);
  process.exitCode = 1;
});
