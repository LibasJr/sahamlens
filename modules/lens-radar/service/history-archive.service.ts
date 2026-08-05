import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';

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
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      ON CONFLICT (date, ticker) DO UPDATE SET
        lens_score = EXCLUDED.lens_score,
        close_price = EXCLUDED.close_price,
        market_cap = EXCLUDED.market_cap,
        technical_score = EXCLUDED.technical_score,
        fundamental_score = EXCLUDED.fundamental_score,
        flow_score = EXCLUDED.flow_score,
        coverage_pct = EXCLUDED.coverage_pct,
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
      ]
    );
    saved++;
  }
  return saved;
}
