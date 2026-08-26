import type { BacktestSignificanceResult, IndicatorName, LiveFilterMatch, SimulateResult } from '@/modules/backtest';
import type { PerformanceMetrics } from '@/modules/backtest/service/performance-metrics';
import type { ReplayCandle } from '@/components/backtest/CandleReplayChart';

export interface PublicChartReplayResponse {
  history?: ReplayCandle[];
}

export interface BacktestTradeRow {
  date: string;
  symbol: string;
  buy: number;
  pnl: string;
}

export interface BacktestApiResponse {
  return: string;
  ihsgReturn: string;
  alpha: string;
  winRate: string;
  totalTrades: number;
  maxDD: string;
  performance: PerformanceMetrics;
  significance: BacktestSignificanceResult;
  universe: SimulateResult['universe'];
  equityCurve: number[];
  ihsgCurve: number[];
  trades: BacktestTradeRow[];
  trades_locked_count: number;
  is_guest_limited: boolean;
  dataAsOf: string;
  message?: string;
}

export interface BacktestLiveFilterResponse {
  scannedAt: string;
  filters: IndicatorName[];
  matches: LiveFilterMatch[];
  total_matches: number;
  locked_count: number;
  is_guest_limited: boolean;
  skippedCount: number;
  message?: string;
}

export interface BacktestChartPoint {
  month: string;
  Strategy: number;
  IHSG: number | null;
}

export interface RechartsTooltipEntry {
  dataKey?: string | number;
  value?: unknown;
}

export interface EquityTooltipProps {
  active?: boolean;
  payload?: RechartsTooltipEntry[];
  label?: string | number;
  initialCapital: number;
}

export type BacktestSuccessBody = BacktestApiResponse;
