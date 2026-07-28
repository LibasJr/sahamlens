import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

import { analyze as analyzePe } from '@/lib/fundamentals/pe-analyzer';
import { analyze as analyzePbv } from '@/lib/fundamentals/pbv-analyzer';
import { analyze as analyzeRoe } from '@/lib/fundamentals/roe-analyzer';
import { analyze as analyzeRoa } from '@/lib/fundamentals/roa-analyzer';
import { analyze as analyzeDer } from '@/lib/fundamentals/der-analyzer';
import { analyze as analyzeCurrentRatio } from '@/lib/fundamentals/current-ratio-analyzer';
import { analyze as analyzeDividend } from '@/lib/fundamentals/dividend-analyzer';
import { analyze as analyzeEpsGrowth } from '@/lib/fundamentals/eps-growth-analyzer';
import { analyze as analyzeGrossMargin } from '@/lib/fundamentals/gross-margin-analyzer';
import { analyze as analyzeNetMargin } from '@/lib/fundamentals/net-margin-analyzer';

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    let ticker = params.ticker.toUpperCase();
    if (!ticker.includes('.')) {
      ticker = `${ticker}.JK`;
    }

    // Fetch Yahoo Finance Fundamental Data
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'price']
    });

    if (!quoteSummary) {
      return NextResponse.json({ error: 'Failed to fetch Fundamental data' }, { status: 404 });
    }

    const currentPrice = quoteSummary.price?.regularMarketPrice || 0;

    // Run all 10 fundamental analyzers
    const analyzersResult = await Promise.all([
      Promise.resolve(analyzePe(quoteSummary)),
      Promise.resolve(analyzePbv(quoteSummary)),
      Promise.resolve(analyzeRoe(quoteSummary)),
      Promise.resolve(analyzeRoa(quoteSummary)),
      Promise.resolve(analyzeDer(quoteSummary)),
      Promise.resolve(analyzeCurrentRatio(quoteSummary)),
      Promise.resolve(analyzeDividend(quoteSummary)),
      Promise.resolve(analyzeEpsGrowth(quoteSummary)),
      Promise.resolve(analyzeGrossMargin(quoteSummary)),
      Promise.resolve(analyzeNetMargin(quoteSummary))
    ]);

    let bullish = 0;
    let bearish = 0;
    let bestPerformer = analyzersResult[0];

    analyzersResult.forEach(res => {
      if (res.decision === 'BULLISH') bullish++;
      else if (res.decision === 'BEARISH') bearish++;

      if (res.confidence > bestPerformer.confidence) {
        bestPerformer = res;
      }
    });

    const totalVotes = bullish + bearish;
    let consensus = 'NEUTRAL';
    
    if (totalVotes > 0) {
      const bullPct = (bullish / totalVotes) * 100;
      if (bullPct >= 60) consensus = `UNDERVALUED (BULLISH ${bullPct.toFixed(0)}%)`;
      else if (bullPct <= 40) consensus = `OVERVALUED (BEARISH ${(100 - bullPct).toFixed(0)}%)`;
    }

    return NextResponse.json({
      ticker,
      price: currentPrice,
      analyzers: analyzersResult,
      consensus,
      bestPerformer,
      stock: {
        symbol: ticker,
        current_price: currentPrice,
        name: quoteSummary.price?.longName || quoteSummary.price?.shortName || ticker,
        change_pct: quoteSummary.price?.regularMarketChangePercent ? parseFloat((quoteSummary.price.regularMarketChangePercent * 100).toFixed(2)) : 0,
        volume: quoteSummary.price?.regularMarketVolume || 0
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
