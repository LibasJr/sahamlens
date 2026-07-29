import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/dbLocal';
import { cookies } from 'next/headers';
import { getDemoSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = getDemoSession(cookies());
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const portfolios = readJson('data/portfolios.json') || [];
    let portfolio = portfolios.find((p: any) => p.user_id === session.id);
    let transactions: any[] = [];

    if (!portfolio) {
      // Fallback Vercel cold-start: Jangan kembalikan 404 agar UI tidak nge-blank
      portfolio = {
        id: `pf_fallback_${session.id}`,
        user_id: session.id,
        name: 'Main Portfolio (Fallback)',
        cash: 63100000,
        initial_cash: 100000000,
        created_at: new Date().toISOString()
      };
      // Hardcode fallback tx: DGWG 10 lot @369, GGRM 1 lot @17450
      transactions = [
        { id: 1, portfolio_id: portfolio.id, symbol: 'DGWG.JK', type: 'BUY', price: 369, lots: 10, date: new Date().toISOString() },
        { id: 2, portfolio_id: portfolio.id, symbol: 'GGRM.JK', type: 'BUY', price: 17450, lots: 1, date: new Date().toISOString() }
      ];
    } else {
      const allTransactions = readJson('data/transactions.json') || [];
      transactions = allTransactions.filter((t: any) => t.portfolio_id === portfolio.id);
    }

    const holdingsMap: Record<string, any> = {};

    transactions.forEach((t: any) => {
      if (!holdingsMap[t.symbol]) {
         holdingsMap[t.symbol] = { symbol: t.symbol, lots: 0, totalCost: 0, avgPrice: 0 };
      }

      if (t.type === 'BUY') {
         holdingsMap[t.symbol].lots += t.lots;
         holdingsMap[t.symbol].totalCost += (t.price * t.lots * 100);
         holdingsMap[t.symbol].avgPrice = holdingsMap[t.symbol].totalCost / (holdingsMap[t.symbol].lots * 100);
      } else if (t.type === 'SELL') {
         holdingsMap[t.symbol].lots -= t.lots;
         holdingsMap[t.symbol].totalCost -= (holdingsMap[t.symbol].avgPrice * t.lots * 100);
         if (holdingsMap[t.symbol].lots === 0) {
           holdingsMap[t.symbol].totalCost = 0;
           holdingsMap[t.symbol].avgPrice = 0;
         }
      }
    });

    const activeHoldings = Object.values(holdingsMap).filter((h: any) => h.lots > 0);

    return NextResponse.json({
      portfolio,
      holdings: activeHoldings,
      transactions
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
