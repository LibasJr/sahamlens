import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AlgoFilters from '@/components/AlgoFilters';
import { GuestLockedSection } from './GuestLockedSection';
import {
  buildPublicTechnicalPayload,
  canFetchPrivateTechnicalAnalysis,
} from './dashboard-analysis';

function candles(count = 244) {
  return Array.from({ length: count }, (_, index) => {
    const close = 6_000 + index;
    return {
      time: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
      open: close - 10,
      high: close + 20,
      low: close - 20,
      close,
      adjClose: close,
      volume: 10_000_000 + index,
    };
  });
}

describe('LensTechnical guest parity', () => {
  it('builds the shared dashboard payload only from public market candles', () => {
    const payload = buildPublicTechnicalPayload('BBCA.JK', candles());

    expect(payload).not.toBeNull();
    expect(payload?.stock.symbol).toBe('BBCA.JK');
    expect(payload?.stock.current_price).toBe(6_243);
    expect(payload?.stock.history).toHaveLength(244);
    expect(payload?.analyzers.map((item) => item.label)).toEqual([
      'EMA 20/50 Cross',
      'RSI 14',
      'MA Trend IDX (20,50,200)',
    ]);
    expect(payload).toMatchObject({
      scoring: null,
      decision: null,
      tradeSetup: null,
      tradePlan: null,
      consensus: null,
      eligibility: null,
      _meta: { source: 'public-chart', freshness: 'EOD' },
    });
    expect(payload).not.toHaveProperty('bestPerformer');
    expect(payload).not.toHaveProperty('consensusData');
    expect(payload).not.toHaveProperty('recommendationAudit');
  });

  it('fails closed instead of inventing values when public prices are invalid', () => {
    expect(buildPublicTechnicalPayload('BBCA.JK', [{ close: 0 }])).toBeNull();
    expect(buildPublicTechnicalPayload('BBCA.JK', [{ close: Number.NaN }])).toBeNull();
    expect(buildPublicTechnicalPayload('BBCA.JK', candles(49))?.analyzers).toHaveLength(3);
  });

  it('never fetches private technical analysis for guests or unresolved sessions', () => {
    expect(canFetchPrivateTechnicalAnalysis(false, null, false)).toBe(false);
    expect(canFetchPrivateTechnicalAnalysis(true, null, false)).toBe(false);
    expect(canFetchPrivateTechnicalAnalysis(true, { id: 'user-1' }, false)).toBe(true);
    expect(canFetchPrivateTechnicalAnalysis(true, { id: 'user-1' }, true)).toBe(false);
  });

  it('locks advanced analyzers in place with free-account CTA', () => {
    const analyzers = [
      { label: 'EMA 20/50 Cross', value: 'EMA20: 10, EMA50: 9', decision: 'BULLISH', confidence: 80 },
      { label: 'MACD', value: 'MACD: 1', decision: 'BULLISH', confidence: 70 },
    ];
    const html = renderToStaticMarkup(React.createElement(AlgoFilters, {
      analyzers,
      sortByConfidence: false,
      setSortByConfidence: () => undefined,
      getAccuracyPct: () => null,
      lockForGuest: true,
    }));

    expect(html).toContain('EMA 20/50 Cross');
    expect(html).toContain('MACD');
    expect(html).toContain('Daftar Gratis');
    expect(html).toContain('/signup?next=%2Fdashboard');
  });

  it('uses one dashboard layout and removes the separate guest preview page', () => {
    const root = path.join(__dirname, '..', '..');
    const dashboardPage = fs.readFileSync(path.join(root, 'app/dashboard/page.tsx'), 'utf8');
    const loadStates = fs.readFileSync(path.join(root, 'components/dashboard/DashboardLoadStates.tsx'), 'utf8');
    const dashboardHook = fs.readFileSync(path.join(root, 'components/dashboard/useDashboardAnalysis.ts'), 'utf8');

    expect(dashboardPage).toContain('<DashboardStockOverview');
    expect(dashboardPage).toContain('<AlgoFilters');
    expect(dashboardPage).toContain('<GuestLockedSection');
    expect(loadStates).not.toContain('GuestTechnicalPreview');
    expect(dashboardHook).not.toMatch(/apiRequest<StockAnalysisDashboardResponse>\(`\/api\/stock\/\$\{symbol\}`[\s\S]*?if \(!canFetchPrivateTechnicalAnalysis/);
    expect(dashboardHook).toContain('if (isIndexTicker(ticker) || isConfirmedGuest)');
    expect(fs.existsSync(path.join(root, 'components/dashboard/GuestTechnicalPreview.tsx'))).toBe(false);
  });

  it('keeps deep-section CTA on free signup during testing', () => {
    const html = renderToStaticMarkup(React.createElement(
      GuestLockedSection,
      { label: 'Risk/reward dan position sizing' },
      React.createElement('div', null, 'Premium value'),
    ));

    expect(html).toContain('Daftar Gratis');
    expect(html).toContain('/signup?next=%2Fdashboard');
    expect(html).not.toContain('Masuk untuk membuka');
  });
});
