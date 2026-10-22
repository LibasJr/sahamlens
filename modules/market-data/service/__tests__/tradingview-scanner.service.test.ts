import { describe, expect, it, vi } from 'vitest';
import {
  buildTradingViewPayload,
  calculateCompositePerformance,
  calculateDist52wHighPct,
  calculateMarketBreadth,
  calculateRelativeStrength,
  calculateSectorSummary,
  checkIsPocketPivot,
  checkIsStage2,
  checkNear52wHigh,
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
      expect(parsed[0].price52wHigh).toBeNull();
      expect(parsed[0].dist52wHighPct).toBeNull();
      expect(parsed[0].isStage2).toBe(false);
      expect(parsed[0].near52wHigh).toBe(false);
      expect(parsed[0].isPocketPivot).toBe(false);
    });

    it('mem-parsing kolom-kolom baru (52W, RVOL, ATR, EMA10, gap) dan menghasilkan metrik kuantitatif', () => {
      const mockRawFull = {
        totalCount: 1,
        data: [
          {
            s: 'IDX:MEDC',
            d: [
              'MEDC', 1400, 3.5, 5000000, 7000000000, 65.0,
              'Energy Minerals', 'Oil & Gas Production', 35000000000000, 6.5, 1.1,
              1320, 1250, 1100, 2.5, 8.0, 15.0, 25.0, 40.0,
              1500, 1000, 2.1, 8000000, 3.2, 45, 1350, 1280, 0.5, 1.2,
            ],
          },
        ],
      };

      const parsed = parseTradingViewScanResponse(mockRawFull);
      expect(parsed).toHaveLength(1);
      const stock = parsed[0];
      expect(stock.ticker).toBe('MEDC');
      expect(stock.price52wHigh).toBe(1500);
      expect(stock.price52wLow).toBe(1000);
      expect(stock.rvol).toBe(2.1);
      expect(stock.avgVolume30d).toBe(8000000);
      expect(stock.volatilityD).toBe(3.2);
      expect(stock.atr).toBe(45);
      expect(stock.ema10).toBe(1350);
      expect(stock.sma20).toBe(1280);
      expect(stock.gap).toBe(0.5);
      expect(stock.changeFromOpen).toBe(1.2);

      // dist52wHighPct: ((1500 - 1400) / 1500) * 100 = 6.67%
      expect(stock.dist52wHighPct).toBe(6.67);
      // isStage2: 1400 > 1250 (sma50) && 1250 > 1100 (sma200) && 1400 > 1320 (ema20) -> true
      expect(stock.isStage2).toBe(true);
      // near52wHigh: isStage2 && 6.67 <= 15.0 -> true
      expect(stock.near52wHigh).toBe(true);
      // isPocketPivot: close >= ema10 (1400 >= 1350) && rvol 2.1 >= 1.5 && change 3.5 > 0 && dist 6.67 <= 25.0 -> true
      expect(stock.isPocketPivot).toBe(true);
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

  describe('calculateDist52wHighPct', () => {
    it('menghitung persentase jarak terhadap 52W High dengan pembulatan 2 desimal', () => {
      // High 1000, Close 850 -> ((1000 - 850) / 1000) * 100 = 15.0%
      expect(calculateDist52wHighPct(1000, 850)).toBe(15);
      // High 1500, Close 1400 -> ((1500 - 1400) / 1500) * 100 = 6.666... -> 6.67%
      expect(calculateDist52wHighPct(1500, 1400)).toBe(6.67);
      // At High -> 0%
      expect(calculateDist52wHighPct(1000, 1000)).toBe(0);
      // Breakout di atas High -> -5%
      expect(calculateDist52wHighPct(1000, 1050)).toBe(-5);
    });

    it('mengembalikan null jika data tidak lengkap atau invalid', () => {
      expect(calculateDist52wHighPct(null, 1000)).toBeNull();
      expect(calculateDist52wHighPct(1000, null)).toBeNull();
      expect(calculateDist52wHighPct(0, 1000)).toBeNull();
      expect(calculateDist52wHighPct(-100, 1000)).toBeNull();
    });
  });

  describe('checkIsStage2', () => {
    it('mengembalikan true jika Close > SMA50 > SMA200 dan Close > EMA20', () => {
      // Close: 150, SMA50: 130, SMA200: 100, EMA20: 140
      expect(checkIsStage2(150, 130, 100, 140)).toBe(true);
    });

    it('mengembalikan true jika Close > SMA50 > SMA200 dan EMA20 null/tidak ada', () => {
      expect(checkIsStage2(150, 130, 100, null)).toBe(true);
      expect(checkIsStage2(150, 130, 100)).toBe(true);
    });

    it('mengembalikan false jika Close <= SMA50', () => {
      expect(checkIsStage2(120, 130, 100, 115)).toBe(false);
    });

    it('mengembalikan false jika SMA50 <= SMA200 (Stage 4 / Downtrend)', () => {
      expect(checkIsStage2(150, 90, 100, 140)).toBe(false);
    });

    it('mengembalikan false jika EMA20 ada namun Close <= EMA20', () => {
      expect(checkIsStage2(135, 130, 100, 140)).toBe(false);
    });

    it('mengembalikan false jika parameter esensial bernilai null', () => {
      expect(checkIsStage2(null, 130, 100, 140)).toBe(false);
      expect(checkIsStage2(150, null, 100, 140)).toBe(false);
      expect(checkIsStage2(150, 130, null, 140)).toBe(false);
    });
  });

  describe('checkNear52wHigh', () => {
    it('mengembalikan true jika Stage 2 dan dist52wHighPct <= 15%', () => {
      expect(checkNear52wHigh(true, 0)).toBe(true);
      expect(checkNear52wHigh(true, 5.5)).toBe(true);
      expect(checkNear52wHigh(true, 15.0)).toBe(true);
    });

    it('mengembalikan false jika dist52wHighPct > 15%', () => {
      expect(checkNear52wHigh(true, 15.01)).toBe(false);
      expect(checkNear52wHigh(true, 25.0)).toBe(false);
    });

    it('mengembalikan false jika bukan Stage 2', () => {
      expect(checkNear52wHigh(false, 5.0)).toBe(false);
    });

    it('mengembalikan false jika dist52wHighPct null', () => {
      expect(checkNear52wHigh(true, null)).toBe(false);
    });
  });

  describe('checkIsPocketPivot', () => {
    it('mengembalikan true jika Close >= EMA10, RVOL >= 1.5, Change > 0, dan dist <= 25%', () => {
      expect(
        checkIsPocketPivot({
          close: 100,
          ema10: 95,
          ema20: 90,
          rvol: 2.0,
          change: 3.5,
          dist52wHighPct: 10,
        })
      ).toBe(true);
    });

    it('mengembalikan true jika memantul di EMA20 saat Close < EMA10', () => {
      expect(
        checkIsPocketPivot({
          close: 98,
          ema10: 100,
          ema20: 95,
          rvol: 1.8,
          change: 1.5,
          dist52wHighPct: 12,
        })
      ).toBe(true);
    });

    it('mengembalikan false jika RVOL < 1.5 (tidak ada lonjakan volume)', () => {
      expect(
        checkIsPocketPivot({
          close: 100,
          ema10: 95,
          ema20: 90,
          rvol: 1.49,
          change: 2.0,
          dist52wHighPct: 10,
        })
      ).toBe(false);
    });

    it('mengembalikan false jika Change <= 0 (bukan hari akumulasi naik)', () => {
      expect(
        checkIsPocketPivot({
          close: 100,
          ema10: 95,
          ema20: 90,
          rvol: 2.5,
          change: 0,
          dist52wHighPct: 10,
        })
      ).toBe(false);
      expect(
        checkIsPocketPivot({
          close: 100,
          ema10: 95,
          ema20: 90,
          rvol: 2.5,
          change: -1.5,
          dist52wHighPct: 10,
        })
      ).toBe(false);
    });

    it('mengembalikan false jika dist52wHighPct > 25% (terlalu jauh dari puncak dasar)', () => {
      expect(
        checkIsPocketPivot({
          close: 100,
          ema10: 95,
          ema20: 90,
          rvol: 2.0,
          change: 4.0,
          dist52wHighPct: 25.1,
        })
      ).toBe(false);
    });

    it('mengembalikan false jika Close di bawah kedua EMA (EMA10 & EMA20)', () => {
      expect(
        checkIsPocketPivot({
          close: 85,
          ema10: 95,
          ema20: 90,
          rvol: 3.0,
          change: 2.0,
          dist52wHighPct: 10,
        })
      ).toBe(false);
    });

    it('mengembalikan false jika salah satu data esensial null', () => {
      expect(
        checkIsPocketPivot({
          close: null,
          ema10: 95,
          rvol: 2.0,
          change: 2.0,
          dist52wHighPct: 10,
        })
      ).toBe(false);
      expect(
        checkIsPocketPivot({
          close: 100,
          rvol: null,
          change: 2.0,
          dist52wHighPct: 10,
        })
      ).toBe(false);
      expect(
        checkIsPocketPivot({
          close: 100,
          rvol: 2.0,
          change: null,
          dist52wHighPct: 10,
        })
      ).toBe(false);
      expect(
        checkIsPocketPivot({
          close: 100,
          rvol: 2.0,
          change: 2.0,
          dist52wHighPct: null,
        })
      ).toBe(false);
    });
  });
});
