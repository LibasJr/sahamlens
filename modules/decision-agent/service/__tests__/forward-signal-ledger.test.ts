import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateNextSessionEntryRef,
  simulateForwardTrade,
  FORWARD_PAPER_FEE_PCT_40,
  FORWARD_PAPER_FEE_PCT_60,
  recordDailyForwardSignals,
} from '../forward-signal-ledger.service';
import type { SelectedPriceBar } from '@/shared/market/price-basis';
import { pool } from '@/shared/database/postgres.client';
import { GET as getTransparencyForwardLedger } from '@/app/api/transparency/forward-ledger/route';
import { checkPublicComputeBudget, rateLimitResult } from '@/shared/security/api-rate-limit';

vi.mock('@/shared/security/api-rate-limit', () => ({
  checkPublicComputeBudget: vi.fn(),
  rateLimitResult: vi.fn(() => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })),
}));

vi.mock('@/shared/database/postgres.client', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('@/shared/database/schema.service', () => ({
  ensureSharedSchema: vi.fn().mockResolvedValue(undefined),
}));

function makeBar(date: string, open: number, high: number, low: number, close: number): SelectedPriceBar {
  return {
    date,
    ticker: 'TEST.JK',
    basis: 'SPLIT_ADJUSTED',
    open,
    high,
    low,
    close,
    source: 'TEST',
    adjustmentVersion: 'v1',
    corporateActionStatus: 'NONE',
  };
}

describe('Forward Signal Ledger & Outcome Evaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateNextSessionEntryRef', () => {
    it('menerapkan adverse slippage 10 bps dan pembulatan ke atas tick BEI', () => {
      // Harga 1000: tick = 5.
      // 1000 * 1.001 = 1001. Dibulatkan ke atas tick 5 -> 1005.
      expect(calculateNextSessionEntryRef(1000)).toBe(1005);

      // Harga 7475: tick = 25.
      // 7475 * 1.001 = 7482.475. Dibulatkan ke atas tick 25 -> 7500.
      expect(calculateNextSessionEntryRef(7475)).toBe(7500);

      // Harga 50: tick = 1.
      // 50 * 1.001 = 50.05. Dibulatkan ke atas tick 1 -> 51.
      expect(calculateNextSessionEntryRef(50)).toBe(51);
    });

    it('mengembalikan 0 untuk harga tidak valid', () => {
      expect(calculateNextSessionEntryRef(0)).toBe(0);
      expect(calculateNextSessionEntryRef(-100)).toBe(0);
      expect(calculateNextSessionEntryRef(NaN)).toBe(0);
    });
  });

  describe('simulateForwardTrade (No-Lookahead & Execution Rules)', () => {
    it('NO-LOOKAHEAD: menolak simulasi bila bar belum mencapai horizon', () => {
      const bars = [
        makeBar('2026-10-19', 1000, 1020, 990, 1010),
        makeBar('2026-10-20', 1010, 1030, 1000, 1020),
      ];
      // Minta horizon T+5 dengan 2 bar -> harus null (belum mature, dilarang lookahead)
      expect(simulateForwardTrade(1000, 950, 1100, bars, 5)).toBeNull();
      // Minta horizon T+20 dengan 2 bar -> harus null
      expect(simulateForwardTrade(1000, 950, 1100, bars, 20)).toBeNull();
    });

    it('eksekusi STOP saat gap down di bawah stop pada open', () => {
      const bars = [
        makeBar('2026-10-19', 1005, 1020, 990, 1000),
        makeBar('2026-10-20', 940, 960, 930, 950), // gap down di bawah stop 950
        makeBar('2026-10-21', 950, 970, 940, 960),
        makeBar('2026-10-22', 960, 980, 950, 970),
        makeBar('2026-10-23', 970, 990, 960, 980),
      ];
      const result = simulateForwardTrade(1005, 950, 1110, bars, 5);
      expect(result).not.toBeNull();
      expect(result?.exitReason).toBe('STOP_HIT');
      expect(result?.exitPrice).toBe(940); // Dieksekusi pada open yang lebih buruk
      expect(result?.exitDate).toBe('2026-10-20');
      expect(result?.firstHit).toBe('STOP');
      expect(result?.stopHit).toBe(true);
    });

    it('eksekusi STOP saat harga low menyentuh stop', () => {
      const bars = [
        makeBar('2026-10-19', 1005, 1020, 990, 1000),
        makeBar('2026-10-20', 980, 990, 950, 960), // low = 950 menyentuh stop 950
        makeBar('2026-10-21', 960, 980, 950, 970),
        makeBar('2026-10-22', 970, 990, 960, 980),
        makeBar('2026-10-23', 980, 1000, 970, 990),
      ];
      const result = simulateForwardTrade(1005, 950, 1110, bars, 5);
      expect(result).not.toBeNull();
      expect(result?.exitReason).toBe('STOP_HIT');
      expect(result?.exitPrice).toBe(950);
      expect(result?.exitDate).toBe('2026-10-20');
      expect(result?.firstHit).toBe('STOP');
    });

    it('eksekusi TARGET saat harga high menyentuh target', () => {
      const bars = [
        makeBar('2026-10-19', 1005, 1050, 1000, 1040),
        makeBar('2026-10-20', 1040, 1120, 1030, 1110), // high = 1120 >= target 1110
        makeBar('2026-10-21', 1110, 1130, 1100, 1120),
        makeBar('2026-10-22', 1120, 1140, 1110, 1130),
        makeBar('2026-10-23', 1130, 1150, 1120, 1140),
      ];
      const result = simulateForwardTrade(1005, 950, 1110, bars, 5);
      expect(result).not.toBeNull();
      expect(result?.exitReason).toBe('TARGET_HIT');
      expect(result?.exitPrice).toBe(1110);
      expect(result?.exitDate).toBe('2026-10-20');
      expect(result?.firstHit).toBe('TARGET');
      expect(result?.targetHit).toBe(true);
    });

    it('TIE-BREAKER AMBIGU: jika stop dan target tersentuh di bar yang sama, pilih stop (konservatif)', () => {
      const bars = [
        makeBar('2026-10-19', 1005, 1030, 1000, 1010),
        makeBar('2026-10-20', 1010, 1150, 940, 1050), // High >= 1110 DAN Low <= 950
        makeBar('2026-10-21', 1050, 1070, 1040, 1060),
        makeBar('2026-10-22', 1060, 1080, 1050, 1070),
        makeBar('2026-10-23', 1070, 1090, 1060, 1080),
      ];
      const result = simulateForwardTrade(1005, 950, 1110, bars, 5);
      expect(result).not.toBeNull();
      expect(result?.exitReason).toBe('BOTH_HIT_WORST_CASE');
      expect(result?.exitPrice).toBe(950); // Stop dieksekusi
      expect(result?.firstHit).toBe('STOP');
      expect(result?.stopHit).toBe(true);
      expect(result?.targetHit).toBe(true);
    });

    it('HOLD EXPIRY: tidak ada stop atau target tersentuh sampai horizon usai', () => {
      const bars = [
        makeBar('2026-10-19', 1005, 1030, 990, 1010),
        makeBar('2026-10-20', 1010, 1040, 1000, 1020),
        makeBar('2026-10-21', 1020, 1050, 1010, 1030),
        makeBar('2026-10-22', 1030, 1060, 1020, 1040),
        makeBar('2026-10-23', 1040, 1070, 1030, 1050), // Final bar close = 1050
      ];
      const result = simulateForwardTrade(1005, 950, 1110, bars, 5);
      expect(result).not.toBeNull();
      expect(result?.exitReason).toBe('HOLD_EXPIRY');
      expect(result?.exitPrice).toBe(1050);
      expect(result?.exitDate).toBe('2026-10-23');
      expect(result?.firstHit).toBe('NONE');
      // Gross return: ((1050 / 1005) - 1) * 100 = 4.4776%
      expect(result?.grossReturnPct).toBeCloseTo(4.4776, 3);
      // Net 40 (fee 0.40%): gross - 0.40
      expect(result?.netReturn40Pct).toBeCloseTo(4.4776 - FORWARD_PAPER_FEE_PCT_40, 3);
      // Net 60 (fee 0.40% + slippage 0.20%): gross - 0.60
      expect(result?.netReturn60Pct).toBeCloseTo(4.4776 - FORWARD_PAPER_FEE_PCT_60, 3);
    });
  });

  describe('recordDailyForwardSignals', () => {
    it('PENJAGA JUMLAH: gagal jika tidak ada sinyal (0 baris)', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);
      await expect(recordDailyForwardSignals('2026-10-16')).rejects.toThrow(
        /Penjaga jumlah: tidak ada sinyal yang ditemukan/,
      );
    });
  });

  describe('Public Route /api/transparency/forward-ledger', () => {
    it('memeriksa public compute budget dan menolak jika over-budget', async () => {
      vi.mocked(checkPublicComputeBudget).mockResolvedValueOnce({
        allowed: false,
        retryAfterSec: 15,
        degraded: false,
        unavailable: false,
      } as any);

      const req = new Request('http://localhost:3000/api/transparency/forward-ledger', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      });

      const res = await getTransparencyForwardLedger(req);
      expect(res.status).toBe(429);
      expect(checkPublicComputeBudget).toHaveBeenCalledWith(expect.any(Headers), 'forward-ledger');
    });

    it('mengembalikan status 200 dan data forward ledger saat budget lolos', async () => {
      vi.mocked(checkPublicComputeBudget).mockResolvedValueOnce({
        allowed: true,
        degraded: false,
        unavailable: false,
      } as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{ totalEmitted: 100, totalCandidates: 25, firstDate: '2026-10-16', latestDate: '2026-10-16' }],
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any) // T20 outcomes
        .mockResolvedValueOnce({ rows: [] } as any); // T5 outcomes

      const req = new Request('http://localhost:3000/api/transparency/forward-ledger');
      const res = await getTransparencyForwardLedger(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.modelStatus).toBe('RESEARCH_ONLY');
      expect(json.insufficientSample).toBe(true);
      expect(json.sampleStatus).toContain('n < 30');
    });
  });
});
