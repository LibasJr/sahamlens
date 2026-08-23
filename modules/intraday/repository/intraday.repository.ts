import { pool, queryReadWithRetry } from '@/shared/database/postgres.client';
import { ensureIntradaySchema } from '../service/intraday-schema.service';
import type { IntradayHorizon } from '../constants/intraday-model';
import type { IntradaySignal, IntradayOutcome } from '../service/intraday-signal.service';
import type { IntradayDayQuality, IntradayQualityReport } from '../service/intraday-bars.service';

/**
 * Batas keras baris yang boleh ditarik ke memori satu proses. Panel admin ini
 * membaca puluhan ribu baris; tanpa batas, satu backfill yang membengkak akan
 * menjatuhkan proses Node alih-alih memberi tahu bahwa datanya terlalu banyak.
 */
export const MAX_OBSERVATION_ROWS = 200_000;

/** Postgres membatasi 65535 parameter per statement; ini menjaga jarak aman. */
const SIGNAL_BATCH_SIZE = 400;
const OUTCOME_BATCH_SIZE = 400;

export interface IntradaySignalWriteRow {
  signal: IntradaySignal;
  outcomes: IntradayOutcome[];
}

export interface IntradayWriteContext {
  modelVersion: string;
  configHash: string;
  provider: string;
  barInterval: string;
  costVersion: string;
}

export interface UpsertResult {
  signalsWritten: number;
  outcomesWritten: number;
}

/** Hapus SELURUH artefak LensIntraday untuk reset masa testing. Tidak menyentuh tabel modul lain. */
export async function resetIntradayResearchData(): Promise<{
  signalsDeleted: number;
  outcomesDeleted: number;
  qualityRowsDeleted: number;
  validationRunsDeleted: number;
}> {
  await ensureIntradaySchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = await client.query<{
      signals: string;
      outcomes: string;
      quality_rows: string;
      validation_runs: string;
    }>(`
      SELECT
        (SELECT count(*) FROM intraday_signals)::text AS signals,
        (SELECT count(*) FROM intraday_outcomes)::text AS outcomes,
        (SELECT count(*) FROM intraday_data_quality)::text AS quality_rows,
        (SELECT count(*) FROM intraday_validation_runs)::text AS validation_runs
    `);
    await client.query(`
      TRUNCATE TABLE
        intraday_outcomes,
        intraday_signals,
        intraday_data_quality,
        intraday_validation_runs,
        intraday_oos_protocols,
        intraday_weight_proposals,
        intraday_threshold_proposals
      RESTART IDENTITY
    `);
    await client.query('COMMIT');
    const row = counts.rows[0]!;
    return {
      signalsDeleted: Number(row.signals),
      outcomesDeleted: Number(row.outcomes),
      qualityRowsDeleted: Number(row.quality_rows),
      validationRunsDeleted: Number(row.validation_runs),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Idempoten: dijalankan dua kali atas hari yang sama menghasilkan jumlah baris yang
 * sama persis. Konflik di-UPDATE, bukan di-INSERT ulang, sehingga worker aman
 * dijalankan ulang setelah gagal di tengah jalan.
 */
export async function upsertIntradaySignals(
  rows: IntradaySignalWriteRow[],
  context: IntradayWriteContext
): Promise<UpsertResult> {
  await ensureIntradaySchema();
  if (!rows.length) return { signalsWritten: 0, outcomesWritten: 0 };

  let signalsWritten = 0;
  let outcomesWritten = 0;

  for (const batch of chunk(rows, SIGNAL_BATCH_SIZE)) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    batch.forEach((row, i) => {
      const base = i * 12;
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`
      );
      values.push(
        row.signal.ticker,
        row.signal.tradingDate,
        row.signal.signalWibIso,
        row.signal.signalMinute,
        row.signal.score,
        row.signal.bucket,
        JSON.stringify(row.signal.components),
        context.modelVersion,
        context.configHash,
        context.provider,
        context.barInterval,
        new Date().toISOString()
      );
    });

    const inserted = await pool.query<{ id: string; ticker: string; trading_date: string; signal_minute_wib: number }>(
      `INSERT INTO intraday_signals
         (ticker, trading_date, signal_timestamp, signal_minute_wib, signal_score, score_bucket,
          component_snapshot, model_version, config_hash, data_provider, bar_interval, updated_at)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (ticker, trading_date, signal_minute_wib, model_version, config_hash)
       DO UPDATE SET
         signal_score = EXCLUDED.signal_score,
         score_bucket = EXCLUDED.score_bucket,
         component_snapshot = EXCLUDED.component_snapshot,
         signal_timestamp = EXCLUDED.signal_timestamp,
         data_provider = EXCLUDED.data_provider,
         bar_interval = EXCLUDED.bar_interval,
         updated_at = now()
       RETURNING id, ticker, trading_date, signal_minute_wib`,
      values
    );
    signalsWritten += inserted.rowCount ?? 0;

    const idByKey = new Map<string, string>();
    for (const r of inserted.rows) {
      idByKey.set(`${r.ticker}|${r.trading_date}|${r.signal_minute_wib}`, r.id);
    }

    const outcomeRows: Array<{ signalId: string; outcome: IntradayOutcome }> = [];
    for (const row of batch) {
      const signalId = idByKey.get(`${row.signal.ticker}|${row.signal.tradingDate}|${row.signal.signalMinute}`);
      if (!signalId) continue;
      for (const outcome of row.outcomes) outcomeRows.push({ signalId, outcome });
    }

    for (const outcomeBatch of chunk(outcomeRows, OUTCOME_BATCH_SIZE)) {
      const oValues: unknown[] = [];
      const oPlaceholders: string[] = [];
      outcomeBatch.forEach(({ signalId, outcome }, i) => {
        const base = i * 28;
        oPlaceholders.push(
          `(${Array.from({ length: 28 }, (_, k) => `$${base + k + 1}`).join(',')})`
        );
        oValues.push(
          signalId,
          outcome.horizon,
          outcome.entryWibIso,
          outcome.entryPrice,
          outcome.entryPriceRaw,
          outcome.exitWibIso,
          outcome.exitPrice,
          outcome.exitPriceRaw,
          outcome.grossReturn,
          outcome.netReturn,
          outcome.totalCost,
          outcome.mfe,
          outcome.mae,
          outcome.minutesToMfe,
          outcome.minutesToMae,
          outcome.exitReason,
          outcome.fillStatus,
          outcome.hitTakeProfit,
          outcome.hitStopLoss,
          outcome.dataQualityStatus,
          context.costVersion,
          outcome.slippageBpsApplied,
          outcome.spreadFloorBinding,
          outcome.tradable,
          outcome.entrySlippageBpsApplied,
          outcome.exitSlippageBpsApplied,
          outcome.entrySpreadFloorBinding,
          outcome.exitSpreadFloorBinding,
        );
      });

      const res = await pool.query(
        `INSERT INTO intraday_outcomes
           (signal_id, horizon, entry_timestamp, entry_price, entry_price_raw, exit_timestamp, exit_price,
            exit_price_raw, gross_return, net_return, total_cost, mfe, mae, minutes_to_mfe, minutes_to_mae,
            exit_reason, fill_status, hit_take_profit, hit_stop_loss, data_quality_status, cost_version,
            slippage_bps_applied, spread_floor_binding, tradable,
            entry_slippage_bps_applied, exit_slippage_bps_applied,
            entry_spread_floor_binding, exit_spread_floor_binding)
         VALUES ${oPlaceholders.join(',')}
         ON CONFLICT (signal_id, horizon)
         DO UPDATE SET
           entry_timestamp = EXCLUDED.entry_timestamp,
           entry_price = EXCLUDED.entry_price,
           entry_price_raw = EXCLUDED.entry_price_raw,
           exit_timestamp = EXCLUDED.exit_timestamp,
           exit_price = EXCLUDED.exit_price,
           exit_price_raw = EXCLUDED.exit_price_raw,
           gross_return = EXCLUDED.gross_return,
           net_return = EXCLUDED.net_return,
           total_cost = EXCLUDED.total_cost,
           mfe = EXCLUDED.mfe,
           mae = EXCLUDED.mae,
           minutes_to_mfe = EXCLUDED.minutes_to_mfe,
           minutes_to_mae = EXCLUDED.minutes_to_mae,
           exit_reason = EXCLUDED.exit_reason,
           fill_status = EXCLUDED.fill_status,
           hit_take_profit = EXCLUDED.hit_take_profit,
           hit_stop_loss = EXCLUDED.hit_stop_loss,
           data_quality_status = EXCLUDED.data_quality_status,
           cost_version = EXCLUDED.cost_version,
           slippage_bps_applied = EXCLUDED.slippage_bps_applied,
           spread_floor_binding = EXCLUDED.spread_floor_binding,
           tradable = EXCLUDED.tradable,
           entry_slippage_bps_applied = EXCLUDED.entry_slippage_bps_applied,
           exit_slippage_bps_applied = EXCLUDED.exit_slippage_bps_applied,
           entry_spread_floor_binding = EXCLUDED.entry_spread_floor_binding,
           exit_spread_floor_binding = EXCLUDED.exit_spread_floor_binding,
           matured_at = COALESCE(intraday_outcomes.matured_at, now()),
           updated_at = now()`,
        oValues
      );
      outcomesWritten += res.rowCount ?? 0;
    }
  }

  return { signalsWritten, outcomesWritten };
}

export async function upsertIntradayDataQuality(
  ticker: string,
  report: IntradayQualityReport,
  retrievedAt: string,
  fetchError: string | null
): Promise<number> {
  await ensureIntradaySchema();
  const days: IntradayDayQuality[] = report.days;
  if (!days.length) return 0;

  let written = 0;
  for (const batch of chunk(days, 200)) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    batch.forEach((day, i) => {
      const base = i * 15;
      placeholders.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`
      );
      values.push(
        ticker,
        day.tradingDate,
        report.provider,
        report.interval,
        day.expectedBars,
        day.validBars,
        day.missingBars,
        report.rejectedByReason.DUPLICATE_TIMESTAMP,
        report.rejectedByReason.HIGH_BELOW_LOW +
          report.rejectedByReason.OPEN_CLOSE_OUTSIDE_RANGE +
          report.rejectedByReason.NON_POSITIVE_PRICE +
          report.rejectedByReason.NEGATIVE_VOLUME,
        day.zeroVolumeBars,
        day.completenessPct,
        day.status,
        day.maxAbsBarMovePct,
        retrievedAt,
        fetchError
      );
    });

    const res = await pool.query(
      `INSERT INTO intraday_data_quality
         (ticker, trading_date, provider, bar_interval, expected_bars, valid_bars, missing_bars,
          duplicate_bars, invalid_ohlc_bars, zero_volume_bars, completeness_pct, status,
          max_abs_bar_move_pct, retrieved_at, fetch_error)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (ticker, trading_date, provider, bar_interval)
       DO UPDATE SET
         expected_bars = EXCLUDED.expected_bars,
         valid_bars = EXCLUDED.valid_bars,
         missing_bars = EXCLUDED.missing_bars,
         duplicate_bars = EXCLUDED.duplicate_bars,
         invalid_ohlc_bars = EXCLUDED.invalid_ohlc_bars,
         zero_volume_bars = EXCLUDED.zero_volume_bars,
         completeness_pct = EXCLUDED.completeness_pct,
         status = EXCLUDED.status,
         max_abs_bar_move_pct = EXCLUDED.max_abs_bar_move_pct,
         retrieved_at = EXCLUDED.retrieved_at,
         fetch_error = EXCLUDED.fetch_error,
         updated_at = now()`,
      values
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------

export interface ObservationRow {
  ticker: string;
  tradingDate: string;
  signalMinute: number;
  signalTimestamp: string;
  score: number;
  bucket: string;
  horizon: string;
  netReturn: number | null;
  grossReturn: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  entryPriceRaw: number | null;
  exitPriceRaw: number | null;
  mfe: number | null;
  mae: number | null;
  exitReason: string;
  fillStatus: string;
  /** Waktu eksekusi tersimpan - dipakai audit look-ahead di panel validasi. null = baris lama. */
  entryTimestamp: string | null;
  exitTimestamp: string | null;
  /** null = baris diarsipkan sebelum kolom ada. Bukan false. */
  tradable: boolean | null;
  spreadFloorBinding: boolean | null;
  slippageBpsApplied: number | null;
  turnoverIdr: number;
  sector: string | null;
  /** Nilai 0-100 tiap komponen pada signal_timestamp - dipakai weight optimizer. */
  componentScores: Record<string, number> | null;
}

export interface LoadObservationsFilter {
  modelVersion: string;
  configHash: string;
  horizon?: IntradayHorizon;
  fromDate?: string;
  toDate?: string;
  /** Hanya sinyal yang dibuat setelah instan ini - dipakai genuine forward OOS. */
  signalAfter?: string;
  limit?: number;
}

/** Sampel terbaru untuk audit visual admin. Ini bukan feed sinyal dan tidak pernah dipakai menu publik. */
export interface RecentIntradaySample {
  ticker: string;
  tradingDate: string;
  signalTimestamp: string;
  signalMinute: number;
  score: number;
  horizon: string;
  entryPriceRaw: number | null;
  exitPriceRaw: number | null;
  netReturn: number | null;
  exitReason: string;
  tradable: boolean | null;
}

export async function listRecentIntradaySamples(
  modelVersion: string,
  configHash: string,
  limit = 20,
): Promise<RecentIntradaySample[]> {
  await ensureIntradaySchema();
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const res = await queryReadWithRetry<{
    ticker: string;
    trading_date: string;
    signal_timestamp: Date;
    signal_minute_wib: number;
    signal_score: string;
    horizon: string;
    entry_price_raw: string | null;
    exit_price_raw: string | null;
    net_return: string | null;
    exit_reason: string;
    tradable: boolean | null;
  }>(
    `SELECT s.ticker, s.trading_date, s.signal_timestamp, s.signal_minute_wib, s.signal_score,
            o.horizon, o.entry_price_raw, o.exit_price_raw, o.net_return, o.exit_reason, o.tradable
     FROM intraday_signals s
     JOIN intraday_outcomes o ON o.signal_id = s.id
     WHERE s.model_version = $1 AND s.config_hash = $2
       AND o.horizon = 'H30' AND o.fill_status = 'FILLED'
     ORDER BY s.trading_date DESC, s.signal_minute_wib DESC, s.ticker ASC
     LIMIT $3`,
    [modelVersion, configHash, safeLimit],
  );
  return res.rows.map((row) => ({
    ticker: row.ticker,
    tradingDate: row.trading_date,
    signalTimestamp: row.signal_timestamp instanceof Date ? row.signal_timestamp.toISOString() : String(row.signal_timestamp),
    signalMinute: row.signal_minute_wib,
    score: Number(row.signal_score),
    horizon: row.horizon,
    entryPriceRaw: row.entry_price_raw == null ? null : Number(row.entry_price_raw),
    exitPriceRaw: row.exit_price_raw == null ? null : Number(row.exit_price_raw),
    netReturn: row.net_return == null ? null : Number(row.net_return),
    exitReason: row.exit_reason,
    tradable: row.tradable,
  }));
}

export async function loadIntradayObservations(filter: LoadObservationsFilter): Promise<{
  rows: ObservationRow[];
  truncated: boolean;
}> {
  await ensureIntradaySchema();
  const limit = Math.min(filter.limit ?? MAX_OBSERVATION_ROWS, MAX_OBSERVATION_ROWS);
  const params: unknown[] = [filter.modelVersion, filter.configHash];
  const where: string[] = ['s.model_version = $1', 's.config_hash = $2'];

  if (filter.horizon) {
    params.push(filter.horizon);
    where.push(`o.horizon = $${params.length}`);
  }
  if (filter.fromDate) {
    params.push(filter.fromDate);
    where.push(`s.trading_date >= $${params.length}`);
  }
  if (filter.toDate) {
    params.push(filter.toDate);
    where.push(`s.trading_date <= $${params.length}`);
  }
  if (filter.signalAfter) {
    params.push(filter.signalAfter);
    where.push(`s.signal_timestamp > $${params.length}`);
  }
  params.push(limit + 1);

  // Sektor diambil dari arsip point-in-time fundamental_history yang SUDAH ada
  // (kolom yahoo_sector). Tabel itu hanya DIBACA - tidak ada tulisan apa pun ke sana.
  const res = await queryReadWithRetry<{
    ticker: string;
    trading_date: string;
    signal_minute_wib: number;
    signal_timestamp: Date;
    signal_score: string;
    score_bucket: string;
    horizon: string;
    net_return: string | null;
    gross_return: string | null;
    entry_price: string | null;
    exit_price: string | null;
    entry_price_raw: string | null;
    exit_price_raw: string | null;
    mfe: string | null;
    mae: string | null;
    exit_reason: string;
    fill_status: string;
    entry_timestamp: Date | string | null;
    exit_timestamp: Date | string | null;
    tradable: boolean | null;
    spread_floor_binding: boolean | null;
    slippage_bps_applied: string | null;
    component_snapshot: { sessionTurnoverIdr?: number; scored?: Record<string, number> } | null;
    sector: string | null;
  }>(
    `WITH latest_sector AS (
       SELECT DISTINCT ON (ticker) ticker, yahoo_sector
       FROM fundamental_history
       WHERE yahoo_sector IS NOT NULL
       ORDER BY ticker, observed_date DESC
     )
     SELECT s.ticker, s.trading_date, s.signal_minute_wib, s.signal_timestamp, s.signal_score,
            s.score_bucket, s.component_snapshot,
            o.horizon, o.net_return, o.gross_return, o.entry_price, o.exit_price,
            o.entry_price_raw, o.exit_price_raw, o.mfe, o.mae,
            o.entry_timestamp, o.exit_timestamp,
            o.exit_reason, o.fill_status, o.tradable, o.spread_floor_binding, o.slippage_bps_applied,
            ls.yahoo_sector AS sector
     FROM intraday_signals s
     JOIN intraday_outcomes o ON o.signal_id = s.id
     LEFT JOIN latest_sector ls ON ls.ticker = s.ticker
     WHERE ${where.join(' AND ')}
     ORDER BY s.trading_date, s.ticker, s.signal_minute_wib, o.horizon
     LIMIT $${params.length}`,
    params
  );

  const truncated = res.rows.length > limit;
  const rows = (truncated ? res.rows.slice(0, limit) : res.rows).map((r) => ({
    ticker: r.ticker,
    tradingDate: r.trading_date,
    signalMinute: r.signal_minute_wib,
    signalTimestamp: r.signal_timestamp instanceof Date ? r.signal_timestamp.toISOString() : String(r.signal_timestamp),
    score: Number(r.signal_score),
    bucket: r.score_bucket,
    horizon: r.horizon,
    netReturn: r.net_return == null ? null : Number(r.net_return),
    grossReturn: r.gross_return == null ? null : Number(r.gross_return),
    entryPrice: r.entry_price == null ? null : Number(r.entry_price),
    exitPrice: r.exit_price == null ? null : Number(r.exit_price),
    entryPriceRaw: r.entry_price_raw == null ? null : Number(r.entry_price_raw),
    exitPriceRaw: r.exit_price_raw == null ? null : Number(r.exit_price_raw),
    mfe: r.mfe == null ? null : Number(r.mfe),
    mae: r.mae == null ? null : Number(r.mae),
    exitReason: r.exit_reason,
    fillStatus: r.fill_status,
    entryTimestamp: r.entry_timestamp == null ? null : (r.entry_timestamp instanceof Date ? r.entry_timestamp.toISOString() : String(r.entry_timestamp)),
    exitTimestamp: r.exit_timestamp == null ? null : (r.exit_timestamp instanceof Date ? r.exit_timestamp.toISOString() : String(r.exit_timestamp)),
    tradable: r.tradable,
    spreadFloorBinding: r.spread_floor_binding,
    slippageBpsApplied: r.slippage_bps_applied == null ? null : Number(r.slippage_bps_applied),
    turnoverIdr: Number(r.component_snapshot?.sessionTurnoverIdr ?? 0),
    sector: r.sector,
    componentScores: r.component_snapshot?.scored ?? null,
  }));

  return { rows, truncated };
}

export interface IntradayCoverage {
  totalSignals: number;
  totalOutcomes: number;
  filledOutcomes: number;
  distinctTickers: number;
  distinctTradingDays: number;
  firstTradingDate: string | null;
  lastTradingDate: string | null;
  lastSignalTimestamp: string | null;
}

export async function getIntradayCoverage(
  modelVersion: string,
  configHash: string,
  /** Kalau diisi, hanya sinyal SETELAH instan ini yang dihitung - dipakai progres OOS. */
  signalAfter?: string | null
): Promise<IntradayCoverage> {
  await ensureIntradaySchema();
  const params: unknown[] = [modelVersion, configHash];
  let signalAfterClause = '';
  if (signalAfter) {
    params.push(signalAfter);
    signalAfterClause = ` AND s.signal_timestamp > $${params.length}`;
  }
  const res = await queryReadWithRetry<{
    total_signals: string;
    total_outcomes: string;
    filled_outcomes: string;
    distinct_tickers: string;
    distinct_days: string;
    first_date: string | null;
    last_date: string | null;
    last_signal: Date | null;
  }>(
    `SELECT
       COUNT(DISTINCT s.id) AS total_signals,
       COUNT(o.*) AS total_outcomes,
       COUNT(o.*) FILTER (WHERE o.fill_status = 'FILLED') AS filled_outcomes,
       COUNT(DISTINCT s.ticker) AS distinct_tickers,
       COUNT(DISTINCT s.trading_date) AS distinct_days,
       MIN(s.trading_date) AS first_date,
       MAX(s.trading_date) AS last_date,
       MAX(s.signal_timestamp) AS last_signal
     FROM intraday_signals s
     LEFT JOIN intraday_outcomes o ON o.signal_id = s.id
     WHERE s.model_version = $1 AND s.config_hash = $2${signalAfterClause}`,
    params
  );
  const row = res.rows[0];
  return {
    totalSignals: Number(row?.total_signals ?? 0),
    totalOutcomes: Number(row?.total_outcomes ?? 0),
    filledOutcomes: Number(row?.filled_outcomes ?? 0),
    distinctTickers: Number(row?.distinct_tickers ?? 0),
    distinctTradingDays: Number(row?.distinct_days ?? 0),
    firstTradingDate: row?.first_date ?? null,
    lastTradingDate: row?.last_date ?? null,
    lastSignalTimestamp: row?.last_signal ? new Date(row.last_signal).toISOString() : null,
  };
}

export interface DataQualitySummary {
  tickersTracked: number;
  daysTracked: number;
  totalExpectedBars: number;
  totalValidBars: number;
  totalMissingBars: number;
  totalDuplicateBars: number;
  totalInvalidOhlcBars: number;
  /** Baris (ticker, hari) yang hari bursanya berjalan tetapi tidak punya satu bar pun. */
  missingDayRows: number;
  completenessPct: number | null;
  problemTickers: Array<{ ticker: string; badDays: number; worstStatus: string }>;
  problemDates: Array<{ tradingDate: string; badTickers: number }>;
  lastRetrievedAt: string | null;
  lastFetchError: { ticker: string; error: string; at: string } | null;
}

export async function getIntradayDataQualitySummary(): Promise<DataQualitySummary> {
  await ensureIntradaySchema();
  const [totals, byTicker, byDate, lastError] = await Promise.all([
    queryReadWithRetry<{
      tickers: string;
      days: string;
      expected: string | null;
      valid: string | null;
      missing: string | null;
      duplicate: string | null;
      invalid_ohlc: string | null;
      last_retrieved: Date | null;
      missing_days: string | null;
    }>(
      `SELECT COUNT(DISTINCT ticker) AS tickers, COUNT(DISTINCT trading_date) AS days,
              SUM(expected_bars) AS expected, SUM(valid_bars) AS valid, SUM(missing_bars) AS missing,
              SUM(duplicate_bars) AS duplicate, SUM(invalid_ohlc_bars) AS invalid_ohlc,
              COUNT(*) FILTER (WHERE status = 'MISSING_DAY') AS missing_days,
              MAX(retrieved_at) AS last_retrieved
       FROM intraday_data_quality`
    ),
    queryReadWithRetry<{ ticker: string; bad_days: string; worst_status: string }>(
      `SELECT ticker, COUNT(*) AS bad_days, MIN(status) AS worst_status
       FROM intraday_data_quality
       WHERE status <> 'OK'
       GROUP BY ticker
       ORDER BY COUNT(*) DESC
       LIMIT 25`
    ),
    queryReadWithRetry<{ trading_date: string; bad_tickers: string }>(
      `SELECT trading_date, COUNT(*) AS bad_tickers
       FROM intraday_data_quality
       WHERE status <> 'OK'
       GROUP BY trading_date
       ORDER BY COUNT(*) DESC
       LIMIT 25`
    ),
    queryReadWithRetry<{ ticker: string; fetch_error: string; retrieved_at: Date }>(
      `SELECT ticker, fetch_error, retrieved_at
       FROM intraday_data_quality
       WHERE fetch_error IS NOT NULL
       ORDER BY retrieved_at DESC
       LIMIT 1`
    ),
  ]);

  const t = totals.rows[0];
  const expected = Number(t?.expected ?? 0);
  const valid = Number(t?.valid ?? 0);
  const err = lastError.rows[0];

  return {
    tickersTracked: Number(t?.tickers ?? 0),
    daysTracked: Number(t?.days ?? 0),
    totalExpectedBars: expected,
    totalValidBars: valid,
    totalMissingBars: Number(t?.missing ?? 0),
    totalDuplicateBars: Number(t?.duplicate ?? 0),
    totalInvalidOhlcBars: Number(t?.invalid_ohlc ?? 0),
    missingDayRows: Number(t?.missing_days ?? 0),
    completenessPct: expected > 0 ? Math.round((valid / expected) * 10000) / 100 : null,
    problemTickers: byTicker.rows.map((r) => ({ ticker: r.ticker, badDays: Number(r.bad_days), worstStatus: r.worst_status })),
    problemDates: byDate.rows.map((r) => ({ tradingDate: r.trading_date, badTickers: Number(r.bad_tickers) })),
    lastRetrievedAt: t?.last_retrieved ? new Date(t.last_retrieved).toISOString() : null,
    lastFetchError: err ? { ticker: err.ticker, error: err.fetch_error, at: new Date(err.retrieved_at).toISOString() } : null,
  };
}

// ---------------------------------------------------------------------------
// Validation runs
// ---------------------------------------------------------------------------

export async function startValidationRun(input: {
  modelVersion: string;
  configHash: string;
  protocolVersion: string | null;
  triggeredBy: string;
}): Promise<number> {
  await ensureIntradaySchema();
  const res = await pool.query<{ run_id: string }>(
    `INSERT INTO intraday_validation_runs (model_version, config_hash, protocol_version, status, triggered_by)
     VALUES ($1, $2, $3, 'RUNNING', $4)
     RETURNING run_id`,
    [input.modelVersion, input.configHash, input.protocolVersion, input.triggeredBy]
  );
  return Number(res.rows[0]!.run_id);
}

export async function finishValidationRun(
  runId: number,
  input: {
    status: string;
    datasetHash: string | null;
    sampleRaw: number;
    sampleEffective: number;
    result: unknown;
    errorMessage?: string | null;
  }
): Promise<void> {
  await pool.query(
    `UPDATE intraday_validation_runs
     SET status = $2, dataset_hash = $3, sample_raw = $4, sample_effective = $5,
         result = $6, error_message = $7, completed_at = now()
     WHERE run_id = $1`,
    [
      runId,
      input.status,
      input.datasetHash,
      input.sampleRaw,
      input.sampleEffective,
      input.result == null ? null : JSON.stringify(input.result),
      input.errorMessage ?? null,
    ]
  );
}

export interface ValidationRunRow {
  runId: number;
  datasetHash: string | null;
  modelVersion: string;
  configHash: string;
  protocolVersion: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  sampleRaw: number;
  sampleEffective: number;
  errorMessage: string | null;
  triggeredBy: string | null;
}

export async function listValidationRuns(limit = 20, offset = 0): Promise<ValidationRunRow[]> {
  await ensureIntradaySchema();
  const res = await queryReadWithRetry<any>(
    `SELECT run_id, dataset_hash, model_version, config_hash, protocol_version, started_at,
            completed_at, status, sample_raw, sample_effective, error_message, triggered_by
     FROM intraday_validation_runs
     ORDER BY started_at DESC
     LIMIT $1 OFFSET $2`,
    [Math.min(limit, 100), Math.max(0, offset)]
  );
  return res.rows.map((r) => ({
    runId: Number(r.run_id),
    datasetHash: r.dataset_hash,
    modelVersion: r.model_version,
    configHash: r.config_hash,
    protocolVersion: r.protocol_version,
    startedAt: new Date(r.started_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    status: r.status,
    sampleRaw: Number(r.sample_raw),
    sampleEffective: Number(r.sample_effective),
    errorMessage: r.error_message,
    triggeredBy: r.triggered_by,
  }));
}

export async function getLatestValidationRunResult(): Promise<{ row: ValidationRunRow; result: unknown } | null> {
  await ensureIntradaySchema();
  const res = await queryReadWithRetry<any>(
    `SELECT run_id, dataset_hash, model_version, config_hash, protocol_version, started_at,
            completed_at, status, sample_raw, sample_effective, error_message, triggered_by, result
     FROM intraday_validation_runs
     WHERE status <> 'RUNNING'
     ORDER BY started_at DESC
     LIMIT 1`
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    row: {
      runId: Number(r.run_id),
      datasetHash: r.dataset_hash,
      modelVersion: r.model_version,
      configHash: r.config_hash,
      protocolVersion: r.protocol_version,
      startedAt: new Date(r.started_at).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      status: r.status,
      sampleRaw: Number(r.sample_raw),
      sampleEffective: Number(r.sample_effective),
      errorMessage: r.error_message,
      triggeredBy: r.triggered_by,
    },
    result: r.result,
  };
}

// ---------------------------------------------------------------------------
// Protokol OOS
// ---------------------------------------------------------------------------

export interface OosProtocolRow {
  protocolVersion: string;
  freezeTimestamp: string;
  modelVersion: string;
  configHash: string;
  status: string;
  scoreFormula: unknown;
  weights: unknown;
  thresholds: unknown;
  entryExitRules: unknown;
  costConfig: unknown;
  acceptanceCriteria: unknown;
  frozenBy: string | null;
}

function mapProtocol(r: any): OosProtocolRow {
  return {
    protocolVersion: r.protocol_version,
    freezeTimestamp: new Date(r.freeze_timestamp).toISOString(),
    modelVersion: r.model_version,
    configHash: r.config_hash,
    status: r.status,
    scoreFormula: r.score_formula,
    weights: r.weights,
    thresholds: r.thresholds,
    entryExitRules: r.entry_exit_rules,
    costConfig: r.cost_config,
    acceptanceCriteria: r.acceptance_criteria,
    frozenBy: r.frozen_by,
  };
}

export async function getActiveOosProtocol(): Promise<OosProtocolRow | null> {
  await ensureIntradaySchema();
  const res = await queryReadWithRetry<any>(
    `SELECT * FROM intraday_oos_protocols ORDER BY freeze_timestamp DESC LIMIT 1`
  );
  return res.rows[0] ? mapProtocol(res.rows[0]) : null;
}

export async function listOosProtocols(limit = 20): Promise<OosProtocolRow[]> {
  await ensureIntradaySchema();
  const res = await queryReadWithRetry<any>(
    `SELECT * FROM intraday_oos_protocols ORDER BY freeze_timestamp DESC LIMIT $1`,
    [Math.min(limit, 100)]
  );
  return res.rows.map(mapProtocol);
}

/**
 * INSERT saja - TIDAK ADA UPDATE. Protokol yang sudah dibekukan tidak bisa disunting
 * lewat jalur mana pun di kode ini; konflik protocol_version ditolak sebagai konflik,
 * bukan diam-diam menimpa baris lama.
 */
export async function insertOosProtocol(input: {
  protocolVersion: string;
  freezeTimestamp: string;
  modelVersion: string;
  configHash: string;
  scoreFormula: unknown;
  weights: unknown;
  thresholds: unknown;
  entryExitRules: unknown;
  costConfig: unknown;
  acceptanceCriteria: unknown;
  frozenBy: string;
}): Promise<{ inserted: boolean }> {
  await ensureIntradaySchema();
  const res = await pool.query(
    `INSERT INTO intraday_oos_protocols
       (protocol_version, freeze_timestamp, model_version, config_hash, status, score_formula,
        weights, thresholds, entry_exit_rules, cost_config, acceptance_criteria, frozen_by)
     VALUES ($1, $2, $3, $4, 'FROZEN', $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (protocol_version) DO NOTHING`,
    [
      input.protocolVersion,
      input.freezeTimestamp,
      input.modelVersion,
      input.configHash,
      JSON.stringify(input.scoreFormula),
      JSON.stringify(input.weights),
      JSON.stringify(input.thresholds),
      JSON.stringify(input.entryExitRules),
      JSON.stringify(input.costConfig),
      JSON.stringify(input.acceptanceCriteria),
      input.frozenBy,
    ]
  );
  return { inserted: (res.rowCount ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// Proposal bobot & ambang
// ---------------------------------------------------------------------------

export async function insertWeightProposal(input: {
  modelVersion: string;
  configHash: string;
  currentWeights: unknown;
  proposedWeights: unknown;
  trainResult: unknown;
  validationResult: unknown;
  testResult: unknown;
  status: string;
  reason: string | null;
}): Promise<number> {
  await ensureIntradaySchema();
  const res = await pool.query<{ proposal_id: string }>(
    `INSERT INTO intraday_weight_proposals
       (model_version, config_hash, current_weights, proposed_weights, train_result,
        validation_result, test_result, status, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING proposal_id`,
    [
      input.modelVersion,
      input.configHash,
      JSON.stringify(input.currentWeights),
      input.proposedWeights == null ? null : JSON.stringify(input.proposedWeights),
      input.trainResult == null ? null : JSON.stringify(input.trainResult),
      input.validationResult == null ? null : JSON.stringify(input.validationResult),
      input.testResult == null ? null : JSON.stringify(input.testResult),
      input.status,
      input.reason,
    ]
  );
  return Number(res.rows[0]!.proposal_id);
}

export async function getLatestWeightProposal(): Promise<any | null> {
  await ensureIntradaySchema();
  const res = await queryReadWithRetry<any>(
    `SELECT * FROM intraday_weight_proposals ORDER BY created_at DESC LIMIT 1`
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    proposalId: Number(r.proposal_id),
    modelVersion: r.model_version,
    configHash: r.config_hash,
    currentWeights: r.current_weights,
    proposedWeights: r.proposed_weights,
    trainResult: r.train_result,
    validationResult: r.validation_result,
    testResult: r.test_result,
    status: r.status,
    reason: r.reason,
    createdAt: new Date(r.created_at).toISOString(),
    approvedBy: r.approved_by,
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
  };
}

export async function insertThresholdProposal(input: {
  modelVersion: string;
  configHash: string;
  proposedThreshold: number;
  selectionResult: unknown;
  status: string;
  reason: string | null;
}): Promise<number> {
  await ensureIntradaySchema();
  const res = await pool.query<{ proposal_id: string }>(
    `INSERT INTO intraday_threshold_proposals
       (model_version, config_hash, proposed_threshold, selection_result, status, reason)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING proposal_id`,
    [
      input.modelVersion,
      input.configHash,
      input.proposedThreshold,
      JSON.stringify(input.selectionResult),
      input.status,
      input.reason,
    ]
  );
  return Number(res.rows[0]!.proposal_id);
}

export async function getLatestThresholdProposal(): Promise<any | null> {
  await ensureIntradaySchema();
  const res = await queryReadWithRetry<any>(
    `SELECT * FROM intraday_threshold_proposals ORDER BY created_at DESC LIMIT 1`
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    proposalId: Number(r.proposal_id),
    modelVersion: r.model_version,
    configHash: r.config_hash,
    proposedThreshold: Number(r.proposed_threshold),
    selectionResult: r.selection_result,
    status: r.status,
    reason: r.reason,
    createdAt: new Date(r.created_at).toISOString(),
    approvedBy: r.approved_by,
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
  };
}
