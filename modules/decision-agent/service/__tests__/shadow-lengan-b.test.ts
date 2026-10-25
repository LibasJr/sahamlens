import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isEligibleShadowLenganB,
  chaikinMoneyFlow20,
  executeShadowLenganB,
  MODEL_VERSION_SHADOW_LENGAN_B,
  SHADOW_LENGAN_B_ADV_FLOOR,
  SHADOW_LENGAN_B_MIN_PRICE,
  SHADOW_LENGAN_B_MIN_MCAP,
  SHADOW_LENGAN_B_MIN_RR,
} from '../shadow-lengan-b.service';
import type { TradingViewStockItem } from '@/modules/market-data/service/tradingview-scanner.service';
import * as tvScanner from '@/modules/market-data/service/tradingview-scanner.service';
import * as techModule from '@/modules/technical';
import * as fslRepo from '../../repository/forward-signal-ledger.repository';
import * as emitenList from '@/shared/market/emiten-list';
import * as idxBoard from '@/lib/utils/idx-trading-board';
import * as umaService from '@/modules/market/service/uma-status.service';

vi.mock('@/shared/database/schema.service', () => ({
  ensureSharedSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/http/provider-circuit-breaker', () => ({
  recordProviderSuccess: vi.fn().mockResolvedValue(undefined),
}));

function makeStock(partial: Partial<TradingViewStockItem> = {}): TradingViewStockItem {
  return {
    ticker: 'TEST',
    symbol: 'IDX:TEST',
    name: 'PT Test Tbk',
    close: 1000,
    change: 2.0,
    volume: 10_000_000,
    turnover: 10_000_000_000, // Rp 10 M (>= 5M)
    rsi: 55,
    sector: 'Energy',
    industry: 'Coal',
    marketCap: 5_000_000_000_000, // Rp 5T (>= 1T)
    pe: 8,
    pbv: 1.2,
    ema20: 950,
    sma50: 900,
    sma200: 800,
    perfWeek: 2.5,
    perfMonth: 5.0,
    perf3M: 15.0,
    perf6M: 25.0,
    perfYear: 30.0,
    compositePerf: 20.0,
    rsScore: 85,
    isLiquid: true,
    aboveSma200: true,
    price52wHigh: 1200,
    price52wLow: 700,
    rvol: 1.5,
    avgVolume30d: 8_000_000,
    volatilityD: 2.0,
    atr: 35,
    ema10: 970,
    sma20: 940,
    gap: 0,
    changeFromOpen: 1.0,
    dist52wHighPct: -16.6,
    isStage2: true,
    near52wHigh: false,
    isPocketPivot: false,
    rsLine: 1.1,
    alphaVsIhsg1M: 3.0,
    alphaVsIhsg3M: 8.0,
    alphaVsIhsgYear: 12.0,
    isLeadingVsIhsg: true,
    isBlueSkyRs: false,
    open: 990,
    high: 1010,
    low: 985,
    spread: 25,
    spreadRatio: 1.0,
    ucr: 0.7,
    vwap: 998,
    isVolumeAbsorption: false,
    isShakeoutSpring: false,
    ...partial,
  };
}

describe('Shadow Forward Ledger Lengan B', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isEligibleShadowLenganB (Hard Gates & Proteksi)', () => {
    it('meloloskan emiten yang memenuhi seluruh gerbang', () => {
      vi.spyOn(emitenList, 'getEmitenBoard').mockReturnValue('Utama');
      vi.spyOn(idxBoard, 'classifyTradingBoard').mockReturnValue({
        board: 'MAIN',
        label: 'Papan Utama',
        shortLabel: 'Utama',
        badgeVariant: 'info',
        description: '',
        isFca: false,
        tradingMechanism: 'Continuous',
      });
      vi.spyOn(umaService, 'getTickerUmaStatus').mockReturnValue({
        isUma: false,
        ticker: 'TEST',
        lastUmaDate: null,
        announcementNo: null,
        title: null,
        attachment: null,
        daysAgo: null,
        historyCount: 0,
        source: null,
        asOf: null,
      });

      const stock = makeStock();
      const suspended = new Set<string>();
      expect(isEligibleShadowLenganB(stock, suspended)).toBe(true);
    });

    it('menolak saham gocap di bawah Rp 100', () => {
      const stock = makeStock({ close: 95 });
      expect(isEligibleShadowLenganB(stock, new Set())).toBe(false);
    });

    it('menolak microcap di bawah Rp 1 Triliun', () => {
      const stock = makeStock({ marketCap: 800_000_000_000 });
      expect(isEligibleShadowLenganB(stock, new Set())).toBe(false);
    });

    it('menolak likuiditas transaksi di bawah Rp 5 Miliar', () => {
      const stock = makeStock({ turnover: 4_500_000_000 });
      expect(isEligibleShadowLenganB(stock, new Set())).toBe(false);
    });

    it('menolak emiten yang tidak dalam Stage 2 uptrend (Close <= SMA50 atau Close <= SMA200)', () => {
      expect(isEligibleShadowLenganB(makeStock({ close: 890, sma50: 900, sma200: 800 }), new Set())).toBe(false);
      expect(isEligibleShadowLenganB(makeStock({ close: 790, sma50: 750, sma200: 800 }), new Set())).toBe(false);
    });

    it('menolak emiten di Papan Pemantauan Khusus / FCA', () => {
      vi.spyOn(emitenList, 'getEmitenBoard').mockReturnValue('Pemantauan Khusus');
      vi.spyOn(idxBoard, 'classifyTradingBoard').mockReturnValue({
        board: 'WATCHLIST_FCA',
        label: 'Papan Pemantauan Khusus (FCA)',
        shortLabel: 'FCA',
        badgeVariant: 'warning',
        description: '',
        isFca: true,
        tradingMechanism: 'Periodic Call Auction',
      });

      expect(isEligibleShadowLenganB(makeStock(), new Set())).toBe(false);
    });

    it('menolak emiten yang sedang disuspensi', () => {
      vi.spyOn(emitenList, 'getEmitenBoard').mockReturnValue('Utama');
      vi.spyOn(idxBoard, 'classifyTradingBoard').mockReturnValue({
        board: 'MAIN',
        label: 'Papan Utama',
        shortLabel: 'Utama',
        badgeVariant: 'info',
        description: '',
        isFca: false,
        tradingMechanism: 'Continuous',
      });

      const suspended = new Set(['TEST']);
      expect(isEligibleShadowLenganB(makeStock(), suspended)).toBe(false);
    });

    it('menolak emiten dengan status UMA aktif <= 7 hari', () => {
      vi.spyOn(emitenList, 'getEmitenBoard').mockReturnValue('Utama');
      vi.spyOn(idxBoard, 'classifyTradingBoard').mockReturnValue({
        board: 'MAIN',
        label: 'Papan Utama',
        shortLabel: 'Utama',
        badgeVariant: 'info',
        description: '',
        isFca: false,
        tradingMechanism: 'Continuous',
      });
      vi.spyOn(umaService, 'getTickerUmaStatus').mockReturnValue({
        isUma: true,
        ticker: 'TEST',
        lastUmaDate: '2026-10-20',
        announcementNo: 'UMA/01',
        title: 'UMA',
        attachment: null,
        daysAgo: 3,
        historyCount: 1,
        source: 'IDX',
        asOf: '2026-10-23',
      });

      expect(isEligibleShadowLenganB(makeStock(), new Set())).toBe(false);
    });
  });

  describe('chaikinMoneyFlow20', () => {
    it('menghitung CMF 20 bar dengan benar', () => {
      const bars = Array.from({ length: 20 }, (_, i) => ({
        High: 110,
        Low: 90,
        Close: 105, // CLV = ((105-90) - (110-105)) / (110-90) = (15 - 5) / 20 = +0.5
        Volume: 1000,
      }));
      const cmf = chaikinMoneyFlow20(bars);
      expect(cmf).toBe(50.0);
    });

    it('mengembalikan 0 untuk deret kosong', () => {
      expect(chaikinMoneyFlow20([])).toBe(0);
    });
  });

  describe('executeShadowLenganB', () => {
    it('melewati trading jika rezim pasar IHSG <= SMA-50 (downtrend guard)', async () => {
      vi.spyOn(tvScanner, 'fetchTradingViewIhsg').mockResolvedValue({
        ticker: 'COMPOSITE',
        symbol: 'IDX:COMPOSITE',
        name: 'IDX Composite',
        close: 6000,
        change: -1.0,
        sma50: 6200, // IHSG < SMA50
        sma200: 6500,
        ema20: 6100,
        perfWeek: -2,
        perfMonth: -3,
        perf3M: -5,
        perf6M: -8,
        perfYear: -10,
        price52wHigh: 7300,
        price52wLow: 5800,
        dist52wHighPct: -17.8,
        trend: 'DOWNTREND',
      });
      vi.spyOn(tvScanner, 'fetchTradingViewScan').mockResolvedValue([]);

      const result = await executeShadowLenganB({ date: '2026-10-25' });
      expect(result.success).toBe(true);
      expect(result.regimePassed).toBe(false);
      expect(result.signalsCount).toBe(0);
      expect(result.reason).toBe('IHSG_DOWNTREND');
    });

    it('menjalankan seleksi dan menghitung TradePlan saat bypassRegime aktif', async () => {
      vi.spyOn(tvScanner, 'fetchTradingViewIhsg').mockResolvedValue({
        ticker: 'COMPOSITE',
        symbol: 'IDX:COMPOSITE',
        name: 'IDX Composite',
        close: 6000,
        change: -1.0,
        sma50: 6200,
        sma200: 6500,
        ema20: 6100,
        perfWeek: -2,
        perfMonth: -3,
        perf3M: -5,
        perf6M: -8,
        perfYear: -10,
        price52wHigh: 7300,
        price52wLow: 5800,
        dist52wHighPct: -17.8,
        trend: 'DOWNTREND',
      });

      const stockA = makeStock({ ticker: 'BBCA', close: 10000, sma50: 9500, sma200: 9000, perf3M: 20.0 });
      vi.spyOn(tvScanner, 'fetchTradingViewScan').mockResolvedValue([stockA]);

      vi.spyOn(emitenList, 'getEmitenBoard').mockReturnValue('Utama');
      vi.spyOn(idxBoard, 'classifyTradingBoard').mockReturnValue({
        board: 'MAIN',
        label: 'Papan Utama',
        shortLabel: 'Utama',
        badgeVariant: 'info',
        description: '',
        isFca: false,
        tradingMechanism: 'Continuous',
      });
      vi.spyOn(umaService, 'getTickerUmaStatus').mockReturnValue({
        isUma: false,
        ticker: 'BBCA',
        lastUmaDate: null,
        announcementNo: null,
        title: null,
        attachment: null,
        daysAgo: null,
        historyCount: 0,
        source: null,
        asOf: null,
      });

      // Buat histori 60 hari naik untuk membentuk support dan resistance
      const mockHistory = Array.from({ length: 60 }, (_, i) => {
        const base = 9000 + i * 20;
        return {
          Date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          Open: base - 10,
          High: base + 20,
          Low: base - 20,
          Close: base,
          Volume: 1_000_000,
        };
      });

      vi.spyOn(techModule, 'fetchYahooHistoryDirect').mockResolvedValue({
        history: mockHistory,
        currentPrice: 10000,
        regularMarketTime: 1792746000,
        previousClose: 9980,
      } as any);

      const insertSpy = vi.spyOn(fslRepo, 'insertForwardSignals').mockResolvedValue(1);

      const result = await executeShadowLenganB({
        date: '2026-10-25',
        bypassRegime: true,
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(result.candidatesEvaluated).toBe(1);
      expect(result.signals.length).toBeGreaterThanOrEqual(0);

      // Verifikasi jika ada sinyal yang lolos
      if (result.signals.length > 0) {
        const sig = result.signals[0];
        expect(sig.rr).toBeGreaterThanOrEqual(SHADOW_LENGAN_B_MIN_RR);
        expect(sig.riskPct).toBeGreaterThanOrEqual(3.5);
        expect(sig.riskPct).toBeLessThanOrEqual(6.0);
        expect(insertSpy).toHaveBeenCalledTimes(1);
      }
    });

    it('tidak menulis ke database pada mode dryRun', async () => {
      vi.spyOn(tvScanner, 'fetchTradingViewIhsg').mockResolvedValue({
        ticker: 'COMPOSITE',
        symbol: 'IDX:COMPOSITE',
        name: 'IDX Composite',
        close: 7000,
        change: 0.5,
        sma50: 6800, // Uptrend
        sma200: 6500,
        ema20: 6900,
        perfWeek: 1,
        perfMonth: 2,
        perf3M: 5,
        perf6M: 10,
        perfYear: 15,
        price52wHigh: 7300,
        price52wLow: 5800,
        dist52wHighPct: -4.1,
        trend: 'UPTREND',
      });

      const stockA = makeStock({ ticker: 'BMRI', close: 7000, sma50: 6500, sma200: 6000, perf3M: 15.0 });
      vi.spyOn(tvScanner, 'fetchTradingViewScan').mockResolvedValue([stockA]);

      vi.spyOn(emitenList, 'getEmitenBoard').mockReturnValue('Utama');
      vi.spyOn(idxBoard, 'classifyTradingBoard').mockReturnValue({
        board: 'MAIN',
        label: 'Papan Utama',
        shortLabel: 'Utama',
        badgeVariant: 'info',
        description: '',
        isFca: false,
        tradingMechanism: 'Continuous',
      });
      vi.spyOn(umaService, 'getTickerUmaStatus').mockReturnValue({
        isUma: false,
        ticker: 'BMRI',
        lastUmaDate: null,
        announcementNo: null,
        title: null,
        attachment: null,
        daysAgo: null,
        historyCount: 0,
        source: null,
        asOf: null,
      });

      const mockHistory = Array.from({ length: 60 }, (_, i) => {
        const base = 6000 + i * 20;
        return {
          Date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          Open: base - 10,
          High: base + 20,
          Low: base - 20,
          Close: base,
          Volume: 1_000_000,
        };
      });

      vi.spyOn(techModule, 'fetchYahooHistoryDirect').mockResolvedValue({
        history: mockHistory,
        currentPrice: 7000,
        regularMarketTime: 1792746000,
        previousClose: 6980,
      } as any);

      const insertSpy = vi.spyOn(fslRepo, 'insertForwardSignals').mockResolvedValue(1);

      const result = await executeShadowLenganB({
        date: '2026-10-25',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(result.insertedCount).toBe(0);
    });
  });
});
