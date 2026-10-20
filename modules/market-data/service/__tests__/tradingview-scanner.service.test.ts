import { describe, expect, it, vi } from 'vitest';
import {
  buildTradingViewPayload,
  calculateCompositePerformance,
  calculateMarketBreadth,
  calculateRelativeStrength,
  calculateSectorSummary,
  fetchTradingViewScan,
  parseTradingViewScanResponse,
  scanIdxMarket,
  TRADINGVIEW_COLUMNS,
} from '../tradingview-scanner.service';
import { ProviderUnavailableError } from '@/shared/errors/app-error';

describe('tradingview-scanner.service', () => {
  describe('buildTradingViewPayload', () => {
    it('menghasilkan payload standar sesuai spesifikasi BEI 850 emiten', () => {
      const payload = buildTradingViewPayload();
      expect(payload.filter).toEqual([
        { left: 'type', operation: 'equal', right: 'stock' },
        { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] },
        { left: 'is_primary', operation: 'equal', right: true },
      ]);
      expect(payload.range).toEqual([0, 850]);
      expect(payload.sort).toEqual({ sortBy: 'Value.Traded', sortOrder: 'desc' });
      expect(payload.columns).toEqual(TRADINGVIEW_COLUMNS);
    });

    it('mendukung kustomisasi range dan kolom', () => {
      const customCols = ['name', 'close', 'change'];
      const payload = buildTradingViewPayload({ range: [0, 50], columns: customCols });
      expect(payload.range).toEqual([0, 50]);
      expect(payload.columns).toEqual(customCols);
    });
  });

  describe('calculateCompositePerformance', () => {
    it('menghitung bobot IBD/Minervini: 40% 3M, 20% 6M, 20% 1Y, 20% 1M', () => {
      // 0.4*10 + 0.2*20 + 0.2*30 + 0.2*5 = 4 + 4 + 6 + 1 = 15.0
      const score = calculateCompositePerformance({
        perf3M: 10,
        perf6M: 20,
        perfYear: 30,
        perfMonth: 5,
        change: 2,
      });
      expect(score).toBe(15);
    });

    it('fallback bertingkat jika data jangka panjang belum tersedia (saham baru/IPO)', () => {
      // Hanya ada perfMonth dan change
      const score = calculateCompositePerformance({
        perfMonth: 10,
        change: 2,
      });
      // 0.4*10 + 0.2*10 + 0.2*10 + 0.2*10 = 10.0
      expect(score).toBe(10);

      // Hanya ada change
      const scoreChangeOnly = calculateCompositePerformance({
        change: 5,
      });
      expect(scoreChangeOnly).toBe(5);
    });
  });

  describe('parseTradingViewScanResponse', () => {
    it('mem-parsing response TradingView menjadi entitas terstruktur', () => {
      const mockRaw = {
        totalCount: 2,
        data: [
          {
            s: 'IDX:BBCA',
            d: [
              'BBCA', 5200, 7.88, 1131000, 5881000000000, 32.3,
              'Finance', 'Major Banks', 594000000000000, 11.0, 2.36,
              5856.9, 6238.4, 6607.7, -12.2, -17.7, -20.3, -19.3, -32.4,
            ],
          },
          {
            s: 'IDX:BBRI',
            d: [
              'BBRI', 2790, 9.84, 692000, 1933000000000, 37.5,
              'Finance', 'Regional Banks', 385000000000000, 6.86, 1.30,
              3014.5, 3169.2, 3290.2, -5.0, -10.0, -15.0, -12.0, -25.0,
            ],
          },
        ],
      };

      const parsed = parseTradingViewScanResponse(mockRaw);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].ticker).toBe('BBCA');
      expect(parsed[0].symbol).toBe('IDX:BBCA');
      expect(parsed[0].close).toBe(5200);
      expect(parsed[0].change).toBe(7.88);
      expect(parsed[0].turnover).toBe(5881000000000);
      expect(parsed[0].sector).toBe('Finance');
      expect(parsed[0].industry).toBe('Major Banks');
      expect(parsed[0].aboveSma200).toBe(false); // 5200 < 6607.7
      expect(parsed[0].compositePerf).toBeDefined();
    });

    it('melempar ProviderUnavailableError jika payload tidak valid', () => {
      expect(() => parseTradingViewScanResponse(null)).toThrow(ProviderUnavailableError);
      expect(() => parseTradingViewScanResponse({})).toThrow(ProviderUnavailableError);
      expect(() => parseTradingViewScanResponse({ data: 'bukan-array' })).toThrow(ProviderUnavailableError);
    });

    it('menangani data null dan missing values secara aman tanpa NaN', () => {
      const mockNulls = {
        data: [
          {
            s: 'IDX:GOTO',
            d: ['GOTO', null, null, null, null, null, null, null, null, null, null, null, null, null],
          },
        ],
      };
      const parsed = parseTradingViewScanResponse(mockNulls);
      expect(parsed[0].ticker).toBe('GOTO');
      expect(parsed[0].close).toBeNull();
      expect(parsed[0].change).toBeNull();
      expect(parsed[0].turnover).toBeNull();
      expect(parsed[0].aboveSma200).toBeNull();
      expect(parsed[0].compositePerf).toBe(0);
      expect(parsed[0].sector).toBe('Other / Diversified');
    });
  });

  describe('calculateRelativeStrength (RS 1–99)', () => {
    it('memberikan skor persentil 1–99 untuk universe likuid (Value.Traded >= 1 Miliar)', () => {
      // Buat 5 saham likuid dengan performa bertingkat
      const stocks = [
        { ticker: 'A', turnover: 2_000_000_000, compositePerf: -10 },
        { ticker: 'B', turnover: 1_500_000_000, compositePerf: 0 },
        { ticker: 'C', turnover: 5_000_000_000, compositePerf: 10 },
        { ticker: 'D', turnover: 3_000_000_000, compositePerf: 20 },
        { ticker: 'E', turnover: 1_000_000_000, compositePerf: 30 },
      ];

      const scored = calculateRelativeStrength(stocks, { minTurnoverIdr: 1_000_000_000 });
      expect(scored).toHaveLength(5);

      // Terendah harus RS 1, tertinggi harus RS 99
      const stockA = scored.find((s) => s.ticker === 'A')!;
      const stockE = scored.find((s) => s.ticker === 'E')!;
      const stockC = scored.find((s) => s.ticker === 'C')!;

      expect(stockA.rsScore).toBe(1);
      expect(stockA.isLiquid).toBe(true);

      expect(stockE.rsScore).toBe(99);
      expect(stockE.isLiquid).toBe(true);

      expect(stockC.rsScore).toBe(50); // median
    });

    it('memberikan rsScore null dan isLiquid false untuk saham illiquid (< Rp 1 Miliar)', () => {
      const stocks = [
        { ticker: 'LIQ1', turnover: 2_000_000_000, compositePerf: 10 },
        { ticker: 'LIQ2', turnover: 3_000_000_000, compositePerf: 20 },
        { ticker: 'ILLIQ1', turnover: 500_000_000, compositePerf: 50 }, // performa tinggi tapi illiquid
        { ticker: 'ILLIQ2', turnover: null, compositePerf: 100 },
      ];

      const scored = calculateRelativeStrength(stocks, { minTurnoverIdr: 1_000_000_000 });
      const illiq1 = scored.find((s) => s.ticker === 'ILLIQ1')!;
      const illiq2 = scored.find((s) => s.ticker === 'ILLIQ2')!;
      const liq1 = scored.find((s) => s.ticker === 'LIQ1')!;
      const liq2 = scored.find((s) => s.ticker === 'LIQ2')!;

      expect(illiq1.rsScore).toBeNull();
      expect(illiq1.isLiquid).toBe(false);
      expect(illiq2.rsScore).toBeNull();
      expect(illiq2.isLiquid).toBe(false);

      expect(liq1.rsScore).toBe(1);
      expect(liq1.isLiquid).toBe(true);
      expect(liq2.rsScore).toBe(99);
      expect(liq2.isLiquid).toBe(true);
    });

    it('menangani tie performa secara adil dengan skor persentil yang identik', () => {
      const stocks = [
        { ticker: 'A', turnover: 2_000_000_000, compositePerf: 10 },
        { ticker: 'B', turnover: 2_000_000_000, compositePerf: 10 },
        { ticker: 'C', turnover: 2_000_000_000, compositePerf: 30 },
      ];

      const scored = calculateRelativeStrength(stocks, { minTurnoverIdr: 1_000_000_000 });
      const a = scored.find((s) => s.ticker === 'A')!;
      const b = scored.find((s) => s.ticker === 'B')!;
      const c = scored.find((s) => s.ticker === 'C')!;

      expect(a.rsScore).toBe(b.rsScore);
      expect(c.rsScore).toBe(99);
    });

    it('menangani universe likuid berisi 1 saham dengan RS 99', () => {
      const stocks = [
        { ticker: 'SOLO', turnover: 2_000_000_000, compositePerf: 15 },
      ];
      const scored = calculateRelativeStrength(stocks);
      expect(scored[0].rsScore).toBe(99);
      expect(scored[0].isLiquid).toBe(true);
    });
  });

  describe('calculateMarketBreadth', () => {
    it('menghitung advances, declines, unchanged, ratio, dan sentimen secara akurat', () => {
      const stocks = [
        { change: 2.5, turnover: 1_000_000_000 },
        { change: 1.0, turnover: 2_000_000_000 },
        { change: -0.5, turnover: 500_000_000 },
        { change: 0, turnover: 100_000_000 },
      ];

      const breadth = calculateMarketBreadth(stocks);
      expect(breadth.advances).toBe(2);
      expect(breadth.declines).toBe(1);
      expect(breadth.unchanged).toBe(1);
      expect(breadth.totalTurnover).toBe(3_600_000_000);
      expect(breadth.advanceDeclineRatio).toBe(2);
      expect(breadth.sentiment).toBe('BULLISH_DOMINANT');
    });

    it('mengelompokkan sentimen BEARISH_DOMINANT saat ratio <= 0.5', () => {
      const stocks = [
        { change: 1.0, turnover: 1_000_000_000 },
        { change: -1.0, turnover: 1_000_000_000 },
        { change: -2.0, turnover: 1_000_000_000 },
        { change: -3.0, turnover: 1_000_000_000 },
      ];

      const breadth = calculateMarketBreadth(stocks);
      expect(breadth.advanceDeclineRatio).toBe(0.33);
      expect(breadth.sentiment).toBe('BEARISH_DOMINANT');
    });
  });

  describe('calculateSectorSummary', () => {
    it('mengagregasi data sektoral dan mengurutkan berdasarkan turnover tertinggi', () => {
      const stocks = [
        { sector: 'Finance', turnover: 10_000_000_000, change: 1.5 },
        { sector: 'Finance', turnover: 5_000_000_000, change: -0.5 },
        { sector: 'Technology', turnover: 1_000_000_000, change: 3.0 },
      ];

      const sectors = calculateSectorSummary(stocks);
      expect(sectors).toHaveLength(2);
      expect(sectors[0].sector).toBe('Finance');
      expect(sectors[0].turnover).toBe(15_000_000_000);
      expect(sectors[0].up).toBe(1);
      expect(sectors[0].down).toBe(1);
      expect(sectors[0].totalStocks).toBe(2);
      expect(sectors[0].avgChangePct).toBe(0.5);

      expect(sectors[1].sector).toBe('Technology');
      expect(sectors[1].turnover).toBe(1_000_000_000);
    });
  });

  describe('fetchTradingViewScan & scanIdxMarket', () => {
    it('mengambil dan mem-parsing data scan dengan mock fetch yang sukses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          totalCount: 1,
          data: [
            {
              s: 'IDX:BBCA',
              d: [
                'BBCA', 5200, 7.88, 1000, 2_000_000_000, 32.3,
                'Finance', 'Major Banks', 500e12, 10, 2,
                5000, 4900, 4800, 1, 2, 5, 10, 20,
              ],
            },
          ],
        }),
      } as unknown as Response);

      const result = await scanIdxMarket({ fetchFn: mockFetch });
      expect(result.totalCount).toBe(1);
      expect(result.liquidCount).toBe(1);
      expect(result.stocks[0].ticker).toBe('BBCA');
      expect(result.stocks[0].rsScore).toBe(99);
      expect(result.topRs[0].ticker).toBe('BBCA');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fail-closed: melempar ProviderUnavailableError jika HTTP error (502)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
      } as unknown as Response);

      await expect(fetchTradingViewScan({ fetchFn: mockFetch })).rejects.toThrow(ProviderUnavailableError);
    });

    it('fail-closed: melempar ProviderUnavailableError jika fetch timeout', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });

      await expect(fetchTradingViewScan({ fetchFn: mockFetch, timeoutMs: 50 })).rejects.toThrow(
        /timeout setelah/
      );
    });

    it('fail-closed: melempar ProviderUnavailableError jika respon bukan JSON valid', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      } as unknown as Response);

      await expect(fetchTradingViewScan({ fetchFn: mockFetch })).rejects.toThrow(
        /response bukan JSON valid/
      );
    });
  });
});
