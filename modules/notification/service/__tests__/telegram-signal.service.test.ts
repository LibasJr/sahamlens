import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateSwingRiskSetup,
  formatSwingMomentumAlert,
  formatSwingScannerBatchSummary,
  formatPrice,
  sendTelegramMessage,
} from '../telegram-signal.service';
import type { TradingViewStockItem, IdxMarketScanResult } from '@/modules/market-data';

describe('telegram-signal.service', () => {
  describe('formatPrice', () => {
    it('memformat angka harga ke format ribuan Indonesia', () => {
      expect(formatPrice(1000)).toBe('1.000');
      expect(formatPrice(8750)).toBe('8.750');
      expect(formatPrice(15000000)).toBe('15.000.000');
    });
  });

  describe('calculateSwingRiskSetup', () => {
    it('menghitung level eksekusi swing terukur sesuai profil risiko Libas', () => {
      const stock: Pick<TradingViewStockItem, 'close' | 'ema20' | 'low' | 'atr' | 'rsScore'> = {
        close: 1000,
        ema20: 970,
        low: 955, // 4.5% di bawah entry
        atr: 35,
        rsScore: 85,
      };

      const setup = calculateSwingRiskSetup(stock, 100_000_000);
      expect(setup).not.toBeNull();
      if (!setup) return;

      expect(setup.entryPrice).toBe(1000);
      expect(setup.stopLossPrice).toBe(955);
      expect(setup.stopLossPct).toBe(4.5);
      // Risk per share = 45
      expect(setup.target1Price).toBe(1090); // 1000 + 2.0 * 45
      expect(setup.target1RiskReward).toBe(2.0);
      expect(setup.target2Price).toBe(1158); // 1000 + 3.5 * 45
      expect(setup.target2RiskReward).toBe(3.5);

      // Batas alokasi maksimal 15% modal Libas (Rp 15.000.000 -> 150 Lot)
      expect(setup.recommendedPositionLots).toBeLessThanOrEqual(150);
      expect(setup.recommendedAllocationPct).toBeLessThanOrEqual(15.0);
      expect(setup.verdict).toBe('VALID SWING ENTRY');
      expect(setup.actionStatus).toBe('Beli bertahap');
    });

    it('membatasi stop loss maksimal pada toleransi 6.0%', () => {
      const stock: Pick<TradingViewStockItem, 'close' | 'ema20' | 'low' | 'atr' | 'rsScore'> = {
        close: 1000,
        ema20: 800,
        low: 700, // Terlalu jauh (-30%)
        atr: 50,
        rsScore: 80,
      };

      const setup = calculateSwingRiskSetup(stock, 100_000_000);
      expect(setup).not.toBeNull();
      if (!setup) return;

      expect(setup.stopLossPrice).toBe(940); // Dibatasi pada minStop (940 / -6.0%)
      expect(setup.stopLossPct).toBe(6.0);
    });

    it('mengembalikan null jika harga penutupan tidak valid', () => {
      const stock: Pick<TradingViewStockItem, 'close' | 'ema20' | 'low' | 'atr' | 'rsScore'> = {
        close: 0,
        ema20: null,
        low: null,
        atr: null,
        rsScore: null,
      };
      expect(calculateSwingRiskSetup(stock)).toBeNull();
    });
  });

  describe('formatSwingMomentumAlert', () => {
    it('membuat kartu alert visual Telegram Blue Sky RS lengkap', () => {
      const stock: TradingViewStockItem = {
        ticker: 'SGER',
        symbol: 'IDX:SGER',
        name: 'SGER',
        close: 800,
        change: 5.96,
        volume: 73000000,
        turnover: 58600000000,
        rsi: 68.5,
        sector: 'Non-Energy Minerals',
        industry: 'Coal',
        marketCap: 3200000000000,
        pe: 8.5,
        pbv: 1.8,
        ema20: 742,
        sma50: 710,
        sma200: 650,
        perfWeek: 8.5,
        perfMonth: 15.2,
        perf3M: 32.0,
        perf6M: 45.0,
        perfYear: 80.0,
        compositePerf: 42.5,
        aboveSma200: true,
        price52wHigh: 800,
        price52wLow: 400,
        rvol: 1.52,
        avgVolume30d: 48000000,
        volatilityD: 3.2,
        atr: 32,
        ema10: 760,
        sma20: 735,
        gap: 0.5,
        changeFromOpen: 4.5,
        open: 765,
        high: 800,
        low: 725,
        spread: 75,
        spreadRatio: 2.34,
        ucr: 1.0,
        vwap: 802,
        isVolumeAbsorption: false,
        isShakeoutSpring: true,
        dist52wHighPct: 0.0,
        isStage2: true,
        near52wHigh: true,
        isPocketPivot: false,
        rsLine: 147.6,
        rsScore: 91,
        alphaVsIhsg1M: 18.2,
        alphaVsIhsg3M: 35.0,
        alphaVsIhsgYear: 75.0,
        isLeadingVsIhsg: true,
        isBlueSkyRs: true,
        isLiquid: true,
      };

      const msg = formatSwingMomentumAlert(stock, 100_000_000);
      expect(msg).toContain('🚨 [SWING MOMENTUM ALERT] #SGER (Non-Energy Minerals)');
      expect(msg).toContain('Blue Sky RS Leading Divergence');
      expect(msg).toContain('Area Beli:');
      expect(msg).toContain('Batas Batal (Stop Loss):');
      expect(msg).toContain('Sasaran 1 (TP1):');
      expect(msg).toContain('RR 1 : 2');
      expect(msg).toContain('Saran Alokasi Libas (Maks 15%):');
      expect(msg).toContain('VERDIK: VALID SWING ENTRY');
    });

    it('membuat kartu alert untuk setup Shakeout Spring', () => {
      const stock: TradingViewStockItem = {
        ticker: 'MHKI',
        symbol: 'IDX:MHKI',
        name: 'MHKI',
        close: 114,
        change: 15.15,
        volume: 11000000,
        turnover: 1300000000,
        rsi: 55.0,
        sector: 'Industrial Services',
        industry: 'Services',
        marketCap: 200000000000,
        pe: null,
        pbv: 1.2,
        ema20: 105,
        sma50: 100,
        sma200: 95,
        perfWeek: 12.0,
        perfMonth: 15.0,
        perf3M: 20.0,
        perf6M: 10.0,
        perfYear: 5.0,
        compositePerf: 14.0,
        aboveSma200: true,
        price52wHigh: 304,
        price52wLow: 90,
        rvol: 6.39,
        avgVolume30d: 2000000,
        volatilityD: 5.0,
        atr: 6,
        ema10: 108,
        sma20: 102,
        gap: 0,
        changeFromOpen: 10.0,
        open: 104,
        high: 115,
        low: 102,
        spread: 13,
        spreadRatio: 2.16,
        ucr: 0.92,
        vwap: 112,
        isVolumeAbsorption: false,
        isShakeoutSpring: true,
        dist52wHighPct: 62.5,
        isStage2: true,
        near52wHigh: false,
        isPocketPivot: false,
        rsLine: null,
        rsScore: 75,
        alphaVsIhsg1M: null,
        alphaVsIhsg3M: null,
        alphaVsIhsgYear: null,
        isLeadingVsIhsg: false,
        isBlueSkyRs: false,
        isLiquid: true,
      };

      const msg = formatSwingMomentumAlert(stock, 100_000_000);
      expect(msg).toContain('Shakeout Spring Reversal Trap');
      expect(msg).toContain('Relative Volume (RVOL): 6.39x');
      expect(msg).toContain('Upper Close Ratio (UCR): 0.92');
    });
  });

  describe('formatSwingScannerBatchSummary', () => {
    it('membuat ringkasan pasar dan setup unggulan harian', () => {
      const mockResult: IdxMarketScanResult = {
        timestamp: '2026-10-22 13:00:00 WIB',
        totalCount: 843,
        liquidCount: 301,
        marketBreadth: {
          advances: 584,
          declines: 141,
          unchanged: 118,
          totalTurnover: 9.24e12,
          totalTurnoverTrillion: 9.24,
          advanceDeclineRatio: 4.14,
          sentiment: 'BULLISH_DOMINANT',
        },
        sectors: [],
        ihsg: {
          ticker: 'COMPOSITE',
          symbol: 'IDX:COMPOSITE',
          name: 'IHSG Composite',
          close: 5419,
          change: 1.7,
          sma50: 5300,
          sma200: 5500,
          ema20: 5350,
          trend: 'DOWNTREND',
          price52wHigh: 7400,
          price52wLow: 5000,
          dist52wHighPct: 40.9,
          perfWeek: 2.5,
          perfMonth: 5.0,
          perf3M: 10.0,
          perf6M: -5.0,
          perfYear: 8.0,
        },
        stocks: [],
        topRs: [],
        topTurnover: [],
        stage2Stocks: [],
        near52wStocks: [
          { ticker: 'SGER', close: 800, change: 5.96, turnover: 58.6e9, rsScore: 91 } as any,
        ],
        pocketPivotStocks: [],
        leadingStocks: [],
        blueSkyRsStocks: [
          { ticker: 'SGER', close: 800, change: 5.96, turnover: 58.6e9, rsScore: 91 } as any,
        ],
        volumeAbsorptionStocks: [],
        shakeoutSpringStocks: [
          { ticker: 'SGER', close: 800, change: 5.96, turnover: 58.6e9, rsScore: 91 } as any,
        ],
      };

      const summary = formatSwingScannerBatchSummary(mockResult);
      expect(summary).toContain('📡 [IDX MARKET SCANNER RECAP]');
      expect(summary).toContain('IHSG Benchmark: 5.419 (+1.70%) | Trend: DOWNTREND');
      expect(summary).toContain('Market Breadth: Naik 584 | Turun 141 | A/D 4.14x (BULLISH_DOMINANT)');
      expect(summary).toContain('Blue Sky RS Leaders   : 1 emiten');
      expect(summary).toContain('TOP CANDIDATES TO WATCH:');
      expect(summary).toContain('#SGER');
    });
  });

  describe('sendTelegramMessage', () => {
    it('mengembalikan error jika kredensial bot belum diatur', async () => {
      const res = await sendTelegramMessage('test', '');
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });
  });
});
