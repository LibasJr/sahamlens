export type PriceBasis = 'RAW' | 'SPLIT_ADJUSTED' | 'TOTAL_RETURN_ADJUSTED' | 'UNKNOWN';

export type PriceBasisErrorCode =
  | 'OK'
  | 'PRICE_BASIS_MISMATCH'
  | 'MISSING_RAW_PRICE'
  | 'MISSING_ADJUSTED_PRICE'
  | 'INVALID_ADJUSTMENT_FACTOR'
  | 'UNRESOLVED_CORPORATE_ACTION'
  | 'LEGACY_UNKNOWN_PRICE_BASIS'
  | 'UNSUPPORTED_PRICE_BASIS'
  | 'INCONSISTENT_OHLC_BASIS';

export type AdjustmentStatus =
  | 'ADJUSTED_FROM_PROVIDER'
  | 'DERIVED_FROM_ADJUSTMENT_FACTOR'
  | 'UNAVAILABLE'
  | 'INVALID_FACTOR';

export type CorporateActionStatus =
  | 'NONE'
  | 'CONFIRMED_SPLIT'
  | 'CONFIRMED_REVERSE_SPLIT'
  | 'CONFIRMED_DIVIDEND'
  | 'CONFIRMED_RIGHTS_ISSUE'
  | 'SUSPECTED_CORPORATE_ACTION'
  | 'UNRESOLVED_CORPORATE_ACTION'
  | 'LEGACY_UNKNOWN_PRICE_BASIS'
  | 'UNRESOLVED_SECURITY_IDENTITY';

export const PRICE_ADJUSTMENT_VERSION = 'price-adjustment-v1';
export const RETURN_PRICE_BASIS: PriceBasis = 'TOTAL_RETURN_ADJUSTED';
export const TRADING_PRICE_BASIS: PriceBasis = 'RAW';

// [HIPOTESIS PENJAGA] Ambang ini hanya trigger pemeriksaan/penolakan observasi, bukan
// klaim bahwa semua pergerakan raw >40% pasti corporate action. IDX punya ARA/ARB,
// suspensi, dan kejadian pasar ekstrem; tanpa data resmi, sistem tidak menebak rasio.
export const MAX_SANE_DAILY_RAW_MOVE = 0.4;
const MAX_SANE_ADJUSTED_MOVE_FOR_CA = 0.1;
const MIN_REASONABLE_ADJUSTMENT_FACTOR = 0.01;
const MAX_REASONABLE_ADJUSTMENT_FACTOR = 100;

export interface PriceBasisMetadata {
  priceBasis: PriceBasis;
  adjustmentSource: string | null;
  adjustmentTimestamp: string | null;
  adjustmentVersion: string;
}

export interface PriceOhlc {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

export interface NormalizedPriceBar {
  date: string;
  ticker: string | null;
  raw: PriceOhlc;
  adjusted: PriceOhlc;
  adjustmentFactor: number | null;
  adjustmentStatus: AdjustmentStatus;
  corporateActionStatus: CorporateActionStatus;
  basisAvailability: {
    raw: boolean;
    adjusted: boolean;
  };
  source: string;
  dataTimestamp: string | null;
  metadata: PriceBasisMetadata;
}

export interface SelectedPriceBar {
  date: string;
  ticker: string | null;
  basis: PriceBasis;
  open: number;
  high: number;
  low: number;
  close: number;
  source: string;
  adjustmentVersion: string;
  corporateActionStatus: CorporateActionStatus;
}

export interface PriceSeriesSelection {
  basis: PriceBasis;
  bars: SelectedPriceBar[];
  invalidCount: number;
  status: PriceBasisErrorCode;
  invalidDates: { date: string; reason: PriceBasisErrorCode }[];
}

export interface CorporateActionDetection {
  suspected: boolean;
  type: 'POSSIBLE_SPLIT' | 'POSSIBLE_REVERSE_SPLIT' | 'POSSIBLE_SPECIAL_DISTRIBUTION' | 'UNKNOWN';
  rawMovePct: number | null;
  adjustedMovePct: number | null;
  reason: string;
}

type OhlcLikeRow = {
  Date?: string | Date;
  date?: string | Date;
  Open?: number | null;
  High?: number | null;
  Low?: number | null;
  Close?: number | null;
  AdjClose?: number | null;
  Volume?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  adjClose?: number | null;
  adjusted_close?: number | null;
  volume?: number | null;
};

export class PriceBasisMismatchError extends Error {
  code: PriceBasisErrorCode = 'PRICE_BASIS_MISMATCH';

  constructor(message: string, public details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'PriceBasisMismatchError';
  }
}

function dateKey(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function finitePositive(value: unknown): number | null {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : null;
}

function round(value: number | null, digits = 8): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function adjustmentStatus(rawClose: number | null, adjustedClose: number | null): {
  factor: number | null;
  status: AdjustmentStatus;
} {
  if (adjustedClose == null) return { factor: null, status: 'UNAVAILABLE' };
  if (rawClose == null || rawClose <= 0 || adjustedClose <= 0) return { factor: null, status: 'INVALID_FACTOR' };
  const factor = adjustedClose / rawClose;
  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    factor < MIN_REASONABLE_ADJUSTMENT_FACTOR ||
    factor > MAX_REASONABLE_ADJUSTMENT_FACTOR
  ) {
    return { factor: null, status: 'INVALID_FACTOR' };
  }
  return {
    factor,
    status: Math.abs(factor - 1) < 1e-10 ? 'ADJUSTED_FROM_PROVIDER' : 'DERIVED_FROM_ADJUSTMENT_FACTOR',
  };
}

function deriveAdjusted(value: number | null, factor: number | null): number | null {
  if (value == null || factor == null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(factor) || value <= 0 || factor <= 0) return null;
  return round(value * factor);
}

export function normalizeYahooOhlcRows(
  rows: OhlcLikeRow[],
  ticker: string | null = null,
  dataTimestamp: string | null = null
): NormalizedPriceBar[] {
  return rows
    .map((row): NormalizedPriceBar | null => {
      const date = dateKey(row.Date ?? row.date);
      if (!date) return null;
      const rawOpen = finitePositive(row.Open ?? row.open);
      const rawHigh = finitePositive(row.High ?? row.high);
      const rawLow = finitePositive(row.Low ?? row.low);
      const rawClose = finitePositive(row.Close ?? row.close);
      const adjustedClose = finitePositive(row.AdjClose ?? row.adjClose ?? row.adjusted_close);
      const { factor, status } = adjustmentStatus(rawClose, adjustedClose);
      const adjusted: PriceOhlc = {
        open: deriveAdjusted(rawOpen, factor),
        high: deriveAdjusted(rawHigh, factor),
        low: deriveAdjusted(rawLow, factor),
        close: status === 'INVALID_FACTOR' ? null : adjustedClose,
      };
      const raw: PriceOhlc = { open: rawOpen, high: rawHigh, low: rawLow, close: rawClose };

      return {
        date,
        ticker,
        raw,
        adjusted,
        adjustmentFactor: factor,
        adjustmentStatus: status,
        corporateActionStatus: 'NONE',
        basisAvailability: {
          raw: [raw.open, raw.high, raw.low, raw.close].every((v) => v != null),
          adjusted: [adjusted.open, adjusted.high, adjusted.low, adjusted.close].every((v) => v != null),
        },
        source: 'YAHOO_CHART',
        dataTimestamp,
        metadata: {
          priceBasis: status === 'UNAVAILABLE' || status === 'INVALID_FACTOR' ? 'UNKNOWN' : RETURN_PRICE_BASIS,
          adjustmentSource: adjustedClose == null ? null : 'YAHOO_CHART_ADJCLOSE',
          adjustmentTimestamp: dataTimestamp,
          adjustmentVersion: PRICE_ADJUSTMENT_VERSION,
        },
      };
    })
    .filter((row): row is NormalizedPriceBar => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ohlcForBasis(bar: NormalizedPriceBar, basis: PriceBasis): { ohlc: PriceOhlc; status: PriceBasisErrorCode } {
  if (basis === 'RAW') return { ohlc: bar.raw, status: bar.basisAvailability.raw ? 'OK' : 'MISSING_RAW_PRICE' };
  if (basis === 'TOTAL_RETURN_ADJUSTED' || basis === 'SPLIT_ADJUSTED') {
    return { ohlc: bar.adjusted, status: bar.basisAvailability.adjusted ? 'OK' : 'MISSING_ADJUSTED_PRICE' };
  }
  if (basis === 'UNKNOWN') return { ohlc: { open: null, high: null, low: null, close: null }, status: 'LEGACY_UNKNOWN_PRICE_BASIS' };
  return { ohlc: { open: null, high: null, low: null, close: null }, status: 'UNSUPPORTED_PRICE_BASIS' };
}

export function selectPriceSeries(bars: NormalizedPriceBar[], basis: PriceBasis): PriceSeriesSelection {
  const selected: SelectedPriceBar[] = [];
  const invalidDates: { date: string; reason: PriceBasisErrorCode }[] = [];
  for (const bar of bars) {
    const { ohlc, status } = ohlcForBasis(bar, basis);
    if (status !== 'OK') {
      invalidDates.push({ date: bar.date, reason: status });
      continue;
    }
    if (![ohlc.open, ohlc.high, ohlc.low, ohlc.close].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) {
      invalidDates.push({ date: bar.date, reason: basis === 'RAW' ? 'MISSING_RAW_PRICE' : 'MISSING_ADJUSTED_PRICE' });
      continue;
    }
    selected.push({
      date: bar.date,
      ticker: bar.ticker,
      basis,
      open: ohlc.open as number,
      high: ohlc.high as number,
      low: ohlc.low as number,
      close: ohlc.close as number,
      source: bar.source,
      adjustmentVersion: bar.metadata.adjustmentVersion,
      corporateActionStatus: bar.corporateActionStatus,
    });
  }

  return {
    basis,
    bars: selected,
    invalidCount: invalidDates.length,
    status: invalidDates[0]?.reason ?? 'OK',
    invalidDates,
  };
}

function priceField(bar: NormalizedPriceBar, basis: PriceBasis, field: keyof PriceOhlc): {
  value: number | null;
  basis: PriceBasis;
  status: PriceBasisErrorCode;
} {
  const { ohlc, status } = ohlcForBasis(bar, basis);
  if (status !== 'OK') return { value: null, basis, status };
  const value = ohlc[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { value: null, basis, status: basis === 'RAW' ? 'MISSING_RAW_PRICE' : 'MISSING_ADJUSTED_PRICE' };
  }
  return { value, basis, status: 'OK' };
}

export function assertSamePriceBasis(
  entryBasis: PriceBasis,
  exitBasis: PriceBasis,
  context: Record<string, unknown> = {}
): void {
  if (entryBasis !== exitBasis) {
    throw new PriceBasisMismatchError(`Price basis mismatch: ${entryBasis} vs ${exitBasis}`, {
      ...context,
      entryBasis,
      exitBasis,
    });
  }
}

export function detectCorporateAction(
  previous: NormalizedPriceBar,
  current: NormalizedPriceBar,
  maxSaneRawMove = MAX_SANE_DAILY_RAW_MOVE
): CorporateActionDetection {
  const rawMove = previous.raw.close && current.raw.close
    ? current.raw.close / previous.raw.close - 1
    : null;
  const adjustedMove = previous.adjusted.close && current.adjusted.close
    ? current.adjusted.close / previous.adjusted.close - 1
    : null;
  const rawMovePct = round(rawMove == null ? null : rawMove * 100, 2);
  const adjustedMovePct = round(adjustedMove == null ? null : adjustedMove * 100, 2);

  if (rawMove == null || !Number.isFinite(rawMove)) {
    return {
      suspected: true,
      type: 'UNKNOWN',
      rawMovePct,
      adjustedMovePct,
      reason: '[HIPOTESIS PENJAGA] Harga raw tidak lengkap; observasi tidak dapat diverifikasi.',
    };
  }
  if (Math.abs(rawMove) <= maxSaneRawMove) {
    return { suspected: false, type: 'UNKNOWN', rawMovePct, adjustedMovePct, reason: 'Raw move masih dalam batas penjaga.' };
  }
  if (adjustedMove != null && Number.isFinite(adjustedMove) && Math.abs(adjustedMove) <= MAX_SANE_ADJUSTED_MOVE_FOR_CA) {
    return {
      suspected: true,
      type: rawMove < 0 ? 'POSSIBLE_SPLIT' : 'POSSIBLE_REVERSE_SPLIT',
      rawMovePct,
      adjustedMovePct,
      reason: '[HIPOTESIS PENJAGA] Raw move ekstrem tetapi adjusted move normal; kemungkinan aksi korporasi. Rasio tidak ditebak otomatis.',
    };
  }

  return {
    suspected: true,
    type: rawMove < 0 ? 'POSSIBLE_SPECIAL_DISTRIBUTION' : 'UNKNOWN',
    rawMovePct,
    adjustedMovePct,
    reason: '[HIPOTESIS PENJAGA] Raw move ekstrem dan tidak dapat direkonsiliasi dengan adjusted series.',
  };
}

export interface ForwardReturnInput {
  ticker: string;
  entryBar: NormalizedPriceBar;
  exitBar: NormalizedPriceBar;
  basis: PriceBasis;
  entryField: keyof PriceOhlc;
  exitField: keyof PriceOhlc;
  roundTripCostPct: number;
  overrideExitBasisForTest?: PriceBasis;
}

export interface ForwardReturnResult {
  status: PriceBasisErrorCode;
  returnPct: number | null;
  metadata: {
    entryPrice: number | null;
    exitPrice: number | null;
    entryPriceBasis: PriceBasis;
    exitPriceBasis: PriceBasis;
    adjustmentVersion: string;
    corporateActionStatus: CorporateActionStatus;
  };
}

export function calculateForwardReturnPct(input: ForwardReturnInput): ForwardReturnResult {
  const exitBasis = input.overrideExitBasisForTest ?? input.basis;
  assertSamePriceBasis(input.basis, exitBasis, {
    ticker: input.ticker,
    entryDate: input.entryBar.date,
    exitDate: input.exitBar.date,
  });
  const entry = priceField(input.entryBar, input.basis, input.entryField);
  if (entry.status !== 'OK') {
    return {
      status: entry.status,
      returnPct: null,
      metadata: {
        entryPrice: null,
        exitPrice: null,
        entryPriceBasis: input.basis,
        exitPriceBasis: exitBasis,
        adjustmentVersion: input.entryBar.metadata.adjustmentVersion,
        corporateActionStatus: input.entryBar.corporateActionStatus,
      },
    };
  }
  const exit = priceField(input.exitBar, exitBasis, input.exitField);
  if (exit.status !== 'OK') {
    return {
      status: exit.status,
      returnPct: null,
      metadata: {
        entryPrice: entry.value,
        exitPrice: null,
        entryPriceBasis: input.basis,
        exitPriceBasis: exitBasis,
        adjustmentVersion: input.exitBar.metadata.adjustmentVersion,
        corporateActionStatus: input.exitBar.corporateActionStatus,
      },
    };
  }

  return {
    status: 'OK',
    returnPct: ((exit.value as number) / (entry.value as number) - 1) * 100 - input.roundTripCostPct,
    metadata: {
      entryPrice: entry.value,
      exitPrice: exit.value,
      entryPriceBasis: input.basis,
      exitPriceBasis: exitBasis,
      adjustmentVersion: input.exitBar.metadata.adjustmentVersion,
      corporateActionStatus: input.exitBar.corporateActionStatus,
    },
  };
}
