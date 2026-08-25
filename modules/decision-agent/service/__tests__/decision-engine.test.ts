import { describe, expect, it } from 'vitest';
import type { ScoredStock } from '@/modules/recommendation/service/ai-pick.service';
import { buildDecisionSignal } from '../decision-engine';
import type { NewsItem } from '@/modules/news';

function stock(overrides: Partial<ScoredStock> = {}): ScoredStock {
  return {
    symbol: 'BBCA.JK',
    price: 10_000,
    changePct: 1,
    totalScore: 78,
    rsi: 55,
    accumulationConfirmed: true,
    breakdown: { technical: 30, fundamental: 25, flow: 23 },
    topReasons: ['Trend naik', 'Fundamental sehat'],
    coverage: 90,
    kategori: 'BUY',
    eligibilityStatus: 'ELIGIBLE',
    eligibilityReasons: [],
    avgValue20d: 500_000_000_000,
    tradeSetup: { tp1: 11_000, tp2: 11_500, cl1: 9_500, cl2: 9_000, rr: 2 },
    ...overrides,
  };
}

const dataAsOf = '2026-08-24T03:00:00.000Z';
const now = new Date('2026-08-24T03:10:00.000Z');

describe('buildDecisionSignal', () => {
  it('membentuk BUY_CANDIDATE paper-ready tetapi live tetap diblokir saat model belum valid', () => {
    const result = buildDecisionSignal({ stock: stock(), bearish: false, newsItems: [], dataAsOf, now, modelValidated: false });
    expect(result.action).toBe('BUY_CANDIDATE');
    expect(result.paperReadiness).toBe('PAPER_READY');
    expect(result.liveReadiness).toBe('BLOCKED_MODEL_UNVALIDATED');
  });

  it('fail-closed menjadi NO_SIGNAL saat coverage tidak cukup', () => {
    const result = buildDecisionSignal({ stock: stock({ coverage: 60 }), bearish: false, newsItems: [], dataAsOf, now, modelValidated: false });
    expect(result.action).toBe('NO_SIGNAL');
    expect(result.paperReadiness).toBe('RESEARCH_ONLY');
    expect(result.liveReadiness).toBe('BLOCKED_DATA_QUALITY');
  });

  it('tidak mengganti breakdown yang hilang dengan angka buatan', () => {
    const result = buildDecisionSignal({ stock: stock({ breakdown: undefined }), bearish: false, newsItems: [], dataAsOf, now, modelValidated: false });
    expect(result.action).toBe('NO_SIGNAL');
    expect(result.scoreBreakdown).toBeNull();
    expect(result.paperReadiness).toBe('RESEARCH_ONLY');
  });

  it('snapshot basi tidak dapat dibuat menjadi order paper baru', () => {
    const result = buildDecisionSignal({
      stock: stock(), bearish: false, newsItems: [], dataAsOf,
      now: new Date('2026-08-24T05:00:00.000Z'), modelValidated: false,
    });
    expect(result.action).toBe('BUY_CANDIDATE');
    expect(result.paperReadiness).toBe('RESEARCH_ONLY');
    expect(result.liveReadiness).toBe('BLOCKED_STALE_DATA');
  });

  it('sinyal bearish menjadi EXIT_REVIEW, bukan short recommendation', () => {
    const result = buildDecisionSignal({ stock: stock(), bearish: true, newsItems: [], dataAsOf, now, modelValidated: false });
    expect(result.action).toBe('EXIT_REVIEW');
  });

  it('membawa sektor, ADV, sumber, waktu, dan basis RSS tanpa mengarang artikel', () => {
    const news: NewsItem = {
      title: 'BBCA melaporkan laba kuartal', link: 'https://example.com/bbca', source: 'Sumber RSS',
      pubDate: '2026-08-24T02:00:00.000Z', sentiment: 'POSITIF', reason: 'Laba meningkat',
      summary: 'Ringkasan RSS menyebut laba dan pendapatan yang dilaporkan.', evidenceBasis: 'RSS_SUMMARY',
      intelligence: {
        eventType: 'EARNINGS', eventLabel: 'Kinerja keuangan', affectedMetrics: ['Laba bersih'],
        horizon: 'SHORT_TERM', expectedImpact: { direction: 'POSITIVE', magnitude: 'HIGH', summary: 'Laba meningkat.' },
        confidence: 80, evidenceBasis: 'RSS_SUMMARY',
      },
    };
    const result = buildDecisionSignal({ stock: stock(), bearish: false, newsItems: [news], dataAsOf, now, modelValidated: false, sector: 'Financial Services' });
    expect(result.sector).toBe('Financial Services');
    expect(result.avgValue20d).toBe(500_000_000_000);
    expect(result.news.basis).toBe('RSS_SUMMARY');
    expect(result.news.matchedArticles).toEqual([expect.objectContaining({ source: 'Sumber RSS', eventType: 'EARNINGS', basis: 'RSS_SUMMARY' })]);
  });
});
