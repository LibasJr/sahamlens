import { describe, expect, it } from 'vitest';
import {
  assessFreshness,
  classifyOwnershipTrend,
  formatPp,
  OWNERSHIP_TREND_THRESHOLDS_VALIDATED,
} from '../ownership-flow-classification';
import type { OwnershipDeltaSet } from '../../types/ownership-flow.types';

function deltaSet(partial: Partial<Record<'d1' | 'd7' | 'd30', number | null>>): OwnershipDeltaSet {
  const make = (pp: number | null | undefined) => ({
    pp: pp ?? null,
    basisObservedDate: pp == null ? null : '2026-07-16',
    actualGapDays: pp == null ? null : 30,
  });
  return { d1: make(partial.d1), d7: make(partial.d7), d30: make(partial.d30) };
}

describe('classifyOwnershipTrend - ambang belum tervalidasi', () => {
  it('ambang memang belum tervalidasi pada fase ini', () => {
    // Test ini adalah pengingat yang disengaja: kalau seseorang menyalakan flag
    // tanpa menjalankan audit distribusi, test ini gagal dan memaksa diskusi.
    expect(OWNERSHIP_TREND_THRESHOLDS_VALIDATED).toBe(false);
  });

  it('mengembalikan DATA_ONLY, bukan label akumulasi karangan', () => {
    const result = classifyOwnershipTrend(deltaSet({ d30: 1.32 }));
    expect(result.trend).toBe('DATA_ONLY');
    expect(result.reason).toContain('+1.32 pp');
    expect(result.reason).toContain('belum divalidasi');
  });

  it('tetap DATA_ONLY untuk penurunan besar', () => {
    expect(classifyOwnershipTrend(deltaSet({ d30: -5 })).trend).toBe('DATA_ONLY');
  });

  it('mengembalikan INSUFFICIENT_DATA ketika tidak ada delta sama sekali', () => {
    const result = classifyOwnershipTrend(deltaSet({}));
    expect(result.trend).toBe('INSUFFICIENT_DATA');
  });

  it('memakai horizon terpanjang yang tersedia', () => {
    const result = classifyOwnershipTrend(deltaSet({ d1: 0.14, d7: 0.51 }));
    expect(result.reason).toContain('+0.51 pp');
  });
});

describe('classifyOwnershipTrend - setelah ambang tervalidasi', () => {
  const options = { thresholdsValidated: true, thresholdPp: 0.25 };

  it('memberi label akumulasi di atas ambang', () => {
    expect(classifyOwnershipTrend(deltaSet({ d30: 1.32 }), options).trend).toBe('FOREIGN_ACCUMULATION');
  });

  it('memberi label distribusi di bawah ambang negatif', () => {
    expect(classifyOwnershipTrend(deltaSet({ d30: -0.8 }), options).trend).toBe('FOREIGN_DISTRIBUTION');
  });

  it('memberi label stabil di dalam ambang', () => {
    expect(classifyOwnershipTrend(deltaSet({ d30: 0.1 }), options).trend).toBe('STABLE');
  });

  it('TIDAK PERNAH menghasilkan label transaksi', () => {
    const labels = [
      classifyOwnershipTrend(deltaSet({ d30: 5 }), options).trend,
      classifyOwnershipTrend(deltaSet({ d30: -5 }), options).trend,
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/BUY|SELL|BELI|JUAL/i);
    }
  });
});

describe('formatPp', () => {
  it('selalu menyertakan satuan pp, bukan %', () => {
    // 40% -> 41% adalah +1 pp (dan +2,5% relatif). Menulisnya "%" membuat pembaca
    // menyimpulkan besaran yang salah - §36.
    expect(formatPp(1)).toBe('+1.00 pp');
    expect(formatPp(-0.51)).toBe('-0.51 pp');
    expect(formatPp(0)).toBe('0.00 pp');
    expect(formatPp(1)).not.toContain('%');
  });
});

describe('assessFreshness', () => {
  const now = new Date('2026-08-16T07:00:00Z');

  it('menandai MISSING ketika tidak ada observasi', () => {
    expect(assessFreshness(null, 'DAILY', now)).toEqual({ freshness: 'MISSING', ageDays: null });
  });

  it('menandai FRESH untuk sumber harian yang baru', () => {
    expect(assessFreshness('2026-08-15', 'DAILY', now)).toEqual({ freshness: 'FRESH', ageDays: 1 });
  });

  it('menandai STALE untuk sumber harian yang tertinggal', () => {
    const result = assessFreshness('2026-08-01', 'DAILY', now);
    expect(result.freshness).toBe('STALE');
    expect(result.ageDays).toBe(15);
  });

  it('memakai ambang berbeda untuk sumber bulanan', () => {
    // Data berumur 17 hari itu WAJAR untuk sumber bulanan, tapi macet untuk harian.
    expect(assessFreshness('2026-07-30', 'MONTHLY', now).freshness).toBe('FRESH');
    expect(assessFreshness('2026-07-30', 'DAILY', now).freshness).toBe('STALE');
  });

  it('fail-closed ke STALE ketika cadence belum diketahui', () => {
    // Tanpa tahu seberapa sering sumber terbit, kita tidak punya dasar menyebut
    // datanya segar - jadi jangan mengaku segar.
    expect(assessFreshness('2026-08-16', 'UNKNOWN', now).freshness).toBe('STALE');
  });
});
