export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  cash: number;
  initial_cash: number;
  created_at: string;
}

export interface Holding {
  portfolio_id: string;
  symbol: string;
  lots: number;
  avg_price: number;
}

// Bentuk yang dikonsumsi frontend (app/portfolio/page.tsx: h.avgPrice, h.totalCost)
// - dipertahankan sama seperti sebelum migrasi Postgres, supaya UI tidak perlu
// diubah. Kolom DB tetap snake_case (konvensi SQL), pemetaan camelCase + totalCost
// turunan terjadi di service layer, bukan di database.
export interface HoldingDto {
  symbol: string;
  lots: number;
  avgPrice: number;
  totalCost: number;
}

export interface Transaction {
  id: string;
  portfolio_id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  price: number;
  lots: number;
  pnl: number | null;
  note: string | null;
  created_at: string;
}

export interface PortfolioSummary {
  portfolio: Portfolio;
  holdings: HoldingDto[];
  transactions: Transaction[];
}
