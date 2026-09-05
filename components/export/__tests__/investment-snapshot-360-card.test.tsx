import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InvestmentSnapshot360Card from '../InvestmentSnapshot360Card';

const DATA = {
  symbol: 'BBCA',
  stockName: 'PT Bank Central Asia Tbk',
  currentPrice: 6450,
  changePct: 0.78,
  volume: 82_000_000,
  dataTimestamp: '2026-09-04T09:14:00Z',
  consensusLabel: 'SINYAL BELI',
  consensusTone: 'positive' as const,
  score: 72,
  scoreBreakdown: { technical: 31, flow: 19, fundamental: 22 },
  range52w: { high52w: 7200, low52w: 5100, currentPrice: 6450, positionPct: 64 },
  trends: [
    { timeframe: 'short', label: 'Jangka Pendek', status: 'BULLISH', detail: 'Harga di atas EMA20', benchmark: 'EMA20' },
    { timeframe: 'medium', label: 'Jangka Menengah', status: 'BULLISH', detail: 'Harga di atas MA50/100', benchmark: 'MA50/100' },
    { timeframe: 'long', label: 'Jangka Panjang', status: 'NEUTRAL', detail: 'Dekat MA200', benchmark: 'MA200' },
  ],
  tradingPlan: { entryZone: [6300, 6400] as [number, number], stopLoss: 6100, targetPrice1: 6900, targetPrice2: 7200, atr14: 120, riskRewardRatio: '1:2' },
  flowDetails: { cmf20: 0.12, bandarmologyStatus: 'BULLISH', foreignFlowStatus: 'NET BUY' },
  fundamentals: { marketCap: 792_551_724_417_024, trailingPE: 13.66, priceToBook: 2.93, returnOnEquity: 0.2182, profitMargins: 0.5312, revenueGrowth: 0.08, earningsGrowth: 0.11, dividendYield: 0.0591, debtToEquity: null },
  profile: { sector: 'Financial Services', industry: 'Banks - Regional' },
  moat: { status: 'KUAT', supportive: 7, neutral: 2, caution: 1, available: 10, expected: 10, coveragePct: 100, pillars: [] },
  valuation: { fairValue: 7100, mos: 9.2, valuation: 'FAIR VALUE', method: 'DCF' },
  latestEarningsQuarter: { quarter: '2Q2026', actualEps: 121, estimatedEps: 118, surprisePct: 2.5, status: 'BEAT' },
  ownership: { foreignPct: 29.3, localPct: 13.2, observedDate: '2026-07-31', previous: { actualGapDays: 31, foreignPp: -0.02 } },
  exportedAt: new Date('2026-09-04T09:14:00Z'),
};

describe('InvestmentSnapshot360Card', () => {
  it('merangkum teknikal, fundamental, risiko, dan provenance dalam satu lembar', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = renderToStaticMarkup(<InvestmentSnapshot360Card {...(DATA as any)} />);

    expect(html).toContain('Investment Snapshot 360°');
    expect(html).toContain('Struktur Teknikal');
    expect(html).toContain('Fundamental &amp; Valuasi');
    expect(html).toContain('Decision Strip');
    expect(html).toContain('Evidence Quality');
    expect(html).toContain('Data per 04 September 2026');
    expect(html).toContain('LensScore adalah keselarasan faktor, bukan probabilitas profit');
  });

  it('menandai data yang tidak tersedia tanpa mengarang keputusan', () => {
    const html = renderToStaticMarkup(
      <InvestmentSnapshot360Card symbol="XXXX" exportedAt={DATA.exportedAt} />,
    );

    expect(html).toContain('DATA TERBATAS');
    expect(html).toContain('TRADEPLAN: TIDAK ACTIONABLE');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('N/A');
  });
});
