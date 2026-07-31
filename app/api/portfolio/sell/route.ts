import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { readJson, writeJson } from '@/lib/dbLocal';
import { getSession } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const { symbol, price, lots, note } = await req.json();

    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    // Sama seperti /api/portfolio/buy: cegah price/lots negatif atau non-integer.
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Harga tidak valid' }, { status: 400 });
    }
    if (!Number.isInteger(lots) || lots <= 0) {
      return NextResponse.json({ error: 'Jumlah lot tidak valid' }, { status: 400 });
    }

    const portfolios = readJson('data/portfolios.json') || [];
    const portfolioIdx = portfolios.findIndex((p: any) => p.user_id === session.id);
    if (portfolioIdx === -1) {
      return NextResponse.json({ error: 'Portfolio tidak ditemukan' }, { status: 404 });
    }
    const portfolio = portfolios[portfolioIdx];

    const allTransactions = readJson('data/transactions.json') || [];
    const transactions = allTransactions.filter((t: any) => t.portfolio_id === portfolio.id);

    // Calculate holding to find avgPrice for PnL
    const holdingsMap: Record<string, any> = {};
    transactions.forEach((t: any) => {
      if (!holdingsMap[t.symbol]) {
         holdingsMap[t.symbol] = { lots: 0, totalCost: 0, avgPrice: 0 };
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

    const holding = holdingsMap[symbol];
    if (!holding || holding.lots < lots) {
      return NextResponse.json({ error: 'Insufficient lots' }, { status: 400 });
    }

    const gross = price * lots * 100;
    const costBasis = holding.avgPrice * lots * 100;
    const pnl = gross - costBasis;

    portfolio.cash += gross;
    writeJson('data/portfolios.json', portfolios);

    const newTx = {
      id: Math.random().toString(36).substring(7),
      portfolio_id: portfolio.id,
      type: 'SELL',
      symbol,
      price,
      lots,
      pnl,
      note,
      date: new Date().toISOString()
    };
    allTransactions.push(newTx);
    writeJson('data/transactions.json', allTransactions);

    return NextResponse.json({ success: true, transaction: newTx });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
