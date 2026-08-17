import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryReadWithRetry, getLastRun } = vi.hoisted(() => ({
  queryReadWithRetry: vi.fn(),
  getLastRun: vi.fn(),
}));

vi.mock('@/shared/database/postgres.client', () => ({ queryReadWithRetry }));
vi.mock('@/shared/scheduler/job-run-log.repository', () => ({ getLastRun }));

import {
  getBrokerSummaryMonitor,
  normalizeBrokerMonitorTicker,
} from '../broker-summary-monitor.service';
import { PUBLIC_BROKER_DAILY_SOURCE } from '../broker-summary-integrity';

describe('normalizeBrokerMonitorTicker', () => {
  it('menormalkan ticker IDX dan menolak input yang tidak aman', () => {
    expect(normalizeBrokerMonitorTicker(' bbca.jk ')).toBe('BBCA');
    expect(normalizeBrokerMonitorTicker('BRI-1')).toBe('BRI-1');
    expect(normalizeBrokerMonitorTicker('BBCA;DROP TABLE')).toBeNull();
    expect(normalizeBrokerMonitorTicker('')).toBeNull();
  });
});

describe('getBrokerSummaryMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLastRun.mockResolvedValue(null);
  });

  it('mengembalikan keadaan kosong bila tabel belum pernah dibuat', async () => {
    queryReadWithRetry.mockResolvedValueOnce({ rows: [{ table_name: null }] });

    const result = await getBrokerSummaryMonitor();

    expect(result.tableReady).toBe(false);
    expect(result.dates).toEqual([]);
    expect(result.brokers).toEqual([]);
    expect(queryReadWithRetry).toHaveBeenCalledTimes(1);
  });

  it('membaca tanggal terbaru, cakupan, ticker, dan agregasi broker otomatis', async () => {
    const job = {
      id: 9,
      job_name: 'broker-summary-scan',
      item_key: null,
      status: 'SUCCESS',
      started_at: '2026-08-11T11:30:00.000Z',
      finished_at: '2026-08-11T11:31:00.000Z',
      error_message: null,
      meta: null,
    };
    getLastRun.mockResolvedValue(job);
    queryReadWithRetry
      .mockResolvedValueOnce({ rows: [{ table_name: 'broker_summary_daily' }] })
      .mockResolvedValueOnce({
        rows: [
          { trade_date: '2026-08-11', row_count: '3000', ticker_count: 150, broker_count: 92, last_imported_at: '2026-08-11T11:31:00.000Z' },
          { trade_date: '2026-08-08', row_count: 2900, ticker_count: 148, broker_count: 91, last_imported_at: '2026-08-08T11:31:00.000Z' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ticker: 'BBCA' }, { ticker: 'BBRI' }] })
      .mockResolvedValueOnce({
        rows: [{
          row_count: '20',
          ticker_count: '1',
          broker_count: '20',
          total_buy_value: '1250000000',
          total_sell_value: '1000000000',
          total_buy_volume: '125000',
          total_sell_volume: '100000',
          total_buy_frequency: '250',
          total_sell_frequency: '200',
          last_imported_at: '2026-08-11T11:31:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { broker_code: 'YP', buy_value: '500000000', sell_value: '100000000', buy_volume: '50000', sell_volume: '10000', buy_frequency: '50', sell_frequency: '20', net_value: '400000000' },
          { broker_code: 'CC', buy_value: '50000000', sell_value: '300000000', buy_volume: '5000', sell_volume: '30000', buy_frequency: '10', sell_frequency: '30', net_value: '-250000000' },
        ],
      });

    const result = await getBrokerSummaryMonitor({ date: 'tanggal-salah', ticker: 'bbca.jk' });

    expect(result.tableReady).toBe(true);
    expect(result.job).toEqual(job);
    expect(result.selectedDate).toBe('2026-08-11');
    expect(result.selectedTicker).toBe('BBCA');
    expect(result.availableTickers).toEqual(['BBCA', 'BBRI']);
    expect(result.coverage).toMatchObject({
      rowCount: 20,
      tickerCount: 1,
      brokerCount: 20,
      totalBuyValue: 1_250_000_000,
      totalSellValue: 1_000_000_000,
      totalBuyVolume: 125_000,
      totalSellVolume: 100_000,
      totalBuyFrequency: 250,
      totalSellFrequency: 200,
    });
    expect(result.brokers).toEqual([
      { brokerCode: 'YP', buyValue: 500_000_000, sellValue: 100_000_000, buyVolume: 50_000, sellVolume: 10_000, buyFrequency: 50, sellFrequency: 20, avgBuyValuePerTrade: 10_000_000, avgSellValuePerTrade: 5_000_000, netValue: 400_000_000 },
      { brokerCode: 'CC', buyValue: 50_000_000, sellValue: 300_000_000, buyVolume: 5_000, sellVolume: 30_000, buyFrequency: 10, sellFrequency: 30, avgBuyValuePerTrade: 5_000_000, avgSellValuePerTrade: 10_000_000, netValue: -250_000_000 },
    ]);
    expect(queryReadWithRetry.mock.calls[4]?.[1]).toEqual([
      '2026-08-11',
      PUBLIC_BROKER_DAILY_SOURCE,
      'BBCA',
      50,
    ]);
    expect(result.source).toBe(PUBLIC_BROKER_DAILY_SOURCE);
    expect(queryReadWithRetry.mock.calls[1]?.[1]).toEqual([PUBLIC_BROKER_DAILY_SOURCE, 30]);
    expect(queryReadWithRetry.mock.calls[2]?.[1]).toEqual(['2026-08-11', PUBLIC_BROKER_DAILY_SOURCE]);
  });
});
