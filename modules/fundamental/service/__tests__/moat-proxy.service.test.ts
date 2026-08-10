import { describe, expect, it } from 'vitest';
import { buildMoatProxy } from '../moat-proxy.service';

const signal = (label: string, decision: 'BULLISH' | 'BEARISH' | 'NEUTRAL', value = '10%') => ({
  label,
  value,
  decision,
  confidence: 70,
});

describe('buildMoatProxy', () => {
  it('hanya memakai sepuluh indikator kualitas dan mengabaikan valuasi', () => {
    const result = buildMoatProxy([
      signal('ROE (Profitability)', 'BULLISH', '20%'),
      signal('Gross Margin', 'BULLISH', '45%'),
      signal('P/E Ratio (Valuation)', 'BEARISH', '30x'),
      signal('PBV Ratio (Valuation)', 'BEARISH', '5x'),
    ]);

    expect(result.available).toBe(2);
    expect(result.supportive).toBe(2);
    expect(result.caution).toBe(0);
    expect(result.status).toBe('DATA TERBATAS');
  });

  it('tidak menghitung N/A dan confidence nol sebagai data tersedia', () => {
    const result = buildMoatProxy([
      signal('Return on Equity', 'NEUTRAL', 'N/A'),
      { label: 'Revenue Growth', value: '12%', decision: 'BULLISH', confidence: 0 },
    ]);

    expect(result.available).toBe(0);
    expect(result.status).toBe('DATA TERBATAS');
    expect(result.supportPct).toBeNull();
  });

  it('menampilkan kondisi campuran saat indikator kuat dan lemah berimbang', () => {
    const result = buildMoatProxy([
      signal('ROE (Profitability)', 'BULLISH'),
      signal('ROA (Efficiency)', 'BEARISH'),
      signal('Revenue Growth (YoY)', 'NEUTRAL'),
      signal('Gross Margin', 'NEUTRAL'),
      signal('Operating Margin', 'NEUTRAL'),
    ]);

    expect(result.status).toBe('CAMPURAN');
    expect(result.supportive).toBe(1);
    expect(result.caution).toBe(1);
    expect(result.neutral).toBe(3);
  });

  it('tidak menyebut kuat bila dukungan belum menjadi mayoritas absolut', () => {
    const result = buildMoatProxy([
      signal('ROE (Profitability)', 'BULLISH'),
      signal('ROA (Efficiency)', 'NEUTRAL'),
      signal('Gross Margin', 'NEUTRAL'),
      signal('Operating Margin', 'NEUTRAL'),
      signal('Net Profit Margin', 'NEUTRAL'),
    ]);

    expect(result.status).toBe('CAMPURAN');
  });

  it('mengelompokkan indikator ke empat pilar dengan cakupan transparan', () => {
    const result = buildMoatProxy([
      signal('ROE (Profitability)', 'BULLISH'),
      signal('ROA (Efficiency)', 'BULLISH'),
      signal('Gross Margin', 'BULLISH'),
      signal('Operating Margin', 'BULLISH'),
      signal('Net Profit Margin', 'BULLISH'),
      signal('EPS Growth (QoQ)', 'BULLISH'),
      signal('Revenue Growth (YoY)', 'BULLISH'),
      signal('Debt/Equity (Risk)', 'BULLISH'),
      signal('Current Ratio (Liquidity)', 'BULLISH'),
      signal('Quick Ratio (Liquidity)', 'BULLISH'),
    ]);

    expect(result.available).toBe(10);
    expect(result.coveragePct).toBe(100);
    expect(result.pillars).toHaveLength(4);
    expect(result.pillars.every((pillar) => pillar.status === 'KUAT')).toBe(true);
  });
});
