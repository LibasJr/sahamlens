import { pool } from '../../../shared/database/postgres.client';
import { ensureSharedSchema } from '../../../shared/database/schema.service';
import { logger } from '../../../shared/logger/logger';
import type { FundamentalInput } from '../../technical';

// ARSIP FUNDAMENTAL POINT-IN-TIME (Phase 0 / P0-5).
//
// Kenapa ada: `writeFundamentalSnapshot()` (shared/cache/ai-pick-cache.ts) menulis ke
// SATU key Redis ber-TTL 24 jam. Setiap eksekusi cron MENIMPA hari sebelumnya, jadi
// nilai fundamental per tanggal hilang permanen. Cache itu TETAP DIPERTAHANKAN (ia
// melayani runtime/current data); tabel ini lapisan terpisah untuk data historis.
//
// ATURAN YANG TIDAK BOLEH DILANGGAR:
// 1. APPEND-ONLY. Tidak ada UPDATE/DELETE di file ini. Snapshot tanggal sebelumnya
//    tidak boleh ditimpa oleh eksekusi cron kapan pun.
// 2. IDEMPOTEN. Cron bisa dieksekusi ulang (retry QStash, deploy dobel). INSERT ...
//    ON CONFLICT DO NOTHING membuat eksekusi kedua pada tanggal yang sama jadi no-op.
// 3. `asOf()` HANYA mengembalikan baris dengan `observed_date <= requestedDate`.
//    Melanggar ini = look-ahead bias: backtest akan "mengetahui" fundamental yang
//    baru dipublikasikan setelah tanggal keputusan, dan hasilnya jadi fiktif.

export interface FundamentalHistoryRow {
  ticker: string;
  /** YYYY-MM-DD, tanggal kalender WIB saat snapshot diambil. */
  observedDate: string;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
}

export interface FundamentalHistoryInput extends FundamentalInput {
  ticker: string;
  observedDate: string;
}

/** DATE Postgres kembali sebagai objek Date (pg tidak mem-parse-nya jadi string).
 * Diformat lewat komponen UTC-nya, BUKAN toISOString() lokal maupun
 * `toISOString().split('T')[0]` atas Date bertimezone server: driver pg membangun
 * Date dari DATE murni pada tengah malam UTC, jadi getUTCFullYear/Month/Date
 * mengembalikan hari yang sama persis dengan yang tersimpan, apa pun TZ server. */
function toDateKey(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

/** NUMERIC Postgres kembali sebagai string (presisi arbitrer tidak muat di double).
 * null tetap null - JANGAN diubah jadi 0, itu klaim finansial yang tidak pernah diukur. */
function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: Record<string, unknown>): FundamentalHistoryRow {
  return {
    ticker: String(row.ticker),
    observedDate: toDateKey(row.observed_date),
    per: toNum(row.per),
    pbv: toNum(row.pbv),
    roe: toNum(row.roe),
    der: toNum(row.der),
    currentRatio: toNum(row.current_ratio),
    revenueGrowth: toNum(row.revenue_growth),
  };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDateKey(date: string, what: string): void {
  if (!DATE_KEY_RE.test(date)) {
    throw new Error(`${what} harus format YYYY-MM-DD, diterima: ${JSON.stringify(date)}`);
  }
}

/**
 * Arsipkan snapshot satu hari untuk banyak ticker sekaligus.
 *
 * Idempoten: memanggilnya dua kali dengan `observedDate` yang sama menyisakan satu
 * baris per ticker, dan baris PERTAMA yang menang (ON CONFLICT DO NOTHING) - eksekusi
 * ulang cron TIDAK menimpa nilai yang sudah terarsip.
 *
 * @returns jumlah baris yang benar-benar BARU (bukan jumlah baris yang dikirim).
 */
export async function archiveFundamentalSnapshot(
  rows: FundamentalHistoryInput[]
): Promise<number> {
  if (rows.length === 0) return 0;
  for (const r of rows) assertDateKey(r.observedDate, 'observedDate');

  await ensureSharedSchema();

  // Satu statement multi-VALUES, bukan N round-trip: 109 ticker x satu koneksi Neon.
  // Parameterized penuh ($1..$n) - tidak ada nilai yang diinterpolasi ke SQL string.
  const params: unknown[] = [];
  const tuples = rows.map((r) => {
    const base = params.length;
    params.push(
      r.ticker,
      r.observedDate,
      r.per,
      r.pbv,
      r.roe,
      r.der,
      r.currentRatio,
      r.revenueGrowth
    );
    return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
  });

  const { rowCount } = await pool.query(
    `INSERT INTO fundamental_history
       (ticker, observed_date, per, pbv, roe, der, current_ratio, revenue_growth)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (ticker, observed_date) DO NOTHING`,
    params
  );
  return rowCount ?? 0;
}

/**
 * Fundamental yang DIKETAHUI pada `requestedDate` - fondasi backtest bebas look-ahead.
 *
 * Mengembalikan snapshot dengan `observed_date` TERBESAR yang masih `<= requestedDate`.
 * Snapshot bertanggal setelah `requestedDate` TIDAK PERNAH dikembalikan, walaupun ia
 * satu-satunya baris yang ada untuk ticker itu - dalam kasus itu jawabannya `null`
 * ("belum ada yang kita ketahui pada tanggal itu"), bukan baris terdekat.
 */
export async function asOf(
  ticker: string,
  requestedDate: string
): Promise<FundamentalHistoryRow | null> {
  assertDateKey(requestedDate, 'requestedDate');
  await ensureSharedSchema();

  const { rows } = await pool.query(
    `SELECT ticker, observed_date, per, pbv, roe, der, current_ratio, revenue_growth
       FROM fundamental_history
      WHERE ticker = $1 AND observed_date <= $2::date
      ORDER BY observed_date DESC
      LIMIT 1`,
    [ticker, requestedDate]
  );
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

/** Seluruh snapshot satu ticker, urut naik - dipakai inspeksi/QA arsip, bukan scoring. */
export async function listHistory(ticker: string): Promise<FundamentalHistoryRow[]> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT ticker, observed_date, per, pbv, roe, der, current_ratio, revenue_growth
       FROM fundamental_history
      WHERE ticker = $1
      ORDER BY observed_date ASC`,
    [ticker]
  );
  return rows.map(mapRow);
}

/**
 * Bungkus `archiveFundamentalSnapshot()` yang TIDAK PERNAH melempar.
 *
 * Dipakai cron: arsip adalah lapisan TAMBAHAN di atas penulisan cache yang sudah ada.
 * Database down tidak boleh menggagalkan job yang tugas utamanya menyegarkan cache
 * runtime - tapi kegagalannya wajib tercatat, bukan ditelan diam-diam.
 */
export async function archiveFundamentalSnapshotSafe(
  rows: FundamentalHistoryInput[]
): Promise<{ archived: number; error: string | null }> {
  try {
    const archived = await archiveFundamentalSnapshot(rows);
    return { archived, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Arsip fundamental_history gagal', { err: message, rows: rows.length });
    return { archived: 0, error: message };
  }
}
