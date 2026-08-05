import { beforeAll, describe, expect, it } from 'vitest';

let script: any;

beforeAll(async () => {
  script = await import('../backfill-fundamental-history.mjs');
});

describe('backfill-fundamental-history script', () => {
  it('parseArgs menerima file, filter ticker, dan mode dry-run', () => {
    const options = script.parseArgs(
      [
        '--file=data/fundamental-awal-2026.csv',
        '--observed-date=2026-01-15',
        '--tickers=bbca,TLKM.JK',
        '--source=IDX financial statement',
        '--skip-empty-rows',
        '--dry-run',
      ],
      new Date('2026-08-06T00:00:00Z')
    );

    expect(options).toMatchObject({
      file: 'data/fundamental-awal-2026.csv',
      observedDate: '2026-01-15',
      tickers: ['BBCA.JK', 'TLKM.JK'],
      source: 'IDX financial statement',
      dryRun: true,
      skipEmptyRows: true,
      percentInput: 'percent',
    });
  });

  it('CSV parser membaca quote dan koma di dalam field source', () => {
    const rows = script.parseCsv('ticker,observed_date,per,source\nBBCA,2026-01-15,22.1,"IDX, laporan Q4"\n');
    expect(rows).toEqual([
      { ticker: 'BBCA', observed_date: '2026-01-15', per: '22.1', source: 'IDX, laporan Q4' },
    ]);
  });

  it('normalizeFundamentalRow tidak memakai data masa depan dan tidak mengubah null menjadi nol', () => {
    const row = script.normalizeFundamentalRow(
      {
        ticker: 'bbca',
        observed_date: '2026-01-15',
        per: '22,1',
        pbv: '-',
        roe: '18.5%',
        der: '',
        current_ratio: '1,4',
        revenue_growth: '8',
      },
      2,
      {
        maxObservedDate: '2026-08-06',
        percentInput: 'percent',
        source: 'test-source',
        observedDate: null,
      }
    );

    expect(row).toMatchObject({
      ticker: 'BBCA.JK',
      observedDate: '2026-01-15',
      per: 22.1,
      pbv: null,
      roe: 18.5,
      der: null,
      currentRatio: 1.4,
      revenueGrowth: 8,
      source: 'test-source',
    });
  });

  it('percent-input decimal mengubah ROE dan revenue growth ke persen secara eksplisit', () => {
    const [row] = script.parseFundamentalRowsFromText(
      JSON.stringify([{ ticker: 'TLKM.JK', observedDate: '2026-02-01', roe: 0.16, revenueGrowth: 0.075 }]),
      {
        file: 'x.json',
        format: 'json',
        maxObservedDate: '2026-08-06',
        percentInput: 'decimal',
        source: 'json-fixture',
        observedDate: null,
      }
    );

    expect(row.roe).toBe(16);
    expect(row.revenueGrowth).toBe(7.5);
  });

  it('baris tanpa observed_date boleh memakai default --observed-date, bukan tanggal hari ini', () => {
    const [row] = script.parseFundamentalRowsFromText(
      'ticker,per\nBBRI,12.4\n',
      {
        file: 'x.csv',
        format: 'csv',
        maxObservedDate: '2026-08-06',
        percentInput: 'percent',
        source: 'manual',
        observedDate: '2026-01-31',
      }
    );

    expect(row.observedDate).toBe('2026-01-31');
    expect(row.ticker).toBe('BBRI.JK');
  });

  it('nama kolom kapital dari CSV/Excel tetap diterima', () => {
    const [row] = script.parseFundamentalRowsFromText(
      'Kode,Observed_Date,PER,PBV,ROE,Revenue_Growth\nBBCA,2026-01-31,22.1,4.3,18.5,8\n',
      {
        file: 'x.csv',
        format: 'csv',
        maxObservedDate: '2026-08-06',
        percentInput: 'percent',
        source: 'manual',
        observedDate: null,
      }
    );

    expect(row).toMatchObject({
      ticker: 'BBCA.JK',
      observedDate: '2026-01-31',
      per: 22.1,
      pbv: 4.3,
      roe: 18.5,
      revenueGrowth: 8,
    });
  });

  it('observed_date masa depan ditolak fail-closed', () => {
    expect(() => script.normalizeFundamentalRow(
      { ticker: 'BBCA', observed_date: '2026-09-01', per: 20 },
      2,
      {
        maxObservedDate: '2026-08-06',
        percentInput: 'percent',
        source: 'test',
        observedDate: null,
      }
    )).toThrow(/masa depan/);
  });

  it('baris tanpa metrik fundamental ditolak, bukan disimpan sebagai angka nol', () => {
    expect(() => script.normalizeFundamentalRow(
      { ticker: 'BBCA', observed_date: '2026-01-15', per: '', roe: '-' },
      2,
      {
        maxObservedDate: '2026-08-06',
        percentInput: 'percent',
        source: 'test',
        observedDate: null,
      }
    )).toThrow(/minimal satu metrik/);
  });

  it('placeholder kosong bisa dilewati eksplisit dengan --skip-empty-rows', () => {
    const result = script.parseFundamentalRowsFromTextWithStats(
      [
        'Kode,observed_date,PER,PBV,ROE,DER,current_ratio,revenue_growth,source',
        'BBCA,2026-01-31,22.1,4.3,18.5,0.2,1.4,8.0,IDX',
        'TPIA,2026-01-31,,,,,,,IDX',
        'DGWG,2026-01-31,,,,,,,IDX',
      ].join('\n'),
      {
        file: 'x.csv',
        format: 'csv',
        maxObservedDate: '2026-08-06',
        percentInput: 'percent',
        source: 'manual',
        observedDate: null,
        skipEmptyRows: true,
      }
    );

    expect(result.rows.map((row: any) => row.ticker)).toEqual(['BBCA.JK']);
    expect(result.rawRows).toBe(3);
    expect(result.skippedEmptyRows).toBe(2);
  });

  it('tanpa --skip-empty-rows, placeholder kosong tetap fail-closed', () => {
    expect(() => script.parseFundamentalRowsFromTextWithStats(
      [
        'Kode,observed_date,PER,PBV,ROE,DER,current_ratio,revenue_growth,source',
        'TPIA,2026-01-31,,,,,,,IDX',
      ].join('\n'),
      {
        file: 'x.csv',
        format: 'csv',
        maxObservedDate: '2026-08-06',
        percentInput: 'percent',
        source: 'manual',
        observedDate: null,
        skipEmptyRows: false,
      }
    )).toThrow(/minimal satu metrik/);
  });

  it('buildFundamentalHistoryInsert append-only via ON CONFLICT DO NOTHING dan menyimpan source', () => {
    const query = script.buildFundamentalHistoryInsert([
      {
        ticker: 'BBCA.JK',
        observedDate: '2026-01-15',
        per: 22.1,
        pbv: 4.3,
        roe: 18.5,
        der: 0.2,
        currentRatio: null,
        revenueGrowth: 8,
        source: 'IDX financial statement',
      },
    ]);

    expect(query).not.toBeNull();
    expect(query!.text.replace(/\s+/g, ' ')).toContain('ON CONFLICT (ticker, observed_date) DO NOTHING');
    expect(query!.text).not.toContain('DO UPDATE');
    expect(query!.text).toContain('source');
    expect(query!.params).toEqual([
      'BBCA.JK',
      '2026-01-15',
      22.1,
      4.3,
      18.5,
      0.2,
      null,
      8,
      'IDX financial statement',
    ]);
  });

  it('filterRows membatasi import jika --tickers dipakai', () => {
    const rows = [
      { ticker: 'BBCA.JK' },
      { ticker: 'BBRI.JK' },
      { ticker: 'TLKM.JK' },
    ];
    expect(script.filterRows(rows, ['BBCA.JK', 'TLKM.JK']).map((row: any) => row.ticker))
      .toEqual(['BBCA.JK', 'TLKM.JK']);
  });
});
