export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  buy_price: number | null;
  alert_price: number | null;
  lot: number | null;
  created_at: string;
}

export type AlertConditionType =
  | 'PRICE_BELOW'
  | 'PRICE_ABOVE'
  | 'CONSENSUS_STRONG_BUY'
  | 'RSI_OVERSOLD'
  | 'BREAKOUT_SCORE_ABOVE'
  | 'BREADTH_ADVANCING_BELOW';

export interface Alert {
  id: string;
  user_id: string;
  symbol: string;
  condition_type: AlertConditionType;
  condition_value: number | null;
  triggered: boolean;
  created_at: string;
}
