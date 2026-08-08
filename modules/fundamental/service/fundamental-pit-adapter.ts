import type {
  FundamentalHistoryRow,
} from '../repository/fundamental-history.repository';

export function fundamentalPitToAnalyzerPayload(
  pit: FundamentalHistoryRow,
): Record<string, any> {
  const summaryDetail: Record<string, number> = {};
  const defaultKeyStatistics: Record<string, number> = {};
  const financialData: Record<string, number> = {};

  // PIT PER sudah berbentuk rasio, contoh 8.07x
  if (pit.per != null && Number.isFinite(pit.per)) {
    summaryDetail.trailingPE = pit.per;
  }

  // PIT PBV sudah berbentuk rasio, contoh 0.80x
  if (pit.pbv != null && Number.isFinite(pit.pbv)) {
    defaultKeyStatistics.priceToBook = pit.pbv;
  }

  // PIT: 9.87 berarti 9.87%.
  // Analyzer/Yahoo: 0.0987.
  if (pit.roe != null && Number.isFinite(pit.roe)) {
    financialData.returnOnEquity = pit.roe / 100;
  }

  // PIT: 0.79 berarti 0.79x.
  // Analyzer DER mengharapkan Yahoo-style 79.
  if (pit.der != null && Number.isFinite(pit.der)) {
    financialData.debtToEquity = pit.der * 100;
  }

  if (
    pit.currentRatio != null &&
    Number.isFinite(pit.currentRatio)
  ) {
    financialData.currentRatio = pit.currentRatio;
  }

  // PIT: 2.2 berarti 2.2%.
  // Analyzer: 0.022.
  if (
    pit.revenueGrowth != null &&
    Number.isFinite(pit.revenueGrowth)
  ) {
    financialData.revenueGrowth = pit.revenueGrowth / 100;
  }

  return {
    summaryDetail,
    defaultKeyStatistics,
    financialData,
  };
}