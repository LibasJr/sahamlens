// 9 filter yang bisa dipilih user di app/backtest/page.tsx, dipetakan 1:1 ke 9 dari
// 10 analyzer di modules/technical (analyzeMomentum sengaja tidak dipakai filter
// manapun - lihat tabel pemetaan di docs/superpowers/specs/2026-08-01-real-backtest-engine-design.md).
// 'Volatility (ATR 14)' dan 'SMA Score (5,10,20)' adalah rename dari nama filter lama
// 'Bollinger Bands'/'Trend Price vs MA200' yang tidak punya analyzer asli yang cocok.
export type IndicatorName =
  | 'EMA 20/50 Cross'
  | 'Volume vs Avg 20D'
  | 'RSI 14'
  | 'MACD'
  | 'Volatility (ATR 14)'
  | 'MA Trend IDX (20,50,200)'
  | 'Support & Resistance'
  | 'Market Flow Index'
  | 'SMA Score (5,10,20)';

export type Decision = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface DailyBar {
  date: string; // YYYY-MM-DD
  close: number;
}

// Deret keputusan harian 1 saham, sudah dipangkas ke window backtest (tanpa bagian
// yang cuma dipakai sebagai buffer lookback indikator). `decisions[name][i]` sejajar
// index dengan `bars[i]` (tanggal yang sama).
export interface TickerIndicatorSeries {
  ticker: string; // format Yahoo, e.g. 'BBCA.JK'
  bars: DailyBar[];
  decisions: Record<IndicatorName, Decision[]>;
}

export interface BacktestIndicatorCache {
  computedAt: string; // ISO timestamp precompute selesai
  ihsg: DailyBar[]; // dipakai sebagai kalender hari bursa acuan + benchmark alpha
  tickers: TickerIndicatorSeries[];
}

export interface SimulateInput {
  filters: IndicatorName[];
  modal: number;
  periodMonths: number; // 3 | 6 | 12 | 24
}

export interface TradeRecord {
  entryDate: string; // YYYY-MM-DD
  date: string; // tanggal exit, YYYY-MM-DD
  symbol: string; // dengan .JK
  buy: number;
  sell: number;
  pnlPct: number; // mis. -23.91 (bukan string)
}

export interface SimulateResult {
  returnPct: number;
  ihsgReturnPct: number;
  alphaPct: number;
  winRatePct: number;
  totalTrades: number;
  maxDrawdownPct: number;
  equityCurve: number[]; // panjang periodMonths+1, mulai dari modal
  ihsgCurve: number[]; // sama panjang, direbase ke skala modal
  trades: TradeRecord[]; // terurut terbaru dulu
  computedAt: string;
}
