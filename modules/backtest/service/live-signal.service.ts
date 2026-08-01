import type {
  BacktestIndicatorCache,
  IndicatorName,
  Decision,
  TickerIndicatorSeries,
} from '../types/backtest.types';

const ALL_INDICATORS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

export interface LiveSignalMatch {
  symbol: string;
  price: number;
  score: number; // jumlah SEMUA 9 indikator yang BULLISH hari itu, 0-9
}

export interface LiveSignalResult {
  dataAsOf: string;
  matches: LiveSignalMatch[];
}

function lastDayDecisions(series: TickerIndicatorSeries, lastIdx: number): Record<IndicatorName, Decision> {
  const decisions = {} as Record<IndicatorName, Decision>;
  ALL_INDICATORS.forEach((name) => {
    decisions[name] = series.decisions[name][lastIdx];
  });
  return decisions;
}

export function computeLiveSignal(cache: BacktestIndicatorCache, filters: IndicatorName[]): LiveSignalResult {
  const matches: LiveSignalMatch[] = [];

  for (const series of cache.tickers) {
    const lastIdx = series.bars.length - 1;
    if (lastIdx < 0) continue;

    const decisions = lastDayDecisions(series, lastIdx);
    const isMatch = filters.every((f) => decisions[f] === 'BULLISH');
    if (!isMatch) continue;

    const score = ALL_INDICATORS.filter((name) => decisions[name] === 'BULLISH').length;
    matches.push({ symbol: series.ticker, price: series.bars[lastIdx].close, score });
  }

  matches.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.symbol.localeCompare(b.symbol)));

  return { dataAsOf: cache.computedAt, matches };
}
