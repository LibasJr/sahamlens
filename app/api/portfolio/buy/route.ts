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
    // Validasi numerik ketat: sebelumnya hanya `if (!price || !lots)`, jadi price/lots
    // negatif lolos dan `portfolio.cash -= cost` dengan cost negatif justru MENAMBAH kas
    // pengguna (mencetak uang virtual tanpa batas).
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

    const cost = price * lots * 100;
    if (portfolio.cash < cost) {
      return NextResponse.json({ error: 'Cash tidak cukup' }, { status: 400 });
    }

    portfolio.cash -= cost;
    writeJson('data/portfolios.json', portfolios);

    const transactions = readJson('data/transactions.json') || [];
    const newTx = {
      id: Math.random().toString(36).substring(7),
      portfolio_id: portfolio.id,
      type: 'BUY',
      symbol,
      price,
      lots,
      note,
      date: new Date().toISOString()
    };
    transactions.push(newTx);
    writeJson('data/transactions.json', transactions);

    return NextResponse.json({ success: true, transaction: newTx });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
