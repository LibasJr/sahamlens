export interface Transaction {
  id: string;
  portfolio_id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  price: number;
  lots: number;
  fee: number;
  pnl?: number;
  note: string;
  created_at: string;
}

export interface Portfolio {
  id: string;
  name: string;
  cash: number;
  initial_cash: number;
  created_at: string;
}

const PORTFOLIO_KEY = 'saham_lens_demo_portfolio';
const TRANSACTIONS_KEY = 'saham_lens_demo_transactions';

export function getPortfolio(): Portfolio {
  if (typeof window === 'undefined') return { id: 'default', name: 'Main Portfolio', cash: 100000000, initial_cash: 100000000, created_at: new Date().toISOString() };
  
  const saved = localStorage.getItem(PORTFOLIO_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  
  const newPortfolio: Portfolio = {
    id: 'default',
    name: 'Main Portfolio',
    cash: 100000000,
    initial_cash: 100000000,
    created_at: new Date().toISOString()
  };
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(newPortfolio));
  return newPortfolio;
}

export function getTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];
  const saved = localStorage.getItem(TRANSACTIONS_KEY);
  return saved ? JSON.parse(saved) : [];
}

export function getHoldings() {
  const transactions = getTransactions();
  const holdings: Record<string, { lots: number; totalCost: number; avgPrice: number }> = {};

  transactions.forEach(t => {
    if (!holdings[t.symbol]) {
      holdings[t.symbol] = { lots: 0, totalCost: 0, avgPrice: 0 };
    }
    
    if (t.type === 'BUY') {
      holdings[t.symbol].lots += t.lots;
      holdings[t.symbol].totalCost += (t.price * t.lots * 100) + t.fee;
      holdings[t.symbol].avgPrice = holdings[t.symbol].totalCost / (holdings[t.symbol].lots * 100);
    } else if (t.type === 'SELL') {
      holdings[t.symbol].lots -= t.lots;
      holdings[t.symbol].totalCost -= (holdings[t.symbol].avgPrice * t.lots * 100);
      if (holdings[t.symbol].lots === 0) {
        holdings[t.symbol].totalCost = 0;
        holdings[t.symbol].avgPrice = 0;
      }
    }
  });

  return Object.entries(holdings)
    .filter(([_, h]) => h.lots > 0)
    .map(([symbol, h]) => ({
      symbol,
      lots: h.lots,
      avgPrice: h.avgPrice,
      totalCost: h.totalCost
    }));
}

export function buyStock(symbol: string, price: number, lots: number, note: string) {
  const portfolio = getPortfolio();
  const cost = price * lots * 100;
  const fee = cost * 0.0015; // 0.15% fee
  const totalCost = cost + fee;

  if (portfolio.cash < totalCost) {
    throw new Error('Cash tidak cukup');
  }

  // Update portfolio
  portfolio.cash -= totalCost;
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));

  // Add transaction
  const transactions = getTransactions();
  const newTx: Transaction = {
    id: Math.random().toString(36).substring(7),
    portfolio_id: portfolio.id,
    symbol,
    type: 'BUY',
    price,
    lots,
    fee,
    note,
    created_at: new Date().toISOString()
  };
  transactions.push(newTx);
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  
  return newTx;
}

export function sellStock(symbol: string, price: number, lots: number, note: string) {
  const portfolio = getPortfolio();
  const holdings = getHoldings();
  const holding = holdings.find(h => h.symbol === symbol);

  if (!holding || holding.lots < lots) {
    throw new Error('Lot tidak cukup untuk dijual');
  }

  const grossValue = price * lots * 100;
  const fee = grossValue * 0.0025; // 0.25% fee
  const netValue = grossValue - fee;
  
  const costBasis = holding.avgPrice * lots * 100;
  const pnl = netValue - costBasis;

  // Update portfolio
  portfolio.cash += netValue;
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));

  // Add transaction
  const transactions = getTransactions();
  const newTx: Transaction = {
    id: Math.random().toString(36).substring(7),
    portfolio_id: portfolio.id,
    symbol,
    type: 'SELL',
    price,
    lots,
    fee,
    pnl,
    note,
    created_at: new Date().toISOString()
  };
  transactions.push(newTx);
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  
  return newTx;
}

export function resetPortfolio() {
  localStorage.removeItem(PORTFOLIO_KEY);
  localStorage.removeItem(TRANSACTIONS_KEY);
}
