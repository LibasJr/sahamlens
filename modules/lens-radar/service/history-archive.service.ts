import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { currentModelVersionStamp } from '../constants/model-version';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface LensRadarArchiveItem {
  symbol: string;
  price: number;
  totalScore: number;
  marketCap?: number | null;
  coverage?: number | null;
  breakdown?: {
    technical?: number | null;
    fundamental?: number | null;
    flow?: number | null;
  } | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function archiveLensRadarHistory(
  scores: LensRadarArchiveItem[],
  asOfDate = todayDateKeyWIB(),
  db: Queryable = pool
): Promise<number> {
  await ensureSharedSchema();
  const versionStamp = currentModelVersionStamp();
  let saved = 0;
  for (const item of scores) {
    const ticker = typeof item.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
    const lensScore = finiteNumber(item.totalScore);
    const closePrice = finiteNumber(item.price);
    if (!ticker || lensScore == null || closePrice == null || closePrice <= 0) continue;

    await db.query(
      `
      INSERT INTO lens_radar_history (
        date, ticker, lens_score, close_price, market_cap,
        technical_score, fundamental_score, flow_score, coverage_pct,
        score_version, valuation_version, signal_version, data_snapshot_version,
        calculation_timestamp, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
      ON CONFLICT (date, ticker) DO UPDATE SET
        lens_score = EXCLUDED.lens_score,
        close_price = EXCLUDED.close_price,
        market_cap = EXCLUDED.market_cap,
        technical_score = EXCLUDED.technical_score,
        fundamental_score = EXCLUDED.fundamental_score,
        flow_score = EXCLUDED.flow_score,
        coverage_pct = EXCLUDED.coverage_pct,
        score_version = EXCLUDED.score_version,
        valuation_version = EXCLUDED.valuation_version,
        signal_version = EXCLUDED.signal_version,
        data_snapshot_version = EXCLUDED.data_snapshot_version,
        calculation_timestamp = EXCLUDED.calculation_timestamp,
        updated_at = now()
      `,
      [
        asOfDate,
        ticker,
        lensScore,
        closePrice,
        finiteNumber(item.marketCap),
        finiteNumber(item.breakdown?.technical),
        finiteNumber(item.breakdown?.fundamental),
        finiteNumber(item.breakdown?.flow),
        finiteNumber(item.coverage),
        versionStamp.score_version,
        versionStamp.valuation_version,
        versionStamp.signal_version,
        versionStamp.data_snapshot_version,
        versionStamp.calculation_timestamp,
      ]
    );
    saved++;
  }
  return saved;
}
