import { beforeAll, describe, expect, it } from 'vitest';

let script: any;

beforeAll(async () => {
  script = await import('../backfill-lens-history.mjs');
});

describe('backfill-lens-history script', () => {
  it('parseArgs default membuat window 1 tahun dan menerima override ticker', () => {
    const options = script.parseArgs(
      ['--start=2026-01-02', '--end=2026-02-03', '--tickers=bbca,TLKM.JK', '--dry-run', '--skip-backtest'],
      new Date('2026-08-06T00:00:00Z')
    );

    expect(options).toMatchObject({
      startDate: '2026-01-02',
      endDate: '2026-02-03',
      tickers: ['BBCA.JK', 'TLKM.JK'],
      dryRun: true,
      skipBacktest: true,
    });
  });

  it('fundamentalAsOf hanya mengambil snapshot yang sudah diketahui pada tanggal sinyal', () => {
    const history = [
      { observedDate: '2026-01-10', per: 10 },
      { observedDate: '2026-02-10', per: 20 },
      { observedDate: '2026-03-10', per: 30 },
    ];

    expect(script.fundamentalAsOf(history, '2026-02-09')?.per).toBe(10);
    expect(script.fundamentalAsOf(history, '2026-02-10')?.per).toBe(20);
    expect(script.fundamentalAsOf(history, '2026-01-09')).toBeNull();
  });

  it('buildLensHistoryUpsert idempoten via ON CONFLICT(date,ticker) dan menyimpan price-basis metadata', () => {
    const query = script.buildLensHistoryUpsert([
      {
        date: '2026-01-02',
        ticker: 'BBCA.JK',
        lensScore: 81,
        closePrice: 9000,
        marketCap: null,
        technicalScore: 32,
        fundamentalScore: 20,
        flowScore: 29,
        coveragePct: 80,
        scoreVersion: 'lens-score-v1.3.0',
        valuationVersion: 'valuation-v1.2.0',
        signalVersion: 'lens-radar-signal-v1.2.0',
        dataSnapshotVersion: 'lens-radar-history-v1.1.0',
        calculationTimestamp: '2026-01-02T10:00:00.000Z',
        rawClosePrice: 9100,
        adjustedClosePrice: 9000,
        priceBasis: 'TOTAL_RETURN_ADJUSTED',
        adjustmentFactor: 0.989011,
        corporateActionStatus: 'NONE',
        priceDataTimestamp: '2026-01-02T09:00:00.000Z',
        priceDataVersion: 'price-adjustment-v1',
        avgValue20d: 4_200_000_000,
      },
    ]);

    expect(query).not.toBeNull();
    expect(query!.text).toContain('ON CONFLICT (date, ticker) DO UPDATE SET');
    expect(query!.text).toContain('raw_close_price');
    expect(query!.text).toContain('adjusted_close_price');
    expect(query!.text).toContain('price_basis');
    expect(query!.text).toContain('price_data_version');
    expect(query!.text).toContain('avg_value_20d = EXCLUDED.avg_value_20d');
    expect(query!.params).toHaveLength(22);
    expect(query!.params).toContain(4_200_000_000);
    expect(query!.params).toContain('TOTAL_RETURN_ADJUSTED');
    expect(query!.params).toContain('price-adjustment-v1');
  });
});
