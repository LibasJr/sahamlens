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

  // REGRESI: look-ahead satu hari lewat pergeseran timezone.
  //
  // node-postgres mem-parse kolom DATE menjadi Date tengah malam WAKTU LOKAL. Dulu
  // loadFundamentalHistory() memformatnya dengan dateKeyUtc() (toISOString), sehingga di
  // server UTC+7 observed_date 2025-04-09 terbaca 2025-04-08. fundamentalAsOf() lalu
  // menganggap laporan sudah diketahui SEHARI SEBELUM terbit - skor tanggal 8 April
  // memakai laporan yang baru dipublikasikan 9 April. Pencegahnya: query meng-cast
  // observed_date ke ::text sehingga Postgres mengirim 'YYYY-MM-DD' dan tidak ada objek
  // Date yang perlu dikonversi sama sekali.
  describe('observed_date tidak bergeser oleh timezone', () => {
    it('query meng-cast observed_date ke ::text, bukan menyerahkannya sebagai DATE', async () => {
      const captured: string[] = [];
      const pool = {
        query: async (text: string) => {
          captured.push(text);
          return { rows: [] };
        },
      };

      await script.loadFundamentalHistory(pool, ['ANTM.JK'], '2026-01-01');

      expect(captured).toHaveLength(1);
      expect(captured[0].replace(/\s+/g, ' ')).toContain('observed_date::text AS observed_date');
    });

    it('tanggal dari Postgres dipetakan apa adanya dan H-1 tetap buta', async () => {
      const pool = {
        query: async () => ({
          rows: [
            // Bentuk persis yang dikirim Postgres untuk ::text atas DATE.
            { ticker: 'ANTM.JK', observed_date: '2025-04-09', per: 9.72, pbv: 1.13, roe: 11.59, der: 0.39, current_ratio: 1.84, revenue_growth: 68.57 },
          ],
        }),
      };

      const byTicker = await script.loadFundamentalHistory(pool, ['ANTM.JK'], '2026-01-01');
      const history = byTicker.get('ANTM.JK');

      expect(history[0].observedDate).toBe('2025-04-09');          // BUKAN 2025-04-08
      expect(script.fundamentalAsOf(history, '2025-04-09')?.roe).toBe(11.59);
      expect(script.fundamentalAsOf(history, '2025-04-08')).toBeNull(); // tidak bocor ke H-1
    });
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
