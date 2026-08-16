import { pool } from '../../../shared/database/postgres.client';
import { ensureSharedSchema } from '../../../shared/database/schema.service';
import { logger } from '../../../shared/logger/logger';
import type { OwnershipObservation } from '../types/ownership-flow.types';

// ARSIP KEPEMILIKAN POINT-IN-TIME.
//
// ATURAN YANG TIDAK BOLEH DILANGGAR (sejajar dengan fundamental_history):
//
// 1. APPEND-ONLY. Tidak ada UPDATE/DELETE di file ini. Snapshot 14 Agustus
//    tidak boleh berubah karena cron 15 Agustus berjalan.
// 2. IDEMPOTEN. ON CONFLICT DO NOTHING atas (ticker, observed_date, source).
//    Cron yang dijalankan dua kali pada hari yang sama tidak menggandakan baris,
//    dan yang MENANG adalah baris PERTAMA - yaitu keadaan sebagaimana pertama
//    kali kita ketahui, yang justru itulah makna point-in-time.
// 3. observed_date BERASAL DARI SUMBER. Tidak pernah diisi tanggal cron. Kalau
//    sumber bilang "As of 15 Aug 2026" dan kita mengambilnya 16 Agustus 01:30
//    UTC, maka observed_date=2026-08-15 dan fetched_at=2026-08-16T01:30Z.
// 4. asOf() hanya mengembalikan observed_date <= tanggal yang diminta. Melanggar
//    ini = look-ahead bias pada backtest.

export interface OwnershipHistoryRow {
  ticker: string;
  observedDate: string;
  localPct: number | null;
  foreignPct: number | null;
  scriplessPct: number | null;
  totalSecurities: number | null;
  localShares: number | null;
  foreignShares: number | null;
  source: string;
  sourceUrl: string | null;
  fetchedAt: string | null;
}

const COLUMNS = `ticker, observed_date, local_pct, foreign_pct, scripless_pct,
       total_securities, local_shares, foreign_shares, source, source_url, fetched_at`;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDateKey(date: string, what: string): void {
  if (!DATE_KEY_RE.test(date)) {
    throw new Error(`${what} harus format YYYY-MM-DD, diterima: ${JSON.stringify(date)}`);
  }
}

/** DATE Postgres di-set kembali sebagai string oleh postgres.client (type parser
 * 1082), tapi jalur lain bisa memberi Date - tangani keduanya lewat komponen UTC
 * supaya tanggal tidak bergeser mengikuti timezone server. */
function toDateKey(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

/** NUMERIC kembali sebagai string dari pg. null TETAP null - jangan jadi 0. */
function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: Record<string, unknown>): OwnershipHistoryRow {
  return {
    ticker: String(row.ticker),
    observedDate: toDateKey(row.observed_date),
    localPct: toNum(row.local_pct),
    foreignPct: toNum(row.foreign_pct),
    scriplessPct: toNum(row.scripless_pct),
    totalSecurities: toNum(row.total_securities),
    localShares: toNum(row.local_shares),
    foreignShares: toNum(row.foreign_shares),
    source: String(row.source),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    fetchedAt: row.fetched_at instanceof Date ? row.fetched_at.toISOString() : row.fetched_at == null ? null : String(row.fetched_at),
  };
}

/**
 * Simpan observasi yang SUDAH lolos validasi parser.
 *
 * Fungsi ini sengaja TIDAK memvalidasi ulang isi angka - itu tugas
 * parseOwnershipRow(), dan menduplikasi aturan validasi di dua tempat adalah
 * cara pasti membuat keduanya berbeda pendapat suatu hari. Yang diperiksa di
 * sini hanya bentuk kunci (tanggal), karena kunci yang salah merusak tabel.
 *
 * @returns jumlah baris yang benar-benar BARU (bukan jumlah baris yang dikirim).
 */
export async function recordOwnershipObservations(
  observations: OwnershipObservation[]
): Promise<number> {
  if (observations.length === 0) return 0;
  for (const row of observations) {
    assertDateKey(row.observedDate, `observedDate ${row.ticker}`);
    if (row.quality !== 'VALID') {
      throw new Error(`Observasi ${row.ticker} berstatus ${row.quality} - hanya VALID yang boleh dipersist`);
    }
  }

  await ensureSharedSchema();

  const params: unknown[] = [];
  const tuples = observations.map((row) => {
    const base = params.length;
    params.push(
      row.ticker,
      row.observedDate,
      row.localPct,
      row.foreignPct,
      row.scriplessPct,
      row.totalSecurities,
      row.localShares,
      row.foreignShares,
      row.source,
      row.sourceUrl,
      row.fetchedAt
    );
    return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::timestamptz)`;
  });

  const { rowCount } = await pool.query(
    `INSERT INTO ownership_flow_history (${COLUMNS})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (ticker, observed_date, source) DO NOTHING`,
    params
  );
  return rowCount ?? 0;
}

/** Bungkus penulisan supaya kegagalan DB tidak menggagalkan seluruh job - tapi
 * TETAP tercatat, bukan ditelan. */
export async function recordOwnershipObservationsSafe(
  observations: OwnershipObservation[]
): Promise<{ inserted: number; error: string | null }> {
  try {
    return { inserted: await recordOwnershipObservations(observations), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Arsip ownership_flow_history gagal', {
      module: 'ownership-flow',
      err: message,
      rows: observations.length,
    });
    return { inserted: 0, error: message };
  }
}

/** Observasi terbaru satu ticker. */
export async function getLatestObservation(ticker: string): Promise<OwnershipHistoryRow | null> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM ownership_flow_history
      WHERE ticker = $1
      ORDER BY observed_date DESC
      LIMIT 1`,
    [ticker]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Observasi yang DIKETAHUI pada tanggal tertentu - fondasi backtest PIT.
 * Baris ber-observed_date setelah `requestedDate` tidak pernah dikembalikan.
 */
export async function asOfObservation(
  ticker: string,
  requestedDate: string
): Promise<OwnershipHistoryRow | null> {
  assertDateKey(requestedDate, 'requestedDate');
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM ownership_flow_history
      WHERE ticker = $1 AND observed_date <= $2::date
      ORDER BY observed_date DESC
      LIMIT 1`,
    [ticker, requestedDate]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Histori satu ticker, urut NAIK - dipakai mesin delta dan chart.
 *
 * `limit` membatasi dari sisi TERBARU (subquery DESC lalu dibalik), supaya
 * pemanggil yang hanya butuh ~90 observasi terakhir tidak menarik seluruh tabel
 * ketika histori sudah bertahun-tahun.
 */
export async function listOwnershipHistory(
  ticker: string,
  limit = 400
): Promise<OwnershipHistoryRow[]> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT ${COLUMNS} FROM ownership_flow_history
        WHERE ticker = $1
        ORDER BY observed_date DESC
        LIMIT $2
     ) recent
     ORDER BY observed_date ASC`,
    [ticker, Math.max(1, Math.min(limit, 5_000))]
  );
  return rows.map(mapRow);
}

/** Observasi terbaru untuk BANYAK ticker sekaligus - halaman daftar. */
export async function getLatestObservationsFor(
  tickers: string[]
): Promise<Map<string, OwnershipHistoryRow>> {
  if (tickers.length === 0) return new Map();
  await ensureSharedSchema();
  // DISTINCT ON: satu baris terbaru per ticker dalam satu kali pindai, tanpa
  // N query terpisah untuk N ticker.
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (ticker) ${COLUMNS}
       FROM ownership_flow_history
      WHERE ticker = ANY($1::text[])
      ORDER BY ticker, observed_date DESC`,
    [tickers]
  );
  const map = new Map<string, OwnershipHistoryRow>();
  for (const row of rows) {
    const mapped = mapRow(row);
    map.set(mapped.ticker, mapped);
  }
  return map;
}

export interface OwnershipHistoryStats {
  totalRows: number;
  distinctTickers: number;
  distinctObservedDates: number;
  latestObservedDate: string | null;
  earliestObservedDate: string | null;
  lastFetchedAt: string | null;
  /** Ticker yang punya observasi pada latestObservedDate. */
  tickersOnLatestDate: number;
}

/** Ringkasan untuk panel admin. Satu query - dipanggil dari halaman admin saja. */
export async function getOwnershipHistoryStats(): Promise<OwnershipHistoryStats> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                          AS total_rows,
       COUNT(DISTINCT ticker)::int            AS distinct_tickers,
       COUNT(DISTINCT observed_date)::int     AS distinct_observed_dates,
       MAX(observed_date)                     AS latest_observed_date,
       MIN(observed_date)                     AS earliest_observed_date,
       MAX(fetched_at)                        AS last_fetched_at
     FROM ownership_flow_history`
  );
  const summary = rows[0] ?? {};
  const latest = summary.latest_observed_date == null ? null : toDateKey(summary.latest_observed_date);

  let tickersOnLatestDate = 0;
  if (latest) {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(DISTINCT ticker)::int AS n FROM ownership_flow_history WHERE observed_date = $1::date`,
      [latest]
    );
    tickersOnLatestDate = Number(countRows[0]?.n ?? 0);
  }

  return {
    totalRows: Number(summary.total_rows ?? 0),
    distinctTickers: Number(summary.distinct_tickers ?? 0),
    distinctObservedDates: Number(summary.distinct_observed_dates ?? 0),
    latestObservedDate: latest,
    earliestObservedDate: summary.earliest_observed_date == null ? null : toDateKey(summary.earliest_observed_date),
    lastFetchedAt:
      summary.last_fetched_at instanceof Date
        ? summary.last_fetched_at.toISOString()
        : summary.last_fetched_at == null
          ? null
          : String(summary.last_fetched_at),
    tickersOnLatestDate,
  };
}
