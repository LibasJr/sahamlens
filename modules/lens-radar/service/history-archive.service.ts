import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { currentModelVersionStamp } from '../constants/model-version';
import { PRICE_ADJUSTMENT_VERSION, TRADING_PRICE_BASIS, type CorporateActionStatus, type PriceBasis } from '@/shared/market/price-basis';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface LensRadarArchiveItem {
  symbol: string;
  price: number;
  rawPrice?: number | null;
  adjustedPrice?: number | null;
  priceBasis?: PriceBasis | null;
  adjustmentFactor?: number | null;
  corporateActionStatus?: CorporateActionStatus | null;
  priceDataTimestamp?: string | null;
  priceDataVersion?: string | null;
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
    const rawClosePrice = finiteNumber(item.rawPrice) ?? closePrice;
    const adjustedClosePrice = finiteNumber(item.adjustedPrice);
    const adjustmentFactor = finiteNumber(item.adjustmentFactor);
    if (!ticker || lensScore == null || closePrice == null || closePrice <= 0) continue;

    await db.query(
      `
      INSERT INTO lens_radar_history (
        date, ticker, lens_score, close_price, market_cap,
        technical_score, fundamental_score, flow_score, coverage_pct,
        score_version, valuation_version, signal_version, data_snapshot_version,
        calculation_timestamp,
        raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
        corporate_action_status, price_data_timestamp, price_data_version,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())
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
        raw_close_price = EXCLUDED.raw_close_price,
        adjusted_close_price = EXCLUDED.adjusted_close_price,
        price_basis = EXCLUDED.price_basis,
        adjustment_factor = EXCLUDED.adjustment_factor,
        corporate_action_status = EXCLUDED.corporate_action_status,
        price_data_timestamp = EXCLUDED.price_data_timestamp,
        price_data_version = EXCLUDED.price_data_version,
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
        rawClosePrice,
        adjustedClosePrice,
        item.priceBasis ?? TRADING_PRICE_BASIS,
        adjustmentFactor,
        item.corporateActionStatus ?? 'NONE',
        item.priceDataTimestamp ?? versionStamp.calculation_timestamp,
        item.priceDataVersion ?? PRICE_ADJUSTMENT_VERSION,
      ]
    );
    saved++;
  }
  return saved;
}
