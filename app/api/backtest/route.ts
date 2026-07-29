import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filters, modal, period } = body;

    // In a real application, we would fetch historical data for multiple stocks, 
    // run the filters day by day, and simulate trades. 
    // Here we use pseudo-random mock logic based on the filters selected to demonstrate the UI.
    
    // Base returns
    let baseReturn = -0.89; // IHSG return
    let winRate = 45;
    let totalTrades = 0;
    let maxDD = -15.5;

    // Adjust based on filters selected
    const filterCount = filters?.length || 0;
    if (filterCount > 0) {
      baseReturn = 5 + (filterCount * 5.2);
      winRate = 55 + (filterCount * 3.5);
      totalTrades = 12 * filterCount;
      maxDD = -10 + (filterCount * 0.5);
    }
    
    // Preset overrides for screenshot-like consistency
    const hasMA = filters?.includes('EMA 20/50 Cross');
    const hasVol = filters?.includes('Volume vs Avg 20D');
    const hasRSI = filters?.includes('RSI 14');
    
    if (hasMA && hasVol && filters.length === 3) {
      baseReturn = 22.4;
      winRate = 67;
      totalTrades = 24;
      maxDD = -8.2;
    }

    const alpha = baseReturn - (-0.89); // Assuming IHSG is -0.89%

    // Generate Equity Curve
    let currentEquity = modal || 100000000;
    const equityCurve = [];
    const ihsgCurve = [];
    let ihsgEquity = modal || 100000000;
    const p = period || 12;

    for (let i = 0; i <= p; i++) {
      equityCurve.push(Math.round(currentEquity));
      ihsgCurve.push(Math.round(ihsgEquity));
      
      // Add random variation but trending towards the final return
      const stepReturn = (baseReturn / p) + (Math.random() * 4 - 2);
      currentEquity *= (1 + (stepReturn / 100));
      
      const ihsgStep = (-0.89 / p) + (Math.random() * 2 - 1);
      ihsgEquity *= (1 + (ihsgStep / 100));
    }

    // Ensure final matches exactly
    equityCurve[equityCurve.length - 1] = Math.round((modal || 100000000) * (1 + (baseReturn / 100)));
    ihsgCurve[ihsgCurve.length - 1] = Math.round((modal || 100000000) * (1 - 0.0089));

    // Generate sample trades
    const trades = [];
    const symbols = ['BBCA', 'BBRI', 'BMRI', 'GGRM', 'DGWG', 'ADRO'];
    for (let i = 0; i < 5; i++) {
      const sym = symbols[Math.floor(Math.random() * symbols.length)];
      const isWin = Math.random() < (winRate / 100);
      const pnlPct = isWin ? 3 + Math.random() * 15 : -(2 + Math.random() * 5);
      trades.push({
        date: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString().split('T')[0],
        symbol: sym + '.JK',
        buy: 1000 + Math.floor(Math.random() * 5000),
        pnl: `${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%`
      });
    }

    // Sort trades by date
    trades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      return: `${baseReturn > 0 ? '+' : ''}${baseReturn.toFixed(1)}%`,
      ihsgReturn: `-0.89%`,
      alpha: `+${alpha.toFixed(2)}%`,
      winRate: `${winRate.toFixed(0)}%`,
      totalTrades,
      maxDD: `${maxDD.toFixed(1)}%`,
      equityCurve,
      ihsgCurve,
      trades
    });

  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
