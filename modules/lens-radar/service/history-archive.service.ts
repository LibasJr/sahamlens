import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { currentModelVersionStamp } from '../constants/model-version';
import { PRICE_ADJUSTMENT_VERSION, TRADING_PRICE_BASIS, type CorporateActionStatus, type PriceBasis } from '@/shared/market/price-basis';
import { ACTIVE_LIQUID_UNIVERSE_VERSION } from '@/modules/market/constants/ai-pick-universe';

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
  /** ADV20 rupiah pada tanggal scan. Gerbang likuiditas backtest membaca kolom ini. */
  avgValue20d?: number | null;
  coverage?: number | null;
  eligibilityStatus?: string | null;
  eligibilityReasons?: string[] | null;
  availableMax?: {
    technical?: number | null;
    fundamental?: number | null;
    flow?: number | null;
  } | null;
  universeEligible?: boolean | null;
  universeReasonCodes?: string[] | null;
  universeAvgClose63d?: number | null;
  universeAvgValue63d?: number | null;
  universeAnnualVolPct?: number | null;
  universeMethodVersion?: string | null;
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
        score_version, score_config_hash, universe_version, valuation_version, signal_version, data_snapshot_version,
        calculation_timestamp,
        raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
        corporate_action_status, price_data_timestamp, price_data_version,
        avg_value_20d, eligibility_status, eligibility_reason_codes,
        technical_available_max, fundamental_available_max, flow_available_max,
        universe_eligible, universe_reason_codes, universe_avg_close_63d,
        universe_avg_value_63d, universe_annual_vol_pct, universe_method_version,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, now())
      ON CONFLICT (date, ticker, score_version, score_config_hash, universe_version) DO UPDATE SET
        lens_score = EXCLUDED.lens_score,
        close_price = EXCLUDED.close_price,
        market_cap = EXCLUDED.market_cap,
        technical_score = EXCLUDED.technical_score,
        fundamental_score = EXCLUDED.fundamental_score,
        flow_score = EXCLUDED.flow_score,
        coverage_pct = EXCLUDED.coverage_pct,
        score_version = EXCLUDED.score_version,
        score_config_hash = EXCLUDED.score_config_hash,
        universe_version = EXCLUDED.universe_version,
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
        avg_value_20d = EXCLUDED.avg_value_20d,
        eligibility_status = EXCLUDED.eligibility_status,
        eligibility_reason_codes = EXCLUDED.eligibility_reason_codes,
        technical_available_max = EXCLUDED.technical_available_max,
        fundamental_available_max = EXCLUDED.fundamental_available_max,
        flow_available_max = EXCLUDED.flow_available_max,
        universe_eligible = EXCLUDED.universe_eligible,
        universe_reason_codes = EXCLUDED.universe_reason_codes,
        universe_avg_close_63d = EXCLUDED.universe_avg_close_63d,
        universe_avg_value_63d = EXCLUDED.universe_avg_value_63d,
        universe_annual_vol_pct = EXCLUDED.universe_annual_vol_pct,
        universe_method_version = EXCLUDED.universe_method_version,
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
        versionStamp.score_config_hash,
        ACTIVE_LIQUID_UNIVERSE_VERSION,
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
        finiteNumber(item.avgValue20d),
        typeof item.eligibilityStatus === 'string' ? item.eligibilityStatus : null,
        Array.isArray(item.eligibilityReasons) && item.eligibilityReasons.length ? item.eligibilityReasons.join(',') : null,
        finiteNumber(item.availableMax?.technical),
        finiteNumber(item.availableMax?.fundamental),
        finiteNumber(item.availableMax?.flow),
        typeof item.universeEligible === 'boolean' ? item.universeEligible : null,
        Array.isArray(item.universeReasonCodes) && item.universeReasonCodes.length ? item.universeReasonCodes.join(',') : null,
        finiteNumber(item.universeAvgClose63d),
        finiteNumber(item.universeAvgValue63d),
        finiteNumber(item.universeAnnualVolPct),
        typeof item.universeMethodVersion === 'string' ? item.universeMethodVersion : null,
      ]
    );
    saved++;
  }
  return saved;
}
