import { beforeEach, describe, expect, it, vi } from 'vitest';

const { importBrokerSummaryCsv } = vi.hoisted(() => ({ importBrokerSummaryCsv: vi.fn() }));
vi.mock('../broker-summary-import.service', () => ({ importBrokerSummaryCsv }));

import {
  indexAlphaBatchToCsv,
  syncIndexAlphaBrokerSummary,
} from '../index-alpha-broker-summary.service';

describe('indexAlphaBatchToCsv', () => {
  it('mengubah respons provider menjadi CSV harian yang dikenali importer', () => {
    const result = indexAlphaBatchToCsv({
      BBCA: [{ code: 'YP', buy_value: 10_000, sell_value: 2_000, buy_avg: 9_500, sell_avg: 9_450 }],
      BBRI: [{ code: 'AK', buy_value: 0, sell_value: 0, buy_avg: 0, sell_avg: 0 }],
    }, '2026-08-11');

    expect(result.rows).toBe(1);
    expect(result.tickersWithData).toEqual(['BBCA']);
    expect(result.csvText).toContain('2026-08-11,BBCA,YP,10000,2000,9500,9450');
  });

  it('menolak nilai negatif agar data rusak tidak masuk database', () => {
    expect(() => indexAlphaBatchToCsv({
      BBCA: [{ code: 'YP', buy_value: -1, sell_value: 2_000, buy_avg: 9_500, sell_avg: 9_450 }],
    }, '2026-08-11')).toThrow('buy_value');
  });
});

describe('syncIndexAlphaBrokerSummary', () => {
  beforeEach(() => {
    importBrokerSummaryCsv.mockReset();
    importBrokerSummaryCsv.mockImplementation(async ({ csvText }: { csvText: string }) => {
      const parsedRows = csvText.trim().split('\n').length - 1;
      return { parsedRows, insertedRows: parsedRows, skippedExistingRows: 0 };
    });
  });

  it('membagi universe menjadi maksimal 50 ticker per request dan mengimpor hasilnya', async () => {
    const tickers = Array.from({ length: 51 }, (_, index) => `A${String(index).padStart(3, '0')}`);
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tickers: string[] };
      const data = Object.fromEntries(body.tickers.map((ticker) => [ticker, [
        { code: 'YP', buy_value: 1_000, sell_value: 500, buy_avg: 100, sell_avg: 99 },
      ]]));
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });

    const result = await syncIndexAlphaBrokerSummary({
      tickers,
      tradeDate: '2026-08-11',
      apiKey: 'test-key',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(importBrokerSummaryCsv).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ requestedTickers: 51, apiRequests: 2, tickersWithData: 51, insertedRows: 51 });
  });
});
