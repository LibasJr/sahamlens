import { describe, expect, it } from 'vitest';
import { buildLensScoreInputProvenance } from '../lens-score-input-provenance.service';

describe('buildLensScoreInputProvenance', () => {
  it('memetakan technical, fundamental, dan flow ke source yang sesuai tanpa mengubah value', () => {
    const provenance = buildLensScoreInputProvenance({
      period: '1d history',
      asOf: '2026-08-26T09:00:00.000Z',
      retrievedAt: '2026-08-27T03:00:00.000Z',
      technical: {
        currentPrice: 9000,
        ma20: 8800,
        rsi: 57.2,
        macdHist: 12.3,
        volToday: null,
      },
      fundamental: {
        per: 18.4,
        normalizedRoe: 21.5,
        sector: {
          yahooSector: 'Financial Services',
          payoutRatio: 0.42,
        },
      },
      flow: {
        officialNetPressure20: 14.2,
        accumulationStatus: 'AKUMULASI',
        consecutiveBuyDays: 3,
      },
    });

    expect(provenance.technical.currentPrice).toEqual({
      value: 9000,
      provenance: expect.objectContaining({
        source: 'YAHOO_CHART',
        period: '1d history',
        asOf: '2026-08-26T09:00:00.000Z',
        retrievedAt: '2026-08-27T03:00:00.000Z',
        transformation: 'DIRECT',
      }),
    });
    expect(provenance.technical.rsi).toEqual({
      value: 57.2,
      provenance: expect.objectContaining({ source: 'TECHNICAL_ANALYZERS', transformation: 'DERIVED' }),
    });
    expect(provenance.technical.macdHist.provenance.source).toBe('TECHNICAL_ANALYZERS');
    expect(provenance.technical.volToday.value).toBeNull();

    expect(provenance.fundamental.per.provenance).toEqual(expect.objectContaining({
      source: 'YAHOO_QUOTE_SUMMARY',
      transformation: 'DIRECT',
    }));
    expect(provenance.fundamental.normalizedRoe).toEqual({
      value: 21.5,
      provenance: expect.objectContaining({ source: 'NORMALIZED_EARNINGS_HISTORY' }),
    });
    expect(provenance.fundamental['sector.yahooSector'].value).toBe('Financial Services');
    expect(provenance.fundamental['sector.payoutRatio'].value).toBe(0.42);

    expect(provenance.flow.officialNetPressure20).toEqual({
      value: 14.2,
      provenance: expect.objectContaining({ source: 'IDX_OFFICIAL_API', transformation: 'DERIVED' }),
    });
    expect(provenance.flow.accumulationStatus.value).toBe('AKUMULASI');
  });

  it('mengabaikan nested object yang tidak secara eksplisit didukung', () => {
    const provenance = buildLensScoreInputProvenance({
      technical: { nested: { value: 1 } },
      fundamental: {},
      flow: { list: [1, 2, 3] },
    });

    expect(provenance.technical).toEqual({});
    expect(provenance.flow).toEqual({});
  });
});
