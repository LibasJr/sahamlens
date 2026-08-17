import { describe, expect, it } from 'vitest';
import {
  assemblePublicMacroDashboard,
  normalizeBiRateHtml,
  normalizeMarketQuotes,
  normalizeWorldBankIndicator,
} from '../public-macro-dashboard.service';

describe('public macro dashboard', () => {
  it('menormalisasi quote pasar dan mengabaikan nilai yang tidak tersedia', () => {
    const market = normalizeMarketQuotes([
      {
        symbol: 'USDIDR=X',
        regularMarketPrice: 17_790,
        regularMarketChangePercent: -0.65,
        regularMarketTime: new Date('2026-08-10T21:05:58.000Z'),
      },
      {
        symbol: '^JKSE',
        regularMarketPrice: null,
      },
    ]);

    expect(market).toHaveLength(1);
    expect(market[0]).toMatchObject({
      key: 'USD_IDR',
      value: 17_790,
      changePct: -0.65,
      source: 'Yahoo Finance',
    });
    expect(market[0].asOf).toBe('2026-08-10T21:05:58.000Z');
  });

  it('mengambil rilis World Bank terbaru beserta pembanding', () => {
    const indicator = normalizeWorldBankIndicator({
      key: 'GDP_GROWTH',
      label: 'Pertumbuhan PDB Indonesia',
      indicator: 'NY.GDP.MKTP.KD.ZG',
      unit: '% YoY',
      frequency: 'Tahunan',
    }, [
      { page: 1 },
      [
        { date: '2025', value: 5.1 },
        { date: '2024', value: 5.03 },
        { date: '2023', value: null },
      ],
    ]);

    expect(indicator).toMatchObject({
      value: 5.1,
      period: '2025',
      previousValue: 5.03,
      previousPeriod: '2024',
      trend: 'UP',
      retrievalStatus: 'LIVE',
    });
  });

  it('membaca BI-Rate hanya dari judul keputusan resmi', () => {
    const indicator = normalizeBiRateHtml(
      '<h2>BI-Rate Tetap 5,75%: Memperkuat Stabilitas</h2><p>22 Juli 2026</p>',
    );

    expect(indicator).toMatchObject({
      key: 'BI_RATE',
      value: 5.75,
      source: 'Bank Indonesia',
      retrievalStatus: 'LIVE',
    });
    expect(normalizeBiRateHtml('<p>Tidak ada keputusan suku bunga</p>')).toBeNull();
  });

  it('menghitung cakupan dan hanya membuat transmisi dari data yang tersedia', () => {
    const market = normalizeMarketQuotes([
      { symbol: 'USDIDR=X', regularMarketPrice: 17_790, regularMarketChangePercent: 0.5 },
      { symbol: 'CL=F', regularMarketPrice: 82.3, regularMarketChangePercent: 5.2 },
    ]);
    const biRate = normalizeBiRateHtml('<h2>BI-Rate Tetap 5,75%</h2>');
    const dashboard = assemblePublicMacroDashboard(
      market,
      biRate ? [biRate] : [],
      new Date('2026-08-11T00:00:00.000Z'),
    );

    expect(dashboard.coverage).toEqual({ available: 3, expected: 11, percent: 27 });
    expect(dashboard.missing).toContain('IHSG');
    expect(dashboard.transmissions.map((item) => item.key)).toEqual([
      'FX_CHANNEL',
      'OIL_CHANNEL',
      'DOMESTIC_RATE_CHANNEL',
    ]);
    expect(dashboard.retrievedAt).toBe('2026-08-11T00:00:00.000Z');
  });
});
