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
  /** YYYY-MM-DD, tanggal ketika data sudah diketahui/published ke pasar. */
  observedDate: string;
  /** YYYY-MM-DD akhir periode laporan; null untuk snapshot lama yang tidak punya metadata periode. */
  periodEnd: string | null;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
  /** Konteks sektor SEBAGAIMANA DIKETAHUI pada `observedDate` (temuan C-02). Null untuk
   * baris arsip lama yang direkam sebelum kolom ini ada - dan itu memang fakta yang benar
   * untuk baris itu, bukan kekurangan yang perlu ditambal mundur. */
  yahooSector: string | null;
  yahooIndustry: string | null;
  payoutRatio: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
}

export interface FundamentalHistoryInput extends FundamentalInput {
  ticker: string;
  observedDate: string;
  /** Opsional untuk snapshot runtime lama; PIT backfill v2 mewajibkannya. */
  periodEnd?: string | null;
  source?: string;
}

export interface FundamentalPitBackfillInput extends FundamentalInput {
  ticker: string;
  /** Tanggal publikasi/pertama diketahui pasar. */
  observedDate: string;
  /** Akhir kuartal laporan. WAJIB untuk PIT backfill v2. */
  periodEnd: string;
  source: string;
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

function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapRow(row: Record<string, unknown>): FundamentalHistoryRow {
  return {
    ticker: String(row.ticker),
    observedDate: toDateKey(row.observed_date),
    periodEnd: row.period_end == null ? null : toDateKey(row.period_end),
    per: toNum(row.per),
    pbv: toNum(row.pbv),
    roe: toNum(row.roe),
    der: toNum(row.der),
    currentRatio: toNum(row.current_ratio),
    revenueGrowth: toNum(row.revenue_growth),
    yahooSector: toText(row.yahoo_sector),
    yahooIndustry: toText(row.yahoo_industry),
    payoutRatio: toNum(row.payout_ratio),
    sharesOutstanding: toNum(row.shares_outstanding),
    marketCap: toNum(row.market_cap),
  };
}

/** Kolom yang dibaca as-of. Satu daftar, dipakai asOf() DAN listHistory() - kalau
 * ditulis dua kali, satu di antaranya pasti tertinggal saat kolom bertambah. */
const AS_OF_COLUMNS = `ticker, observed_date, period_end, per, pbv, roe, der,
       current_ratio, revenue_growth, yahoo_sector, yahoo_industry, payout_ratio,
       shares_outstanding, market_cap`;

/** Kolom yang DITULIS arsip. Satu daftar untuk kedua penulis (snapshot cron & PIT
 * backfill v2) - kelas bug "daftar kolom dan daftar nilai bergeser satu posisi" pernah
 * terjadi persis di importer admin (lihat catatan di
 * modules/fundamental/service/fundamental-backfill-import.service.ts), jadi di sini
 * keduanya dihasilkan dari satu fungsi. */
const ARCHIVE_COLUMNS = `ticker, observed_date, period_end, per, pbv, roe, der,
        current_ratio, revenue_growth, source, yahoo_sector, yahoo_industry, payout_ratio,
        shares_outstanding, market_cap`;

/** Dorong satu baris ke `params` dan kembalikan placeholder-nya. Urutan nilai di sini
 * WAJIB sama dengan ARCHIVE_COLUMNS di atas. */
function pushArchiveRow(
  params: unknown[],
  row: FundamentalHistoryInput,
  source: string
): string {
  const base = params.length;
  params.push(
    row.ticker,
    row.observedDate,
    row.periodEnd ?? null,
    row.per,
    row.pbv,
    row.roe,
    row.der,
    row.currentRatio,
    row.revenueGrowth,
    source,
    // Konteks sektor point-in-time (temuan C-02). `beta` sengaja TIDAK diarsipkan:
    // ia dihitung dari harga per-request terhadap IHSG, jadi ia turunan dari data
    // harga yang sudah punya arsipnya sendiri - menyimpannya di sini akan menciptakan
    // sumber kedua yang bisa berbeda.
    row.sector?.yahooSector ?? null,
    row.sector?.yahooIndustry ?? null,
    row.sector?.payoutRatio ?? null,
    row.sharesOutstanding ?? null,
    row.marketCap ?? null
  );
  return [
    `$${base + 1}`, `$${base + 2}::date`, `$${base + 3}::date`,
    `$${base + 4}`, `$${base + 5}`, `$${base + 6}`, `$${base + 7}`,
    `$${base + 8}`, `$${base + 9}`, `$${base + 10}`,
    `$${base + 11}`, `$${base + 12}`, `$${base + 13}`,
    `$${base + 14}`, `$${base + 15}`,
  ].join(', ');
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
  const tuples = rows.map((r) => `(${pushArchiveRow(params, r, 'yahoo-quoteSummary')})`);

  const { rowCount } = await pool.query(
    `INSERT INTO fundamental_history
       (${ARCHIVE_COLUMNS})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (ticker, observed_date) DO NOTHING`,
    params
  );
  return rowCount ?? 0;
}


/**
 * Append-only writer khusus PIT v2.
 *
 * Tidak UPDATE baris lama. Jika (ticker, observed_date) sudah ada, baris lama menang.
 * period_end WAJIB dan harus <= observed_date. Ini mencegah laporan dipakai sebelum
 * tanggal publikasinya dan mencegah data lama 2026-01-30 tertimpa.
 */
export async function archiveFundamentalPitBackfill(
  rows: FundamentalPitBackfillInput[]
): Promise<number> {
  if (!rows.length) return 0;

  for (const r of rows) {
    assertDateKey(r.observedDate, 'observedDate');
    assertDateKey(r.periodEnd, 'periodEnd');
    if (r.periodEnd > r.observedDate) {
      throw new Error(
        `PIT invalid ${r.ticker}: periodEnd ${r.periodEnd} > observedDate ${r.observedDate}`
      );
    }
    if (!r.source?.trim()) throw new Error(`PIT ${r.ticker}: source wajib diisi`);
  }

  await ensureSharedSchema();

  const params: unknown[] = [];
  const tuples = rows.map((r) => `(${pushArchiveRow(params, r, r.source.trim())})`);

  const { rowCount } = await pool.query(
    `INSERT INTO fundamental_history
       (${ARCHIVE_COLUMNS})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (ticker, observed_date) DO NOTHING`,
    params
  );
  return rowCount ?? 0;
}

export async function auditFundamentalHistoryCounts(): Promise<{
  distinctObservedDates: number;
  totalRows: number;
}> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT
       COUNT(DISTINCT observed_date)::int AS distinct_observed_dates,
       COUNT(*)::int AS total_rows
     FROM fundamental_history`
  );
  return {
    distinctObservedDates: Number(rows[0]?.distinct_observed_dates ?? 0),
    totalRows: Number(rows[0]?.total_rows ?? 0),
  };
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
    `SELECT ${AS_OF_COLUMNS}
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
    `SELECT ${AS_OF_COLUMNS}
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
