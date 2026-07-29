import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/lib/session';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const hasPro = checkProAccess(session);
  if (!hasPro) {
    return NextResponse.json({ error: 'Limit analisa harian habis' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const symbol1 = searchParams.get('symbol1') || 'BBCA.JK';
  const symbol2 = searchParams.get('symbol2') || 'BBRI.JK';

  // In a real app, we would fetch /api/stock/[symbol] and /api/fundamental for both
  // Here we use pseudo-random mock logic based on symbols
  
  const generateMock = (sym: string) => {
    const isBBCA = sym === 'BBCA.JK';
    const isBBRI = sym === 'BBRI.JK';
    const isDGWG = sym === 'DGWG.JK';
    
    return {
      symbol: sym,
      price: isBBCA ? 6225 : isBBRI ? 4120 : isDGWG ? 280 : 1500 + Math.floor(Math.random() * 5000),
      score: isBBCA ? 58 : isBBRI ? 62 : isDGWG ? 31 : 40 + Math.floor(Math.random() * 50),
      maStatus: isBBCA ? "REBOUND LEMAH" : isBBRI ? "UPTREND" : isDGWG ? "DOWNTREND" : "SIDEWAYS",
      per: isBBCA ? 13.2 : isBBRI ? 11.8 : isDGWG ? 24.5 : 10 + (Math.random() * 10),
      pbv: isBBCA ? 2.95 : isBBRI ? 2.1 : isDGWG ? 1.5 : 1 + (Math.random() * 2),
      roe: isBBCA ? 18 : isBBRI ? 19 : isDGWG ? 8 : 10 + Math.floor(Math.random() * 15),
      foreignNet: isBBCA ? 49 : isBBRI ? 22 : isDGWG ? -17 : Math.floor(Math.random() * 100) - 50,
      rr: isBBCA ? "1:17 Layak" : isBBRI ? "1:2.5 Kurang" : isDGWG ? "1:4.3 Lumayan" : "1:2 Cukup"
    };
  };

  const data1 = generateMock(symbol1);
  const data2 = generateMock(symbol2);

  // Determine winners
  const scoreWinner = data1.score > data2.score ? data1.symbol : data2.symbol;
  const maWinner = data1.maStatus === "UPTREND" ? data1.symbol : data2.maStatus === "UPTREND" ? data2.symbol : data1.symbol;
  const perWinner = data1.per < data2.per ? data1.symbol : data2.symbol;
  const pbvWinner = data1.pbv < data2.pbv ? data1.symbol : data2.symbol;
  const foreignWinner = data1.foreignNet > data2.foreignNet ? data1.symbol : data2.symbol;
  
  const rrValue1 = parseFloat(data1.rr.split(':')[1]);
  const rrValue2 = parseFloat(data2.rr.split(':')[1]);
  const rrWinner = rrValue1 > rrValue2 ? data1.symbol : data2.symbol;

  return NextResponse.json({
    data1,
    data2,
    winners: {
      score: scoreWinner,
      ma: maWinner,
      per: perWinner,
      pbv: pbvWinner,
      foreign: foreignWinner,
      rr: rrWinner
    },
    conclusion: `${data1.symbol} ${data1.maStatus.toLowerCase()}, ${data2.symbol} ${data2.maStatus.toLowerCase()} lebih menarik.`
  });
}
