import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SetupCard } from '@/components/radar/SetupCard';
import type { AiPickItem } from '@/app/breakout-radar/radar-model';

function makeItem(overrides: Partial<AiPickItem> = {}): AiPickItem {
  return {
    symbol: 'BBCA.JK',
    price: 10000,
    changePct: 2.5,
    baseScore: 75,
    signals: [],
    finalScore: 75,
    coverage: 95,
    flagged: false,
    flagReason: null,
    breakdown: { technical: 30, fundamental: 25, flow: 20 },
    topReasons: ['MACD bullish'],
    ...overrides,
  };
}

function renderCard(item: AiPickItem, isExpanded: boolean) {
  return renderToStaticMarkup(
    <SetupCard item={item} isExpanded={isExpanded} onToggle={() => {}} />
  );
}

describe('SetupCard (renderToStaticMarkup)', () => {
  it('renders category badge for breakout', () => {
    const item = makeItem({ signals: ['breakout'] });
    const html = renderCard(item, false);
    expect(html).toContain('Breakout');
  });

  it('renders score and price', () => {
    const item = makeItem({ price: 10500, finalScore: 82 });
    const html = renderCard(item, false);
    expect(html).toContain('82');
    expect(html).toContain('10.500');
  });

  it('renders coverage percentage', () => {
    const item = makeItem({ coverage: 87 });
    const html = renderCard(item, false);
    expect(html).toContain('data 87%');
  });

  it('renders flag warning when flagged', () => {
    const item = makeItem({ flagged: true, flagReason: 'dead cross' });
    const html = renderCard(item, false);
    expect(html).toContain('dead cross');
  });

  it('does NOT render "Buy" or "Strong Buy" anywhere', () => {
    const item = makeItem({ signals: ['breakout'] });
    const html = renderCard(item, true);
    expect(html).not.toMatch(/buy|strong buy/i);
  });

  it('renders entry, stop loss, targets, and RR when tradePlan exists (expanded)', () => {
    const item = makeItem({
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: ['Pullback ke support'],
        missingData: [],
        caveats: ['TradePlan adalah rencana risiko, bukan jaminan.'],
      },
    });
    const html = renderCard(item, true);
    expect(html).toContain('Entry Ref');
    expect(html).toContain('Stop / Inval');
    expect(html).toContain('Target 1');
    expect(html).toContain('Target 2');
    expect(html).toContain('Risk/Reward');
    expect(html).toContain('1:2.0');
  });

  it('renders "not available" message when no tradePlan (expanded)', () => {
    const item = makeItem({ tradePlan: null });
    const html = renderCard(item, true);
    expect(html).toContain('belum tersedia');
  });

  it('renders support and resistance when available', () => {
    const item = makeItem({
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: [],
        missingData: ['ADX/DMI'],
        caveats: [],
      },
    });
    const html = renderCard(item, true);
    expect(html).toContain('Support');
    expect(html).toContain('Resistance');
    expect(html).toContain('ADX/DMI');
  });

  it('renders missing data section', () => {
    const item = makeItem({
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: [],
        missingData: ['ADX/DMI', 'Bollinger %B'],
        caveats: [],
      },
    });
    const html = renderCard(item, true);
    expect(html).toContain('Data Belum Tersedia');
    expect(html).toContain('ADX/DMI');
  });

  it('renders caveats when present', () => {
    const item = makeItem({
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: [],
        missingData: [],
        caveats: ['Entry memakai Open H+1 setelah sinyal EOD.'],
      },
    });
    const html = renderCard(item, true);
    expect(html).toContain('Entry memakai Open H+1');
  });

  it('renders risk level and confidence badges', () => {
    const item = makeItem({
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: [],
        missingData: [],
        caveats: [],
      },
    });
    const html = renderCard(item, true);
    expect(html).toContain('Risiko: LOW');
    expect(html).toContain('Kepercayaan: HIGH');
  });

  it('does not render entry/stop when tradePlan is null (expanded)', () => {
    const item = makeItem({ tradePlan: null });
    const html = renderCard(item, true);
    expect(html).not.toContain('Entry Ref');
    expect(html).not.toContain('Stop / Invalid');
  });

  it('collapses details when isExpanded=false', () => {
    const item = makeItem({
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: [],
        missingData: [],
        caveats: [],
      },
    });
    const htmlCollapsed = renderCard(item, false);
    expect(htmlCollapsed).not.toContain('Entry Ref');
    expect(htmlCollapsed).not.toContain('Risk/Reward');
  });

  it('renders Retest category when near support', () => {
    const item = makeItem({
      price: 10200,
      signals: [],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: [],
        missingData: [],
        caveats: [],
      },
    });
    const html = renderCard(item, false);
    expect(html).toContain('Retest');
  });

  it('renders Reversal category when accumulation + near support', () => {
    const item = makeItem({
      price: 10100,
      changePct: -0.5,
      signals: ['akumulasi'],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10100,
        stopLoss: 9700,
        cutLoss: 9700,
        takeProfit1: 10700,
        takeProfit2: 11000,
        riskReward: 1.7,
        riskPercent: 4.0,
        riskAtr: 1.3,
        riskLevel: 'MEDIUM',
        confidenceScore: 60,
        confidenceLevel: 'MEDIUM',
        support: { price: 10000, touches: 4 },
        nearestSupport: { price: 10000, touches: 4 },
        resistance: { price: 10800, touches: 2 },
        reasons: [],
        missingData: [],
        caveats: [],
      },
    });
    const html = renderCard(item, false);
    expect(html).toContain('Reversal');
  });

  it('renders Momentum continuation for golden cross', () => {
    const item = makeItem({ signals: ['golden cross'] });
    const html = renderCard(item, false);
    expect(html).toContain('Lanjutan Momentum');
  });

  it('renders Setup teknikal as fallback', () => {
    const item = makeItem({ signals: [], tradePlan: null });
    const html = renderCard(item, false);
    expect(html).toContain('Setup Teknikal');
  });
});
