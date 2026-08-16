#!/usr/bin/env node
/**
 * BACKFILL OWNERSHIP FLOW dari arsip periodik KSEI (Holding Composition).
 *
 * Format resmi yang sudah diverifikasi (BalanceposEfek20260731.zip):
 *   ZIP -> BalanceposYYYYMMDD.txt
 *   delimiter: pipe (|)
 *   Date: DD-MMM-YYYY, contoh 31-JUL-2026
 *   agregat yang dipakai: Total Local, Total Foreign, Total
 *   Sec. Num disimpan sebagai totalSecurities bila tersedia.
 *
 * Aturan keras:
 * - hanya Type=EQUITY;
 * - tidak ada data sintetis / forward-fill;
 * - observed_date selalu tanggal yang dinyatakan file;
 * - dry-run adalah default, --confirm wajib untuk menulis;
 * - append-only + idempotent (ON CONFLICT DO NOTHING).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_ID = 'KSEI_HOLDING_COMPOSITION';
const SOURCE_ARCHIVE_PAGE = 'https://web.ksei.co.id/archive_download/holding_composition';
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = new Map([
  ['JAN', 1], ['FEB', 2], ['MAR', 3], ['APR', 4], ['MAY', 5], ['JUN', 6],
  ['JUL', 7], ['AUG', 8], ['SEP', 9], ['OCT', 10], ['NOV', 11], ['DEC', 12],
]);

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

function isRealDate(key) {
  if (!DATE_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Terima ISO atau format resmi KSEI DD-MMM-YYYY. Hasil selalu YYYY-MM-DD. */
function normalizeObservedDate(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (isRealDate(text)) return text;

  const match = text.toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.get(match[2]);
  const year = Number(match[3]);
  if (!month) return null;
  const iso = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isRealDate(iso) ? iso : null;
}

function archiveDownloadUrl(observedDate) {
  const ymd = observedDate.replaceAll('-', '');
  return `https://web.ksei.co.id/Download/BalanceposEfek${ymd}.zip`;
}

/** Parser angka ketat; tidak memakai parseFloat agar "42,31" tidak menjadi 42. */
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

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === delimiter) count++;
  }
  return count;
}

/**
 * Deteksi delimiter dari header. Pipe diprioritaskan karena itulah format arsip
 * KSEI yang benar-benar diamati; CSV/semicolon/tab tetap didukung untuk fixture
 * lama dan konversi manual.
 */
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = ['|', '\t', ';', ','];
  let best = '|';
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = countDelimiter(firstLine, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/** Delimited-text parser sederhana dengan dukungan field berkutip. */
function parseDelimited(text) {
  const delimiter = detectDelimiter(text);
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
    else if (ch === delimiter) {
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
  return { delimiter, rows };
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Exact match didahulukan. Prefix hanya fallback agar "local" tidak salah menangkap "Local IS". */
function findColumn(header, exactCandidates, prefixCandidates = []) {
  const normalized = header.map(normalizeHeader);
  for (const candidate of exactCandidates) {
    const idx = normalized.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < normalized.length; i++) {
    if (prefixCandidates.some((candidate) => normalized[i].startsWith(candidate))) return i;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    console.error('ERROR: --file wajib. Gunakan file TXT hasil ekstrak ZIP resmi KSEI.');
    console.error(`       Arsip: ${SOURCE_ARCHIVE_PAGE}`);
    process.exitCode = 1;
    return;
  }

  const forcedDate = args.observedDate ? normalizeObservedDate(args.observedDate) : null;
  if (args.observedDate && !forcedDate) {
    console.error(`ERROR: --observed-date "${args.observedDate}" bukan tanggal yang sah.`);
    process.exitCode = 1;
    return;
  }

  const raw = await fs.readFile(path.resolve(args.file), 'utf8');
  const { delimiter, rows } = parseDelimited(raw);
  if (rows.length < 2) {
    console.error('ERROR: berkas tidak memuat header + baris data.');
    process.exitCode = 1;
    return;
  }

  const header = rows[0];
  const idx = {
    ticker: findColumn(header, ['code', 'kode', 'security code', 'short code']),
    type: findColumn(header, ['type', 'security type']),
    secNum: findColumn(header, ['sec. num', 'sec num', 'security number', 'number of securities']),
    // PENTING: pakai agregat Total Local / Total Foreign, BUKAN Local IS / Foreign IS.
    local: findColumn(header, ['total local', 'local total', 'local', 'lokal']),
    foreign: findColumn(header, ['total foreign', 'foreign total', 'foreign', 'asing']),
    // Exact "total" agar tidak salah mengambil "Total Local".
    total: findColumn(header, ['total']),
    date: findColumn(header, ['date', 'tanggal', 'as of']),
  };

  if (idx.ticker < 0 || idx.local < 0 || idx.foreign < 0) {
    console.error('ERROR: kolom wajib arsip KSEI tidak ditemukan.');
    console.error(`  Header terbaca: ${header.join(' | ')}`);
    console.error('  Dibutuhkan minimal: Code, Total Local, Total Foreign.');
    process.exitCode = 1;
    return;
  }

  if (idx.date < 0 && !forcedDate) {
    console.error('ERROR: berkas tidak punya kolom Date DAN --observed-date tidak diisi.');
    console.error('       Tanggal saat script berjalan tidak pernah dipakai sebagai tanggal historis.');
    process.exitCode = 1;
    return;
  }

  const accepted = [];
  const rejected = [];
  let skippedNonEquity = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];

    if (idx.type >= 0) {
      const securityType = String(row[idx.type] ?? '').trim().toUpperCase();
      if (securityType !== 'EQUITY') {
        skippedNonEquity++;
        continue;
      }
    }

    const ticker = normalizeTicker(row[idx.ticker]);
    if (!ticker) {
      rejected.push({ line: r + 1, reason: `kode emiten tidak dikenali: ${JSON.stringify(row[idx.ticker] ?? null)}` });
      continue;
    }

    const fileDate = idx.date >= 0 ? normalizeObservedDate(row[idx.date]) : null;
    const observedDate = fileDate ?? forcedDate;
    if (!observedDate) {
      rejected.push({ line: r + 1, reason: `tanggal snapshot tidak sah: ${JSON.stringify(row[idx.date] ?? null)}` });
      continue;
    }
    if (fileDate && forcedDate && fileDate !== forcedDate) {
      rejected.push({
        line: r + 1,
        reason: `${ticker}: tanggal file ${fileDate} berbeda dari --observed-date ${forcedDate}`,
      });
      continue;
    }

    const localRaw = parseNumericToken(row[idx.local]);
    const foreignRaw = parseNumericToken(row[idx.foreign]);
    const totalHoldings = idx.total >= 0 ? parseNumericToken(row[idx.total]) : null;
    const secNum = idx.secNum >= 0 ? parseNumericToken(row[idx.secNum]) : null;

    if (localRaw === null || foreignRaw === null) {
      rejected.push({ line: r + 1, reason: `${ticker}: Total Local/Total Foreign tidak terbaca` });
      continue;
    }
    if (localRaw < 0 || foreignRaw < 0) {
      rejected.push({ line: r + 1, reason: `${ticker}: jumlah local/foreign negatif` });
      continue;
    }

    // Untuk Balancepos resmi, "Total" adalah saldo custody = Total Local + Total Foreign.
    // Persentase komposisi dihitung terhadap saldo custody ini, bukan terhadap Sec. Num.
    const computedHoldings = localRaw + foreignRaw;
    const denominator = totalHoldings ?? computedHoldings;
    if (!denominator || denominator <= 0) {
      rejected.push({ line: r + 1, reason: `${ticker}: total custody tidak sah (${denominator})` });
      continue;
    }

    if (totalHoldings !== null) {
      const tolerance = Math.max(1, Math.abs(totalHoldings) * 1e-9);
      if (Math.abs(computedHoldings - totalHoldings) > tolerance) {
        rejected.push({
          line: r + 1,
          reason: `${ticker}: Total Local + Total Foreign (${computedHoldings}) != Total (${totalHoldings})`,
        });
        continue;
      }
    }

    let localPct;
    let foreignPct;

    // Tetap menerima fixture/generic file yang sudah berupa persentase.
    if (Math.abs(localRaw + foreignRaw - 100) <= 0.05) {
      localPct = localRaw;
      foreignPct = foreignRaw;
    } else {
      localPct = (localRaw / denominator) * 100;
      foreignPct = (foreignRaw / denominator) * 100;
    }

    if (
      !Number.isFinite(localPct) || !Number.isFinite(foreignPct) ||
      localPct < 0 || localPct > 100 || foreignPct < 0 || foreignPct > 100 ||
      Math.abs(localPct + foreignPct - 100) > 0.05
    ) {
      rejected.push({
        line: r + 1,
        reason: `${ticker}: komposisi tidak konsisten (local=${localPct}, foreign=${foreignPct})`,
      });
      continue;
    }

    accepted.push({
      ticker,
      observedDate,
      localPct: Number(localPct.toFixed(4)),
      foreignPct: Number(foreignPct.toFixed(4)),
      // Sec. Num adalah jumlah efek emiten; fallback ke Total custody bila tidak tersedia.
      totalSecurities: secNum ?? totalHoldings ?? computedHoldings,
      localShares: localRaw,
      foreignShares: foreignRaw,
      sourceUrl: archiveDownloadUrl(observedDate),
    });

    if (args.limit > 0 && accepted.length >= args.limit) break;
  }

  const dates = Array.from(new Set(accepted.map((a) => a.observedDate))).sort();

  console.log('\nBackfill Ownership Flow - arsip periodik KSEI');
  console.log(`  Berkas             : ${args.file}`);
  console.log(`  Source             : ${SOURCE_ID}`);
  console.log(`  Delimiter          : ${delimiter === '\t' ? 'TAB' : delimiter}`);
  console.log(`  Baris EQUITY valid : ${accepted.length}`);
  console.log(`  Non-EQUITY dilewati: ${skippedNonEquity}`);
  console.log(`  Baris ditolak      : ${rejected.length}`);
  console.log(`  Tanggal snapshot   : ${dates.join(', ') || '(tidak ada)'}`);

  if (accepted.length) {
    console.log('\n  Preview (maks 5):');
    for (const row of accepted.slice(0, 5)) {
      console.log(
        `    ${row.ticker.padEnd(10)} ${row.observedDate}  local=${row.localPct.toFixed(4)}%  foreign=${row.foreignPct.toFixed(4)}%`
      );
    }
  }

  if (rejected.length) {
    console.log('\n  Contoh penolakan (maks 10):');
    for (const item of rejected.slice(0, 10)) console.log(`    baris ${item.line}: ${item.reason}`);
  }

  if (!accepted.length) {
    console.error('\nTidak ada baris EQUITY sah. Tidak ada yang ditulis.');
    process.exitCode = 1;
    return;
  }

  if (!args.confirm) {
    console.log('\nDRY RUN - tidak ada yang ditulis ke database.');
    console.log('Jalankan ulang dengan --confirm HANYA bila preview dan jumlah baris sudah masuk akal.');
    return;
  }

  const { pool } = await import('../shared/database/postgres.client.ts');
  const { ensureSharedSchema } = await import('../shared/database/schema.service.ts');
  await ensureSharedSchema();

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
        SOURCE_ID, row.sourceUrl, fetchedAt
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
  console.log('Source arsip tetap KSEI_HOLDING_COMPOSITION dan tidak menimpa snapshot live.');
  await pool.end?.();
}

main().catch((err) => {
  console.error('Backfill gagal:', err);
  process.exitCode = 1;
});
