import { describe, expect, it } from 'vitest';
import { buildFundamentalHealthSummary, type HealthDimension } from '../health-summary';
import { analyze as analyzeRoe } from '@/modules/fundamental/service/analyzers/roe-analyzer';
import { analyze as analyzeMargin } from '@/modules/fundamental/service/analyzers/net-margin-analyzer';
import { analyze as analyzeRevenue } from '@/modules/fundamental/service/analyzers/revenue-growth-analyzer';
import { analyze as analyzeDer } from '@/modules/fundamental/service/analyzers/der-analyzer';
import { analyze as analyzeCurrentRatio } from '@/modules/fundamental/service/analyzers/current-ratio-analyzer';

/**
 * Ringkasan kesehatan di kepala /fundamental HARUS sepakat dengan kartu analyzer yang
 * ada tepat di bawahnya. Kalau ambangnya berpisah diam-diam, satu emiten bisa terbaca
 * "Profitabilitas kuat" sekaligus "ROE BEARISH" di layar yang sama - dan tidak ada
 * yang gagal, hanya pembacanya yang berhenti percaya.
 *
 * Yang diuji karena itu bukan angka ambangnya (itu cuma menyalin ulang konstanta), tapi
 * KESEPAKATAN antara dua implementasi pada nilai di sekitar batas.
 */

function dim(dimensions: HealthDimension[], id: HealthDimension['id']): HealthDimension {
  const found = dimensions.find((d) => d.id === id);
  if (!found) throw new Error(`dimensi ${id} hilang dari ringkasan`);
  return found;
}

/** BULLISH/BEARISH/NEUTRAL analyzer -> STRONG/WEAK/MODERATE ringkasan. */
function expectedFrom(decision: string): 'STRONG' | 'WEAK' | 'MODERATE' {
  if (decision === 'BULLISH') return 'STRONG';
  if (decision === 'BEARISH') return 'WEAK';
  return 'MODERATE';
}

describe('ringkasan kesehatan fundamental sepakat dengan analyzer', () => {
  // Nilai di kedua sisi setiap ambang yang dipakai analyzer terkait.
  const roeCases = [0.2, 0.151, 0.15, 0.1, 0.05, 0.049, -0.03];
  const marginCases = [0.3, 0.151, 0.15, 0.08, 0.05, 0.049, -0.1];
  const growthCases = [0.5, 0.101, 0.1, 0.03, 0, -0.001, -0.4];
  const derCases = [10, 99, 100, 150, 200, 201, 400];
  const currentRatioCases = [3, 1.51, 1.5, 1.2, 1, 0.99, 0.4];

  it('profitabilitas mengikuti ROE dan net margin yang sama-sama kuat/lemah', () => {
    for (const roe of roeCases) {
      const analyzerVerdict = expectedFrom(analyzeRoe({ financialData: { returnOnEquity: roe } }).decision);
      // Margin dipatok pada nilai yang menghasilkan verdict identik supaya `combine()`
      // tidak menutupi hasil ROE-nya.
      const margin = roe;
      expect(expectedFrom(analyzeMargin({ financialData: { profitMargins: margin } }).decision)).toBe(analyzerVerdict);

      const summary = buildFundamentalHealthSummary({ returnOnEquity: roe, profitMargins: margin }, null);
      expect(dim(summary, 'profitability').verdict, `ROE ${roe}`).toBe(analyzerVerdict);
    }
  });

  it('pertumbuhan mengikuti revenue growth analyzer', () => {
    for (const growth of growthCases) {
      const analyzerVerdict = expectedFrom(analyzeRevenue({ financialData: { revenueGrowth: growth } }).decision);
      const summary = buildFundamentalHealthSummary({ revenueGrowth: growth, earningsGrowth: growth }, null);
      expect(dim(summary, 'growth').verdict, `growth ${growth}`).toBe(analyzerVerdict);
    }
  });

  it('neraca mengikuti DER analyzer saat current ratio sepakat', () => {
    for (const der of derCases) {
      const analyzerVerdict = expectedFrom(analyzeDer({ financialData: { debtToEquity: der } }).decision);
      // Current ratio dipilih yang menghasilkan verdict sama, jadi yang diuji DER-nya.
      const currentRatio = analyzerVerdict === 'STRONG' ? 2 : analyzerVerdict === 'WEAK' ? 0.8 : 1.2;
      expect(expectedFrom(analyzeCurrentRatio({ financialData: { currentRatio } }).decision)).toBe(analyzerVerdict);

      const summary = buildFundamentalHealthSummary({ debtToEquity: der, currentRatio }, null);
      expect(dim(summary, 'balanceSheet').verdict, `DER ${der}`).toBe(analyzerVerdict);
    }
  });

  it('current ratio sendirian juga sepakat dengan analyzernya', () => {
    for (const currentRatio of currentRatioCases) {
      const analyzerVerdict = expectedFrom(analyzeCurrentRatio({ financialData: { currentRatio } }).decision);
      const summary = buildFundamentalHealthSummary({ currentRatio }, null);
      expect(dim(summary, 'balanceSheet').verdict, `current ratio ${currentRatio}`).toBe(analyzerVerdict);
    }
  });
});

describe('data hilang tidak dikarang', () => {
  it('semua dimensi UNKNOWN saat tidak ada satu pun angka', () => {
    const summary = buildFundamentalHealthSummary(null, null);
    expect(summary).toHaveLength(5);
    for (const dimension of summary) expect(dimension.verdict).toBe('UNKNOWN');
  });

  it('UNKNOWN bukan MODERATE - "belum ada data" berbeda dari "biasa saja"', () => {
    const summary = buildFundamentalHealthSummary({ returnOnEquity: null, profitMargins: null }, null);
    expect(dim(summary, 'profitability').verdict).not.toBe('MODERATE');
  });

  it('satu sinyal lemah menurunkan dimensinya, tidak disembunyikan rata-rata', () => {
    // ROE 25% (kuat) tetapi margin 1% (lemah).
    const summary = buildFundamentalHealthSummary({ returnOnEquity: 0.25, profitMargins: 0.01 }, null);
    expect(dim(summary, 'profitability').verdict).toBe('WEAK');
  });
});

describe('arus kas dibaca dari tanda, bukan besaran', () => {
  it('OCF negatif = lemah', () => {
    const summary = buildFundamentalHealthSummary({ operatingCashflow: -1, freeCashflow: 5 }, null);
    expect(dim(summary, 'cashFlow').verdict).toBe('WEAK');
  });

  it('OCF positif dengan FCF negatif = perlu dicermati, bukan lemah', () => {
    const summary = buildFundamentalHealthSummary({ operatingCashflow: 10, freeCashflow: -2 }, null);
    expect(dim(summary, 'cashFlow').verdict).toBe('CAUTION');
  });

  it('keduanya positif = kuat', () => {
    const summary = buildFundamentalHealthSummary({ operatingCashflow: 10, freeCashflow: 4 }, null);
    expect(dim(summary, 'cashFlow').verdict).toBe('STRONG');
  });
});

describe('valuasi memakai konsensus server, tidak dihitung ulang', () => {
  it('UNDERVALUED / FAIR / OVERVALUED terpetakan', () => {
    expect(dim(buildFundamentalHealthSummary({}, 'UNDERVALUED (diskon 20%)'), 'valuation').verdict).toBe('STRONG');
    expect(dim(buildFundamentalHealthSummary({}, 'FAIR VALUE'), 'valuation').verdict).toBe('MODERATE');
    expect(dim(buildFundamentalHealthSummary({}, 'OVERVALUED'), 'valuation').verdict).toBe('CAUTION');
  });

  it('label yang tidak dikenali tetap UNKNOWN, bukan ditebak', () => {
    expect(dim(buildFundamentalHealthSummary({}, 'MENGHITUNG...'), 'valuation').verdict).toBe('UNKNOWN');
  });
});

describe('bank', () => {
  it('DER dan current ratio tidak dipakai menilai neraca bank', () => {
    // DER 800 (8x) akan terbaca "lemah" untuk emiten biasa; untuk bank itu model bisnis.
    const summary = buildFundamentalHealthSummary({ debtToEquity: 800, currentRatio: 0.5 }, null, { isBank: true });
    const balanceSheet = dim(summary, 'balanceSheet');
    expect(balanceSheet.verdict).toBe('UNKNOWN');
    expect(balanceSheet.evidence).toContain('CAR');
  });
});
